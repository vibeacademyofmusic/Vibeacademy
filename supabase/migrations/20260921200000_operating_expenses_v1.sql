-- VIBE Academy — Recurring branch operating expenses V1
-- Records cost recognition only. Does not mark money as paid.
-- Additive. Local apply via migration up. Do not reset or remote-push from this change.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_OPERATING_EXPENSE_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;
  if to_regclass('public.branches') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.is_global_super_admin()') is null
     or to_regprocedure('public.has_role_permission(text,text,uuid)') is null then
    raise exception 'VIBE_OPERATING_EXPENSE_PREREQUISITE_MISSING';
  end if;
  if to_regnamespace('vibe_operating_expense_private') is not null
     or to_regclass('public.operating_expense_templates') is not null
     or to_regclass('public.operating_expense_records') is not null
     or to_regclass('public.operating_expense_events') is not null then
    raise exception 'VIBE_OPERATING_EXPENSE_OBJECT_ALREADY_EXISTS';
  end if;
end;
$preflight$;

insert into public.permissions(code,name,module)
values
  ('operating_expense.view','View recurring operating expenses','finance'),
  ('operating_expense.manage','Manage recurring operating expenses','finance')
on conflict(code) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='FINANCE' and p.code in ('operating_expense.view','operating_expense.manage')
on conflict do nothing;

create schema vibe_operating_expense_private authorization postgres;
revoke all on schema vibe_operating_expense_private from public,anon,authenticated,service_role;

create table public.operating_expense_templates (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  category text not null check (category in (
    'RENT','ELECTRICITY','WATER','INTERNET','FIXED_PHONE','SECURITY','CLEANING','SOFTWARE','MAINTENANCE','OTHER'
  )),
  custom_category_name text,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  vendor text check (vendor is null or char_length(btrim(vendor)) between 1 and 200),
  amount_mode text not null check (amount_mode in ('FIXED','VARIABLE')),
  expected_amount numeric(16,2),
  currency text not null default 'VND' check (currency ~ '^[A-Z]{3}$'),
  recurrence text not null default 'MONTHLY' check (recurrence='MONTHLY'),
  effective_from date not null check (isfinite(effective_from)),
  effective_to date check (effective_to is null or (isfinite(effective_to) and effective_to>=effective_from)),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  version integer not null default 1 check (version>0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  retired_by uuid references auth.users(id) on delete restrict,
  retired_at timestamptz,
  retire_reason text,
  constraint operating_expense_template_other_name check (
    (category='OTHER' and custom_category_name is not null and char_length(btrim(custom_category_name)) between 1 and 100)
    or (category<>'OTHER' and custom_category_name is null)
  ),
  constraint operating_expense_template_amount_mode check (
    (amount_mode='FIXED' and expected_amount is not null and expected_amount>0 and expected_amount<>'NaN'::numeric)
    or (amount_mode='VARIABLE' and (expected_amount is null or (expected_amount>0 and expected_amount<>'NaN'::numeric)))
  ),
  constraint operating_expense_template_money_scale check (
    expected_amount is null or (expected_amount=round(expected_amount,2) and (currency<>'VND' or expected_amount=trunc(expected_amount)))
  ),
  constraint operating_expense_template_retire_shape check (
    (status='ACTIVE' and retired_by is null and retired_at is null and retire_reason is null)
    or (status='RETIRED' and retired_by is not null and retired_at is not null and char_length(btrim(retire_reason)) between 1 and 2000)
  )
);

create table public.operating_expense_records (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.operating_expense_templates(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  expense_month date not null check (isfinite(expense_month) and extract(day from expense_month)=1),
  expense_date date check (expense_date is null or isfinite(expense_date)),
  due_date date check (due_date is null or isfinite(due_date)),
  category text not null,
  custom_category_name text,
  name text not null,
  vendor text,
  expected_amount numeric(16,2),
  actual_amount numeric(16,2),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reference text check (reference is null or char_length(btrim(reference)) between 1 and 200),
  note text check (note is null or char_length(btrim(note)) between 1 and 2000),
  status text not null default 'DRAFT' check (status in ('DRAFT','RECORDED','CANCELLED')),
  version integer not null default 1 check (version>0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  recorded_by uuid references auth.users(id) on delete restrict,
  recorded_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  constraint operating_expense_record_actual_state check (
    (status='DRAFT' and actual_amount is null and recorded_by is null and recorded_at is null
      and cancelled_by is null and cancelled_at is null and cancel_reason is null)
    or (status='RECORDED' and actual_amount is not null and actual_amount>0 and actual_amount<>'NaN'::numeric
      and actual_amount=round(actual_amount,2) and (currency<>'VND' or actual_amount=trunc(actual_amount))
      and recorded_by is not null and recorded_at is not null
      and cancelled_by is null and cancelled_at is null and cancel_reason is null)
    or (status='CANCELLED' and cancelled_by is not null and cancelled_at is not null
      and char_length(btrim(cancel_reason)) between 1 and 2000)
  ),
  constraint operating_expense_record_expected_scale check (
    expected_amount is null or (expected_amount=round(expected_amount,2) and expected_amount>=0
      and (currency<>'VND' or expected_amount=trunc(expected_amount)))
  )
);

create unique index operating_expense_record_active_month
  on public.operating_expense_records(template_id,expense_month)
  where status in ('DRAFT','RECORDED');

create index operating_expense_template_branch_status
  on public.operating_expense_templates(branch_id,status,category,id);
create index operating_expense_record_list
  on public.operating_expense_records(branch_id,expense_month desc,status,id);

create table public.operating_expense_events (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.operating_expense_templates(id) on delete restrict,
  record_id uuid references public.operating_expense_records(id) on delete restrict,
  event_type text not null check (event_type in (
    'TEMPLATE_CREATED','TEMPLATE_UPDATED','TEMPLATE_RETIRED','MONTH_PREPARED','DRAFT_SAVED','RECORDED','CANCELLED'
  )),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  request_key uuid not null,
  request_payload jsonb not null,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  result jsonb not null,
  unique(actor_id,request_key)
);

create index operating_expense_event_record
  on public.operating_expense_events(record_id,created_at,id);

create function public.can_read_operating_expense_branch(p_branch uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(public.account_is_active(),false)
    and p_branch is not null
    and (
      public.is_global_super_admin()
      or public.has_role_permission('FINANCE','operating_expense.view',p_branch)
      or public.has_role_permission('FINANCE','operating_expense.manage',p_branch)
    );
$$;

create function vibe_operating_expense_private.can_manage(p_branch uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(public.account_is_active(),false)
    and p_branch is not null
    and (
      public.is_global_super_admin()
      or public.has_role_permission('FINANCE','operating_expense.manage',p_branch)
    );
$$;

create function vibe_operating_expense_private.month_start(p_month date)
returns date
language sql immutable
set search_path = public, pg_temp
as $$
  select case when p_month is null or not isfinite(p_month) then null else date_trunc('month',p_month)::date end
$$;

create function vibe_operating_expense_private.money_ok(p_amount numeric,p_currency text,p_required boolean)
returns boolean
language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when p_amount is null then not p_required
    when p_amount<='0'::numeric or p_amount='NaN'::numeric or p_amount<>round(p_amount,2) then false
    when p_currency='VND' and p_amount<>trunc(p_amount) then false
    else true
  end
$$;

create function vibe_operating_expense_private.record_view(p_record uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'record',to_jsonb(r),
    'branch',jsonb_build_object('id',b.id,'name',b.name,'code',b.code),
    'template',jsonb_build_object(
      'id',t.id,'name',t.name,'status',t.status,'amount_mode',t.amount_mode,
      'expected_amount',t.expected_amount,'vendor',t.vendor,'version',t.version
    ),
    'expected_amount',r.expected_amount,
    'actual_amount',case when r.status='RECORDED' then r.actual_amount else null end,
    'variance_amount',case when r.status='RECORDED' and r.expected_amount is not null then r.actual_amount-r.expected_amount else null end,
    'payment_status','NO_OUTGOING_PAYMENT_LEDGER'
  )
  from public.operating_expense_records r
  join public.operating_expense_templates t on t.id=r.template_id
  join public.branches b on b.id=r.branch_id
  where r.id=p_record
$$;

create function vibe_operating_expense_private.replay(p_key uuid,p_payload jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare ev public.operating_expense_events;
begin
  if auth.uid() is null or p_key is null then raise exception 'OPERATING_EXPENSE_REQUEST_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vibe_operating_expense:'||auth.uid()::text||':'||p_key::text,0));
  select * into ev from public.operating_expense_events where actor_id=auth.uid() and request_key=p_key;
  if found then
    if ev.request_payload is distinct from p_payload then raise exception 'OPERATING_EXPENSE_REQUEST_KEY_REUSED'; end if;
    return ev.result;
  end if;
  return null;
end;
$fn$;

create function vibe_operating_expense_private.write_event(
  p_template uuid,p_record uuid,p_type text,p_key uuid,p_payload jsonb,p_before jsonb,p_after jsonb,p_result jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.operating_expense_events(
    template_id,record_id,event_type,actor_id,request_key,request_payload,before_snapshot,after_snapshot,result
  ) values(p_template,p_record,p_type,auth.uid(),p_key,p_payload,p_before,p_after,p_result);
  return p_result;
end;
$fn$;

create function vibe_operating_expense_private.guard_template()
returns trigger language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if tg_op='DELETE' then raise exception 'OPERATING_EXPENSE_USE_RETIREMENT'; end if;
  if old.status='RETIRED' then raise exception 'OPERATING_EXPENSE_TEMPLATE_RETIRED'; end if;
  if new.id is distinct from old.id or new.branch_id is distinct from old.branch_id or new.created_by is distinct from old.created_by then
    raise exception 'OPERATING_EXPENSE_TEMPLATE_IDENTITY_IMMUTABLE';
  end if;
  if new.version<>old.version+1 then raise exception 'OPERATING_EXPENSE_VERSION_MUST_INCREMENT'; end if;
  if not (
    (old.status='ACTIVE' and new.status in ('ACTIVE','RETIRED'))
  ) then raise exception 'OPERATING_EXPENSE_INVALID_TEMPLATE_TRANSITION'; end if;
  return new;
end;
$fn$;

create function vibe_operating_expense_private.guard_record()
returns trigger language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if tg_op='DELETE' then raise exception 'OPERATING_EXPENSE_USE_CANCELLATION'; end if;
  if new.id is distinct from old.id or new.template_id is distinct from old.template_id
     or new.branch_id is distinct from old.branch_id or new.expense_month is distinct from old.expense_month
     or new.category is distinct from old.category or new.custom_category_name is distinct from old.custom_category_name
     or new.name is distinct from old.name or new.currency is distinct from old.currency
     or new.expected_amount is distinct from old.expected_amount then
    raise exception 'OPERATING_EXPENSE_RECORD_SNAPSHOT_IMMUTABLE';
  end if;
  if new.version<>old.version+1 then raise exception 'OPERATING_EXPENSE_VERSION_MUST_INCREMENT'; end if;
  if old.status='CANCELLED' then raise exception 'OPERATING_EXPENSE_ALREADY_CANCELLED'; end if;
  if old.status='RECORDED' then
    if new.status<>'CANCELLED' then raise exception 'OPERATING_EXPENSE_RECORDED_IMMUTABLE'; end if;
    if new.actual_amount is distinct from old.actual_amount or new.expense_date is distinct from old.expense_date
       or new.due_date is distinct from old.due_date or new.vendor is distinct from old.vendor
       or new.reference is distinct from old.reference or new.note is distinct from old.note
       or new.recorded_by is distinct from old.recorded_by or new.recorded_at is distinct from old.recorded_at then
      raise exception 'OPERATING_EXPENSE_RECORDED_IMMUTABLE';
    end if;
  elsif old.status='DRAFT' and new.status not in ('DRAFT','RECORDED','CANCELLED') then
    raise exception 'OPERATING_EXPENSE_INVALID_TRANSITION';
  end if;
  return new;
end;
$fn$;

create function vibe_operating_expense_private.guard_event()
returns trigger language plpgsql
set search_path = public, pg_temp
as $fn$
begin raise exception 'OPERATING_EXPENSE_EVENT_HISTORY_IMMUTABLE'; end;
$fn$;

create trigger operating_expense_template_guard
before update or delete on public.operating_expense_templates
for each row execute function vibe_operating_expense_private.guard_template();

create trigger operating_expense_record_guard
before update or delete on public.operating_expense_records
for each row execute function vibe_operating_expense_private.guard_record();

create trigger operating_expense_event_guard
before update or delete on public.operating_expense_events
for each row execute function vibe_operating_expense_private.guard_event();

alter table public.operating_expense_templates enable row level security;
alter table public.operating_expense_records enable row level security;
alter table public.operating_expense_events enable row level security;

create policy operating_expense_template_read on public.operating_expense_templates
  for select to authenticated using (public.can_read_operating_expense_branch(branch_id));
create policy operating_expense_record_read on public.operating_expense_records
  for select to authenticated using (public.can_read_operating_expense_branch(branch_id));
create policy operating_expense_event_read on public.operating_expense_events
  for select to authenticated using (
    (template_id is not null and exists(select 1 from public.operating_expense_templates t where t.id=template_id and public.can_read_operating_expense_branch(t.branch_id)))
    or (record_id is not null and exists(select 1 from public.operating_expense_records r where r.id=record_id and public.can_read_operating_expense_branch(r.branch_id)))
  );

revoke all on public.operating_expense_templates, public.operating_expense_records, public.operating_expense_events
  from public,anon,authenticated,service_role;
grant select on public.operating_expense_templates, public.operating_expense_records, public.operating_expense_events
  to authenticated;

create function public.list_operating_expense_context()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  if not (
    public.is_global_super_admin()
    or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
      where ur.user_id=auth.uid() and r.code='FINANCE' and ur.is_active
        and (ur.valid_from is null or ur.valid_from<=now()) and (ur.valid_until is null or ur.valid_until>now())
        and exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
          where rp.role_id=r.id and p.code in ('operating_expense.view','operating_expense.manage')))
  ) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;

  return jsonb_build_object(
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'code',b.code) order by b.name,b.id)
      from public.branches b where b.status='ACTIVE' and public.can_read_operating_expense_branch(b.id)),'[]'::jsonb),
    'templates',coalesce((select jsonb_agg(jsonb_build_object(
        'id',t.id,'branch_id',t.branch_id,'branch_name',b.name,'category',t.category,
        'custom_category_name',t.custom_category_name,'name',t.name,'vendor',t.vendor,
        'amount_mode',t.amount_mode,'expected_amount',t.expected_amount,'currency',t.currency,
        'effective_from',t.effective_from,'effective_to',t.effective_to,'status',t.status,'version',t.version
      ) order by b.name,t.name,t.id)
      from public.operating_expense_templates t
      join public.branches b on b.id=t.branch_id
      where public.can_read_operating_expense_branch(t.branch_id)),'[]'::jsonb),
    'categories',jsonb_build_array(
      'RENT','ELECTRICITY','WATER','INTERNET','FIXED_PHONE','SECURITY','CLEANING','SOFTWARE','MAINTENANCE','OTHER'
    ),
    'payment_status','NO_OUTGOING_PAYMENT_LEDGER'
  );
end;
$fn$;

create function public.list_operating_expenses(
  p_month date default null,
  p_branch uuid default null,
  p_category text default null,
  p_status text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare month_value date; result jsonb;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'OPERATING_EXPENSE_INVALID_PAGE'; end if;
  if p_status is not null and p_status not in ('DRAFT','RECORDED','CANCELLED') then raise exception 'OPERATING_EXPENSE_INVALID_STATUS'; end if;
  if p_category is not null and p_category not in (
    'RENT','ELECTRICITY','WATER','INTERNET','FIXED_PHONE','SECURITY','CLEANING','SOFTWARE','MAINTENANCE','OTHER'
  ) then raise exception 'OPERATING_EXPENSE_INVALID_CATEGORY'; end if;
  if p_search is not null and char_length(btrim(p_search))>100 then raise exception 'OPERATING_EXPENSE_INVALID_SEARCH'; end if;
  month_value:=vibe_operating_expense_private.month_start(p_month);

  with visible as (
    select r.id,r.template_id,r.branch_id,b.name branch_name,r.expense_month,r.category,r.custom_category_name,
      r.name,r.vendor,r.expected_amount,
      case when r.status='RECORDED' then r.actual_amount else null end actual_amount,
      case when r.status='RECORDED' and r.expected_amount is not null then r.actual_amount-r.expected_amount else null end variance_amount,
      r.currency,r.status,r.version,r.expense_date,r.due_date
    from public.operating_expense_records r
    join public.branches b on b.id=r.branch_id
    where public.can_read_operating_expense_branch(r.branch_id)
      and (month_value is null or r.expense_month=month_value)
      and (p_branch is null or r.branch_id=p_branch)
      and (p_category is null or r.category=p_category)
      and (p_status is null or r.status=p_status)
      and (p_search is null or btrim(p_search)='' or r.name ilike '%'||btrim(p_search)||'%'
        or coalesce(r.vendor,'') ilike '%'||btrim(p_search)||'%'
        or coalesce(r.custom_category_name,'') ilike '%'||btrim(p_search)||'%'
        or coalesce(r.reference,'') ilike '%'||btrim(p_search)||'%')
  ), page_rows as (
    select * from visible order by expense_month desc,name,id limit p_limit+1 offset p_offset
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(q) order by q.expense_month desc,q.name,q.id)
      from (select * from page_rows order by expense_month desc,name,id limit p_limit) q),'[]'::jsonb),
    'has_more',(select count(*)>p_limit from page_rows),
    'limit',p_limit,'offset',p_offset,
    'payment_status','NO_OUTGOING_PAYMENT_LEDGER'
  ) into result;
  return result;
end;
$fn$;

create function public.get_operating_expense(p_record uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare rec public.operating_expense_records; view jsonb;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  select * into rec from public.operating_expense_records where id=p_record;
  if not found or not public.can_read_operating_expense_branch(rec.branch_id) then return null; end if;
  view:=vibe_operating_expense_private.record_view(p_record);
  return view;
end;
$fn$;

create function public.create_operating_expense_template(
  p_branch uuid,p_category text,p_custom_category_name text,p_name text,p_vendor text,
  p_amount_mode text,p_expected_amount numeric,p_currency text,p_effective_from date,p_effective_to date,p_key uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  payload jsonb; prior jsonb; template_id uuid:=gen_random_uuid(); custom_name text; vendor_name text; currency_code text;
  result jsonb;
begin
  if not vibe_operating_expense_private.can_manage(p_branch) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  if not exists(select 1 from public.branches where id=p_branch and status='ACTIVE') then raise exception 'OPERATING_EXPENSE_BRANCH_REQUIRED'; end if;
  if p_category is null or p_category not in (
    'RENT','ELECTRICITY','WATER','INTERNET','FIXED_PHONE','SECURITY','CLEANING','SOFTWARE','MAINTENANCE','OTHER'
  ) then raise exception 'OPERATING_EXPENSE_INVALID_CATEGORY'; end if;
  custom_name:=nullif(btrim(coalesce(p_custom_category_name,'')),'');
  if p_category='OTHER' then
    if custom_name is null or char_length(custom_name)>100 then raise exception 'OPERATING_EXPENSE_CUSTOM_CATEGORY_REQUIRED'; end if;
  elsif custom_name is not null then
    raise exception 'OPERATING_EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then raise exception 'OPERATING_EXPENSE_NAME_REQUIRED'; end if;
  vendor_name:=nullif(btrim(coalesce(p_vendor,'')),'');
  if vendor_name is not null and char_length(vendor_name)>200 then raise exception 'OPERATING_EXPENSE_INVALID_VENDOR'; end if;
  if p_amount_mode not in ('FIXED','VARIABLE') then raise exception 'OPERATING_EXPENSE_INVALID_AMOUNT_MODE'; end if;
  currency_code:=upper(coalesce(p_currency,'VND'));
  if currency_code !~ '^[A-Z]{3}$' then raise exception 'OPERATING_EXPENSE_INVALID_CURRENCY'; end if;
  if p_expected_amount is not null and currency_code='VND' and p_expected_amount<>trunc(p_expected_amount) then
    raise exception 'OPERATING_EXPENSE_VND_REQUIRES_WHOLE_DONG';
  end if;
  if p_amount_mode='FIXED' then
    if not vibe_operating_expense_private.money_ok(p_expected_amount,currency_code,true) then raise exception 'OPERATING_EXPENSE_FIXED_AMOUNT_REQUIRED'; end if;
  elsif p_expected_amount is not null and not vibe_operating_expense_private.money_ok(p_expected_amount,currency_code,true) then
    raise exception 'OPERATING_EXPENSE_INVALID_AMOUNT';
  end if;
  if p_effective_from is null or not isfinite(p_effective_from) then raise exception 'OPERATING_EXPENSE_EFFECTIVE_FROM_REQUIRED'; end if;
  if p_effective_to is not null and (not isfinite(p_effective_to) or p_effective_to<p_effective_from) then raise exception 'OPERATING_EXPENSE_INVALID_EFFECTIVE_TO'; end if;

  payload:=jsonb_build_object(
    'operation','TEMPLATE_CREATED','branch_id',p_branch,'category',p_category,'custom_category_name',custom_name,
    'name',btrim(p_name),'vendor',vendor_name,'amount_mode',p_amount_mode,'expected_amount',p_expected_amount,
    'currency',currency_code,'effective_from',p_effective_from,'effective_to',p_effective_to
  );
  prior:=vibe_operating_expense_private.replay(p_key,payload);
  if prior is not null then return prior; end if;

  insert into public.operating_expense_templates(
    id,branch_id,category,custom_category_name,name,vendor,amount_mode,expected_amount,currency,effective_from,effective_to,created_by
  ) values(
    template_id,p_branch,p_category,custom_name,btrim(p_name),vendor_name,p_amount_mode,p_expected_amount,currency_code,
    p_effective_from,p_effective_to,auth.uid()
  );
  result:=jsonb_build_object('template_id',template_id,'status','ACTIVE');
  return vibe_operating_expense_private.write_event(template_id,null,'TEMPLATE_CREATED',p_key,payload,null,to_jsonb((select t from public.operating_expense_templates t where t.id=template_id)),result);
end;
$fn$;

create function public.update_operating_expense_template(
  p_template uuid,p_version integer,p_category text,p_custom_category_name text,p_name text,p_vendor text,
  p_amount_mode text,p_expected_amount numeric,p_currency text,p_effective_from date,p_effective_to date,p_key uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  target public.operating_expense_templates; payload jsonb; prior jsonb; custom_name text; vendor_name text; currency_code text; result jsonb; before_data jsonb;
begin
  select * into target from public.operating_expense_templates where id=p_template for update;
  if not found then raise exception 'OPERATING_EXPENSE_TEMPLATE_NOT_FOUND'; end if;
  if not vibe_operating_expense_private.can_manage(target.branch_id) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  if target.status<>'ACTIVE' then raise exception 'OPERATING_EXPENSE_TEMPLATE_RETIRED'; end if;
  if p_version is distinct from target.version then raise exception 'OPERATING_EXPENSE_CHANGED_RELOAD'; end if;
  if p_category is null or p_category not in (
    'RENT','ELECTRICITY','WATER','INTERNET','FIXED_PHONE','SECURITY','CLEANING','SOFTWARE','MAINTENANCE','OTHER'
  ) then raise exception 'OPERATING_EXPENSE_INVALID_CATEGORY'; end if;
  custom_name:=nullif(btrim(coalesce(p_custom_category_name,'')),'');
  if p_category='OTHER' then
    if custom_name is null or char_length(custom_name)>100 then raise exception 'OPERATING_EXPENSE_CUSTOM_CATEGORY_REQUIRED'; end if;
  elsif custom_name is not null then
    raise exception 'OPERATING_EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 200 then raise exception 'OPERATING_EXPENSE_NAME_REQUIRED'; end if;
  vendor_name:=nullif(btrim(coalesce(p_vendor,'')),'');
  currency_code:=upper(coalesce(p_currency,target.currency));
  if p_amount_mode not in ('FIXED','VARIABLE') then raise exception 'OPERATING_EXPENSE_INVALID_AMOUNT_MODE'; end if;
  if p_amount_mode='FIXED' and not vibe_operating_expense_private.money_ok(p_expected_amount,currency_code,true) then
    raise exception 'OPERATING_EXPENSE_FIXED_AMOUNT_REQUIRED';
  end if;
  if p_expected_amount is not null and currency_code='VND' and p_expected_amount<>trunc(p_expected_amount) then
    raise exception 'OPERATING_EXPENSE_VND_REQUIRES_WHOLE_DONG';
  end if;
  if p_effective_from is null or not isfinite(p_effective_from) then raise exception 'OPERATING_EXPENSE_EFFECTIVE_FROM_REQUIRED'; end if;
  if p_effective_to is not null and (not isfinite(p_effective_to) or p_effective_to<p_effective_from) then raise exception 'OPERATING_EXPENSE_INVALID_EFFECTIVE_TO'; end if;
  payload:=jsonb_build_object(
    'operation','TEMPLATE_UPDATED','template_id',p_template,'version',p_version,'category',p_category,
    'custom_category_name',custom_name,'name',btrim(p_name),'vendor',vendor_name,'amount_mode',p_amount_mode,
    'expected_amount',p_expected_amount,'currency',currency_code,'effective_from',p_effective_from,'effective_to',p_effective_to
  );
  prior:=vibe_operating_expense_private.replay(p_key,payload);
  if prior is not null then return prior; end if;
  before_data:=to_jsonb(target);
  update public.operating_expense_templates set
    category=p_category,custom_category_name=custom_name,name=btrim(p_name),vendor=vendor_name,amount_mode=p_amount_mode,
    expected_amount=p_expected_amount,currency=currency_code,effective_from=p_effective_from,effective_to=p_effective_to,
    version=version+1,updated_at=clock_timestamp()
  where id=p_template;
  result:=jsonb_build_object('template_id',p_template,'status','ACTIVE','version',p_version+1);
  return vibe_operating_expense_private.write_event(p_template,null,'TEMPLATE_UPDATED',p_key,payload,before_data,to_jsonb((select t from public.operating_expense_templates t where t.id=p_template)),result);
end;
$fn$;

create function public.retire_operating_expense_template(p_template uuid,p_version integer,p_reason text,p_key uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare target public.operating_expense_templates; payload jsonb; prior jsonb; result jsonb; before_data jsonb;
begin
  select * into target from public.operating_expense_templates where id=p_template for update;
  if not found then raise exception 'OPERATING_EXPENSE_TEMPLATE_NOT_FOUND'; end if;
  if not vibe_operating_expense_private.can_manage(target.branch_id) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'OPERATING_EXPENSE_RETIRE_REASON_REQUIRED'; end if;
  payload:=jsonb_build_object('operation','TEMPLATE_RETIRED','template_id',p_template,'version',p_version,'reason',btrim(p_reason));
  prior:=vibe_operating_expense_private.replay(p_key,payload);
  if prior is not null then return prior; end if;
  if target.status='RETIRED' then raise exception 'OPERATING_EXPENSE_TEMPLATE_RETIRED'; end if;
  if p_version is distinct from target.version then raise exception 'OPERATING_EXPENSE_CHANGED_RELOAD'; end if;
  before_data:=to_jsonb(target);
  update public.operating_expense_templates set
    status='RETIRED',retired_by=auth.uid(),retired_at=clock_timestamp(),retire_reason=btrim(p_reason),
    version=version+1,updated_at=clock_timestamp()
  where id=p_template;
  result:=jsonb_build_object('template_id',p_template,'status','RETIRED');
  return vibe_operating_expense_private.write_event(p_template,null,'TEMPLATE_RETIRED',p_key,payload,before_data,to_jsonb((select t from public.operating_expense_templates t where t.id=p_template)),result);
end;
$fn$;

create function public.prepare_operating_expense_month(p_month date,p_branch uuid,p_key uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  month_value date:=vibe_operating_expense_private.month_start(p_month);
  payload jsonb; prior jsonb; created uuid[]:='{}'; skipped integer:=0; tpl record; record_id uuid; result jsonb;
begin
  if not vibe_operating_expense_private.can_manage(p_branch) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  if month_value is null then raise exception 'OPERATING_EXPENSE_MONTH_REQUIRED'; end if;
  payload:=jsonb_build_object('operation','MONTH_PREPARED','month',month_value,'branch_id',p_branch);
  prior:=vibe_operating_expense_private.replay(p_key,payload);
  if prior is not null then return prior; end if;

  for tpl in
    select * from public.operating_expense_templates
    where branch_id=p_branch and status='ACTIVE'
      and date_trunc('month',effective_from)::date<=month_value
      and (effective_to is null or date_trunc('month',effective_to)::date>=month_value)
    order by name,id
    for update
  loop
    if exists(select 1 from public.operating_expense_records r where r.template_id=tpl.id and r.expense_month=month_value and r.status in ('DRAFT','RECORDED')) then
      skipped:=skipped+1;
      continue;
    end if;
    record_id:=gen_random_uuid();
    insert into public.operating_expense_records(
      id,template_id,branch_id,expense_month,category,custom_category_name,name,vendor,expected_amount,currency,created_by
    ) values(
      record_id,tpl.id,tpl.branch_id,month_value,tpl.category,tpl.custom_category_name,tpl.name,tpl.vendor,tpl.expected_amount,tpl.currency,auth.uid()
    );
    created:=array_append(created,record_id);
  end loop;

  result:=jsonb_build_object(
    'month',month_value,'branch_id',p_branch,'created_ids',to_jsonb(created),
    'created_count',coalesce(array_length(created,1),0),'skipped_count',skipped,
    'status','DRAFT','payment_status','NO_OUTGOING_PAYMENT_LEDGER'
  );
  return vibe_operating_expense_private.write_event(null,created[1],'MONTH_PREPARED',p_key,payload,null,result,result);
end;
$fn$;

create function public.save_operating_expense_draft(
  p_record uuid,p_version integer,p_expense_date date,p_due_date date,p_vendor text,p_reference text,p_note text,p_key uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare rec public.operating_expense_records; payload jsonb; prior jsonb; vendor_name text; reference_text text; note_text text; before_data jsonb; result jsonb;
begin
  select * into rec from public.operating_expense_records where id=p_record for update;
  if not found then raise exception 'OPERATING_EXPENSE_RECORD_NOT_FOUND'; end if;
  if not vibe_operating_expense_private.can_manage(rec.branch_id) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  payload:=jsonb_build_object(
    'operation','DRAFT_SAVED','record_id',p_record,'version',p_version,'expense_date',p_expense_date,'due_date',p_due_date,
    'vendor',nullif(btrim(coalesce(p_vendor,'')),''),'reference',nullif(btrim(coalesce(p_reference,'')),''),'note',nullif(btrim(coalesce(p_note,'')),'')
  );
  prior:=vibe_operating_expense_private.replay(p_key,payload);
  if prior is not null then return prior; end if;
  if rec.status<>'DRAFT' then raise exception 'OPERATING_EXPENSE_DRAFT_REQUIRED'; end if;
  if p_version is distinct from rec.version then raise exception 'OPERATING_EXPENSE_CHANGED_RELOAD'; end if;
  if p_expense_date is not null and not isfinite(p_expense_date) then raise exception 'OPERATING_EXPENSE_INVALID_DATE'; end if;
  if p_due_date is not null and not isfinite(p_due_date) then raise exception 'OPERATING_EXPENSE_INVALID_DATE'; end if;
  vendor_name:=nullif(btrim(coalesce(p_vendor,'')),'');
  reference_text:=nullif(btrim(coalesce(p_reference,'')),'');
  note_text:=nullif(btrim(coalesce(p_note,'')),'');
  if vendor_name is not null and char_length(vendor_name)>200 then raise exception 'OPERATING_EXPENSE_INVALID_VENDOR'; end if;
  if reference_text is not null and char_length(reference_text)>200 then raise exception 'OPERATING_EXPENSE_INVALID_REFERENCE'; end if;
  if note_text is not null and char_length(note_text)>2000 then raise exception 'OPERATING_EXPENSE_INVALID_NOTE'; end if;
  before_data:=vibe_operating_expense_private.record_view(p_record);
  update public.operating_expense_records set
    expense_date=p_expense_date,due_date=p_due_date,vendor=vendor_name,reference=reference_text,note=note_text,
    version=version+1,updated_at=clock_timestamp()
  where id=p_record;
  result:=vibe_operating_expense_private.record_view(p_record)||jsonb_build_object('record_id',p_record);
  return vibe_operating_expense_private.write_event(rec.template_id,p_record,'DRAFT_SAVED',p_key,payload,before_data,result,result);
end;
$fn$;

create function public.record_operating_expense(
  p_record uuid,p_version integer,p_expense_date date,p_due_date date,p_actual_amount numeric,
  p_vendor text,p_reference text,p_note text,p_key uuid
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare rec public.operating_expense_records; payload jsonb; prior jsonb; vendor_name text; reference_text text; note_text text; before_data jsonb; result jsonb;
begin
  select * into rec from public.operating_expense_records where id=p_record for update;
  if not found then raise exception 'OPERATING_EXPENSE_RECORD_NOT_FOUND'; end if;
  if not vibe_operating_expense_private.can_manage(rec.branch_id) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  vendor_name:=nullif(btrim(coalesce(p_vendor,'')),'');
  reference_text:=nullif(btrim(coalesce(p_reference,'')),'');
  note_text:=nullif(btrim(coalesce(p_note,'')),'');
  payload:=jsonb_build_object(
    'operation','RECORDED','record_id',p_record,'version',p_version,'expense_date',p_expense_date,'due_date',p_due_date,
    'actual_amount',p_actual_amount,'vendor',vendor_name,'reference',reference_text,'note',note_text
  );
  prior:=vibe_operating_expense_private.replay(p_key,payload);
  if prior is not null then return prior; end if;
  if rec.status<>'DRAFT' then raise exception 'OPERATING_EXPENSE_DRAFT_REQUIRED'; end if;
  if p_version is distinct from rec.version then raise exception 'OPERATING_EXPENSE_CHANGED_RELOAD'; end if;
  if p_expense_date is null or not isfinite(p_expense_date) then raise exception 'OPERATING_EXPENSE_INVALID_DATE'; end if;
  if p_due_date is not null and not isfinite(p_due_date) then raise exception 'OPERATING_EXPENSE_INVALID_DATE'; end if;
  if not vibe_operating_expense_private.money_ok(p_actual_amount,rec.currency,true) then
    if rec.currency='VND' and p_actual_amount is not null and p_actual_amount<>trunc(p_actual_amount) then
      raise exception 'OPERATING_EXPENSE_VND_REQUIRES_WHOLE_DONG';
    end if;
    raise exception 'OPERATING_EXPENSE_INVALID_AMOUNT';
  end if;
  before_data:=vibe_operating_expense_private.record_view(p_record);
  update public.operating_expense_records set
    expense_date=p_expense_date,due_date=p_due_date,actual_amount=p_actual_amount,vendor=vendor_name,
    reference=reference_text,note=note_text,status='RECORDED',recorded_by=auth.uid(),recorded_at=clock_timestamp(),
    version=version+1,updated_at=clock_timestamp()
  where id=p_record;
  result:=vibe_operating_expense_private.record_view(p_record)||jsonb_build_object('record_id',p_record,'status','RECORDED','payment_status','NO_OUTGOING_PAYMENT_LEDGER');
  return vibe_operating_expense_private.write_event(rec.template_id,p_record,'RECORDED',p_key,payload,before_data,result,result);
end;
$fn$;

create function public.cancel_operating_expense(p_record uuid,p_version integer,p_reason text,p_key uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare rec public.operating_expense_records; payload jsonb; prior jsonb; before_data jsonb; result jsonb;
begin
  select * into rec from public.operating_expense_records where id=p_record for update;
  if not found then raise exception 'OPERATING_EXPENSE_RECORD_NOT_FOUND'; end if;
  if not vibe_operating_expense_private.can_manage(rec.branch_id) then raise exception 'OPERATING_EXPENSE_UNAUTHORIZED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'OPERATING_EXPENSE_CANCEL_REASON_REQUIRED'; end if;
  payload:=jsonb_build_object('operation','CANCELLED','record_id',p_record,'version',p_version,'reason',btrim(p_reason));
  prior:=vibe_operating_expense_private.replay(p_key,payload);
  if prior is not null then return prior; end if;
  if rec.status='CANCELLED' then raise exception 'OPERATING_EXPENSE_ALREADY_CANCELLED'; end if;
  if p_version is distinct from rec.version then raise exception 'OPERATING_EXPENSE_CHANGED_RELOAD'; end if;
  before_data:=vibe_operating_expense_private.record_view(p_record);
  update public.operating_expense_records set
    status='CANCELLED',cancelled_by=auth.uid(),cancelled_at=clock_timestamp(),cancel_reason=btrim(p_reason),
    version=version+1,updated_at=clock_timestamp()
  where id=p_record;
  result:=vibe_operating_expense_private.record_view(p_record)||jsonb_build_object('record_id',p_record,'status','CANCELLED');
  return vibe_operating_expense_private.write_event(rec.template_id,p_record,'CANCELLED',p_key,payload,before_data,result,result);
end;
$fn$;

revoke all on function
  public.can_read_operating_expense_branch(uuid),
  public.list_operating_expense_context(),
  public.list_operating_expenses(date,uuid,text,text,text,integer,integer),
  public.get_operating_expense(uuid),
  public.create_operating_expense_template(uuid,text,text,text,text,text,numeric,text,date,date,uuid),
  public.update_operating_expense_template(uuid,integer,text,text,text,text,text,numeric,text,date,date,uuid),
  public.retire_operating_expense_template(uuid,integer,text,uuid),
  public.prepare_operating_expense_month(date,uuid,uuid),
  public.save_operating_expense_draft(uuid,integer,date,date,text,text,text,uuid),
  public.record_operating_expense(uuid,integer,date,date,numeric,text,text,text,uuid),
  public.cancel_operating_expense(uuid,integer,text,uuid)
from public,anon,service_role;

grant execute on function
  public.can_read_operating_expense_branch(uuid),
  public.list_operating_expense_context(),
  public.list_operating_expenses(date,uuid,text,text,text,integer,integer),
  public.get_operating_expense(uuid),
  public.create_operating_expense_template(uuid,text,text,text,text,text,numeric,text,date,date,uuid),
  public.update_operating_expense_template(uuid,integer,text,text,text,text,text,numeric,text,date,date,uuid),
  public.retire_operating_expense_template(uuid,integer,text,uuid),
  public.prepare_operating_expense_month(date,uuid,uuid),
  public.save_operating_expense_draft(uuid,integer,date,date,text,text,text,uuid),
  public.record_operating_expense(uuid,integer,date,date,numeric,text,text,text,uuid),
  public.cancel_operating_expense(uuid,integer,text,uuid)
to authenticated;

do $verify$
begin
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proname like '%operating_expense%'
      and has_function_privilege('anon',p.oid,'EXECUTE')
  ) then
    raise exception 'VIBE_OPERATING_EXPENSE_ANON_DEFINER';
  end if;
  if exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.proname like '%operating_expense%'
      and not coalesce(p.proconfig @> array['search_path=public, pg_temp'],false)
  ) then
    raise exception 'VIBE_OPERATING_EXPENSE_SEARCH_PATH_CONTRACT_FAILED';
  end if;
end;
$verify$;

notify pgrst,'reload schema';
commit;
