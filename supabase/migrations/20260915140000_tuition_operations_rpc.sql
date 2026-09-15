-- Operational wrappers: existing pricing/date/discount triggers remain authoritative.
create function public.preview_tuition_term(
  p_enrollment_id uuid, p_tuition_plan_id uuid, p_starts_on date,
  p_discount_type text, p_discount_value numeric, p_discount_name text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e record; plan record; price record; latest record;
  discount numeric(14,2); start_date date;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then raise exception 'SUPER_ADMIN role required'; end if;
  select en.started_at, en.status, c.branch_id, b.name as branch_name into e
  from enrollments en join classes c on c.id=en.class_id join branches b on b.id=c.branch_id
  where en.id=p_enrollment_id;
  if not found or e.status <> 'ACTIVE' or e.started_at is null then raise exception 'Active enrollment with study start required'; end if;
  select name, duration_months into plan from tuition_plans where id=p_tuition_plan_id and status='ACTIVE';
  if not found then raise exception 'Tuition plan does not exist or is inactive'; end if;
  select list_price, currency into price from tuition_plan_branch_prices
  where tuition_plan_id=p_tuition_plan_id and status='ACTIVE' and (branch_id=e.branch_id or branch_id is null)
  order by (branch_id is not null) desc limit 1;
  if not found then raise exception 'No active tuition price'; end if;
  select effective_ends_on, status into latest from enrollment_tuition
  where enrollment_id=p_enrollment_id and status<>'CANCELLED' order by effective_ends_on desc limit 1;
  if latest.status='SCHEDULED' then raise exception 'Scheduled tuition already exists'; end if;
  start_date := coalesce(p_starts_on, latest.effective_ends_on+1, e.started_at);
  if start_date < e.started_at or (latest.effective_ends_on is null and start_date<>e.started_at) then
    raise exception 'Invalid tuition study start date';
  end if;
  if p_discount_type is null or p_discount_type not in ('NONE','PERCENT','FIXED') or p_discount_value is null then raise exception 'Invalid discount'; end if;
  if p_discount_type<>'NONE' and nullif(btrim(p_discount_name),'') is null then raise exception 'Discount name required'; end if;
  if length(p_discount_name)>300 then raise exception 'Discount name too long'; end if;
  discount := calculate_tuition_discount_amount(price.list_price,p_discount_type,p_discount_value);
  if exists(select 1 from enrollment_tuition where enrollment_id=p_enrollment_id and status<>'CANCELLED'
    and daterange(starts_on,effective_ends_on,'[]') && daterange(start_date,calculate_tuition_base_end(start_date,plan.duration_months),'[]')) then
    raise exception 'Tuition periods overlap';
  end if;
  return jsonb_build_object('starts_on',start_date,'base_ends_on',calculate_tuition_base_end(start_date,plan.duration_months),
    'branch_name',e.branch_name,'plan_name',plan.name,'list_price',price.list_price,'currency',price.currency,
    'discount_amount',discount,'amount',price.list_price-discount);
end $$;

create function public.create_tuition_term(
  p_enrollment_id uuid, p_tuition_plan_id uuid, p_starts_on date,
  p_discount_type text, p_discount_value numeric, p_discount_name text, p_notes text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare quote jsonb; result uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'SUPER_ADMIN role required'; end if;
  -- Serialize creations per enrollment; final insert still passes all existing triggers.
  perform 1 from enrollments where id=p_enrollment_id for update;
  quote := preview_tuition_term(p_enrollment_id,p_tuition_plan_id,p_starts_on,p_discount_type,p_discount_value,p_discount_name);
  if length(p_notes)>2000 then raise exception 'Notes too long'; end if;
  insert into enrollment_tuition(enrollment_id,tuition_plan_id,starts_on,status,discount_type,discount_value,discount_name,notes)
  values(p_enrollment_id,p_tuition_plan_id,(quote->>'starts_on')::date,
    case when (quote->>'starts_on')::date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then 'SCHEDULED' else 'ACTIVE' end,
    p_discount_type,p_discount_value,p_discount_name,p_notes) returning id into result;
  return result;
end $$;

create function public.preview_tuition_discount(p_tuition_id uuid,p_discount_type text,p_discount_value numeric,p_discount_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t enrollment_tuition%rowtype; discount numeric(14,2);
begin
  if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'SUPER_ADMIN role required'; end if;
  select * into t from enrollment_tuition where id=p_tuition_id;
  if not found or t.status='CANCELLED' then raise exception 'Tuition unavailable'; end if;
  if exists(select 1 from invoices where enrollment_tuition_id=t.id) then raise exception 'Tuition discount cannot change after invoice creation'; end if;
  if p_discount_type is null or p_discount_type not in ('NONE','PERCENT','FIXED') or p_discount_value is null then raise exception 'Invalid discount'; end if;
  if p_discount_type<>'NONE' and nullif(btrim(p_discount_name),'') is null then raise exception 'Discount name required'; end if;
  if length(p_discount_name)>300 then raise exception 'Discount name too long'; end if;
  discount := calculate_tuition_discount_amount(t.list_price,p_discount_type,p_discount_value);
  return jsonb_build_object('list_price',t.list_price,'currency',t.currency,'discount_amount',discount,'amount',t.list_price-discount,
    'starts_on',t.starts_on,'base_ends_on',t.base_ends_on,'branch_name',t.branch_name_snapshot,'plan_name',t.plan_name_snapshot);
end $$;

create function public.update_tuition_discount(p_tuition_id uuid,p_discount_type text,p_discount_value numeric,p_discount_name text)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'SUPER_ADMIN role required'; end if;
  -- Same row lock as create_tuition_invoice, preventing invoice/discount races.
  perform 1 from enrollment_tuition where id=p_tuition_id for update;
  perform preview_tuition_discount(p_tuition_id,p_discount_type,p_discount_value,p_discount_name);
  update enrollment_tuition set discount_type=p_discount_type,discount_value=p_discount_value,discount_name=p_discount_name where id=p_tuition_id;
  return p_tuition_id;
end $$;
revoke all on function public.preview_tuition_term(uuid,uuid,date,text,numeric,text),public.create_tuition_term(uuid,uuid,date,text,numeric,text,text),public.preview_tuition_discount(uuid,text,numeric,text),public.update_tuition_discount(uuid,text,numeric,text) from public;
grant execute on function public.preview_tuition_term(uuid,uuid,date,text,numeric,text),public.create_tuition_term(uuid,uuid,date,text,numeric,text,text),public.preview_tuition_discount(uuid,text,numeric,text),public.update_tuition_discount(uuid,text,numeric,text) to authenticated;
