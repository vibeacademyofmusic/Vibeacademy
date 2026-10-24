-- Student lifecycle segmentation.
-- Waiting, future start, actively studying, and paused studying are mutually exclusive
-- per enrollment/placement record. A second program can still wait while another
-- enrollment for the same student is already studying.
-- Does not rename classes or rewrite payment completion.

create or replace function public.enrollment_lifecycle_state(
  p_enrollment uuid,
  p_on date
) returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when enrollment.status = 'ACTIVE'
      and class_row.status = 'ACTIVE'
      and enrollment.started_at is not null
      and enrollment.started_at <= p_on
      and (enrollment.ended_at is null or enrollment.ended_at >= p_on)
      and not exists (
        select 1
        from public.student_placement_cases placement
        where placement.enrollment_id = enrollment.id
          and (
            placement.status in ('UNASSIGNED', 'MATCHING')
            or (
              placement.status = 'SCHEDULED'
              and placement.scheduled_start_date > p_on
            )
          )
      )
    then case
      when public.is_enrollment_paused_on(enrollment.id, p_on) then 'PAUSED'
      else 'ACTIVE'
    end
    else null
  end
  from public.enrollments enrollment
  join public.classes class_row on class_row.id = enrollment.class_id
  where enrollment.id = p_enrollment
$$;

revoke all on function public.enrollment_lifecycle_state(uuid, date)
from public, anon, authenticated, service_role;

create or replace function public.list_current_student_enrollments(
  p_branch uuid,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0,
  p_class uuid default null,
  p_teacher uuid default null
)
returns table (
  enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text,
  course_name text, level_name text, class_name text, teacher_name text, schedule_label text,
  started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid,
  student_status text, enrollment_status text
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
      order by ct.assigned_at desc
      limit 1),
    (select string_agg(
        case schedule.day_of_week
          when 1 then 'Thứ 2'
          when 2 then 'Thứ 3'
          when 3 then 'Thứ 4'
          when 4 then 'Thứ 5'
          when 5 then 'Thứ 6'
          when 6 then 'Thứ 7'
          else 'Chủ nhật'
        end || ' ' || to_char(schedule.start_time, 'HH24:MI') || '–' || to_char(schedule.end_time, 'HH24:MI'),
        ', ' order by schedule.day_of_week, schedule.start_time)
      from public.schedules schedule
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'),
    enrollment.started_at,
    (select tuition.plan_name_snapshot from public.enrollment_tuition tuition
      where tuition.enrollment_id = enrollment.id and tuition.status <> 'CANCELLED'
      order by tuition.starts_on desc limit 1),
    (select count(*)::integer from public.attendance_records record where record.enrollment_id = enrollment.id),
    class_row.id,
    class_row.branch_id,
    student.status,
    enrollment.status
  from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  join public.classes class_row on class_row.id = enrollment.class_id
  join public.branches branch on branch.id = class_row.branch_id
  join public.courses course on course.id = class_row.course_id
  where public.enrollment_lifecycle_state(enrollment.id, public.registration_vietnam_today()) = 'ACTIVE'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
    and (p_class is null or class_row.id = p_class)
    and (
      p_teacher is null
      or exists (
        select 1 from public.class_teachers ct
        where ct.class_id = class_row.id
          and ct.teacher_id = p_teacher
          and ct.is_active
      )
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or student.full_name ilike '%' || replace(btrim(p_search), '%', '') || '%'
      or student.student_code ilike '%' || replace(btrim(p_search), '%', '') || '%'
    )
  order by student.full_name, enrollment.started_at
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.count_current_student_enrollments(
  p_branch uuid,
  p_search text default null,
  p_class uuid default null,
  p_teacher uuid default null
)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer
  from public.list_current_student_enrollments(p_branch, p_search, null, 0, p_class, p_teacher)
$$;

create or replace function public.list_paused_student_enrollments(
  p_branch uuid,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0,
  p_class uuid default null,
  p_teacher uuid default null
)
returns table (
  enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text,
  course_name text, level_name text, class_name text, teacher_name text, schedule_label text,
  started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid,
  student_status text, enrollment_status text
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
      order by ct.assigned_at desc
      limit 1),
    (select string_agg(
        case schedule.day_of_week
          when 1 then 'Thứ 2'
          when 2 then 'Thứ 3'
          when 3 then 'Thứ 4'
          when 4 then 'Thứ 5'
          when 5 then 'Thứ 6'
          when 6 then 'Thứ 7'
          else 'Chủ nhật'
        end || ' ' || to_char(schedule.start_time, 'HH24:MI') || '–' || to_char(schedule.end_time, 'HH24:MI'),
        ', ' order by schedule.day_of_week, schedule.start_time)
      from public.schedules schedule
      where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'),
    enrollment.started_at,
    (select tuition.plan_name_snapshot from public.enrollment_tuition tuition
      where tuition.enrollment_id = enrollment.id and tuition.status <> 'CANCELLED'
      order by tuition.starts_on desc limit 1),
    (select count(*)::integer from public.attendance_records record where record.enrollment_id = enrollment.id),
    class_row.id,
    class_row.branch_id,
    student.status,
    enrollment.status
  from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  join public.classes class_row on class_row.id = enrollment.class_id
  join public.branches branch on branch.id = class_row.branch_id
  join public.courses course on course.id = class_row.course_id
  where public.enrollment_lifecycle_state(enrollment.id, public.registration_vietnam_today()) = 'PAUSED'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
    and (p_class is null or class_row.id = p_class)
    and (
      p_teacher is null
      or exists (
        select 1 from public.class_teachers ct
        where ct.class_id = class_row.id
          and ct.teacher_id = p_teacher
          and ct.is_active
      )
    )
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or student.full_name ilike '%' || replace(btrim(p_search), '%', '') || '%'
      or student.student_code ilike '%' || replace(btrim(p_search), '%', '') || '%'
    )
  order by student.full_name, enrollment.started_at
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.count_paused_student_enrollments(
  p_branch uuid,
  p_search text default null,
  p_class uuid default null,
  p_teacher uuid default null
)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer
  from public.list_paused_student_enrollments(p_branch, p_search, null, 0, p_class, p_teacher)
$$;

create or replace function public.list_waiting_placements(
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
    placement.status,
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
    and placement.status in ('UNASSIGNED', 'MATCHING')
    and (
      coalesce(p_filter, 'ALL') = 'ALL'
      or (p_filter = 'UNASSIGNED' and placement.status = 'UNASSIGNED')
      or (p_filter = 'MATCHING' and placement.status = 'MATCHING')
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

create or replace function public.count_waiting_placements(
  p_branch uuid,
  p_filter text default 'ALL',
  p_search text default null
) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer
  from public.list_waiting_placements(p_branch, p_filter, p_search, null, 0)
$$;

create or replace function public.list_future_start_placements(
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
    'SCHEDULED_FUTURE'::text,
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
    and placement.status = 'SCHEDULED'
    and placement.scheduled_start_date > public.registration_vietnam_today()
    and (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or student.full_name ilike '%' || replace(btrim(p_search), '%', '') || '%'
      or student.student_code ilike '%' || replace(btrim(p_search), '%', '') || '%'
    )
  order by placement.scheduled_start_date, student.full_name
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.count_future_start_placements(
  p_branch uuid,
  p_search text default null
) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer
  from public.list_future_start_placements(p_branch, 'ALL', p_search, null, 0)
$$;

create or replace function public.waiting_placement_summary(p_branch uuid)
returns table (
  waiting_count integer,
  unassigned_count integer,
  matching_count integer,
  scheduled_count integer,
  average_wait numeric,
  over_3 integer,
  over_7 integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  with visible as (
    select
      public.registration_vietnam_today() - placement.opened_at::date as days,
      placement.status,
      placement.scheduled_start_date
    from public.student_placement_cases placement
    where public.registration_can('student_placement.view', placement.branch_id)
      and (p_branch is null or placement.branch_id = p_branch)
      and (
        placement.status in ('UNASSIGNED', 'MATCHING')
        or (
          placement.status = 'SCHEDULED'
          and placement.scheduled_start_date > public.registration_vietnam_today()
        )
      )
  ),
  waiting as (
    select * from visible where status in ('UNASSIGNED', 'MATCHING')
  )
  select
    (select count(*)::integer from waiting),
    (select count(*)::integer from waiting where status = 'UNASSIGNED'),
    (select count(*)::integer from waiting where status = 'MATCHING'),
    (select count(*)::integer from visible where status = 'SCHEDULED'),
    (select coalesce(round(avg(days), 1), 0) from waiting),
    (select count(*)::integer from waiting where days > 3),
    (select count(*)::integer from waiting where days > 7)
$$;

revoke all on function
  public.list_paused_student_enrollments(uuid, text, integer, integer, uuid, uuid),
  public.count_paused_student_enrollments(uuid, text, uuid, uuid),
  public.count_waiting_placements(uuid, text, text),
  public.list_future_start_placements(uuid, text, text, integer, integer),
  public.count_future_start_placements(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.list_paused_student_enrollments(uuid, text, integer, integer, uuid, uuid),
  public.count_paused_student_enrollments(uuid, text, uuid, uuid),
  public.count_waiting_placements(uuid, text, text),
  public.list_future_start_placements(uuid, text, text, integer, integer),
  public.count_future_start_placements(uuid, text)
to authenticated;
