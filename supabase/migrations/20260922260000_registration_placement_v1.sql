-- Registration applications and class placement.
-- Students, parents, and enrollments stay the source of truth.
-- An enrollment still requires a class, so the waiting queue is a placement case.

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'REGISTRATION_V1_REQUIRES_POSTGRES';
  end if;
  if to_regclass('public.students') is null
     or to_regclass('public.parents') is null
     or to_regclass('public.student_parents') is null
     or to_regclass('public.enrollments') is null
     or to_regclass('public.classes') is null
     or to_regclass('public.crm_leads') is null
     or to_regclass('public.invoice_receivables') is null
     or to_regprocedure('public.has_role(text)') is null
     or to_regprocedure('public.account_is_active()') is null
  then
    raise exception 'REGISTRATION_V1_PREREQUISITE_MISSING';
  end if;
  if to_regclass('public.registration_applications') is not null
     or to_regclass('public.student_placement_cases') is not null
  then
    raise exception 'REGISTRATION_V1_ALREADY_EXISTS';
  end if;
end;
$preflight$;

insert into public.permissions(code, name, module)
values
  ('registration.view', 'View registration applications in an authorized branch', 'registration'),
  ('registration.create', 'Create a registration application in an authorized branch', 'registration'),
  ('registration.update', 'Update a registration application in an authorized branch', 'registration'),
  ('registration.complete', 'Complete a registration application in an authorized branch', 'registration'),
  ('student_placement.view', 'View class placement cases in an authorized branch', 'registration'),
  ('student_placement.manage', 'Assign a class placement in an authorized branch', 'registration')
on conflict (code) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'registration.view', 'registration.create', 'registration.update', 'registration.complete',
  'student_placement.view', 'student_placement.manage'
)
where r.code = 'BRANCH_ADMIN'
on conflict do nothing;

create function public.registration_can(p_permission text, p_branch uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.account_is_active()
    and p_branch is not null
    and p_permission in (
      'registration.view', 'registration.create', 'registration.update', 'registration.complete',
      'student_placement.view', 'student_placement.manage'
    )
    and exists(select 1 from public.branches where id = p_branch)
    and (
      public.has_role('SUPER_ADMIN')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where ur.user_id = auth.uid()
          and r.code <> 'SUPER_ADMIN'
          and ur.branch_id = p_branch
          and ur.is_active
          and (ur.valid_from is null or ur.valid_from <= now())
          and (ur.valid_until is null or ur.valid_until > now())
          and p.code = p_permission
      )
    )
$$;

create function public.registration_vietnam_today() returns date
language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create table public.registration_applications (
  id uuid primary key,
  application_code text not null unique,
  crm_lead_id uuid references public.crm_leads(id),
  branch_id uuid not null references public.branches(id),
  student_name text,
  student_date_of_birth date,
  parent_name text,
  parent_phone text,
  parent_email text,
  program_interest text,
  instrument_interest text,
  course_id uuid references public.courses(id),
  invoice_id uuid references public.invoices(id),
  desired_start_date date,
  preferred_schedule text,
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'SUBMITTED', 'VERIFIED', 'PAYMENT_PENDING', 'PAID', 'COMPLETED',
    'CANCELLED', 'REJECTED', 'EXPIRED'
  )),
  linked_student_id uuid references public.students(id),
  linked_parent_id uuid references public.parents(id),
  linked_enrollment_id uuid references public.enrollments(id),
  submitted_at timestamptz,
  verified_at timestamptz,
  payment_confirmed_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (char_length(btrim(coalesce(student_name, ''))) <= 200),
  check (parent_phone is null or char_length(parent_phone) <= 40),
  check (preferred_schedule is null or char_length(preferred_schedule) <= 500),
  check (
    (status = 'COMPLETED' and linked_student_id is not null and linked_parent_id is not null and completed_at is not null)
    or status <> 'COMPLETED'
  ),
  check (payment_confirmed_at is null or invoice_id is not null)
);

create index registration_applications_branch_idx
  on public.registration_applications(branch_id, status, created_at desc);
create unique index registration_applications_one_open_lead_idx
  on public.registration_applications(crm_lead_id)
  where crm_lead_id is not null and status not in ('CANCELLED', 'REJECTED', 'EXPIRED');

create table public.registration_application_events (
  id uuid primary key,
  application_id uuid not null references public.registration_applications(id),
  event_type text not null check (event_type in (
    'CREATED', 'SUBMITTED', 'VERIFIED', 'PAYMENT_CONFIRMED', 'IDENTITY_REVIEWED',
    'STUDENT_LINKED', 'PARENT_LINKED', 'ENROLLMENT_CREATED', 'REGISTRATION_COMPLETED',
    'PLACEMENT_OPENED', 'CANCELLED'
  )),
  from_status text,
  to_status text,
  actor_id uuid not null references auth.users(id),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index registration_application_events_application_idx
  on public.registration_application_events(application_id, created_at);

create table public.student_placement_cases (
  id uuid primary key,
  student_id uuid not null references public.students(id),
  registration_application_id uuid not null unique references public.registration_applications(id),
  enrollment_id uuid unique references public.enrollments(id),
  branch_id uuid not null references public.branches(id),
  status text not null check (status in ('UNASSIGNED', 'MATCHING', 'SCHEDULED')),
  desired_start_date date,
  preferred_schedule text,
  assigned_class_id uuid references public.classes(id),
  assigned_teacher_id uuid references public.teachers(id),
  scheduled_start_date date,
  owner_user_id uuid references auth.users(id),
  opened_at timestamptz not null default clock_timestamp(),
  scheduled_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (status <> 'SCHEDULED' or (assigned_class_id is not null and scheduled_start_date is not null and enrollment_id is not null)),
  check (status = 'SCHEDULED' or (assigned_class_id is null and scheduled_start_date is null and enrollment_id is null))
);
create index student_placement_cases_branch_idx
  on public.student_placement_cases(branch_id, status, opened_at);

create table public.student_placement_events (
  id uuid primary key,
  placement_id uuid not null references public.student_placement_cases(id),
  event_type text not null check (event_type in ('PLACEMENT_OPENED', 'PLACEMENT_MATCHING', 'CLASS_ASSIGNED', 'START_DATE_SET')),
  actor_id uuid not null references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create function public.guard_registration_application() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('registration.write', true), '') = 'on' then
    if tg_op = 'DELETE' then raise exception 'REGISTRATION_IMMUTABLE'; end if;
    return new;
  end if;
  raise exception 'REGISTRATION_DIRECT_WRITE_DENIED';
end $$;

create function public.guard_student_placement() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(current_setting('registration.write', true), '') = 'on' then
    if tg_op = 'DELETE' then raise exception 'PLACEMENT_IMMUTABLE'; end if;
    return new;
  end if;
  raise exception 'PLACEMENT_DIRECT_WRITE_DENIED';
end $$;

create trigger registration_applications_guard
before insert or update or delete on public.registration_applications
for each row execute function public.guard_registration_application();
create trigger registration_application_events_guard
before insert or update or delete on public.registration_application_events
for each row execute function public.guard_registration_application();
create trigger student_placement_cases_guard
before insert or update or delete on public.student_placement_cases
for each row execute function public.guard_student_placement();
create trigger student_placement_events_guard
before insert or update or delete on public.student_placement_events
for each row execute function public.guard_student_placement();

alter table public.registration_applications enable row level security;
alter table public.registration_application_events enable row level security;
alter table public.student_placement_cases enable row level security;
alter table public.student_placement_events enable row level security;

create policy registration_applications_select on public.registration_applications
for select to authenticated using (public.registration_can('registration.view', branch_id));
create policy registration_events_select on public.registration_application_events
for select to authenticated using (
  exists (
    select 1 from public.registration_applications app
    where app.id = registration_application_events.application_id
      and public.registration_can('registration.view', app.branch_id)
  )
);
create policy student_placement_select on public.student_placement_cases
for select to authenticated using (public.registration_can('student_placement.view', branch_id));
create policy student_placement_events_select on public.student_placement_events
for select to authenticated using (
  exists (
    select 1 from public.student_placement_cases placement
    where placement.id = student_placement_events.placement_id
      and public.registration_can('student_placement.view', placement.branch_id)
  )
);

revoke all on public.registration_applications, public.registration_application_events,
  public.student_placement_cases, public.student_placement_events
from public, anon, authenticated, service_role;
grant select on public.registration_applications, public.registration_application_events,
  public.student_placement_cases, public.student_placement_events
to authenticated;

create function public.registration_invoice_settled(p_invoice uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_invoice is not null and exists (
    select 1 from public.invoice_receivables receivable
    where receivable.invoice_id = p_invoice
      and receivable.invoice_status = 'ISSUED'
      and receivable.outstanding_balance = 0
  )
$$;

create function public.create_registration_application(
  p_request uuid,
  p_branch uuid,
  p_lead uuid,
  p_student_name text,
  p_student_date_of_birth date,
  p_parent_name text,
  p_parent_phone text,
  p_program text,
  p_instrument text,
  p_desired_start date,
  p_preferred_schedule text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  lead public.crm_leads%rowtype;
  code text;
begin
  if actor is null or not public.registration_can('registration.create', p_branch) then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  if p_request is null then raise exception 'REGISTRATION_INVALID'; end if;
  if exists(select 1 from public.registration_application_events where id = p_request) then
    return (select application_id from public.registration_application_events where id = p_request);
  end if;
  if p_lead is not null then
    select * into lead from public.crm_leads where id = p_lead;
    if not found or lead.branch_id <> p_branch or lead.status <> 'WON' then
      raise exception 'REGISTRATION_LEAD_DENIED';
    end if;
  end if;
  code := 'DK-' || to_char(public.registration_vietnam_today(), 'YYYYMMDD') || '-' || upper(substr(replace(p_request::text, '-', ''), 21, 12));
  perform set_config('registration.write', 'on', true);
  insert into public.registration_applications(
    id, application_code, crm_lead_id, branch_id, student_name, student_date_of_birth,
    parent_name, parent_phone, program_interest, instrument_interest, desired_start_date,
    preferred_schedule, created_by
  ) values (
    p_request, code, p_lead, p_branch,
    nullif(btrim(coalesce(p_student_name, case when p_lead is not null then lead.student_name end, case when p_lead is not null then lead.full_name end, '')), ''),
    coalesce(p_student_date_of_birth, case when p_lead is not null then lead.student_date_of_birth end),
    nullif(btrim(coalesce(p_parent_name, case when p_lead is not null then lead.parent_name end, case when p_lead is not null then lead.full_name end, '')), ''),
    nullif(btrim(coalesce(p_parent_phone, case when p_lead is not null then lead.phone end, '')), ''),
    nullif(btrim(coalesce(p_program, case when p_lead is not null then lead.program_interest end, '')), ''),
    nullif(btrim(coalesce(p_instrument, case when p_lead is not null then lead.instrument_interest end, '')), ''),
    p_desired_start,
    nullif(btrim(coalesce(p_preferred_schedule, '')), ''),
    actor
  );
  insert into public.registration_application_events(id, application_id, event_type, to_status, actor_id)
  values (p_request, p_request, 'CREATED', 'DRAFT', actor);
  perform set_config('registration.write', 'off', true);
  return p_request;
end $$;

create function public.registration_lock(p_application uuid, p_version integer, p_permission text)
returns public.registration_applications
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.registration_applications%rowtype;
begin
  select * into row from public.registration_applications where id = p_application for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if not public.registration_can(p_permission, row.branch_id) then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  if row.version is distinct from p_version then raise exception 'REGISTRATION_STALE'; end if;
  return row;
end $$;

create function public.transition_registration_application(
  p_request uuid,
  p_application uuid,
  p_version integer,
  p_action text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.registration_applications%rowtype;
  next_status text;
  event_name text;
begin
  if actor is null or p_request is null or p_action not in ('SUBMIT', 'VERIFY', 'CANCEL') then
    raise exception 'REGISTRATION_INVALID';
  end if;
  if exists(select 1 from public.registration_application_events where id = p_request) then
    return p_application;
  end if;
  row := public.registration_lock(p_application, p_version, 'registration.update');
  if p_action = 'SUBMIT' and row.status = 'DRAFT' then
    if nullif(btrim(coalesce(row.student_name, '')), '') is null or row.student_date_of_birth is null then
      raise exception 'REGISTRATION_INCOMPLETE';
    end if;
    next_status := 'SUBMITTED'; event_name := 'SUBMITTED';
  elsif p_action = 'VERIFY' and row.status = 'SUBMITTED' then
    next_status := 'VERIFIED'; event_name := 'VERIFIED';
  elsif p_action = 'CANCEL' and row.status not in ('COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED') then
    next_status := 'CANCELLED'; event_name := 'CANCELLED';
  else
    raise exception 'REGISTRATION_TRANSITION_DENIED';
  end if;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set
    status = next_status,
    submitted_at = case when next_status = 'SUBMITTED' then clock_timestamp() else submitted_at end,
    verified_at = case when next_status = 'VERIFIED' then clock_timestamp() else verified_at end,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id)
  values (p_request, row.id, event_name, row.status, next_status, actor);
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

create function public.attach_registration_invoice(
  p_request uuid,
  p_application uuid,
  p_version integer,
  p_invoice uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.registration_applications%rowtype;
  settled boolean;
  next_status text;
begin
  if actor is null or p_request is null or p_invoice is null then raise exception 'REGISTRATION_INVALID'; end if;
  if exists(select 1 from public.registration_application_events where id = p_request) then return p_application; end if;
  row := public.registration_lock(p_application, p_version, 'registration.update');
  if row.status not in ('VERIFIED', 'PAYMENT_PENDING', 'PAID') then raise exception 'REGISTRATION_TRANSITION_DENIED'; end if;
  if not exists(select 1 from public.invoices where id = p_invoice and branch_id_snapshot = row.branch_id) then
    raise exception 'REGISTRATION_PAYMENT_DENIED';
  end if;
  settled := public.registration_invoice_settled(p_invoice);
  next_status := case when settled then 'PAID' else 'PAYMENT_PENDING' end;
  perform set_config('registration.write', 'on', true);
  update public.registration_applications set
    invoice_id = p_invoice,
    status = next_status,
    payment_confirmed_at = case when settled then clock_timestamp() else null end,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  if settled then
    insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id, metadata)
    values (p_request, row.id, 'PAYMENT_CONFIRMED', row.status, next_status, actor, jsonb_build_object('invoice_id', p_invoice));
  else
    insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id, metadata)
    values (p_request, row.id, 'VERIFIED', row.status, next_status, actor, jsonb_build_object('invoice_id', p_invoice, 'settled', false));
  end if;
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

create function public.complete_registration_application(
  p_request uuid,
  p_application uuid,
  p_version integer,
  p_student uuid,
  p_parent uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.registration_applications%rowtype;
  v_student uuid := p_student;
  v_parent uuid := p_parent;
  matches integer;
  student_code text;
  parent_code text;
  placement_id uuid;
begin
  if actor is null or p_request is null then raise exception 'REGISTRATION_INVALID'; end if;
  if exists(select 1 from public.registration_application_events where id = p_request and event_type = 'REGISTRATION_COMPLETED') then
    return p_application;
  end if;
  if not public.registration_can('registration.complete', (select branch_id from public.registration_applications where id = p_application)) then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  select * into row from public.registration_applications where id = p_application for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if row.status = 'COMPLETED' then return row.id; end if;
  if row.version is distinct from p_version then raise exception 'REGISTRATION_STALE'; end if;
  if row.status not in ('VERIFIED', 'PAID', 'PAYMENT_PENDING') then raise exception 'REGISTRATION_TRANSITION_DENIED'; end if;
  if nullif(btrim(coalesce(row.student_name, '')), '') is null or row.student_date_of_birth is null or nullif(btrim(coalesce(row.parent_name, '')), '') is null then
    raise exception 'REGISTRATION_INCOMPLETE';
  end if;
  if row.invoice_id is not null and not public.registration_invoice_settled(row.invoice_id) then
    raise exception 'REGISTRATION_PAYMENT_REQUIRED';
  end if;
  select count(*) into matches
  from public.students student
  where student.date_of_birth = row.student_date_of_birth
    and lower(btrim(coalesce(student.full_name, ''))) = lower(btrim(row.student_name));
  if v_student is null and matches > 0 then raise exception 'REGISTRATION_REVIEW_REQUIRED'; end if;
  if v_student is not null then
    if not exists(
      select 1 from public.students student
      where student.id = v_student and student.status = 'ACTIVE'
        and student.date_of_birth = row.student_date_of_birth
        and lower(btrim(coalesce(student.full_name, ''))) = lower(btrim(row.student_name))
    ) then
      raise exception 'REGISTRATION_MATCH_REJECTED';
    end if;
  end if;
  if v_parent is not null and not exists(select 1 from public.parents where id = v_parent and status = 'ACTIVE') then
    raise exception 'REGISTRATION_MATCH_REJECTED';
  end if;
  perform set_config('registration.write', 'on', true);
  if v_student is null then
    v_student := gen_random_uuid();
    student_code := 'HV-' || substr(replace(v_student::text, '-', ''), 1, 8);
    insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status)
    values (v_student, student_code, btrim(row.student_name), row.student_date_of_birth, row.branch_id, public.registration_vietnam_today(), 'ACTIVE');
  end if;
  if v_parent is null then
    v_parent := gen_random_uuid();
    parent_code := 'PH-' || substr(replace(v_parent::text, '-', ''), 1, 8);
    insert into public.parents(id, parent_code, status) values (v_parent, parent_code, 'ACTIVE');
  end if;
  insert into public.student_parents(student_id, parent_id, relationship, is_primary)
  values (v_student, v_parent, 'GUARDIAN', true)
  on conflict (student_id, parent_id) do nothing;
  placement_id := gen_random_uuid();
  insert into public.student_placement_cases(
    id, student_id, registration_application_id, branch_id, status, desired_start_date, preferred_schedule, owner_user_id
  ) values (
    placement_id, v_student, row.id, row.branch_id, 'UNASSIGNED', row.desired_start_date, row.preferred_schedule, actor
  );
  update public.registration_applications set
    linked_student_id = v_student,
    linked_parent_id = v_parent,
    status = 'COMPLETED',
    payment_confirmed_at = case when invoice_id is not null then coalesce(payment_confirmed_at, clock_timestamp()) else payment_confirmed_at end,
    completed_at = clock_timestamp(),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.registration_application_events(id, application_id, event_type, from_status, to_status, actor_id, metadata)
  values
    (p_request, row.id, 'REGISTRATION_COMPLETED', row.status, 'COMPLETED', actor, jsonb_build_object('student_id', v_student, 'parent_id', v_parent)),
    (gen_random_uuid(), row.id, 'STUDENT_LINKED', row.status, 'COMPLETED', actor, jsonb_build_object('student_id', v_student)),
    (gen_random_uuid(), row.id, 'PARENT_LINKED', row.status, 'COMPLETED', actor, jsonb_build_object('parent_id', v_parent)),
    (gen_random_uuid(), row.id, 'PLACEMENT_OPENED', row.status, 'COMPLETED', actor, jsonb_build_object('placement_id', placement_id));
  insert into public.student_placement_events(id, placement_id, event_type, actor_id)
  values (gen_random_uuid(), placement_id, 'PLACEMENT_OPENED', actor);
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

create function public.set_student_placement_matching(p_request uuid, p_placement uuid, p_version integer) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
begin
  if actor is null or p_request is null then raise exception 'PLACEMENT_INVALID'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then return p_placement; end if;
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found then raise exception 'PLACEMENT_NOT_FOUND'; end if;
  if not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status <> 'UNASSIGNED' then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  perform set_config('registration.write', 'on', true);
  update public.student_placement_cases set status = 'MATCHING', version = version + 1, updated_at = clock_timestamp() where id = row.id;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id) values (p_request, row.id, 'PLACEMENT_MATCHING', actor);
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

create function public.assign_student_placement(
  p_request uuid,
  p_placement uuid,
  p_version integer,
  p_class uuid,
  p_start date
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  class_row public.classes%rowtype;
  occupied integer;
  v_enrollment uuid;
  teacher_id uuid;
begin
  if actor is null or p_request is null or p_class is null or p_start is null then raise exception 'PLACEMENT_INVALID'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then return p_placement; end if;
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found then raise exception 'PLACEMENT_NOT_FOUND'; end if;
  if not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status not in ('UNASSIGNED', 'MATCHING') or row.enrollment_id is not null then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into class_row from public.classes where id = p_class;
  if not found or class_row.branch_id <> row.branch_id or class_row.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  if class_row.start_date is not null and p_start < class_row.start_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  if class_row.end_date is not null and p_start > class_row.end_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  select count(*) into occupied from public.enrollments
  where class_id = class_row.id and status in ('ACTIVE', 'PAUSED');
  if occupied >= class_row.capacity then raise exception 'PLACEMENT_CLASS_FULL'; end if;
  if exists(
    select 1 from public.enrollments
    where student_id = row.student_id and class_id = class_row.id and status in ('ACTIVE', 'PAUSED')
  ) then
    raise exception 'PLACEMENT_ALREADY_ENROLLED';
  end if;
  select ct.teacher_id into teacher_id
  from public.class_teachers ct
  where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY' and ct.is_active
    and ct.assigned_at <= p_start and (ct.ended_at is null or ct.ended_at >= p_start)
  order by ct.assigned_at desc
  limit 1;
  v_enrollment := gen_random_uuid();
  perform set_config('registration.write', 'on', true);
  insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status)
  values (v_enrollment, row.student_id, class_row.id, public.registration_vietnam_today(), p_start, 'ACTIVE');
  update public.student_placement_cases set
    status = 'SCHEDULED',
    enrollment_id = v_enrollment,
    assigned_class_id = class_row.id,
    assigned_teacher_id = teacher_id,
    scheduled_start_date = p_start,
    scheduled_at = clock_timestamp(),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  update public.registration_applications set linked_enrollment_id = v_enrollment, updated_at = clock_timestamp()
  where id = row.registration_application_id;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id, metadata)
  values (p_request, row.id, 'CLASS_ASSIGNED', actor, jsonb_build_object('class_id', class_row.id, 'start', p_start, 'enrollment_id', v_enrollment));
  insert into public.registration_application_events(id, application_id, event_type, actor_id, metadata)
  values (gen_random_uuid(), row.registration_application_id, 'ENROLLMENT_CREATED', actor, jsonb_build_object('enrollment_id', v_enrollment));
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

create function public.list_current_student_enrollments(p_branch uuid, p_search text)
returns table (
  enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text,
  course_name text, level_name text, class_name text, teacher_name text, schedule_label text,
  started_on date, package_name text, attendance_marked integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select enrollment.id, student.id, student.student_code, student.full_name, branch.name,
    course.name,
    (select level.name from public.curriculum_levels level where level.id = course.level_id),
    class_row.name,
    (select coalesce(profile.full_name, teacher.full_name) from public.class_teachers ct
      join public.teachers teacher on teacher.id = ct.teacher_id
      left join public.profiles profile on profile.id = teacher.user_id
      where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY' and ct.is_active
      limit 1),
    (select string_agg(schedule.day_of_week::text || ' ' || to_char(schedule.start_time, 'HH24:MI'), ', ' order by schedule.day_of_week, schedule.start_time)
      from public.schedules schedule where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'),
    enrollment.started_at,
    (select tuition.plan_name_snapshot from public.enrollment_tuition tuition
      where tuition.enrollment_id = enrollment.id and tuition.status <> 'CANCELLED'
      order by tuition.starts_on desc limit 1),
    (select count(*)::integer from public.attendance_records record where record.enrollment_id = enrollment.id)
  from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  join public.classes class_row on class_row.id = enrollment.class_id
  join public.branches branch on branch.id = class_row.branch_id
  join public.courses course on course.id = class_row.course_id
  where enrollment.status = 'ACTIVE'
    and class_row.status = 'ACTIVE'
    and enrollment.started_at is not null
    and enrollment.started_at <= public.registration_vietnam_today()
    and (enrollment.ended_at is null or enrollment.ended_at >= public.registration_vietnam_today())
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or student.full_name ilike '%' || replace(btrim(p_search), '%', '') || '%'
      or student.student_code ilike '%' || replace(btrim(p_search), '%', '') || '%'
    )
  order by student.full_name, enrollment.started_at
$$;

create function public.list_waiting_placements(p_branch uuid, p_filter text, p_search text)
returns table (
  placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text,
  branch_id uuid, branch_name text, program_name text, level_name text, desired_start date,
  preferred_schedule text, placement_status text, class_name text, teacher_name text,
  scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date
)
language sql stable security definer set search_path = public, pg_temp as $$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(course.name, app.program_interest),
    (select level.name from public.curriculum_levels level where level.id = course.level_id),
    placement.desired_start_date, placement.preferred_schedule,
    case
      when placement.status = 'SCHEDULED' then 'SCHEDULED_FUTURE'
      else placement.status
    end,
    class_row.name,
    (select teacher.full_name from public.teachers teacher where teacher.id = placement.assigned_teacher_id),
    placement.scheduled_start_date,
    (select profile.full_name from public.profiles profile where profile.id = placement.owner_user_id),
    coalesce(app.payment_confirmed_at, app.completed_at)::date,
    public.registration_vietnam_today() - placement.opened_at::date,
    placement.opened_at::date
  from public.student_placement_cases placement
  join public.students student on student.id = placement.student_id
  join public.registration_applications app on app.id = placement.registration_application_id
  join public.branches branch on branch.id = placement.branch_id
  left join public.classes class_row on class_row.id = placement.assigned_class_id
  left join public.courses course on course.id = class_row.course_id
  where public.registration_can('student_placement.view', placement.branch_id)
    and (p_branch is null or placement.branch_id = p_branch)
    and (
      placement.status in ('UNASSIGNED', 'MATCHING')
      or (placement.status = 'SCHEDULED' and placement.scheduled_start_date > public.registration_vietnam_today())
    )
    and (
      coalesce(p_filter, 'ALL') = 'ALL'
      or (p_filter = 'UNASSIGNED' and placement.status = 'UNASSIGNED')
      or (p_filter = 'MATCHING' and placement.status = 'MATCHING')
      or (p_filter = 'SCHEDULED_FUTURE' and placement.status = 'SCHEDULED' and placement.scheduled_start_date > public.registration_vietnam_today())
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or student.full_name ilike '%' || replace(btrim(p_search), '%', '') || '%'
      or student.student_code ilike '%' || replace(btrim(p_search), '%', '') || '%'
    )
  order by placement.opened_at, student.full_name
$$;

create function public.waiting_placement_summary(p_branch uuid)
returns table (waiting_count integer, unassigned_count integer, matching_count integer, scheduled_count integer, average_wait numeric, over_3 integer, over_7 integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with open_cases as (
    select public.registration_vietnam_today() - placement.opened_at::date as days, placement.status, placement.scheduled_start_date
    from public.student_placement_cases placement
    where public.registration_can('student_placement.view', placement.branch_id)
      and (p_branch is null or placement.branch_id = p_branch)
      and (
        placement.status in ('UNASSIGNED', 'MATCHING')
        or (placement.status = 'SCHEDULED' and placement.scheduled_start_date > public.registration_vietnam_today())
      )
  )
  select
    count(*)::integer,
    count(*) filter (where status = 'UNASSIGNED')::integer,
    count(*) filter (where status = 'MATCHING')::integer,
    count(*) filter (where status = 'SCHEDULED')::integer,
    coalesce(round(avg(days), 1), 0),
    count(*) filter (where days > 3)::integer,
    count(*) filter (where days > 7)::integer
  from open_cases
$$;

revoke all on function
  public.registration_can(text, uuid),
  public.registration_vietnam_today(),
  public.registration_invoice_settled(uuid),
  public.registration_lock(uuid, integer, text),
  public.guard_registration_application(),
  public.guard_student_placement(),
  public.create_registration_application(uuid, uuid, uuid, text, date, text, text, text, text, date, text),
  public.transition_registration_application(uuid, uuid, integer, text),
  public.attach_registration_invoice(uuid, uuid, integer, uuid),
  public.complete_registration_application(uuid, uuid, integer, uuid, uuid),
  public.set_student_placement_matching(uuid, uuid, integer),
  public.assign_student_placement(uuid, uuid, integer, uuid, date),
  public.list_current_student_enrollments(uuid, text),
  public.list_waiting_placements(uuid, text, text),
  public.waiting_placement_summary(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.registration_can(text, uuid),
  public.create_registration_application(uuid, uuid, uuid, text, date, text, text, text, text, date, text),
  public.transition_registration_application(uuid, uuid, integer, text),
  public.attach_registration_invoice(uuid, uuid, integer, uuid),
  public.complete_registration_application(uuid, uuid, integer, uuid, uuid),
  public.set_student_placement_matching(uuid, uuid, integer),
  public.assign_student_placement(uuid, uuid, integer, uuid, date),
  public.list_current_student_enrollments(uuid, text),
  public.list_waiting_placements(uuid, text, text),
  public.waiting_placement_summary(uuid)
to authenticated;
