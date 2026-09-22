-- VIBE Academy -- Employee Expense Claims, Phase 1
-- Migration candidate: apply ONLY to a backed-up local development database.
-- Additive: NO writes to existing payroll balances, salary rules or Academic.
-- Approval in this phase means APPROVED / PENDING_PAYROLL_INTEGRATION, NOT paid.
-- Evidence references are metadata. Secure receipt upload and payroll posting
-- are separate integration steps; do not roll this out for real payments yet.
-- Install once via Supabase migrations. Never replace an applied migration.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Refuse an incompatible environment instead of silently creating guessed tables.
do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_EXPENSE_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;
  if to_regclass('public.employees') is null
     or to_regclass('public.employee_versions') is null
     or to_regclass('public.organization_units') is null
     or to_regclass('public.branches') is null
     or to_regclass('public.employee_trips') is null
     or to_regclass('public.employee_trip_reviews') is null
     or to_regclass('public.payroll_adjustments') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_role(text)') is null
     or to_regprocedure('public.has_permission(text,uuid)') is null
     or to_regprocedure('public.has_role_permission(text,text,uuid)') is null then
    raise exception 'VIBE_EXPENSE_PREREQUISITE_MISSING';
  end if;
  if to_regnamespace('vibe_expense_private') is not null
     or to_regclass('public.employee_expense_claims') is not null
     or to_regclass('public.employee_expense_claim_lines') is not null
     or to_regclass('public.employee_expense_claim_events') is not null then
    raise exception 'VIBE_EXPENSE_OBJECT_ALREADY_EXISTS: inspect migration history; do not overwrite';
  end if;
end;
$preflight$;

create schema vibe_expense_private authorization postgres;
revoke all on schema vibe_expense_private from public, anon, authenticated, service_role;

create table public.employee_expense_claims (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  branch_id uuid not null references public.branches(id),
  requested_month date not null check (
    isfinite(requested_month) and extract(day from requested_month) = 1
  ),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  status text not null default 'DRAFT' check (
    status in ('DRAFT','SUBMITTED','RETURNED','APPROVED','REJECTED','CANCELLED')
  ),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  submitted_at timestamptz,
  submitted_snapshot jsonb,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(btrim(review_reason)) between 1 and 2000),
  approved_amount numeric(16,2),
  constraint expense_approved_amount_state check (
    (status = 'APPROVED' and approved_amount is not null and approved_amount > 0
      and approved_amount <> 'NaN'::numeric
      and reviewed_by is not null and reviewed_at is not null)
    or (status <> 'APPROVED' and approved_amount is null)
  ),
  constraint expense_submitted_snapshot_state check (
    status not in ('SUBMITTED','RETURNED','APPROVED','REJECTED')
    or (submitted_at is not null and submitted_snapshot is not null)
  )
);

create table public.employee_expense_claim_lines (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.employee_expense_claims(id),
  trip_id uuid not null references public.employee_trips(id),
  allowance numeric(16,2) not null default 0,
  transport numeric(16,2) not null default 0,
  lodging numeric(16,2) not null default 0,
  total_amount numeric(16,2) generated always as (allowance + transport + lodging) stored,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  evidence_reference text check (
    evidence_reference is null or char_length(btrim(evidence_reference)) between 1 and 2000
  ),
  -- Immutable source metadata as seen when the employee last saved this line.
  trip_snapshot jsonb not null,
  reservation_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint expense_line_money check (
    allowance >= 0 and allowance <= 999999999999.99
    and transport >= 0 and transport <= 999999999999.99
    and lodging >= 0 and lodging <= 999999999999.99
    and allowance <> 'NaN'::numeric and transport <> 'NaN'::numeric and lodging <> 'NaN'::numeric
    and allowance + transport + lodging <= 999999999999.99
  ),
  unique (claim_id, trip_id)
);
-- One trip is reserved by one active claim. Rejection/cancellation releases it;
-- the rejected/cancelled claim and its historical lines are not deleted.
create unique index employee_expense_trip_reserved_once
  on public.employee_expense_claim_lines(trip_id) where reservation_active;
create index employee_expense_line_claim on public.employee_expense_claim_lines(claim_id);
create index employee_expense_claim_owner
  on public.employee_expense_claims(employee_id, created_at desc, id);
create index employee_expense_claim_review_queue
  on public.employee_expense_claims(branch_id, status, requested_month, id);

create table public.employee_expense_claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.employee_expense_claims(id),
  event_type text not null check (event_type in (
    'CREATED','LINE_SAVED','LINE_REMOVED','SUBMITTED','RETURNED','APPROVED','REJECTED','CANCELLED'
  )),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  request_key uuid not null,
  request_payload jsonb not null,
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  result jsonb not null,
  unique (actor_id, request_key)
);
create index employee_expense_event_claim
  on public.employee_expense_claim_events(claim_id, created_at, id);

-- Actor access is based on existing VIBE payroll rights; no blanket grants,
-- new user roles, employee identity edits or salary permissions are introduced.
create function vibe_expense_private.owns_employee(p_employee uuid, p_branch uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(public.account_is_active(), false)
    and auth.uid() is not null
    and coalesce(public.has_permission('payroll.view_own', p_branch), false)
    and exists (
      select 1 from public.employees e
      cross join lateral (
        select v.employment_status from public.employee_versions v
        where v.employee_id = e.id
          and v.effective_on <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
        order by v.effective_on desc, v.version desc limit 1
      ) current_employment
      where e.id = p_employee and e.profile_id = auth.uid()
        and current_employment.employment_status = 'ACTIVE'
    );
$fn$;

create function vibe_expense_private.can_review(p_branch uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select auth.uid() is not null and coalesce(public.account_is_active(), false)
    and (
      coalesce(public.has_role('SUPER_ADMIN'), false)
      or coalesce(public.has_role_permission('FINANCE', 'payroll.approve', p_branch), false)
    );
$fn$;

create function public.can_read_employee_expense_claim(p_claim uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select exists (
    select 1 from public.employee_expense_claims c where c.id = p_claim
      and (vibe_expense_private.owns_employee(c.employee_id,c.branch_id)
           or vibe_expense_private.can_review(c.branch_id))
  );
$fn$;

alter table public.employee_expense_claims enable row level security;
alter table public.employee_expense_claim_lines enable row level security;
alter table public.employee_expense_claim_events enable row level security;

create policy expense_claim_read on public.employee_expense_claims
  for select to authenticated using (public.can_read_employee_expense_claim(id));
create policy expense_claim_line_read on public.employee_expense_claim_lines
  for select to authenticated using (public.can_read_employee_expense_claim(claim_id));
create policy expense_claim_event_read on public.employee_expense_claim_events
  for select to authenticated using (public.can_read_employee_expense_claim(claim_id));

-- All writes go through authorized RPCs; policies do NOT allow direct mutations.
revoke all on public.employee_expense_claims, public.employee_expense_claim_lines,
  public.employee_expense_claim_events from public, anon, authenticated, service_role;
grant select on public.employee_expense_claims, public.employee_expense_claim_lines,
  public.employee_expense_claim_events to authenticated;

create function vibe_expense_private.snapshot(p_claim uuid)
returns jsonb language sql volatile security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select jsonb_build_object(
    'claim', to_jsonb(c) - 'submitted_snapshot',
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.id)
      from public.employee_expense_claim_lines l where l.claim_id=c.id), '[]'::jsonb),
    'total_amount', coalesce((select sum(l.total_amount)
      from public.employee_expense_claim_lines l where l.claim_id=c.id),0),
    'payroll_integration', 'NOT_ENABLED_IN_PHASE_1'
  ) from public.employee_expense_claims c where c.id=p_claim;
$fn$;

-- These functions are private and have no EXECUTE grants to API roles.
-- A request key is scoped to its actor. Reusing it for another payload is rejected.
create function vibe_expense_private.replay(p_key uuid, p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare ev public.employee_expense_claim_events;
begin
  if auth.uid() is null or p_key is null then raise exception 'EXPENSE_REQUEST_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vibe_expense:'||auth.uid()::text||':'||p_key::text,0));
  select * into ev from public.employee_expense_claim_events
    where actor_id=auth.uid() and request_key=p_key;
  if found then
    if ev.request_payload is distinct from p_payload then raise exception 'EXPENSE_REQUEST_KEY_REUSED'; end if;
    return ev.result;
  end if;
  return null;
end;
$fn$;

create function vibe_expense_private.record_event(
  p_claim uuid,p_key uuid,p_payload jsonb,p_event text,p_before jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare result jsonb; after_data jsonb;
begin
  after_data := vibe_expense_private.snapshot(p_claim);
  result := jsonb_build_object(
    'claim_id',p_claim,'status',after_data->'claim'->>'status',
    'version',(after_data->'claim'->>'version')::integer,
    'total_amount',after_data->'total_amount',
    'approved_amount',after_data->'claim'->'approved_amount',
    'payroll_integration','NOT_ENABLED_IN_PHASE_1'
  );
  insert into public.employee_expense_claim_events(
    claim_id,event_type,actor_id,request_key,request_payload,before_snapshot,after_snapshot,result
  ) values(p_claim,p_event,auth.uid(),p_key,p_payload,p_before,after_data,result);
  return result;
end;
$fn$;

create function vibe_expense_private.guard_event_history()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $fn$
begin raise exception 'EXPENSE_EVENT_HISTORY_IMMUTABLE'; end;
$fn$;
create trigger expense_event_history_immutable
  before update or delete on public.employee_expense_claim_events
  for each row execute function vibe_expense_private.guard_event_history();

create function vibe_expense_private.guard_claim_history()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $fn$
begin
  if tg_op='DELETE' then raise exception 'EXPENSE_USE_CANCELLATION'; end if;
  if old.status in ('APPROVED','REJECTED','CANCELLED') then raise exception 'EXPENSE_CLAIM_TERMINAL'; end if;
  if (to_jsonb(new)-array['status','version','updated_at','submitted_at','submitted_snapshot',
      'reviewed_by','reviewed_at','review_reason','approved_amount']) is distinct from
     (to_jsonb(old)-array['status','version','updated_at','submitted_at','submitted_snapshot',
      'reviewed_by','reviewed_at','review_reason','approved_amount']) then
    raise exception 'EXPENSE_CLAIM_IDENTITY_IMMUTABLE';
  end if;
  if new.version <> old.version+1 then raise exception 'EXPENSE_VERSION_MUST_INCREMENT'; end if;
  if not (
    (old.status in ('DRAFT','RETURNED') and new.status in (old.status,'SUBMITTED','CANCELLED'))
    or (old.status='SUBMITTED' and new.status in ('APPROVED','RETURNED','REJECTED'))
  ) then raise exception 'EXPENSE_INVALID_TRANSITION'; end if;
  return new;
end;
$fn$;
create trigger expense_claim_history_guard before update or delete
  on public.employee_expense_claims for each row
  execute function vibe_expense_private.guard_claim_history();

create function vibe_expense_private.guard_line_history()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp
as $fn$
declare parent_id uuid; parent_status text;
begin
  parent_id:=case when tg_op='INSERT' then new.claim_id else old.claim_id end;
  select status into parent_status from public.employee_expense_claims where id=parent_id for update;
  if tg_op='UPDATE' and (new.id is distinct from old.id or new.claim_id is distinct from old.claim_id) then
    raise exception 'EXPENSE_LINE_IDENTITY_IMMUTABLE';
  end if;
  -- A terminal rejected/cancelled claim only releases a reservation; its content stays immutable.
  if tg_op='UPDATE' and parent_status in ('REJECTED','CANCELLED')
     and old.reservation_active and not new.reservation_active
     and (to_jsonb(new)-'reservation_active') = (to_jsonb(old)-'reservation_active') then
    return new;
  end if;
  if parent_status is null or parent_status not in ('DRAFT','RETURNED') then
    raise exception 'EXPENSE_LINES_LOCKED';
  end if;
  if tg_op<>'DELETE' and not new.reservation_active then raise exception 'EXPENSE_RESERVATION_REQUIRED'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$fn$;
create trigger expense_line_history_guard before insert or update or delete
  on public.employee_expense_claim_lines for each row
  execute function vibe_expense_private.guard_line_history();

create function public.create_employee_expense_claim(
  p_month date,p_title text,p_currency text,p_key uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare eid uuid; bid uuid; cid uuid; payload jsonb; prior jsonb;
begin
  if not coalesce(public.account_is_active(),false) or auth.uid() is null then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  select e.id,u.branch_id into eid,bid from public.employees e
  cross join lateral (
    select v.unit_code,v.employment_status from public.employee_versions v
    where v.employee_id=e.id and v.effective_on<=(now() at time zone 'Asia/Ho_Chi_Minh')::date
    order by v.effective_on desc,v.version desc limit 1
  ) v
  join public.organization_units u on u.code=v.unit_code
  join public.branches b on b.id=u.branch_id and b.status='ACTIVE'
  where e.profile_id=auth.uid() and v.employment_status='ACTIVE';
  if eid is null or bid is null or not vibe_expense_private.owns_employee(eid,bid) then
    raise exception 'EXPENSE_ACTIVE_EMPLOYEE_LINK_AND_OWN_PERMISSION_REQUIRED';
  end if;
  if p_month is null or not isfinite(p_month) or extract(day from p_month)<>1 then raise exception 'EXPENSE_INVALID_MONTH'; end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 200 then raise exception 'EXPENSE_TITLE_REQUIRED'; end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'EXPENSE_INVALID_CURRENCY'; end if;
  payload:=jsonb_build_object('action','CREATE','employee_id',eid,'branch_id',bid,'month',p_month,'title',btrim(p_title),'currency',p_currency);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  insert into public.employee_expense_claims(employee_id,branch_id,requested_month,currency,title,created_by)
  values(eid,bid,p_month,p_currency,btrim(p_title),auth.uid()) returning id into cid;
  return vibe_expense_private.record_event(cid,p_key,payload,'CREATED',null);
end;
$fn$;

create function public.save_employee_expense_claim_line(
  p_claim uuid,p_version integer,p_line uuid,p_trip uuid,
  p_allowance numeric,p_transport numeric,p_lodging numeric,
  p_note text,p_evidence_reference text,p_key uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; old_line public.employee_expense_claim_lines;
  trip_data jsonb; payload jsonb; prior jsonb; before_data jsonb; result jsonb;
begin
  select * into c from public.employee_expense_claims
    where id=p_claim and created_by=auth.uid()
      and vibe_expense_private.owns_employee(employee_id,branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  if p_line is null or p_trip is null then raise exception 'EXPENSE_LINE_AND_TRIP_REQUIRED'; end if;
  if p_allowance is null or p_transport is null or p_lodging is null
     or p_allowance<0 or p_transport<0 or p_lodging<0
     or p_allowance>999999999999.99 or p_transport>999999999999.99 or p_lodging>999999999999.99
     or p_allowance<>round(p_allowance,2) or p_transport<>round(p_transport,2) or p_lodging<>round(p_lodging,2)
     or p_allowance+p_transport+p_lodging>999999999999.99 then raise exception 'EXPENSE_INVALID_MONEY'; end if;
  if c.currency='VND' and (p_allowance<>trunc(p_allowance) or p_transport<>trunc(p_transport) or p_lodging<>trunc(p_lodging)) then
    raise exception 'EXPENSE_VND_REQUIRES_WHOLE_DONG';
  end if;
  if p_note is null or char_length(btrim(p_note)) not between 1 and 2000 then raise exception 'EXPENSE_LINE_REASON_REQUIRED'; end if;
  if p_evidence_reference is not null and char_length(btrim(p_evidence_reference))>2000 then raise exception 'EXPENSE_EVIDENCE_TOO_LONG'; end if;
  payload:=jsonb_build_object('action','SAVE_LINE','claim_id',p_claim,'version',p_version,'line_id',p_line,'trip_id',p_trip,
    'allowance',p_allowance,'transport',p_transport,'lodging',p_lodging,'note',btrim(p_note),'evidence_reference',nullif(btrim(p_evidence_reference),''));
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_LINES_LOCKED'; end if;
  select jsonb_build_object('trip',to_jsonb(t),'review',to_jsonb(r)) into trip_data
  from public.employee_trips t join public.employee_trip_reviews r on r.trip_id=t.id and r.decision='APPROVED'
  where t.id=p_trip and t.employee_id=c.employee_id;
  if trip_data is null then raise exception 'EXPENSE_APPROVED_OWN_TRIP_REQUIRED'; end if;
  if exists(select 1 from public.payroll_adjustments where trip_id=p_trip and kind='TRAVEL_ALLOWANCE') then
    raise exception 'EXPENSE_TRIP_ALREADY_IN_PAYROLL';
  end if;
  select * into old_line from public.employee_expense_claim_lines where id=p_line;
  if found and old_line.claim_id<>p_claim then raise exception 'EXPENSE_LINE_UNAVAILABLE'; end if;
  if old_line.id is null and (select count(*) from public.employee_expense_claim_lines where claim_id=p_claim)>=100 then
    raise exception 'EXPENSE_MAX_100_TRIPS_PER_CLAIM';
  end if;
  if exists(select 1 from public.employee_expense_claim_lines where trip_id=p_trip and reservation_active and id<>p_line) then
    raise exception 'EXPENSE_TRIP_RESERVED_BY_ANOTHER_CLAIM';
  end if;
  before_data:=vibe_expense_private.snapshot(p_claim);
  insert into public.employee_expense_claim_lines(id,claim_id,trip_id,allowance,transport,lodging,note,evidence_reference,trip_snapshot)
  values(p_line,p_claim,p_trip,p_allowance,p_transport,p_lodging,btrim(p_note),nullif(btrim(p_evidence_reference),''),trip_data)
  on conflict(id) do update set trip_id=excluded.trip_id,allowance=excluded.allowance,transport=excluded.transport,
    lodging=excluded.lodging,note=excluded.note,evidence_reference=excluded.evidence_reference,
    trip_snapshot=excluded.trip_snapshot,updated_at=clock_timestamp()
  where public.employee_expense_claim_lines.claim_id=p_claim;
  if not found then raise exception 'EXPENSE_LINE_UNAVAILABLE'; end if;
  if (select coalesce(sum(total_amount),0) from public.employee_expense_claim_lines where claim_id=p_claim)>999999999999.99 then
    raise exception 'EXPENSE_TOTAL_TOO_LARGE';
  end if;
  update public.employee_expense_claims set version=version+1,updated_at=clock_timestamp() where id=p_claim;
  result:=vibe_expense_private.record_event(p_claim,p_key,payload,'LINE_SAVED',before_data);
  return result;
end;
$fn$;

create function public.remove_employee_expense_claim_line(
  p_claim uuid,p_version integer,p_line uuid,p_key uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; payload jsonb; prior jsonb; before_data jsonb;
begin
  select * into c from public.employee_expense_claims
    where id=p_claim and created_by=auth.uid()
      and vibe_expense_private.owns_employee(employee_id,branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  payload:=jsonb_build_object('action','REMOVE_LINE','claim_id',p_claim,'version',p_version,'line_id',p_line);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_LINES_LOCKED'; end if;
  before_data:=vibe_expense_private.snapshot(p_claim);
  delete from public.employee_expense_claim_lines where id=p_line and claim_id=p_claim;
  if not found then raise exception 'EXPENSE_LINE_UNAVAILABLE'; end if;
  update public.employee_expense_claims set version=version+1,updated_at=clock_timestamp() where id=p_claim;
  return vibe_expense_private.record_event(p_claim,p_key,payload,'LINE_REMOVED',before_data);
end;
$fn$;

create function vibe_expense_private.validate_submission(p_claim uuid)
returns numeric language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; total numeric; number_lines integer;
begin
  select * into strict c from public.employee_expense_claims where id=p_claim;
  select count(*),coalesce(sum(total_amount),0) into number_lines,total
    from public.employee_expense_claim_lines where claim_id=p_claim;
  if number_lines=0 or total<=0 then raise exception 'EXPENSE_NONEMPTY_POSITIVE_CLAIM_REQUIRED'; end if;
  if exists(select 1 from public.employee_expense_claim_lines l where l.claim_id=p_claim
    and (l.total_amount<=0 or not l.reservation_active)) then raise exception 'EXPENSE_POSITIVE_LINES_REQUIRED'; end if;
  if exists(select 1 from public.employee_expense_claim_lines l where l.claim_id=p_claim
    and (l.transport>0 or l.lodging>0) and nullif(btrim(l.evidence_reference),'') is null) then
    raise exception 'EXPENSE_TRANSPORT_LODGING_EVIDENCE_REQUIRED';
  end if;
  if exists(
    select 1 from public.employee_expense_claim_lines l
    left join public.employee_trips t on t.id=l.trip_id
    left join public.employee_trip_reviews r on r.trip_id=t.id and r.decision='APPROVED'
    where l.claim_id=p_claim and (
      t.id is null or t.employee_id is distinct from c.employee_id or r.id is null
      or t.ends_on>(now() at time zone 'Asia/Ho_Chi_Minh')::date
      or not l.reservation_active
      or l.trip_snapshot is distinct from jsonb_build_object('trip',to_jsonb(t),'review',to_jsonb(r))
    )
  ) then raise exception 'EXPENSE_TRIP_EVIDENCE_CHANGED_OR_NOT_FINISHED'; end if;
  if exists(select 1 from public.employee_expense_claim_lines l join public.payroll_adjustments a
    on a.trip_id=l.trip_id and a.kind='TRAVEL_ALLOWANCE' where l.claim_id=p_claim) then
    raise exception 'EXPENSE_TRIP_ALREADY_IN_PAYROLL';
  end if;
  return total;
end;
$fn$;

create function public.submit_employee_expense_claim(p_claim uuid,p_version integer,p_key uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; payload jsonb; prior jsonb; before_data jsonb;
begin
  select * into c from public.employee_expense_claims
    where id=p_claim and created_by=auth.uid()
      and vibe_expense_private.owns_employee(employee_id,branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  payload:=jsonb_build_object('action','SUBMIT','claim_id',p_claim,'version',p_version);
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_INVALID_TRANSITION'; end if;
  perform vibe_expense_private.validate_submission(p_claim);
  before_data:=vibe_expense_private.snapshot(p_claim);
  update public.employee_expense_claims set status='SUBMITTED',version=version+1,updated_at=clock_timestamp(),
    submitted_at=clock_timestamp(),submitted_snapshot=before_data,
    reviewed_by=null,reviewed_at=null,review_reason=null where id=p_claim;
  return vibe_expense_private.record_event(p_claim,p_key,payload,'SUBMITTED',before_data);
end;
$fn$;

create function public.review_employee_expense_claim(
  p_claim uuid,p_version integer,p_decision text,p_reason text,p_key uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; payload jsonb; prior jsonb; before_data jsonb; total numeric;
begin
  -- Authorize branch BEFORE taking the claim lock or exposing its version.
  select * into c from public.employee_expense_claims
    where id=p_claim and vibe_expense_private.can_review(branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  if c.created_by=auth.uid() or exists(
    select 1 from public.employees e where e.id=c.employee_id and e.profile_id=auth.uid()
  ) then raise exception 'EXPENSE_INDEPENDENT_REVIEWER_REQUIRED'; end if;
  if p_decision is null or p_decision not in ('APPROVED','RETURNED','REJECTED') then raise exception 'EXPENSE_INVALID_DECISION'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'EXPENSE_REVIEW_REASON_REQUIRED'; end if;
  payload:=jsonb_build_object('action','REVIEW','claim_id',p_claim,'version',p_version,'decision',p_decision,'reason',btrim(p_reason));
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status<>'SUBMITTED' then raise exception 'EXPENSE_REVIEW_REQUIRES_SUBMITTED'; end if;
  if p_decision='APPROVED' then total:=vibe_expense_private.validate_submission(p_claim); end if;
  before_data:=vibe_expense_private.snapshot(p_claim);
  update public.employee_expense_claims set status=p_decision,version=version+1,updated_at=clock_timestamp(),
    reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_reason=btrim(p_reason),
    approved_amount=case when p_decision='APPROVED' then total else null end
  where id=p_claim;
  if p_decision='REJECTED' then
    update public.employee_expense_claim_lines set reservation_active=false where claim_id=p_claim;
  end if;
  return vibe_expense_private.record_event(p_claim,p_key,payload,p_decision,before_data);
end;
$fn$;

create function public.cancel_employee_expense_claim(
  p_claim uuid,p_version integer,p_reason text,p_key uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare c public.employee_expense_claims; payload jsonb; prior jsonb; before_data jsonb;
begin
  select * into c from public.employee_expense_claims
    where id=p_claim and created_by=auth.uid()
      and vibe_expense_private.owns_employee(employee_id,branch_id) for update;
  if not found then raise exception 'EXPENSE_UNAUTHORIZED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'EXPENSE_CANCEL_REASON_REQUIRED'; end if;
  payload:=jsonb_build_object('action','CANCEL','claim_id',p_claim,'version',p_version,'reason',btrim(p_reason));
  prior:=vibe_expense_private.replay(p_key,payload); if prior is not null then return prior; end if;
  if c.version is distinct from p_version then raise exception 'EXPENSE_CHANGED_RELOAD'; end if;
  if c.status not in ('DRAFT','RETURNED') then raise exception 'EXPENSE_CANCEL_REQUIRES_EDITABLE_DRAFT'; end if;
  before_data:=vibe_expense_private.snapshot(p_claim);
  update public.employee_expense_claims set status='CANCELLED',version=version+1,updated_at=clock_timestamp(),review_reason=btrim(p_reason) where id=p_claim;
  update public.employee_expense_claim_lines set reservation_active=false where claim_id=p_claim;
  return vibe_expense_private.record_event(p_claim,p_key,payload,'CANCELLED',before_data);
end;
$fn$;

-- Use this read RPC for one claim; list queries can SELECT the three RLS tables.
create function public.get_employee_expense_claim(p_claim uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if not coalesce(public.can_read_employee_expense_claim(p_claim),false) then return null; end if;
  return vibe_expense_private.snapshot(p_claim);
end;
$fn$;

-- Explicit grants in the SAME migration transaction as function creation.
revoke all on all functions in schema vibe_expense_private from public,anon,authenticated,service_role;
revoke all on function public.can_read_employee_expense_claim(uuid),
  public.create_employee_expense_claim(date,text,text,uuid),
  public.save_employee_expense_claim_line(uuid,integer,uuid,uuid,numeric,numeric,numeric,text,text,uuid),
  public.remove_employee_expense_claim_line(uuid,integer,uuid,uuid),
  public.submit_employee_expense_claim(uuid,integer,uuid),
  public.review_employee_expense_claim(uuid,integer,text,text,uuid),
  public.cancel_employee_expense_claim(uuid,integer,text,uuid),
  public.get_employee_expense_claim(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.can_read_employee_expense_claim(uuid),
  public.create_employee_expense_claim(date,text,text,uuid),
  public.save_employee_expense_claim_line(uuid,integer,uuid,uuid,numeric,numeric,numeric,text,text,uuid),
  public.remove_employee_expense_claim_line(uuid,integer,uuid,uuid),
  public.submit_employee_expense_claim(uuid,integer,uuid),
  public.review_employee_expense_claim(uuid,integer,text,text,uuid),
  public.cancel_employee_expense_claim(uuid,integer,text,uuid),
  public.get_employee_expense_claim(uuid)
to authenticated;

comment on table public.employee_expense_claims is
 'VIBE expense claims Phase 1. APPROVED is an expense approval, not payroll approval or payment. No automatic payroll posting in this migration.';
comment on column public.employee_expense_claim_lines.evidence_reference is
 'Internal document reference only. This field does not verify file ownership, upload receipt bytes or prove that the document exists.';

notify pgrst,'reload schema';
commit;
