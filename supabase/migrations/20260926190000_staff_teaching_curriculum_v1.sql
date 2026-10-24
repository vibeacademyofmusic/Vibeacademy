-- Teaching capacity follows the instrument catalogue (curriculums), not lesson topics.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.staff_teaching_assignments
  drop constraint staff_teaching_assignments_subject_id_fkey;

alter table public.staff_teaching_assignments
  rename column subject_id to curriculum_id;

alter table public.staff_teaching_assignments
  add constraint staff_teaching_assignments_curriculum_id_fkey
  foreign key (curriculum_id) references public.curriculums(id);

create or replace function public.assign_staff_teaching(
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
  if not exists(select 1 from public.curriculums where id = p_subject and status = 'ACTIVE') then
    raise exception 'STAFF_SUBJECT_NOT_ACTIVE';
  end if;
  perform 1 from public.employees where id = p_employee for update;
  if exists (
    select 1 from public.staff_teaching_assignments a
    where a.employee_id = p_employee
      and a.curriculum_id = p_subject
      and a.capacity = p_capacity
      and a.status = 'ACTIVE'
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, 'infinity'::date, '[]')
  ) then
    raise exception 'STAFF_TEACHING_OVERLAP';
  end if;
  insert into public.staff_teaching_assignments(
    employee_id, curriculum_id, capacity, effective_from, reason, created_by
  ) values (
    p_employee, p_subject, p_capacity, p_effective_from, btrim(p_reason), auth.uid()
  ) returning id into result;
  insert into public.employee_audit(employee_id, action, after_data, reason, actor)
  select p_employee, 'TEACHING_ASSIGNED', to_jsonb(a), btrim(p_reason), auth.uid()
  from public.staff_teaching_assignments a where a.id = result;
  return result;
end;
$$;

create or replace function public.end_staff_teaching(
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
    and curriculum_id = (before_row->>'curriculum_id')::uuid
    and capacity = before_row->>'capacity'
    and effective_from = (before_row->>'effective_from')::date
    and reason = before_row->>'reason';
  select to_jsonb(a) into after_row from public.staff_teaching_assignments a where a.id = p_assignment;
  insert into public.employee_audit(employee_id, action, before_data, after_data, reason, actor)
  values (employee, 'TEACHING_ENDED', before_row, after_row, btrim(p_reason), auth.uid());
end;
$$;

create or replace function public.staff_name_card(p_employee uuid)
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
          when 'TEACHER' then 'Giáo viên ' || c.name
          when 'ASSISTANT' then 'Trợ giảng ' || c.name
        end as label
        from public.staff_teaching_assignments a
        join public.curriculums c on c.id = a.curriculum_id
        where a.employee_id = directory.id
          and a.status = 'ACTIVE'
          and a.effective_from <= today
          and (a.effective_to is null or a.effective_to >= today)
          and nullif(btrim(c.name), '') is not null
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

commit;
