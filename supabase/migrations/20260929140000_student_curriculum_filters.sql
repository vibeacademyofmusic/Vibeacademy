-- Local student curriculum filters. Existing RPCs remain unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_current_student_enrollments_by_curriculum(p_curriculum uuid, p_branch uuid, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text, course_name text, level_name text, class_name text, teacher_name text, schedule_label text, started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid, student_status text, enrollment_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and (p_curriculum is null or course.curriculum_id = p_curriculum)
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
$function$;

REVOKE ALL ON FUNCTION public.list_current_student_enrollments_by_curriculum(uuid, uuid, text, integer, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_current_student_enrollments_by_curriculum(uuid, uuid, text, integer, integer, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_future_start_placements_by_curriculum(p_curriculum uuid, p_branch uuid, p_filter text, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
 RETURNS TABLE(placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text, branch_id uuid, branch_name text, program_name text, level_name text, desired_start date, preferred_schedule text, placement_status text, class_name text, teacher_name text, scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date, enrollment_id uuid, class_id uuid, course_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and (p_curriculum is null or coalesce(app.curriculum_id, program.curriculum_id) = p_curriculum)
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
$function$;

REVOKE ALL ON FUNCTION public.list_future_start_placements_by_curriculum(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_future_start_placements_by_curriculum(uuid, uuid, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_paused_student_enrollments_by_curriculum(p_curriculum uuid, p_branch uuid, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text, course_name text, level_name text, class_name text, teacher_name text, schedule_label text, started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid, student_status text, enrollment_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    and (p_curriculum is null or course.curriculum_id = p_curriculum)
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
$function$;

REVOKE ALL ON FUNCTION public.list_paused_student_enrollments_by_curriculum(uuid, uuid, text, integer, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_paused_student_enrollments_by_curriculum(uuid, uuid, text, integer, integer, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_waiting_placements_by_curriculum(p_curriculum uuid, p_branch uuid, p_filter text, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
 RETURNS TABLE(placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text, branch_id uuid, branch_name text, program_name text, level_name text, desired_start date, preferred_schedule text, placement_status text, class_name text, teacher_name text, scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date, enrollment_id uuid, class_id uuid, course_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(curriculum.name, program.name, app.program_interest),
    coalesce(registration_level.name, course_level.name),
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
  left join public.curriculums curriculum on curriculum.id = coalesce(app.curriculum_id, program.curriculum_id)
  left join public.curriculum_levels registration_level on registration_level.id = app.level_id
  left join public.curriculum_levels course_level on course_level.id = program.level_id
  where public.registration_can('student_placement.view', placement.branch_id)
    and (p_curriculum is null or coalesce(app.curriculum_id, program.curriculum_id) = p_curriculum)
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
$function$;

REVOKE ALL ON FUNCTION public.list_waiting_placements_by_curriculum(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_waiting_placements_by_curriculum(uuid, uuid, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_current_student_enrollments_by_curriculum(p_curriculum uuid, p_branch uuid, p_search text DEFAULT NULL::text, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.list_current_student_enrollments_by_curriculum(p_curriculum, p_branch, p_search, null, 0, p_class, p_teacher)
$function$;

REVOKE ALL ON FUNCTION public.count_current_student_enrollments_by_curriculum(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_current_student_enrollments_by_curriculum(uuid, uuid, text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_future_start_placements_by_curriculum(p_curriculum uuid, p_branch uuid, p_search text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.list_future_start_placements_by_curriculum(p_curriculum, p_branch, 'ALL', p_search, null, 0)
$function$;

REVOKE ALL ON FUNCTION public.count_future_start_placements_by_curriculum(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_future_start_placements_by_curriculum(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_paused_student_enrollments_by_curriculum(p_curriculum uuid, p_branch uuid, p_search text DEFAULT NULL::text, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.list_paused_student_enrollments_by_curriculum(p_curriculum, p_branch, p_search, null, 0, p_class, p_teacher)
$function$;

REVOKE ALL ON FUNCTION public.count_paused_student_enrollments_by_curriculum(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_paused_student_enrollments_by_curriculum(uuid, uuid, text, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_waiting_placements_by_curriculum(p_curriculum uuid, p_branch uuid, p_filter text DEFAULT 'ALL'::text, p_search text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer
  from public.list_waiting_placements_by_curriculum(p_curriculum, p_branch, p_filter, p_search, null, 0)
$function$;

REVOKE ALL ON FUNCTION public.count_waiting_placements_by_curriculum(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_waiting_placements_by_curriculum(uuid, uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
