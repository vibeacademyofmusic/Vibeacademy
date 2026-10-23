-- A student who already belongs to a teaching shift is no longer waiting to be placed.
-- The queue, its counts, and the summary all use the same exclusion.

create or replace function public.list_waiting_placements_by_curriculum(
  p_curriculum uuid,
  p_branch uuid,
  p_filter text,
  p_search text,
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  placement_id uuid,
  placement_version integer,
  student_id uuid,
  student_name text,
  parent_name text,
  branch_id uuid,
  branch_name text,
  program_name text,
  level_name text,
  desired_start date,
  preferred_schedule text,
  placement_status text,
  class_name text,
  teacher_name text,
  scheduled_start date,
  owner_name text,
  completed_on date,
  days_waiting integer,
  opened_on date,
  enrollment_id uuid,
  class_id uuid,
  course_id uuid
)
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(curriculum.name, program.name, app.program_interest),
    coalesce(
      public.student_program_level_name(student.id, coalesce(app.curriculum_id, program.curriculum_id)),
      registration_level.name,
      course_level.name
    ),
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
    and not exists (
      select 1
      from public.enrollments open_enrollment
      join public.classes open_shift on open_shift.id = open_enrollment.class_id
      where open_enrollment.student_id = placement.student_id
        and open_enrollment.status in ('ACTIVE', 'PAUSED')
        and open_shift.status = 'ACTIVE'
    )
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
  order by
    case
      when placement.desired_start_date is not null
        and placement.desired_start_date < public.registration_vietnam_today() then 0
      else 1
    end,
    placement.opened_at,
    student.full_name
  limit case when p_limit is null then null else least(greatest(p_limit, 0), 100) end
  offset greatest(coalesce(p_offset, 0), 0)
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
    and not exists (
      select 1
      from public.enrollments open_enrollment
      join public.classes open_shift on open_shift.id = open_enrollment.class_id
      where open_enrollment.student_id = placement.student_id
        and open_enrollment.status in ('ACTIVE', 'PAUSED')
        and open_shift.status = 'ACTIVE'
    )
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
      and not exists (
        select 1
        from public.enrollments open_enrollment
        join public.classes open_shift on open_shift.id = open_enrollment.class_id
        where open_enrollment.student_id = placement.student_id
          and open_enrollment.status in ('ACTIVE', 'PAUSED')
          and open_shift.status = 'ACTIVE'
      )
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

-- Direct enrollment, outside the placement screen, closes the matching waiting case.
create or replace function public.close_waiting_placement_on_enrollment()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  shift_branch uuid;
  shift_program uuid;
begin
  if new.status not in ('ACTIVE', 'PAUSED') then
    return new;
  end if;
  if current_setting('registration.write', true) = 'on' then
    return new;
  end if;
  select branch_id, public.shift_program_id(id)
    into shift_branch, shift_program
  from public.classes
  where id = new.class_id and status = 'ACTIVE';
  if shift_branch is null then
    return new;
  end if;
  perform set_config('registration.write', 'on', true);
  update public.student_placement_cases placement
  set status = 'SCHEDULED',
      enrollment_id = new.id,
      assigned_class_id = new.class_id,
      scheduled_start_date = coalesce(placement.scheduled_start_date, new.started_at, public.registration_vietnam_today()),
      scheduled_at = coalesce(placement.scheduled_at, clock_timestamp()),
      assigned_teacher_id = coalesce(placement.assigned_teacher_id, (
        select teacher.teacher_id
        from public.class_teachers teacher
        where teacher.class_id = new.class_id
          and teacher.teacher_role = 'PRIMARY'
          and teacher.is_active
        order by teacher.assigned_at desc
        limit 1
      )),
      version = placement.version + 1,
      updated_at = clock_timestamp()
  where placement.student_id = new.student_id
    and placement.status in ('UNASSIGNED', 'MATCHING')
    and placement.enrollment_id is null
    and placement.branch_id = shift_branch
    and public.registration_program_id(placement.registration_application_id) is not distinct from shift_program;
  return new;
end;
$$;

revoke all on function public.close_waiting_placement_on_enrollment() from public, anon, authenticated;

drop trigger if exists close_waiting_placement_on_enrollment on public.enrollments;
create trigger close_waiting_placement_on_enrollment
after insert or update of status on public.enrollments
for each row
execute function public.close_waiting_placement_on_enrollment();

-- Existing waiting rows that already have the matching shift become scheduled.
do $$
begin
  perform set_config('registration.write', 'on', true);
  update public.student_placement_cases placement
  set status = 'SCHEDULED',
      enrollment_id = chosen.enrollment_id,
      assigned_class_id = chosen.class_id,
      scheduled_start_date = coalesce(placement.scheduled_start_date, chosen.started_at, public.registration_vietnam_today()),
      scheduled_at = coalesce(placement.scheduled_at, clock_timestamp()),
      assigned_teacher_id = coalesce(placement.assigned_teacher_id, chosen.teacher_id),
      version = placement.version + 1,
      updated_at = clock_timestamp()
  from (
    select distinct on (waiting.id)
      waiting.id as placement_id,
      enrollment.id as enrollment_id,
      enrollment.class_id,
      enrollment.started_at,
      (
        select teacher.teacher_id
        from public.class_teachers teacher
        where teacher.class_id = enrollment.class_id
          and teacher.teacher_role = 'PRIMARY'
          and teacher.is_active
        order by teacher.assigned_at desc
        limit 1
      ) as teacher_id
    from public.student_placement_cases waiting
    join public.enrollments enrollment
      on enrollment.student_id = waiting.student_id
     and enrollment.status in ('ACTIVE', 'PAUSED')
    join public.classes shift
      on shift.id = enrollment.class_id
     and shift.status = 'ACTIVE'
     and shift.branch_id = waiting.branch_id
     and public.shift_program_id(shift.id) is not distinct from public.registration_program_id(waiting.registration_application_id)
    where waiting.status in ('UNASSIGNED', 'MATCHING')
      and waiting.enrollment_id is null
    order by waiting.id, enrollment.started_at desc nulls last
  ) chosen
  where placement.id = chosen.placement_id;
end $$;
