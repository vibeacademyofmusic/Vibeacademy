-- Quantity-only stock ledger. No financial posting or role expansion.
insert into public.permissions(code,name,module) values
 ('inventory.view','View branch inventory','inventory'),
 ('inventory.manage','Post branch inventory movements','inventory')
on conflict(code) do nothing;

create table public.inventory_items (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9_-]{0,49}$'),
 name text not null check(length(trim(name)) between 1 and 200),
 category text not null check(length(trim(category)) between 1 and 100),
 unit text not null check(length(trim(unit)) between 1 and 40),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.inventory_movements (
 id uuid primary key, -- caller request identity; retries compare the full payload
 item_id uuid not null references public.inventory_items(id),
 branch_id uuid not null references public.branches(id),
 destination_id uuid references public.branches(id),
 kind text not null check(kind in('RECEIPT','OUTBOUND','TRANSFER','ADJUSTMENT')),
 quantity numeric not null check(quantity <> 0 and abs(quantity)<=1000000000 and quantity=round(quantity,3) and quantity<>'NaN'::numeric),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 check(kind='ADJUSTMENT' or quantity>0),
 check((kind='TRANSFER' and destination_id is not null and destination_id<>branch_id) or (kind<>'TRANSFER' and destination_id is null))
);
create table public.inventory_entries (
 movement_id uuid not null references public.inventory_movements(id),
 branch_id uuid not null references public.branches(id),
 item_id uuid not null references public.inventory_items(id),
 delta numeric not null check(delta<>0),
 created_at timestamptz not null,
 primary key(movement_id,branch_id)
);
create index inventory_entries_balance_idx on public.inventory_entries(item_id,branch_id,created_at) include(delta);
create index inventory_movements_history_idx on public.inventory_movements(item_id,created_at desc,id);
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_entries enable row level security;
revoke all on public.inventory_items,public.inventory_movements,public.inventory_entries from public,anon,authenticated,service_role;
grant select on public.inventory_items,public.inventory_movements,public.inventory_entries to authenticated;
create policy inventory_catalogue_read on public.inventory_items for select to authenticated using(public.has_role('SUPER_ADMIN') or exists(select 1 from public.branches b where public.has_permission('inventory.view',b.id)));
-- A transfer's shared notes/source are visible only to staff authorized at both ends.
create policy inventory_movement_read on public.inventory_movements for select to authenticated using(public.has_permission('inventory.view',branch_id) and (destination_id is null or public.has_permission('inventory.view',destination_id)));
create policy inventory_entry_read on public.inventory_entries for select to authenticated using(public.has_permission('inventory.view',branch_id));

create function public.reject_inventory_history_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$begin
 raise exception 'Inventory history is immutable; post a new adjustment';
end$$;
create trigger inventory_movement_immutable before update or delete on public.inventory_movements for each row execute function public.reject_inventory_history_mutation();
create trigger inventory_entry_immutable before update or delete on public.inventory_entries for each row execute function public.reject_inventory_history_mutation();

create function public.create_inventory_item(p_code text,p_name text,p_category text,p_unit text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 insert into public.inventory_items(code,name,category,unit,created_by)
 values(upper(trim(p_code)),trim(p_name),trim(p_category),trim(p_unit),auth.uid()) returning id into result;
 return result;
end$$;

create function public.post_inventory_movement(p_request uuid,p_item uuid,p_branch uuid,p_kind text,p_quantity numeric,p_reason text,p_destination uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.inventory_movements; stock numeric; change numeric; stamp timestamptz;
begin
 if not public.has_permission('inventory.manage',p_branch) or
   (p_destination is not null and not public.has_permission('inventory.manage',p_destination)) then raise exception 'Unauthorized'; end if;
 if p_request is null or p_item is null or p_branch is null or p_kind is null or p_kind not in('RECEIPT','OUTBOUND','TRANSFER','ADJUSTMENT') or
 p_quantity is null or p_quantity=0 or p_quantity='NaN'::numeric or abs(p_quantity)>1000000000 or p_quantity<>round(p_quantity,3) or
 (p_kind<>'ADJUSTMENT' and p_quantity<0) or p_reason is null or length(trim(p_reason)) not between 1 and 2000 or
 (p_kind='TRANSFER' and (p_destination is null or p_destination=p_branch)) or (p_kind<>'TRANSFER' and p_destination is not null)
 then raise exception 'Invalid inventory movement'; end if;
 -- Same request, even with a different item, must serialize before payload checking.
 perform pg_advisory_xact_lock(hashtextextended('inventory-request:'||p_request::text,0));
 select * into old from public.inventory_movements where id=p_request;
 if found then
   if old.item_id is distinct from p_item or old.branch_id is distinct from p_branch or old.destination_id is distinct from p_destination or
   old.kind is distinct from p_kind or old.quantity is distinct from p_quantity or old.reason is distinct from trim(p_reason) or old.created_by is distinct from auth.uid()
   then raise exception 'Inventory request payload mismatch'; end if;
   return old.id;
 end if;
 -- Serialize all branches for this item, avoiding opposing-transfer deadlocks.
 perform 1 from public.inventory_items where id=p_item for update;
 if not found then raise exception 'Inventory item not found'; end if;
 if not exists(select 1 from public.branches where id=p_branch and status='ACTIVE') or
 (p_destination is not null and not exists(select 1 from public.branches where id=p_destination and status='ACTIVE')) then raise exception 'Inactive or missing branch'; end if;
 select coalesce(sum(delta),0) into stock from public.inventory_entries where item_id=p_item and branch_id=p_branch;
 change:=case when p_kind in('OUTBOUND','TRANSFER') then -p_quantity else p_quantity end;
 if stock+change<0 then raise exception 'Insufficient inventory'; end if;
 stamp:=clock_timestamp();
 insert into public.inventory_movements(id,item_id,branch_id,destination_id,kind,quantity,reason,created_by,created_at)
 values(p_request,p_item,p_branch,p_destination,p_kind,p_quantity,trim(p_reason),auth.uid(),stamp);
 insert into public.inventory_entries(movement_id,branch_id,item_id,delta,created_at) values(p_request,p_branch,p_item,change,stamp);
 if p_kind='TRANSFER' then
 insert into public.inventory_entries(movement_id,branch_id,item_id,delta,created_at) values(p_request,p_destination,p_item,p_quantity,stamp);
 end if;
 return p_request;
end$$;

create function public.inventory_monthly_report(p_branch uuid,p_month date,p_offset integer default 0)
returns table(item_id uuid,code text,name text,unit text,opening numeric,inbound numeric,outbound numeric,closing numeric)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare start_at timestamptz; end_at timestamptz;
begin
 if not public.has_permission('inventory.view',p_branch) then raise exception 'Unauthorized'; end if;
 if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'Invalid inventory report filter'; end if;
 start_at:=p_month::timestamp at time zone 'Asia/Ho_Chi_Minh';
 end_at:=(p_month+interval '1 month')::timestamp at time zone 'Asia/Ho_Chi_Minh';
 return query select i.id,i.code,i.name,i.unit,
 coalesce(sum(e.delta) filter(where e.created_at<start_at),0),
 coalesce(sum(e.delta) filter(where e.created_at>=start_at and e.delta>0),0),
 coalesce(-sum(e.delta) filter(where e.created_at>=start_at and e.delta<0),0),
 coalesce(sum(e.delta),0)
 from public.inventory_items i left join public.inventory_entries e on e.item_id=i.id and e.branch_id=p_branch and e.created_at<end_at
 group by i.id order by i.code limit 26 offset p_offset;
end$$;
revoke all on function public.reject_inventory_history_mutation(),public.create_inventory_item(text,text,text,text),public.post_inventory_movement(uuid,uuid,uuid,text,numeric,text,uuid),public.inventory_monthly_report(uuid,date,integer) from public,anon,authenticated,service_role;
grant execute on function public.create_inventory_item(text,text,text,text),public.post_inventory_movement(uuid,uuid,uuid,text,numeric,text,uuid),public.inventory_monthly_report(uuid,date,integer) to authenticated;
