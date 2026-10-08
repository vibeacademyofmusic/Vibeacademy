-- Operational admission for the current/waiting student lists.
-- Student detail and other admin modules stay on their existing guards.

create function public.student_ops_may_enter()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.account_is_active(), false)
    and (
      public.has_role('SUPER_ADMIN')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        join public.branches b on b.id = ur.branch_id
        where ur.user_id = auth.uid()
          and r.code <> 'SUPER_ADMIN'
          and ur.branch_id is not null
          and ur.is_active
          and (ur.valid_from is null or ur.valid_from <= now())
          and (ur.valid_until is null or ur.valid_until > now())
          and p.code = 'student_placement.view'
      )
    )
$$;

revoke all on function public.student_ops_may_enter() from public, anon, authenticated, service_role;
grant execute on function public.student_ops_may_enter() to authenticated;

create or replace function public.assign_student_placement(
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
  program_id uuid;
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
  select app.course_id into program_id
  from public.registration_applications app
  where app.id = row.registration_application_id;
  if program_id is not null and program_id is distinct from class_row.course_id then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
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
