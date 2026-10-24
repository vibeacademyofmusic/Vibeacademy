-- Serialized stock extends inventory_entries; monetary fields are metadata only.
create table public.instrument_catalogue (
 item_id uuid primary key references public.inventory_items(id),
 brand text not null check(length(trim(brand)) between 1 and 100),
 model text not null check(length(trim(model)) between 1 and 100)
);
create table public.instrument_units (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.instrument_catalogue(item_id),
 serial text not null check(length(trim(serial)) between 1 and 150),
 created_at timestamptz not null default clock_timestamp(),
 unique(item_id,serial)
);
create table public.instrument_commercial_details (
 unit_id uuid primary key references public.instrument_units(id),
 supplier text not null check(length(trim(supplier)) between 1 and 200),
 acquisition_cost numeric not null check(acquisition_cost>=0 and acquisition_cost<=1000000000000 and acquisition_cost=round(acquisition_cost,2)),
 asking_price numeric not null check(asking_price>=0 and asking_price<=1000000000000 and asking_price=round(asking_price,2)),
 currency text not null check(currency ~ '^[A-Z]{3}$')
);
create table public.instrument_events (
 movement_id uuid primary key references public.inventory_movements(id) deferrable initially deferred,
 unit_id uuid not null references public.instrument_units(id),
 kind text not null check(kind in('RECEIPT','TRANSFER','SALE')),
 branch_id uuid not null references public.branches(id),
 destination_id uuid references public.branches(id),
 sale_price numeric check(sale_price>=0 and sale_price<=1000000000000 and sale_price=round(sale_price,2)),
 currency text check(currency ~ '^[A-Z]{3}$'),
 warranty_until date check(isfinite(warranty_until)),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 check((kind='SALE' and sale_price is not null and currency is not null) or (kind<>'SALE' and sale_price is null and currency is null and warranty_until is null)),
 check((kind='TRANSFER' and destination_id is not null and destination_id<>branch_id) or (kind<>'TRANSFER' and destination_id is null))
);
create index instrument_event_history_idx on public.instrument_events(unit_id,created_at desc,movement_id);
alter table public.instrument_catalogue enable row level security;
alter table public.instrument_units enable row level security;
alter table public.instrument_commercial_details enable row level security;
alter table public.instrument_events enable row level security;
revoke all on public.instrument_catalogue,public.instrument_units,public.instrument_commercial_details,public.instrument_events from public,anon,authenticated,service_role;
grant select on public.instrument_catalogue,public.instrument_units,public.instrument_commercial_details,public.instrument_events to authenticated;
-- Initial commercial UI is SUPER_ADMIN-only; no new non-admin grants.
create policy instrument_catalogue_read on public.instrument_catalogue for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy instrument_unit_read on public.instrument_units for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy instrument_cost_read on public.instrument_commercial_details for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy instrument_event_read on public.instrument_events for select to authenticated using(public.has_role('SUPER_ADMIN'));
create trigger instrument_history_immutable before update or delete on public.instrument_events for each row execute function public.reject_inventory_history_mutation();
create trigger instrument_identity_immutable before update or delete on public.instrument_units for each row execute function public.reject_inventory_history_mutation();
create trigger instrument_cost_immutable before update or delete on public.instrument_commercial_details for each row execute function public.reject_inventory_history_mutation();

create function public.guard_serialized_inventory() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$begin
 if exists(select 1 from public.instrument_catalogue where item_id=new.item_id) and not exists(
 select 1 from public.instrument_events e join public.instrument_units u on u.id=e.unit_id
 where e.movement_id=new.id and u.item_id=new.item_id and new.quantity=1
 and new.kind=case e.kind when 'SALE' then 'OUTBOUND' else e.kind end
 and new.branch_id=e.branch_id and new.destination_id is not distinct from e.destination_id
 and new.created_by=e.created_by and new.reason=e.reason)
 then raise exception 'Serialized stock requires instrument workflow'; end if;
 return new;
end$$;
create trigger inventory_serial_guard before insert on public.inventory_movements for each row execute function public.guard_serialized_inventory();

create function public.create_instrument_model(p_code text,p_name text,p_category text,p_brand text,p_model text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 result:=public.create_inventory_item(p_code,p_name,p_category,'cái');
 insert into public.instrument_catalogue(item_id,brand,model) values(result,trim(p_brand),trim(p_model));
 return result;
end$$;

create function public.receive_instrument(p_request uuid,p_item uuid,p_serial text,p_branch uuid,p_supplier text,p_cost numeric,p_price numeric,p_currency text,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.instrument_events; unit public.instrument_units; commercial public.instrument_commercial_details; result uuid;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_request is null then raise exception 'Invalid instrument request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-request:'||p_request::text,0));
 select * into old from public.instrument_events where movement_id=p_request;
 if found then
 select * into unit from public.instrument_units where id=old.unit_id;
 select * into commercial from public.instrument_commercial_details where unit_id=unit.id;
 if old.kind<>'RECEIPT' or old.created_by is distinct from auth.uid() or old.branch_id is distinct from p_branch or unit.item_id is distinct from p_item or unit.serial is distinct from trim(p_serial)
 or commercial.supplier is distinct from trim(p_supplier) or commercial.acquisition_cost is distinct from p_cost or commercial.asking_price is distinct from p_price or commercial.currency is distinct from p_currency or old.reason is distinct from trim(p_reason)
 then raise exception 'Inventory request payload mismatch'; end if;
 return unit.id;
 end if;
 perform 1 from public.inventory_items where id=p_item for update;
 if not found then raise exception 'Inventory item not found'; end if;
 insert into public.instrument_units(item_id,serial) values(p_item,trim(p_serial)) returning id into result;
 insert into public.instrument_commercial_details(unit_id,supplier,acquisition_cost,asking_price,currency) values(result,trim(p_supplier),p_cost,p_price,p_currency);
 insert into public.instrument_events(movement_id,unit_id,kind,branch_id,reason,created_by) values(p_request,result,'RECEIPT',p_branch,trim(p_reason),auth.uid());
 perform public.post_inventory_movement(p_request,p_item,p_branch,'RECEIPT',1,p_reason);
 return result;
end$$;

create function public.move_instrument(p_request uuid,p_unit uuid,p_kind text,p_destination uuid,p_sale_price numeric,p_currency text,p_warranty_until date,p_reason text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.instrument_events; last_event public.instrument_events; item uuid; origin uuid;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_request is null or p_kind is null or p_kind not in('TRANSFER','SALE') then raise exception 'Invalid instrument request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-request:'||p_request::text,0));
 select * into old from public.instrument_events where movement_id=p_request;
 if found then
 if old.unit_id is distinct from p_unit or old.kind is distinct from p_kind or old.destination_id is distinct from p_destination or old.sale_price is distinct from p_sale_price or old.currency is distinct from p_currency or old.warranty_until is distinct from p_warranty_until or old.reason is distinct from trim(p_reason) or old.created_by is distinct from auth.uid()
 then raise exception 'Inventory request payload mismatch'; end if;
 return old.movement_id;
 end if;
 select item_id into item from public.instrument_units where id=p_unit;
 if not found then raise exception 'Instrument not found'; end if;
 perform 1 from public.inventory_items where id=item for update;
 select * into last_event from public.instrument_events where unit_id=p_unit order by created_at desc,movement_id desc limit 1;
 if not found or last_event.kind='SALE' then raise exception 'Instrument is not in stock'; end if;
 origin:=coalesce(last_event.destination_id,last_event.branch_id);
 if p_warranty_until is not null and p_warranty_until<(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Warranty date precedes sale'; end if;
 insert into public.instrument_events(movement_id,unit_id,kind,branch_id,destination_id,sale_price,currency,warranty_until,reason,created_by)
 values(p_request,p_unit,p_kind,origin,p_destination,p_sale_price,p_currency,p_warranty_until,trim(p_reason),auth.uid());
 perform public.post_inventory_movement(p_request,item,origin,case p_kind when 'SALE' then 'OUTBOUND' else 'TRANSFER' end,1,p_reason,p_destination);
 return p_request;
end$$;
revoke all on function public.guard_serialized_inventory(),public.create_instrument_model(text,text,text,text,text),public.receive_instrument(uuid,uuid,text,uuid,text,numeric,numeric,text,text),public.move_instrument(uuid,uuid,text,uuid,numeric,text,date,text) from public,anon,authenticated,service_role;
grant execute on function public.create_instrument_model(text,text,text,text,text),public.receive_instrument(uuid,uuid,text,uuid,text,numeric,numeric,text,text),public.move_instrument(uuid,uuid,text,uuid,numeric,text,date,text) to authenticated;
