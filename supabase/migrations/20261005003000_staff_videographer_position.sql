-- Extend the existing position workflow; no permission or payroll changes.
alter table public.staff_position_catalog drop constraint staff_position_catalog_code_check;
alter table public.staff_position_catalog add constraint staff_position_catalog_code_check check (code in ('VAS', 'VAM', 'VAH', 'VIDEOGRAPHER'));
insert into public.staff_position_catalog(code) values ('VIDEOGRAPHER') on conflict (code) do nothing;
CREATE OR REPLACE FUNCTION public.assign_staff_position(p_employee uuid, p_code text, p_effective_from date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  result uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'STAFF_PROFILE_UNAUTHORIZED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'STAFF_ASSIGNMENT_REASON_REQUIRED';
  end if;
  if p_code not in ('VAS', 'VAM', 'VAH', 'VIDEOGRAPHER') then
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
$function$;

CREATE OR REPLACE FUNCTION public.staff_name_card(p_employee uuid)
 RETURNS TABLE(full_name text, employee_code text, teaching_badges text[], position_badges text[], branch_name text, portrait_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
          and p.position_code in ('VAS', 'VAM', 'VAH', 'VIDEOGRAPHER')
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
$function$;
