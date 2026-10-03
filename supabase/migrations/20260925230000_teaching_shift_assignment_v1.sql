-- Teaching-shift assignment for the post-payment waiting queue.
-- Reuses student_placement_cases, assign_student_placement, and enrollment start dates.
-- Does not rename classes or rewrite payment completion.

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
  scope_code text;
begin
  if actor is null or p_request is null or p_class is null or p_start is null then raise exception 'PLACEMENT_INVALID'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then return p_placement; end if;
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status not in ('UNASSIGNED', 'MATCHING') or row.enrollment_id is not null then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into class_row from public.classes where id = p_class;
  if not found or class_row.branch_id <> row.branch_id or class_row.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  select app.course_id into program_id
  from public.registration_applications app
  where app.id = row.registration_application_id;
  if program_id is null or program_id is distinct from class_row.course_id then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  scope_code := public.class_enrollment_compatibility(class_row.id, row.student_id);
  if scope_code is distinct from 'IN_SCOPE' then
    raise exception 'PLACEMENT_LEVEL_DENIED';
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
  if teacher_id is null then raise exception 'PLACEMENT_TEACHER_REQUIRED'; end if;
  if not exists(
    select 1 from public.schedules schedule
    where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
  ) then
    raise exception 'PLACEMENT_SCHEDULE_REQUIRED';
  end if;
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

drop function public.list_waiting_placements(uuid, text, text, integer, integer);

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
  enrollment_id uuid, class_id uuid, course_id uuid
)
language sql stable security definer set search_path = public, pg_temp as $$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(program.name, app.program_interest),
    (select level.name from public.curriculum_levels level where level.id = program.level_id),
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
    placement.assigned_class_id,
    coalesce(app.course_id, class_row.course_id)
  from public.student_placement_cases placement
  join public.students student on student.id = placement.student_id
  join public.registration_applications app on app.id = placement.registration_application_id
  join public.branches branch on branch.id = placement.branch_id
  left join public.classes class_row on class_row.id = placement.assigned_class_id
  left join public.courses program on program.id = coalesce(app.course_id, class_row.course_id)
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

drop function public.list_placement_class_options(uuid);

create function public.list_placement_class_options(p_branch uuid)
returns table (
  id uuid,
  name text,
  branch_id uuid,
  open_seats integer,
  code text,
  branch_name text,
  course_id uuid,
  curriculum_name text,
  level_label text,
  teacher_name text,
  room_name text,
  schedule_label text,
  duration_minutes integer,
  enrolled_count integer,
  capacity integer,
  status text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select class_row.id,
    class_row.name,
    class_row.branch_id,
    class_row.capacity - (
      select count(*)::integer from public.enrollments enrollment
      where enrollment.class_id = class_row.id and enrollment.status in ('ACTIVE', 'PAUSED')
    ),
    class_row.code,
    branch.name,
    class_row.course_id,
    curriculum.name,
    case
      when from_level.name is null or to_level.name is null then null
      when from_level.id = to_level.id then from_level.name
      else from_level.name || ' – ' || to_level.name
    end,
    (
      select coalesce(profile.full_name, teacher.full_name)
      from public.class_teachers ct
      join public.teachers teacher on teacher.id = ct.teacher_id
      left join public.profiles profile on profile.id = teacher.user_id
      where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY' and ct.is_active
      order by ct.assigned_at desc
      limit 1
    ),
    (
      select room.name
      from public.schedules schedule
      left join public.rooms room on room.id = schedule.room_id
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
      order by schedule.day_of_week, schedule.start_time
      limit 1
    ),
    (
      select string_agg(
        case schedule.day_of_week
          when 1 then 'Thứ 2'
          when 2 then 'Thứ 3'
          when 3 then 'Thứ 4'
          when 4 then 'Thứ 5'
          when 5 then 'Thứ 6'
          when 6 then 'Thứ 7'
          else 'Chủ nhật'
        end || ' ' || to_char(schedule.start_time, 'HH24:MI') || '–' || to_char(schedule.end_time, 'HH24:MI'),
        ', ' order by schedule.day_of_week, schedule.start_time
      )
      from public.schedules schedule
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
    ),
    (
      select (extract(epoch from (schedule.end_time - schedule.start_time)) / 60)::integer
      from public.schedules schedule
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'
      order by schedule.day_of_week, schedule.start_time
      limit 1
    ),
    (
      select count(*)::integer from public.enrollments enrollment
      where enrollment.class_id = class_row.id and enrollment.status in ('ACTIVE', 'PAUSED')
    ),
    class_row.capacity,
    class_row.status
  from public.classes class_row
  join public.branches branch on branch.id = class_row.branch_id
  join public.courses course on course.id = class_row.course_id
  join public.curriculums curriculum on curriculum.id = course.curriculum_id
  left join public.curriculum_levels from_level on from_level.id = class_row.accepted_from_level_id
  left join public.curriculum_levels to_level on to_level.id = class_row.accepted_to_level_id
  where class_row.status = 'ACTIVE'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
    and (
      select count(*) from public.enrollments enrollment
      where enrollment.class_id = class_row.id and enrollment.status in ('ACTIVE', 'PAUSED')
    ) < class_row.capacity
  order by class_row.name
  limit 100
$$;

revoke all on function
  public.list_waiting_placements(uuid, text, text, integer, integer),
  public.list_placement_class_options(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.list_waiting_placements(uuid, text, text, integer, integer),
  public.list_placement_class_options(uuid)
to authenticated;
