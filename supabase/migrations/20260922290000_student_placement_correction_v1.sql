-- Pre-start placement correction.
-- Phase 2 is a separate Student Class Transfer Workflow. It has to account for
-- past attendance, future sessions, the teacher relationship, makeup credits,
-- learning journals, academic progress, tuition, and reporting history.
-- This migration does not transfer a learner after the Vietnam start date.

set local lock_timeout = '5s';
set local statement_timeout = '90s';

alter table public.enrollments drop constraint enrollments_student_class_key;

create unique index enrollments_active_student_class_key
  on public.enrollments (student_id, class_id)
  where status in ('ACTIVE', 'PAUSED');

do $event_type$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.student_placement_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%event_type%';
  if constraint_name is null then
    raise exception 'PLACEMENT_EVENT_CONSTRAINT_MISSING';
  end if;
  execute format('alter table public.student_placement_events drop constraint %I', constraint_name);
end;
$event_type$;

alter table public.student_placement_events
  add constraint student_placement_events_event_type_check
  check (event_type in (
    'PLACEMENT_OPENED', 'PLACEMENT_MATCHING', 'CLASS_ASSIGNED', 'START_DATE_SET',
    'PLACEMENT_CHANGED', 'PLACEMENT_CANCELLED'
  ));

create function public.placement_reason(p_reason text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  value text := btrim(coalesce(p_reason, ''));
begin
  if char_length(value) < 1 or char_length(value) > 2000 then
    raise exception 'PLACEMENT_REASON_REQUIRED';
  end if;
  return value;
end $$;

create function public.placement_learning_history_exists(p_enrollment uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.attendance_records where enrollment_id = p_enrollment)
    or exists(select 1 from public.enrollment_tuition where enrollment_id = p_enrollment)
    or exists(select 1 from public.enrollment_pauses where enrollment_id = p_enrollment)
    or exists(select 1 from public.makeup_credits where enrollment_id = p_enrollment)
    or exists(select 1 from public.lesson_feedback where enrollment_id = p_enrollment)
    or exists(select 1 from public.learning_reports where enrollment_id = p_enrollment)
    or exists(select 1 from public.learning_access_grants where enrollment_id = p_enrollment)
    or exists(select 1 from public.session_occurrence_participants where enrollment_id = p_enrollment)
    or exists(select 1 from public.invoices where enrollment_id_snapshot = p_enrollment)
    or exists(select 1 from public.student_retention_alerts where enrollment_id = p_enrollment)
    or exists(select 1 from public.crm_reactivation_cases where source_enrollment_id = p_enrollment)
    or exists(select 1 from public.enrollments where id = p_enrollment and student_curriculum_enrollment_id is not null)
$$;

create or replace function public.set_student_placement_matching(p_request uuid, p_placement uuid, p_version integer) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
begin
  if actor is null or p_request is null then raise exception 'PLACEMENT_INVALID'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then return p_placement; end if;
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status <> 'UNASSIGNED' then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  perform set_config('registration.write', 'on', true);
  update public.student_placement_cases set status = 'MATCHING', version = version + 1, updated_at = clock_timestamp() where id = row.id;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id) values (p_request, row.id, 'PLACEMENT_MATCHING', actor);
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

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
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
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

create function public.change_future_student_placement(
  p_request uuid,
  p_placement uuid,
  p_version integer,
  p_enrollment uuid,
  p_class uuid,
  p_start date,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  enrollment public.enrollments%rowtype;
  class_row public.classes%rowtype;
  occupied integer;
  teacher_id uuid;
  program_id uuid;
  reason text;
begin
  if actor is null or p_request is null or p_enrollment is null or p_class is null or p_start is null then
    raise exception 'PLACEMENT_INVALID';
  end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then return p_placement; end if;
  reason := public.placement_reason(p_reason);
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if row.enrollment_id is distinct from p_enrollment then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status <> 'SCHEDULED' then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into enrollment from public.enrollments where id = row.enrollment_id for update;
  if not found or enrollment.student_id <> row.student_id or enrollment.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_TRANSITION_DENIED';
  end if;
  if enrollment.started_at is null or enrollment.started_at <= public.registration_vietnam_today() then
    raise exception 'PLACEMENT_ALREADY_STARTED';
  end if;
  if public.placement_learning_history_exists(enrollment.id) then raise exception 'PLACEMENT_HISTORY_LOCKED'; end if;
  select * into class_row from public.classes where id = p_class for update;
  if not found or class_row.branch_id <> row.branch_id or class_row.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  select app.course_id into program_id from public.registration_applications app where app.id = row.registration_application_id;
  if program_id is not null and program_id is distinct from class_row.course_id then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  if p_start <= public.registration_vietnam_today() then raise exception 'PLACEMENT_START_DENIED'; end if;
  if class_row.start_date is not null and p_start < class_row.start_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  if class_row.end_date is not null and p_start > class_row.end_date then raise exception 'PLACEMENT_START_DENIED'; end if;
  if class_row.id = enrollment.class_id and p_start = enrollment.started_at then raise exception 'PLACEMENT_UNCHANGED'; end if;
  select count(*) into occupied from public.enrollments
  where class_id = class_row.id and status in ('ACTIVE', 'PAUSED') and id <> enrollment.id;
  if occupied >= class_row.capacity then raise exception 'PLACEMENT_CLASS_FULL'; end if;
  if exists(
    select 1 from public.enrollments
    where student_id = row.student_id and class_id = class_row.id and status in ('ACTIVE', 'PAUSED') and id <> enrollment.id
  ) then
    raise exception 'PLACEMENT_ALREADY_ENROLLED';
  end if;
  select ct.teacher_id into teacher_id
  from public.class_teachers ct
  where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY' and ct.is_active
    and ct.assigned_at <= p_start and (ct.ended_at is null or ct.ended_at >= p_start)
  order by ct.assigned_at desc
  limit 1;
  perform set_config('registration.write', 'on', true);
  update public.enrollments
  set class_id = class_row.id, started_at = p_start, updated_at = clock_timestamp()
  where id = enrollment.id;
  update public.student_placement_cases set
    assigned_class_id = class_row.id,
    assigned_teacher_id = teacher_id,
    scheduled_start_date = p_start,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id, metadata)
  values (
    p_request, row.id, 'PLACEMENT_CHANGED', actor,
    jsonb_build_object(
      'student_id', row.student_id,
      'enrollment_id', enrollment.id,
      'old_class_id', enrollment.class_id,
      'new_class_id', class_row.id,
      'old_start', enrollment.started_at,
      'new_start', p_start,
      'reason', reason
    )
  );
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

create function public.cancel_future_student_placement(
  p_request uuid,
  p_placement uuid,
  p_version integer,
  p_enrollment uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  enrollment public.enrollments%rowtype;
  reason text;
begin
  if actor is null or p_request is null or p_enrollment is null then raise exception 'PLACEMENT_INVALID'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then return p_placement; end if;
  reason := public.placement_reason(p_reason);
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if row.enrollment_id is distinct from p_enrollment then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status <> 'SCHEDULED' then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into enrollment from public.enrollments where id = row.enrollment_id for update;
  if not found or enrollment.student_id <> row.student_id or enrollment.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_TRANSITION_DENIED';
  end if;
  if enrollment.started_at is null or enrollment.started_at <= public.registration_vietnam_today() then
    raise exception 'PLACEMENT_ALREADY_STARTED';
  end if;
  if public.placement_learning_history_exists(enrollment.id) then raise exception 'PLACEMENT_HISTORY_LOCKED'; end if;
  perform set_config('registration.write', 'on', true);
  update public.enrollments
  set status = 'WITHDRAWN', ended_at = started_at, updated_at = clock_timestamp()
  where id = enrollment.id;
  update public.student_placement_cases set
    status = 'UNASSIGNED',
    enrollment_id = null,
    assigned_class_id = null,
    assigned_teacher_id = null,
    scheduled_start_date = null,
    scheduled_at = null,
    version = version + 1,
    updated_at = clock_timestamp()
  where id = row.id;
  update public.registration_applications
  set linked_enrollment_id = null, updated_at = clock_timestamp()
  where id = row.registration_application_id;
  insert into public.student_placement_events(id, placement_id, event_type, actor_id, metadata)
  values (
    p_request, row.id, 'PLACEMENT_CANCELLED', actor,
    jsonb_build_object(
      'student_id', row.student_id,
      'enrollment_id', enrollment.id,
      'old_class_id', enrollment.class_id,
      'new_class_id', null,
      'old_start', enrollment.started_at,
      'reason', reason
    )
  );
  perform set_config('registration.write', 'off', true);
  return row.id;
end $$;

drop function public.list_waiting_placements(uuid, text, text);
drop function public.list_current_student_enrollments(uuid, text);

create function public.list_current_student_enrollments(
  p_branch uuid,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0
)
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
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.list_waiting_placements(
  p_branch uuid,
  p_filter text,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text,
  branch_id uuid, branch_name text, program_name text, level_name text, desired_start date,
  preferred_schedule text, placement_status text, class_name text, teacher_name text,
  scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date,
  enrollment_id uuid, class_id uuid
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
    placement.opened_at::date,
    placement.enrollment_id,
    placement.assigned_class_id
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
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create function public.list_placement_class_options(p_branch uuid)
returns table (id uuid, name text, branch_id uuid, open_seats integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select class_row.id, class_row.name, class_row.branch_id,
    class_row.capacity - (
      select count(*)::integer from public.enrollments enrollment
      where enrollment.class_id = class_row.id and enrollment.status in ('ACTIVE', 'PAUSED')
    )
  from public.classes class_row
  where class_row.status = 'ACTIVE'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
    and (
      select count(*) from public.enrollments enrollment
      where enrollment.class_id = class_row.id and enrollment.status in ('ACTIVE', 'PAUSED')
    ) < class_row.capacity
  order by class_row.name
$$;

revoke all on function
  public.placement_reason(text),
  public.placement_learning_history_exists(uuid),
  public.change_future_student_placement(uuid, uuid, integer, uuid, uuid, date, text),
  public.cancel_future_student_placement(uuid, uuid, integer, uuid, text),
  public.list_current_student_enrollments(uuid, text, integer, integer),
  public.list_waiting_placements(uuid, text, text, integer, integer),
  public.list_placement_class_options(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.change_future_student_placement(uuid, uuid, integer, uuid, uuid, date, text),
  public.cancel_future_student_placement(uuid, uuid, integer, uuid, text),
  public.list_current_student_enrollments(uuid, text, integer, integer),
  public.list_waiting_placements(uuid, text, text, integer, integer),
  public.list_placement_class_options(uuid)
to authenticated;
