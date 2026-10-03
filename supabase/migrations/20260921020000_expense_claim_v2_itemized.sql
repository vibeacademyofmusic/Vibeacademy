-- VIBE Academy -- Expense Claim V2 (itemized, no receipt/evidence workflow)
-- Additive correction only. Legacy trip-summary claims and lines remain unchanged.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_EXPENSE_V2_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;
  if to_regclass('public.employee_expense_claims') is null
     or to_regclass('public.employee_expense_claim_lines') is null
     or to_regclass('public.employee_expense_claim_events') is null
     or to_regclass('public.employee_trips') is null
     or to_regclass('public.employee_trip_reviews') is null
     or to_regclass('public.payroll_period_actions_v2') is null
     or to_regprocedure('public.post_expense_claim_to_payroll_v2(uuid,integer,uuid,text,uuid)') is null then
    raise exception 'VIBE_EXPENSE_V2_PREREQUISITE_MISSING';
  end if;
  if to_regclass('public.employee_expense_claim_items_v2') is not null then
    raise exception 'VIBE_EXPENSE_V2_ALREADY_EXISTS: inspect migration history; do not overwrite';
  end if;
end;
$preflight$;

alter table public.employee_expense_claims
  add column claim_model text not null default 'LEGACY_TRIP_SUMMARY',
  add column trip_id uuid references public.employee_trips(id) on delete restrict;

alter table public.employee_expense_claims
  add constraint employee_expense_claim_model_check check (
    (claim_model='LEGACY_TRIP_SUMMARY' and trip_id is null)
    or (claim_model='ITEMIZED_V2' and trip_id is not null)
  );

create unique index employee_expense_claim_v2_active_trip
  on public.employee_expense_claims(trip_id)
  where claim_model='ITEMIZED_V2' and status not in ('REJECTED','CANCELLED');

create index employee_expense_claim_model_status_month
  on public.employee_expense_claims(claim_model,status,requested_month desc,id);

create table public.employee_expense_claim_items_v2 (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.employee_expense_claims(id) on delete restrict,
  expense_date date not null check (isfinite(expense_date)),
  category_name text not null check (char_length(btrim(category_name)) between 1 and 100),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  amount numeric(16,2) not null check (
    amount > 0 and amount <= 999999999999.99 and amount <> 'NaN'::numeric
    and amount=round(amount,2)
  ),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index employee_expense_claim_items_v2_claim_date
  on public.employee_expense_claim_items_v2(claim_id,expense_date,id);

alter table public.employee_expense_claim_items_v2 enable row level security;
create policy employee_expense_claim_items_v2_read
  on public.employee_expense_claim_items_v2
  for select to authenticated
  using (public.can_read_employee_expense_claim(claim_id));

revoke all on public.employee_expense_claim_items_v2 from public,anon,authenticated,service_role;
grant select on public.employee_expense_claim_items_v2 to authenticated;

alter table public.employee_expense_claim_events
  drop constraint employee_expense_claim_events_event_type_check;
alter table public.employee_expense_claim_events
  add constraint employee_expense_claim_events_event_type_check check (event_type in (
    'CREATED','LINE_SAVED','LINE_REMOVED','ITEM_SAVED','ITEM_REMOVED',
    'SUBMITTED','RETURNED','APPROVED','REJECTED','CANCELLED'
  ));

create or replace function vibe_expense_private.snapshot(p_claim uuid)
returns jsonb language sql volatile security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'claim', to_jsonb(c) - 'submitted_snapshot',
    'lines', case when c.claim_model='LEGACY_TRIP_SUMMARY' then
      coalesce((select jsonb_agg(to_jsonb(l) order by l.id)
        from public.employee_expense_claim_lines l where l.claim_id=c.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'items', case when c.claim_model='ITEMIZED_V2' then
      coalesce((select jsonb_agg(to_jsonb(i) order by i.expense_date,i.id)
        from public.employee_expense_claim_items_v2 i where i.claim_id=c.id), '[]'::jsonb)
      else '[]'::jsonb end,
    'total_amount', case when c.claim_model='ITEMIZED_V2' then
      coalesce((select sum(i.amount) from public.employee_expense_claim_items_v2 i where i.claim_id=c.id),0)
      else coalesce((select sum(l.total_amount) from public.employee_expense_claim_lines l where l.claim_id=c.id),0) end,
    'payroll_posting', coalesce((select jsonb_build_object(
        'action_id',a.id,'period_id',a.period_id,'status',a.status,'created_at',a.created_at
      ) from public.payroll_period_actions_v2 a
      where a.source_expense_claim_id=c.id and a.status='ACTIVE'
      order by a.created_at desc limit 1), jsonb_build_object('status','NOT_POSTED')),
    'payment_status','NO_AUTHORITATIVE_PAYMENT_EVIDENCE'
  ) from public.employee_expense_claims c where c.id=p_claim;
$fn$;

create or replace function vibe_expense_private.guard_item_v2_history()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $fn$
declare parent_id uuid; parent_status text; parent_model text; parent_currency text;
begin
  parent_id:=case when tg_op='INSERT' then new.claim_id else old.claim_id end;
  select status,claim_model,currency into parent_status,parent_model,parent_currency
  from public.employee_expense_claims where id=parent_id for update;
  if parent_model is distinct from 'ITEMIZED_V2' then raise exception 'EXPENSE_V2_ITEM_REQUIRES_V2_CLAIM'; end if;
  if parent_status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_V2_ITEMS_LOCKED'; end if;
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.claim_id is distinct from old.claim_id) then
    raise exception 'EXPENSE_V2_ITEM_IDENTITY_IMMUTABLE';
  end if;
  if tg_op<>'DELETE' and parent_currency='VND' and new.amount<>trunc(new.amount) then
    raise exception 'EXPENSE_VND_REQUIRES_WHOLE_DONG';
  end if;
  if tg_op='DELETE' then return old; end if;
  new.category_name:=btrim(new.category_name);
  new.note:=btrim(new.note);
  return new;
end;
$fn$;

create trigger employee_expense_claim_items_v2_guard
before insert or update or delete on public.employee_expense_claim_items_v2
for each row execute function vibe_expense_private.guard_item_v2_history();

create function vibe_expense_private.current_employee_context()
returns table(employee_id uuid,branch_id uuid,employee_code text,full_name text)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select e.id,u.branch_id,e.employee_code,v.full_name
  from public.employees e
  cross join lateral (
    select ev.unit_code,ev.employment_status,ev.full_name
    from public.employee_versions ev
    where ev.employee_id=e.id
      and ev.effective_on <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
    order by ev.effective_on desc,ev.version desc limit 1
  ) v
  join public.organization_units u on u.code=v.unit_code
  join public.branches b on b.id=u.branch_id and b.status='ACTIVE'
  where e.profile_id=auth.uid() and v.employment_status='ACTIVE'
    and coalesce(public.account_is_active(),false)
    and coalesce(public.has_permission('payroll.view_own',u.branch_id),false);
$fn$;

create function public.get_expense_claim_v2_create_context()
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare ctx record;
begin
  select * into ctx from vibe_expense_private.current_employee_context();
  if ctx.employee_id is null then raise exception 'EXPENSE_ACTIVE_EMPLOYEE_LINK_AND_OWN_PERMISSION_REQUIRED'; end if;
  return jsonb_build_object(
    'employee',jsonb_build_object('id',ctx.employee_id,'employee_code',ctx.employee_code,'full_name',ctx.full_name),
    'branch',jsonb_build_object('id',ctx.branch_id,'name',(select b.name from public.branches b where b.id=ctx.branch_id)),
    'trips',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'starts_on',t.starts_on,'ends_on',t.ends_on,'reason',t.reason,
      'destination_unit',t.destination_unit
    ) order by t.starts_on desc,t.id)
    from public.employee_trips t
    join public.employee_trip_reviews r on r.trip_id=t.id and r.decision='APPROVED'
    where t.employee_id=ctx.employee_id
      and not exists(select 1 from public.employee_expense_claims c where c.trip_id=t.id and c.claim_model='ITEMIZED_V2' and c.status not in ('REJECTED','CANCELLED'))
      and not exists(select 1 from public.employee_expense_claim_lines l where l.trip_id=t.id and l.reservation_active)
    ),'[]'::jsonb)
  );
end;
$fn$;

create function public.list_employee_expense_claims_v2(p_status text default null,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  if p_status is not null and p_status not in ('DRAFT','SUBMITTED','RETURNED','APPROVED','REJECTED','CANCELLED') then raise exception 'EXPENSE_INVALID_STATUS_FILTER'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'EXPENSE_INVALID_PAGE'; end if;
  return jsonb_build_object(
    'claims',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id) from (
      select c.id,c.employee_id,c.branch_id,c.trip_id,c.claim_model,c.title,c.status,c.requested_month,c.currency,
        c.version,c.created_by,c.approved_amount,c.created_at,e.employee_code,
        (select ev.full_name from public.employee_versions ev where ev.employee_id=c.employee_id
          order by ev.effective_on desc,ev.version desc limit 1) full_name,
        case when c.claim_model='ITEMIZED_V2' then coalesce((select sum(i.amount) from public.employee_expense_claim_items_v2 i where i.claim_id=c.id),0)
          else coalesce((select sum(l.total_amount) from public.employee_expense_claim_lines l where l.claim_id=c.id),0) end total_amount,
        case when exists(select 1 from public.payroll_period_actions_v2 a where a.source_expense_claim_id=c.id and a.status='ACTIVE') then 'POSTED' else 'NOT_POSTED' end payroll_posting_state
      from public.employee_expense_claims c join public.employees e on e.id=c.employee_id
      where public.can_read_employee_expense_claim(c.id) and (p_status is null or c.status=p_status)
      order by c.created_at desc,c.id limit p_limit offset p_offset
    ) q),'[]'::jsonb),
    'limit',p_limit,'offset',p_offset
  );
end;
$fn$;

create function public.create_employee_expense_claim_v2(p_trip uuid,p_month date,p_currency text,p_key uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare ctx record; trip_row public.employee_trips%rowtype; cid uuid; payload jsonb; prior jsonb;
begin
  select * into ctx from vibe_expense_private.current_employee_context();
  if ctx.employee_id is null then raise exception 'EXPENSE_ACTIVE_EMPLOYEE_LINK_AND_OWN_PERMISSION_REQUIRED'; end if;
  if p_trip is null then raise exception 'EXPENSE_APPROVED_OWN_TRIP_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vibe_expense_trip:'||p_trip::text,0));
  select t.* into trip_row from public.employee_trips t
  join public.employee_trip_reviews r on r.trip_id=t.id and r.decision='APPROVED'
  where t.id=p_trip and t.employee_id=ctx.employee_id;
  if not found then raise exception 'EXPENSE_APPROVED_OWN_TRIP_REQUIRED'; end if;
  if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 then raise exception 'EXPENSE_INVALID_MONTH'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'EXPENSE_INVALID_CURRENCY'; end if;
  payload:=jsonb_build_object('action','CREATE_V2','employee_id',ctx.employee_id,'branch_id',ctx.branch_id,'trip_id',p_trip,'month',p_month,'currency',p_currency);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if exists(select 1 from public.employee_expense_claims c where c.trip_id=p_trip and c.claim_model='ITEMIZED_V2' and c.status not in ('REJECTED','CANCELLED'))
     or exists(select 1 from public.employee_expense_claim_lines l where l.trip_id=p_trip and l.reservation_active)
     or exists(select 1 from public.payroll_adjustments a where a.trip_id=p_trip and a.kind='TRAVEL_ALLOWANCE') then
    raise exception 'EXPENSE_TRIP_RESERVED_BY_ANOTHER_CLAIM';
  end if;
  insert into public.employee_expense_claims(employee_id,branch_id,trip_id,claim_model,requested_month,currency,title,created_by)
  values(ctx.employee_id,ctx.branch_id,p_trip,'ITEMIZED_V2',p_month,p_currency,btrim(trip_row.reason),auth.uid()) returning id into cid;
  return vibe_expense_private.record_event(cid,p_key,payload,'CREATED',null);
end;
$fn$;

create function public.save_employee_expense_claim_item_v2(
  p_claim uuid,p_version integer,p_item uuid,p_expense_date date,
  p_category_name text,p_note text,p_amount numeric,p_key uuid
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare c public.employee_expense_claims; old_item public.employee_expense_claim_items_v2; payload jsonb; prior jsonb; before_data jsonb;
begin
  select * into c from public.employee_expense_claims
  where id=p_claim and claim_model='ITEMIZED_V2' and created_by=auth.uid()
    and vibe_expense_private.owns_employee(employee_id,branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  if p_item is null or p_expense_date is null or not isfinite(p_expense_date) then raise exception 'EXPENSE_V2_ITEM_AND_DATE_REQUIRED'; end if;
  if p_category_name is null or char_length(btrim(p_category_name)) not between 1 and 100 then raise exception 'EXPENSE_V2_CATEGORY_INVALID'; end if;
  if p_note is null or char_length(btrim(p_note)) not between 1 and 2000 then raise exception 'EXPENSE_V2_NOTE_REQUIRED'; end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then raise exception 'EXPENSE_INVALID_MONEY'; end if;
  if c.currency='VND' and p_amount<>trunc(p_amount) then raise exception 'EXPENSE_VND_REQUIRES_WHOLE_DONG'; end if;
  payload:=jsonb_build_object('action','SAVE_ITEM_V2','claim_id',p_claim,'version',p_version,'item_id',p_item,
    'expense_date',p_expense_date,'category_name',btrim(p_category_name),'note',btrim(p_note),'amount',p_amount);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_V2_ITEMS_LOCKED'; end if;
  select * into old_item from public.employee_expense_claim_items_v2 where id=p_item;
  if found and old_item.claim_id<>p_claim then raise exception 'EXPENSE_V2_ITEM_UNAVAILABLE'; end if;
  before_data:=vibe_expense_private.snapshot(p_claim);
  insert into public.employee_expense_claim_items_v2(id,claim_id,expense_date,category_name,note,amount)
  values(p_item,p_claim,p_expense_date,btrim(p_category_name),btrim(p_note),p_amount)
  on conflict(id) do update set expense_date=excluded.expense_date,category_name=excluded.category_name,
    note=excluded.note,amount=excluded.amount,updated_at=clock_timestamp()
  where public.employee_expense_claim_items_v2.claim_id=p_claim;
  if not found then raise exception 'EXPENSE_V2_ITEM_UNAVAILABLE'; end if;
  if (select coalesce(sum(amount),0) from public.employee_expense_claim_items_v2 where claim_id=p_claim)>999999999999.99 then raise exception 'EXPENSE_TOTAL_TOO_LARGE'; end if;
  update public.employee_expense_claims set version=version+1,updated_at=clock_timestamp() where id=p_claim;
  return vibe_expense_private.record_event(p_claim,p_key,payload,'ITEM_SAVED',before_data);
end;
$fn$;

create function public.remove_employee_expense_claim_item_v2(p_claim uuid,p_version integer,p_item uuid,p_key uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare c public.employee_expense_claims; payload jsonb; prior jsonb; before_data jsonb;
begin
  select * into c from public.employee_expense_claims
  where id=p_claim and claim_model='ITEMIZED_V2' and created_by=auth.uid()
    and vibe_expense_private.owns_employee(employee_id,branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  payload:=jsonb_build_object('action','REMOVE_ITEM_V2','claim_id',p_claim,'version',p_version,'item_id',p_item);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_V2_ITEMS_LOCKED'; end if;
  before_data:=vibe_expense_private.snapshot(p_claim);
  delete from public.employee_expense_claim_items_v2 where id=p_item and claim_id=p_claim;
  if not found then raise exception 'EXPENSE_V2_ITEM_UNAVAILABLE'; end if;
  update public.employee_expense_claims set version=version+1,updated_at=clock_timestamp() where id=p_claim;
  return vibe_expense_private.record_event(p_claim,p_key,payload,'ITEM_REMOVED',before_data);
end;
$fn$;

create function vibe_expense_private.validate_submission_v2(p_claim uuid)
returns numeric language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; total numeric; item_count integer;
begin
  select * into strict c from public.employee_expense_claims where id=p_claim and claim_model='ITEMIZED_V2';
  if not exists(select 1 from public.employee_trips t join public.employee_trip_reviews r on r.trip_id=t.id and r.decision='APPROVED' where t.id=c.trip_id and t.employee_id=c.employee_id) then
    raise exception 'EXPENSE_APPROVED_OWN_TRIP_REQUIRED';
  end if;
  select count(*)::integer,coalesce(sum(amount),0) into item_count,total from public.employee_expense_claim_items_v2 where claim_id=p_claim;
  if item_count=0 or total<=0 then raise exception 'EXPENSE_NONEMPTY_POSITIVE_CLAIM_REQUIRED'; end if;
  if total>999999999999.99 then raise exception 'EXPENSE_TOTAL_TOO_LARGE'; end if;
  return total;
end;
$fn$;

create function public.submit_employee_expense_claim_v2(p_claim uuid,p_version integer,p_key uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare c public.employee_expense_claims; payload jsonb; prior jsonb; before_data jsonb;
begin
  select * into c from public.employee_expense_claims where id=p_claim and claim_model='ITEMIZED_V2'
    and created_by=auth.uid() and vibe_expense_private.owns_employee(employee_id,branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  payload:=jsonb_build_object('action','SUBMIT_V2','claim_id',p_claim,'version',p_version);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_INVALID_TRANSITION'; end if;
  perform vibe_expense_private.validate_submission_v2(p_claim);
  before_data:=vibe_expense_private.snapshot(p_claim);
  update public.employee_expense_claims set status='SUBMITTED',version=version+1,updated_at=clock_timestamp(),
    submitted_at=clock_timestamp(),submitted_snapshot=before_data,reviewed_by=null,reviewed_at=null,review_reason=null where id=p_claim;
  return vibe_expense_private.record_event(p_claim,p_key,payload,'SUBMITTED',before_data);
end;
$fn$;

create function public.review_employee_expense_claim_v2(p_claim uuid,p_version integer,p_decision text,p_reason text,p_key uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare c public.employee_expense_claims; payload jsonb; prior jsonb; before_data jsonb; total numeric;
begin
  select * into c from public.employee_expense_claims where id=p_claim and claim_model='ITEMIZED_V2'
    and vibe_expense_private.can_review(branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  if c.created_by=auth.uid() or exists(select 1 from public.employees e where e.id=c.employee_id and e.profile_id=auth.uid()) then
    raise exception 'EXPENSE_INDEPENDENT_REVIEWER_REQUIRED';
  end if;
  if p_decision is null or p_decision not in ('APPROVED','RETURNED','REJECTED') then raise exception 'EXPENSE_INVALID_DECISION'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'EXPENSE_REVIEW_REASON_REQUIRED'; end if;
  payload:=jsonb_build_object('action','REVIEW_V2','claim_id',p_claim,'version',p_version,'decision',p_decision,'reason',btrim(p_reason));
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status<>'SUBMITTED' then raise exception 'EXPENSE_REVIEW_REQUIRES_SUBMITTED'; end if;
  if p_decision='APPROVED' then total:=vibe_expense_private.validate_submission_v2(p_claim); end if;
  before_data:=vibe_expense_private.snapshot(p_claim);
  update public.employee_expense_claims set status=p_decision,version=version+1,updated_at=clock_timestamp(),
    reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_reason=btrim(p_reason),
    approved_amount=case when p_decision='APPROVED' then total else null end where id=p_claim;
  return vibe_expense_private.record_event(p_claim,p_key,payload,p_decision,before_data);
end;
$fn$;

-- Payroll V2 keeps the legacy validation branch and uses item totals for ITEMIZED_V2.
create or replace function public.post_expense_claim_to_payroll_v2(
  p_period uuid,p_version integer,p_claim uuid,p_reason text,p_key uuid
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare period_row public.payroll_periods%rowtype; payroll_row public.teacher_payrolls%rowtype;
  claim_row public.employee_expense_claims%rowtype; prior public.payroll_period_actions_v2%rowtype;
  inserted public.payroll_period_actions_v2%rowtype; payload jsonb; claim_snapshot jsonb;
  before_state jsonb; after_state jsonb; source_count integer; source_total numeric(16,2);
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED'; end if;
  select p.* into period_row from public.payroll_periods p where p.id=p_period
    and public.has_permission('payroll.prepare',p.branch_id)
    and (public.is_global_super_admin() or public.has_role_permission('FINANCE','payroll.prepare',p.branch_id)) for update;
  if not found then raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED'; end if;
  if p_key is null then raise exception 'PAYROLL_V2_ACTION_KEY_REQUIRED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'PAYROLL_V2_ACTION_REASON_REQUIRED'; end if;
  payload:=jsonb_build_object('action','POST_EXPENSE_CLAIM','period_id',p_period,'period_version',p_version,'claim_id',p_claim,'reason',btrim(p_reason));
  select * into prior from public.payroll_period_actions_v2 a where a.created_by=auth.uid() and a.request_key=p_key;
  if found then
    if prior.request_payload is distinct from payload then raise exception 'PAYROLL_V2_ACTION_KEY_ALREADY_USED'; end if;
    return jsonb_build_object('status',case when prior.status='ACTIVE' then 'ALREADY_POSTED' else 'ALREADY_CANCELLED' end,
      'action_id',prior.id,'claim_id',prior.source_expense_claim_id,'amount',prior.amount,'currency',prior.currency,
      'payment_status','NOT_PAID_BY_THIS_ACTION');
  end if;
  if period_row.version is distinct from p_version then raise exception 'PAYROLL_V2_PERIOD_CHANGED_RELOAD'; end if;
  if period_row.status not in ('GENERATED','REVIEW') then raise exception 'PAYROLL_V2_ACTION_REQUIRES_GENERATED_OR_REVIEW'; end if;
  select c.* into claim_row from public.employee_expense_claims c where c.id=p_claim for update;
  if not found then raise exception 'PAYROLL_V2_EXPENSE_CLAIM_UNAVAILABLE'; end if;
  if claim_row.status<>'APPROVED' or claim_row.approved_amount is null or claim_row.approved_amount<=0 then raise exception 'PAYROLL_V2_EXPENSE_CLAIM_NOT_APPROVED'; end if;
  if claim_row.branch_id is distinct from period_row.branch_id or claim_row.requested_month is distinct from period_row.starts_on then raise exception 'PAYROLL_V2_EXPENSE_CLAIM_PERIOD_MISMATCH'; end if;
  if claim_row.claim_model='ITEMIZED_V2' then
    select count(*)::integer,coalesce(sum(i.amount),0) into source_count,source_total from public.employee_expense_claim_items_v2 i where i.claim_id=claim_row.id;
  else
    select count(*)::integer,coalesce(sum(l.total_amount),0) into source_count,source_total from public.employee_expense_claim_lines l where l.claim_id=claim_row.id and l.reservation_active;
    if exists(select 1 from public.employee_expense_claim_lines l join public.payroll_adjustments a on a.trip_id=l.trip_id and a.kind='TRAVEL_ALLOWANCE' where l.claim_id=claim_row.id) then
      raise exception 'PAYROLL_V2_EXPENSE_CLAIM_LEGACY_CONFLICT';
    end if;
  end if;
  if source_count=0 or source_total is distinct from claim_row.approved_amount then raise exception 'PAYROLL_V2_EXPENSE_CLAIM_LINES_INVALID'; end if;
  if exists(select 1 from public.payroll_period_actions_v2 a where a.source_expense_claim_id=claim_row.id and a.status='ACTIVE') then raise exception 'PAYROLL_V2_EXPENSE_CLAIM_ALREADY_POSTED'; end if;
  select t.* into payroll_row from public.teacher_payrolls t where t.period_id=period_row.id and t.employee_id=claim_row.employee_id and t.calculation_version like 'PAYROLL_V2%' for update;
  if not found then raise exception 'PAYROLL_V2_EXPENSE_CLAIM_PAYROLL_HEADER_REQUIRED'; end if;
  if payroll_row.currency is distinct from claim_row.currency then raise exception 'PAYROLL_V2_ACTION_CURRENCY_MISMATCH'; end if;
  claim_snapshot:=vibe_expense_private.snapshot(claim_row.id); before_state:=public.payroll_approval_snapshot(period_row.id);
  insert into public.payroll_period_actions_v2(period_id,employee_id,component_code,category,source_type,source_expense_claim_id,amount,currency,reason,request_key,request_payload,source_snapshot,created_by)
  values(period_row.id,claim_row.employee_id,'TRAVEL_EXPENSE','REIMBURSEMENT','EXPENSE_CLAIM',claim_row.id,claim_row.approved_amount,claim_row.currency,btrim(p_reason),p_key,payload,
    jsonb_build_object('integration_version','PAYROLL_V2_EXPENSE_ITEMIZED_V2','expense_claim',claim_snapshot),auth.uid()) returning * into inserted;
  perform public.refresh_staff_payroll_v2_totals(period_row.id,claim_row.employee_id);
  update public.payroll_periods set version=version+1 where id=period_row.id;
  after_state:=public.payroll_approval_snapshot(period_row.id);
  insert into public.payroll_events(period_id,status,note,actor_id,event_type,before_snapshot,after_snapshot)
  values(period_row.id,period_row.status,btrim(p_reason),auth.uid(),'V2_PERIOD_ACTION',before_state,after_state);
  return jsonb_build_object('status','POSTED','action_id',inserted.id,'period_id',inserted.period_id,'employee_id',inserted.employee_id,
    'claim_id',inserted.source_expense_claim_id,'component_code',inserted.component_code,'amount',inserted.amount,'currency',inserted.currency,
    'payment_status','NOT_PAID_BY_THIS_ACTION');
end;
$fn$;

revoke all on function public.get_expense_claim_v2_create_context(),
  public.list_employee_expense_claims_v2(text,integer,integer),
  public.create_employee_expense_claim_v2(uuid,date,text,uuid),
  public.save_employee_expense_claim_item_v2(uuid,integer,uuid,date,text,text,numeric,uuid),
  public.remove_employee_expense_claim_item_v2(uuid,integer,uuid,uuid),
  public.submit_employee_expense_claim_v2(uuid,integer,uuid),
  public.review_employee_expense_claim_v2(uuid,integer,text,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_expense_claim_v2_create_context(),
  public.list_employee_expense_claims_v2(text,integer,integer),
  public.create_employee_expense_claim_v2(uuid,date,text,uuid),
  public.save_employee_expense_claim_item_v2(uuid,integer,uuid,date,text,text,numeric,uuid),
  public.remove_employee_expense_claim_item_v2(uuid,integer,uuid,uuid),
  public.submit_employee_expense_claim_v2(uuid,integer,uuid),
  public.review_employee_expense_claim_v2(uuid,integer,text,text,uuid)
to authenticated;

revoke all on all functions in schema vibe_expense_private from public,anon,authenticated,service_role;

comment on column public.employee_expense_claims.claim_model is 'Explicit legacy versus itemized V2 discriminator; existing claims remain LEGACY_TRIP_SUMMARY.';
comment on table public.employee_expense_claim_items_v2 is 'Itemized Expense Claim V2 expenses. No receipt, upload, attachment, file, or evidence fields by owner decision.';
comment on function public.post_expense_claim_to_payroll_v2(uuid,integer,uuid,text,uuid) is 'Posts an approved legacy or itemized V2 claim to Payroll. Posting is not payment proof.';

notify pgrst,'reload schema';
commit;
