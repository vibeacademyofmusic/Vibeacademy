-- Student Operations UX: enrich learning report list columns for ops filters/display.
-- Does not change report engine, approval rules, or RLS. Local only until staging.

drop view if exists public.learning_report_list;

create view public.learning_report_list with (security_invoker = true) as
select
  r.id,
  r.student_id,
  r.enrollment_id,
  r.branch_id,
  r.report_type,
  r.status,
  r.period_start,
  r.period_end,
  r.generated_at,
  r.approved_at,
  coalesce(r.snapshot_data, r.draft_data) -> 'student' ->> 'name' as student_name,
  coalesce(r.snapshot_data, r.draft_data) -> 'student' ->> 'code' as student_code,
  coalesce(r.snapshot_data, r.draft_data) -> 'branch' ->> 'name' as branch_name,
  e.class_id,
  coalesce(
    coalesce(r.snapshot_data, r.draft_data) ->> 'class_name',
    class_row.name
  ) as class_name,
  coalesce(r.snapshot_data, r.draft_data) -> 'academic' ->> 'current_grade' as current_grade,
  coalesce(r.snapshot_data, r.draft_data) -> 'academic' ->> 'status' as academic_status,
  coalesce(r.snapshot_data, r.draft_data) -> 'academic' ->> 'curriculum' as curriculum_name,
  (
    select string_agg(coalesce(teacher ->> 'name', teacher ->> 'code'), ', ' order by teacher ->> 'role', teacher ->> 'code')
    from jsonb_array_elements(coalesce(coalesce(r.snapshot_data, r.draft_data) -> 'teachers', '[]'::jsonb)) as teacher
  ) as teacher_names
from public.learning_reports r
left join public.enrollments e on e.id = r.enrollment_id
left join public.classes class_row on class_row.id = e.class_id;

grant select on public.learning_report_list to authenticated;

create index if not exists learning_reports_status_period_idx
  on public.learning_reports (status, period_end desc, id);

create index if not exists learning_reports_type_status_idx
  on public.learning_reports (report_type, status, period_start desc, id);

create index if not exists lesson_feedback_enrollment_idx
  on public.lesson_feedback (enrollment_id, session_starts_at desc, id);

-- Optional class/teacher filters for current-student ops list. Preserves prior 4-arg callers via defaults.
drop function if exists public.list_current_student_enrollments(uuid, text, integer, integer);

create function public.list_current_student_enrollments(
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
      limit 1),
    (select string_agg(schedule.day_of_week::text || ' ' || to_char(schedule.start_time, 'HH24:MI'), ', ' order by schedule.day_of_week, schedule.start_time)
      from public.schedules schedule where schedule.class_id = class_row.id and schedule.status = 'ACTIVE'),
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
  where enrollment.status = 'ACTIVE'
    and class_row.status = 'ACTIVE'
    and enrollment.started_at is not null
    and enrollment.started_at <= public.registration_vietnam_today()
    and (enrollment.ended_at is null or enrollment.ended_at >= public.registration_vietnam_today())
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

create function public.count_current_student_enrollments(
  p_branch uuid,
  p_search text default null,
  p_class uuid default null,
  p_teacher uuid default null
)
returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer
  from public.enrollments enrollment
  join public.students student on student.id = enrollment.student_id
  join public.classes class_row on class_row.id = enrollment.class_id
  where enrollment.status = 'ACTIVE'
    and class_row.status = 'ACTIVE'
    and enrollment.started_at is not null
    and enrollment.started_at <= public.registration_vietnam_today()
    and (enrollment.ended_at is null or enrollment.ended_at >= public.registration_vietnam_today())
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
$$;

revoke all on function
  public.list_current_student_enrollments(uuid, text, integer, integer, uuid, uuid),
  public.count_current_student_enrollments(uuid, text, uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.list_current_student_enrollments(uuid, text, integer, integer, uuid, uuid),
  public.count_current_student_enrollments(uuid, text, uuid, uuid)
to authenticated;
