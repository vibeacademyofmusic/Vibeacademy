-- Teaching capacity and VAS/VAM/VAH badges are profile facts.
-- They do not write operational_role_id, user_roles, or payroll components.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_STAFF_PROFILE_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;
  if to_regclass('public.employees') is null
     or to_regclass('public.employee_audit') is null
     or to_regclass('public.curriculum_subjects') is null
     or to_regclass('public.organization_units') is null
     or to_regclass('storage.buckets') is null
     or to_regprocedure('public.has_role(text)') is null
  then
    raise exception 'VIBE_STAFF_PROFILE_PREREQUISITE_MISSING';
  end if;
  if to_regclass('public.staff_teaching_assignments') is not null
     or to_regclass('public.staff_position_assignments') is not null
     or to_regclass('public.staff_portraits') is not null
  then
    raise exception 'VIBE_STAFF_PROFILE_ALREADY_EXISTS';
  end if;
end;
$preflight$;

create table public.staff_position_catalog (
  code text primary key check (code in ('VAS', 'VAM', 'VAH')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE'))
);

insert into public.staff_position_catalog(code) values ('VAS'), ('VAM'), ('VAH');

create table public.staff_position_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  position_code text not null references public.staff_position_catalog(code),
  effective_from date not null check (isfinite(effective_from)),
  effective_to date check (effective_to is null or (isfinite(effective_to) and effective_to >= effective_from)),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);

create unique index staff_position_assignment_same_start
  on public.staff_position_assignments(employee_id, position_code, effective_from);

create table public.staff_teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  subject_id uuid not null references public.curriculum_subjects(id),
  capacity text not null check (capacity in ('TEACHER', 'ASSISTANT')),
  effective_from date not null check (isfinite(effective_from)),
  effective_to date check (effective_to is null or (isfinite(effective_to) and effective_to >= effective_from)),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);

create unique index staff_teaching_assignment_same_start
  on public.staff_teaching_assignments(employee_id, subject_id, capacity, effective_from);

create table public.staff_portraits (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id),
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 2000000),
  width integer not null check (width between 400 and 4000),
  height integer not null check (height between 400 and 4000),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REPLACED', 'REMOVED')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default clock_timestamp()
);

create unique index staff_portraits_one_active
  on public.staff_portraits(employee_id) where status = 'ACTIVE';

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-portraits',
  'staff-portraits',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.staff_position_catalog enable row level security;
alter table public.staff_position_assignments enable row level security;
alter table public.staff_teaching_assignments enable row level security;
alter table public.staff_portraits enable row level security;

create policy staff_position_catalog_read
  on public.staff_position_catalog for select to authenticated
  using (coalesce(public.has_role('SUPER_ADMIN'), false));

create policy staff_position_assignments_read
  on public.staff_position_assignments for select to authenticated
  using (coalesce(public.has_role('SUPER_ADMIN'), false));

create policy staff_teaching_assignments_read
  on public.staff_teaching_assignments for select to authenticated
  using (coalesce(public.has_role('SUPER_ADMIN'), false));

create policy staff_portraits_read
  on public.staff_portraits for select to authenticated
  using (coalesce(public.has_role('SUPER_ADMIN'), false));

create policy staff_portraits_object_read
  on storage.objects for select to authenticated
  using (bucket_id = 'staff-portraits' and coalesce(public.has_role('SUPER_ADMIN'), false));

create policy staff_portraits_object_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-portraits' and coalesce(public.has_role('SUPER_ADMIN'), false));

create policy staff_portraits_object_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'staff-portraits' and coalesce(public.has_role('SUPER_ADMIN'), false));

revoke all on public.staff_position_catalog, public.staff_position_assignments,
  public.staff_teaching_assignments, public.staff_portraits
  from public, anon, authenticated, service_role;
grant select on public.staff_position_catalog, public.staff_position_assignments,
  public.staff_teaching_assignments, public.staff_portraits to authenticated;

create function public.assign_staff_teaching(
  p_employee uuid,
  p_subject uuid,
  p_capacity text,
  p_effective_from date,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_ASSIGNMENT_REASON_REQUIRED';
  end if;
  if p_capacity not in ('TEACHER', 'ASSISTANT') then
    raise exception 'STAFF_TEACHING_CAPACITY_UNKNOWN';
  end if;
  if p_effective_from is null or not isfinite(p_effective_from) then
    raise exception 'STAFF_ASSIGNMENT_DATE_INVALID';
  end if;
  if not exists(select 1 from public.employees where id = p_employee) then
    raise exception 'STAFF_EMPLOYEE_NOT_FOUND';
  end if;
  if not exists(select 1 from public.curriculum_subjects where id = p_subject and status = 'ACTIVE') then
    raise exception 'STAFF_SUBJECT_NOT_ACTIVE';
  end if;
  perform 1 from public.employees where id = p_employee for update;
  if exists (
    select 1 from public.staff_teaching_assignments a
    where a.employee_id = p_employee
      and a.subject_id = p_subject
      and a.capacity = p_capacity
      and a.status = 'ACTIVE'
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, 'infinity'::date, '[]')
  ) then
    raise exception 'STAFF_TEACHING_OVERLAP';
  end if;
  insert into public.staff_teaching_assignments(
    employee_id, subject_id, capacity, effective_from, reason, created_by
  ) values (
    p_employee, p_subject, p_capacity, p_effective_from, btrim(p_reason), auth.uid()
  ) returning id into result;
  insert into public.employee_audit(employee_id, action, after_data, reason, actor)
  select p_employee, 'TEACHING_ASSIGNED', to_jsonb(a), btrim(p_reason), auth.uid()
  from public.staff_teaching_assignments a where a.id = result;
  return result;
end;
$$;

create function public.end_staff_teaching(
  p_assignment uuid,
  p_effective_to date,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row jsonb;
  after_row jsonb;
  employee uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_ASSIGNMENT_REASON_REQUIRED';
  end if;
  if p_effective_to is null or not isfinite(p_effective_to) then
    raise exception 'STAFF_ASSIGNMENT_DATE_INVALID';
  end if;
  select to_jsonb(a), a.employee_id into before_row, employee
  from public.staff_teaching_assignments a where a.id = p_assignment for update;
  if before_row is null then
    raise exception 'STAFF_ASSIGNMENT_NOT_FOUND';
  end if;
  if (before_row->>'effective_from')::date > p_effective_to then
    raise exception 'STAFF_ASSIGNMENT_DATE_INVALID';
  end if;
  update public.staff_teaching_assignments
  set effective_to = p_effective_to, status = 'INACTIVE'
  where id = p_assignment
    and subject_id = (before_row->>'subject_id')::uuid
    and capacity = before_row->>'capacity'
    and effective_from = (before_row->>'effective_from')::date
    and reason = before_row->>'reason';
  select to_jsonb(a) into after_row from public.staff_teaching_assignments a where a.id = p_assignment;
  insert into public.employee_audit(employee_id, action, before_data, after_data, reason, actor)
  values (employee, 'TEACHING_ENDED', before_row, after_row, btrim(p_reason), auth.uid());
end;
$$;

create function public.assign_staff_position(
  p_employee uuid,
  p_code text,
  p_effective_from date,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_ASSIGNMENT_REASON_REQUIRED';
  end if;
  if p_code not in ('VAS', 'VAM', 'VAH') then
    raise exception 'STAFF_POSITION_UNKNOWN';
  end if;
  if p_effective_from is null or not isfinite(p_effective_from) then
    raise exception 'STAFF_ASSIGNMENT_DATE_INVALID';
  end if;
  if not exists(select 1 from public.employees where id = p_employee) then
    raise exception 'STAFF_EMPLOYEE_NOT_FOUND';
  end if;
  perform 1 from public.employees where id = p_employee for update;
  if exists (
    select 1 from public.staff_position_assignments a
    where a.employee_id = p_employee
      and a.position_code = p_code
      and a.status = 'ACTIVE'
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, 'infinity'::date, '[]')
  ) then
    raise exception 'STAFF_POSITION_OVERLAP';
  end if;
  insert into public.staff_position_assignments(
    employee_id, position_code, effective_from, reason, created_by
  ) values (
    p_employee, p_code, p_effective_from, btrim(p_reason), auth.uid()
  ) returning id into result;
  insert into public.employee_audit(employee_id, action, after_data, reason, actor)
  select p_employee, 'POSITION_ASSIGNED', to_jsonb(a), btrim(p_reason), auth.uid()
  from public.staff_position_assignments a where a.id = result;
  return result;
end;
$$;

create function public.end_staff_position(
  p_assignment uuid,
  p_effective_to date,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row jsonb;
  employee uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_ASSIGNMENT_REASON_REQUIRED';
  end if;
  if p_effective_to is null or not isfinite(p_effective_to) then
    raise exception 'STAFF_ASSIGNMENT_DATE_INVALID';
  end if;
  select to_jsonb(a), a.employee_id into before_row, employee
  from public.staff_position_assignments a where a.id = p_assignment for update;
  if before_row is null then
    raise exception 'STAFF_ASSIGNMENT_NOT_FOUND';
  end if;
  if (before_row->>'effective_from')::date > p_effective_to then
    raise exception 'STAFF_ASSIGNMENT_DATE_INVALID';
  end if;
  update public.staff_position_assignments
  set effective_to = p_effective_to, status = 'INACTIVE'
  where id = p_assignment
    and position_code = before_row->>'position_code'
    and effective_from = (before_row->>'effective_from')::date
    and reason = before_row->>'reason';
  insert into public.employee_audit(employee_id, action, before_data, after_data, reason, actor)
  select employee, 'POSITION_ENDED', before_row, to_jsonb(a), btrim(p_reason), auth.uid()
  from public.staff_position_assignments a where a.id = p_assignment;
end;
$$;

create function public.record_staff_portrait(
  p_employee uuid,
  p_path text,
  p_type text,
  p_bytes integer,
  p_width integer,
  p_height integer
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous text;
  result uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  if not exists(select 1 from public.employees where id = p_employee) then
    raise exception 'STAFF_EMPLOYEE_NOT_FOUND';
  end if;
  if p_path is distinct from p_employee::text || '/' || split_part(p_path, '/', 2)
     or split_part(p_path, '/', 2) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
     or p_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_bytes is null or p_bytes <= 0 or p_bytes > 2000000
     or p_width is null or p_height is null
     or p_width < 400 or p_height < 400 or p_width > 4000 or p_height > 4000
  then
    raise exception 'STAFF_PORTRAIT_INVALID';
  end if;
  perform 1 from public.employees where id = p_employee for update;
  select storage_path into previous
  from public.staff_portraits
  where employee_id = p_employee and status = 'ACTIVE'
  for update;
  update public.staff_portraits
  set status = 'REPLACED'
  where employee_id = p_employee and status = 'ACTIVE';
  insert into public.staff_portraits(
    employee_id, storage_path, content_type, byte_size, width, height, created_by
  ) values (
    p_employee, p_path, p_type, p_bytes, p_width, p_height, auth.uid()
  ) returning id into result;
  insert into public.employee_audit(employee_id, action, before_data, after_data, reason, actor)
  values (
    p_employee,
    'PORTRAIT_RECORDED',
    case when previous is null then null else jsonb_build_object('storage_path', previous) end,
    jsonb_build_object('id', result),
    'Cập nhật chân dung hồ sơ nhân sự',
    auth.uid()
  );
  return previous;
end;
$$;

create function public.remove_staff_portrait(p_employee uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed text;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_ASSIGNMENT_REASON_REQUIRED';
  end if;
  update public.staff_portraits
  set status = 'REMOVED'
  where employee_id = p_employee and status = 'ACTIVE'
  returning storage_path into removed;
  if removed is null then
    raise exception 'STAFF_PORTRAIT_MISSING';
  end if;
  insert into public.employee_audit(employee_id, action, after_data, reason, actor)
  values (p_employee, 'PORTRAIT_REMOVED', jsonb_build_object('removed', true), btrim(p_reason), auth.uid());
  return removed;
end;
$$;

create function public.staff_name_card(p_employee uuid)
returns table (
  full_name text,
  employee_code text,
  teaching_badges text[],
  position_badges text[],
  branch_name text,
  portrait_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  return query
  select
    directory.full_name,
    directory.employee_code,
    coalesce((
      select array_agg(label order by label)
      from (
        select distinct case a.capacity
          when 'TEACHER' then 'Giáo viên ' || s.name
          when 'ASSISTANT' then 'Trợ giảng ' || s.name
        end as label
        from public.staff_teaching_assignments a
        join public.curriculum_subjects s on s.id = a.subject_id
        where a.employee_id = directory.id
          and a.status = 'ACTIVE'
          and a.effective_from <= today
          and (a.effective_to is null or a.effective_to >= today)
          and nullif(btrim(s.name), '') is not null
      ) labels
      where label is not null
    ), '{}'::text[]),
    coalesce((
      select array_agg(code order by code)
      from (
        select distinct p.position_code as code
        from public.staff_position_assignments p
        where p.employee_id = directory.id
          and p.status = 'ACTIVE'
          and p.position_code in ('VAS', 'VAM', 'VAH')
          and p.effective_from <= today
          and (p.effective_to is null or p.effective_to >= today)
      ) codes
    ), '{}'::text[]),
    case when branch.id is not null and branch.status = 'ACTIVE' then branch.name else null end,
    (
      select portrait.storage_path
      from public.staff_portraits portrait
      where portrait.employee_id = directory.id and portrait.status = 'ACTIVE'
      limit 1
    )
  from public.employee_directory directory
  left join public.organization_units unit on unit.code = directory.unit_code
  left join public.branches branch on branch.id = unit.branch_id
  where directory.id = p_employee;
end;
$$;

revoke all on function
  public.assign_staff_teaching(uuid, uuid, text, date, text),
  public.end_staff_teaching(uuid, date, text),
  public.assign_staff_position(uuid, text, date, text),
  public.end_staff_position(uuid, date, text),
  public.record_staff_portrait(uuid, text, text, integer, integer, integer),
  public.remove_staff_portrait(uuid, text),
  public.staff_name_card(uuid)
from public, anon, service_role;
grant execute on function
  public.assign_staff_teaching(uuid, uuid, text, date, text),
  public.end_staff_teaching(uuid, date, text),
  public.assign_staff_position(uuid, text, date, text),
  public.end_staff_position(uuid, date, text),
  public.record_staff_portrait(uuid, text, text, integer, integer, integer),
  public.remove_staff_portrait(uuid, text),
  public.staff_name_card(uuid)
to authenticated;

comment on table public.staff_teaching_assignments is
  'Subject teaching capacity. Does not grant account roles or payroll components.';
comment on table public.staff_position_assignments is
  'Concurrent VAS, VAM, and VAH badges. Does not replace operational_role_id or grant access.';
comment on table public.staff_portraits is
  'Private portrait metadata. The image lives in the private staff-portraits bucket.';

commit;
