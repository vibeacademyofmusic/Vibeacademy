-- A teaching shift can point at a canonical program without a legacy course.
-- Existing course links stay in place. A primary teacher may cover two
-- overlapping shifts; a third overlapping shift is still rejected.

alter table public.classes
  add column if not exists curriculum_id uuid references public.curriculums(id);

update public.classes class_row
set curriculum_id = course.curriculum_id
from public.courses course
where course.id = class_row.course_id
  and class_row.curriculum_id is null
  and course.curriculum_id is not null;

alter table public.classes alter column course_id drop not null;

alter table public.classes drop constraint if exists classes_program_present;
alter table public.classes
  add constraint classes_program_present
  check (course_id is not null or curriculum_id is not null);

create index if not exists classes_curriculum_id_idx on public.classes(curriculum_id);

create or replace function public.shift_program_id(p_class uuid)
returns uuid
language sql
stable
set search_path to public, pg_temp
as $$
  select coalesce(class_row.curriculum_id, course.curriculum_id)
  from public.classes class_row
  left join public.courses course on course.id = class_row.course_id
  where class_row.id = p_class
$$;

create or replace function public.registration_program_id(p_application uuid)
returns uuid
language sql
stable
set search_path to public, pg_temp
as $$
  select coalesce(app.curriculum_id, course.curriculum_id)
  from public.registration_applications app
  left join public.courses course on course.id = app.course_id
  where app.id = p_application
$$;

create or replace function public.student_program_level_name(p_student uuid, p_curriculum uuid)
returns text
language sql
stable
set search_path to public, pg_temp
as $$
  select level.name
  from public.student_curriculum_enrollments sce
  join public.curriculum_levels level on level.id = sce.current_level_id
  where sce.student_id = p_student
    and sce.curriculum_id = p_curriculum
    and sce.status = 'ACTIVE'
  order by sce.is_primary desc nulls last, sce.started_at desc nulls last, sce.id
  limit 1
$$;

create or replace function public.validate_class_level_scope(
  p_course_id uuid,
  p_from uuid,
  p_to uuid,
  p_curriculum_id uuid default null
)
returns void
language plpgsql
stable
set search_path to public, pg_temp
as $$
declare
  v_curriculum uuid;
  v_from_curriculum uuid;
  v_to_curriculum uuid;
  v_from_seq integer;
  v_to_seq integer;
begin
  if p_from is null and p_to is null then
    return;
  end if;

  if p_from is null or p_to is null then
    raise exception 'Class level scope requires both from and to Levels, or both null'
      using errcode = 'P0001';
  end if;

  if p_curriculum_id is not null then
    v_curriculum := p_curriculum_id;
  else
    select curriculum_id into v_curriculum
    from public.courses
    where id = p_course_id;
  end if;

  if v_curriculum is null then
    raise exception 'Phạm vi trình độ cần một chương trình của ca dạy'
      using errcode = 'P0001';
  end if;

  select curriculum_id, sequence_no into v_from_curriculum, v_from_seq
  from public.curriculum_levels
  where id = p_from;

  if not found then
    raise exception 'From Level not found'
      using errcode = 'P0001';
  end if;

  select curriculum_id, sequence_no into v_to_curriculum, v_to_seq
  from public.curriculum_levels
  where id = p_to;

  if not found then
    raise exception 'To Level not found'
      using errcode = 'P0001';
  end if;

  if v_from_curriculum is distinct from v_curriculum
     or v_to_curriculum is distinct from v_curriculum then
    raise exception 'Phạm vi trình độ phải thuộc chương trình của ca dạy'
      using errcode = 'P0001';
  end if;

  if v_from_seq > v_to_seq then
    raise exception 'Class level scope from sequence cannot exceed to sequence'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.guard_class_level_scope()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
begin
  if new.course_id is null and not exists (
    select 1
    from public.curriculums program
    where program.id = new.curriculum_id
      and public.curriculum_is_operational(program.code, program.status)
  ) then
    raise exception 'Ca dạy phải chọn chương trình Piano, Guitar, Violin hoặc Trống'
      using errcode = 'P0001';
  end if;

  perform public.validate_class_level_scope(
    new.course_id,
    new.accepted_from_level_id,
    new.accepted_to_level_id,
    new.curriculum_id
  );
  return new;
end;
$$;

drop trigger if exists trg_guard_class_level_scope on public.classes;
create trigger trg_guard_class_level_scope
before insert or update of course_id, curriculum_id, accepted_from_level_id, accepted_to_level_id
on public.classes
for each row execute function public.guard_class_level_scope();

create or replace function public.set_class_level_scope(p_class uuid, p_from uuid, p_to uuid)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_course uuid;
  v_curriculum uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'Unauthorized' using errcode = 'P0001';
  end if;

  select course_id, curriculum_id into v_course, v_curriculum
  from public.classes
  where id = p_class;
  if not found then
    raise exception 'Class not found' using errcode = 'P0001';
  end if;

  perform public.validate_class_level_scope(v_course, p_from, p_to, coalesce(v_curriculum, public.shift_program_id(p_class)));

  update public.classes
  set accepted_from_level_id = p_from,
      accepted_to_level_id = p_to,
      updated_at = now()
  where id = p_class;

  return p_class;
end;
$$;

drop function if exists public.validate_class_level_scope(uuid, uuid, uuid);

create or replace function public.class_student_current_level(p_class uuid, p_student uuid)
returns table(student_curriculum_enrollment_id uuid, current_level_id uuid, level_name text, sequence_no integer, curriculum_id uuid)
language sql
stable
set search_path to public, pg_temp
as $$
  select
    sce.id,
    sce.current_level_id,
    level_row.name,
    level_row.sequence_no,
    coalesce(class_row.curriculum_id, course.curriculum_id)
  from public.classes class_row
  left join public.courses course on course.id = class_row.course_id
  join public.student_curriculum_enrollments sce
    on sce.student_id = p_student
   and sce.curriculum_id = coalesce(class_row.curriculum_id, course.curriculum_id)
   and sce.status = 'ACTIVE'
  left join public.curriculum_levels level_row
    on level_row.id = sce.current_level_id
  where class_row.id = p_class
  order by sce.is_primary desc nulls last, sce.started_at desc nulls last, sce.id
  limit 1;
$$;

create or replace function public.class_enrollment_compatibility(p_class uuid, p_student uuid)
returns text
language plpgsql
stable
set search_path to public, pg_temp
as $$
declare
  v_from uuid;
  v_to uuid;
  v_curriculum uuid;
  v_prog record;
  v_from_seq integer;
  v_to_seq integer;
begin
  select class_row.accepted_from_level_id, class_row.accepted_to_level_id,
         coalesce(class_row.curriculum_id, course.curriculum_id)
  into v_from, v_to, v_curriculum
  from public.classes class_row
  left join public.courses course on course.id = class_row.course_id
  where class_row.id = p_class;

  if not found or v_curriculum is null then
    raise exception 'Class not found' using errcode = 'P0001';
  end if;

  if v_from is null or v_to is null then
    return 'CLASS_SCOPE_UNCONFIGURED';
  end if;

  select * into v_prog
  from public.class_student_current_level(p_class, p_student);

  if not found then
    if exists (
      select 1 from public.student_curriculum_enrollments sce
      where sce.student_id = p_student and sce.status = 'ACTIVE'
    ) then
      return 'WRONG_PROGRAM';
    end if;
    return 'ACADEMIC_PROGRAM_MISSING';
  end if;

  if v_prog.current_level_id is null then
    return 'CURRENT_LEVEL_MISSING';
  end if;

  if v_prog.curriculum_id is distinct from v_curriculum then
    return 'WRONG_PROGRAM';
  end if;

  select sequence_no into v_from_seq from public.curriculum_levels where id = v_from;
  select sequence_no into v_to_seq from public.curriculum_levels where id = v_to;

  if v_prog.sequence_no is null then
    return 'CURRENT_LEVEL_MISSING';
  end if;

  if v_prog.sequence_no < v_from_seq or v_prog.sequence_no > v_to_seq then
    return 'OUTSIDE_SCOPE';
  end if;

  return 'IN_SCOPE';
end;
$$;

create or replace function public.placement_compatible_classes(p_cases uuid[])
returns table(placement_id uuid, class_id uuid)
language plpgsql
stable security definer
set search_path to public, pg_temp
as $$
begin
  if auth.uid() is null or cardinality(p_cases) > 100 then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  return query
  select p.id, c.id
  from public.student_placement_cases p
  join public.registration_applications a on a.id = p.registration_application_id
  join public.classes c on c.branch_id = p.branch_id and c.status = 'ACTIVE'
  left join public.courses course on course.id = c.course_id
  where p.id = any(p_cases)
    and public.registration_can('student_placement.view', p.branch_id)
    and public.shift_program_id(c.id) = public.registration_program_id(a.id)
    and public.class_enrollment_compatibility(c.id, p.student_id) = 'IN_SCOPE'
    and (c.start_date is null or coalesce(p.scheduled_start_date, p.desired_start_date, c.start_date) >= c.start_date)
    and (c.end_date is null or c.end_date >= greatest(public.registration_vietnam_today(), p.scheduled_start_date, p.desired_start_date));
end;
$$;

create or replace function public.list_placement_class_options(p_branch uuid)
returns table(id uuid, name text, branch_id uuid, open_seats integer, code text, branch_name text, course_id uuid, curriculum_name text, level_label text, teacher_name text, room_name text, schedule_label text, duration_minutes integer, enrolled_count integer, capacity integer, status text)
language sql
stable security definer
set search_path to public, pg_temp
as $$
  select class_row.id,
    class_row.name,
    class_row.branch_id,
    class_row.capacity - coalesce(occupancy.n, 0),
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
      select min(coalesce(profile.full_name, teacher.full_name))
      from public.class_teachers ct
      join public.teachers teacher on teacher.id = ct.teacher_id
      left join public.profiles profile on profile.id = teacher.user_id
      where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY' and (ct.is_active or ct.ended_at is not null)
        and ct.assigned_at <= public.registration_vietnam_today()
        and (ct.ended_at is null or ct.ended_at >= public.registration_vietnam_today())
      having count(*) = 1
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
    coalesce(occupancy.n, 0),
    class_row.capacity,
    class_row.status
  from public.classes class_row
  left join (
    select enrollment.class_id, count(*)::integer n
    from public.enrollments enrollment
    join public.classes c on c.id = enrollment.class_id
    where enrollment.status in ('ACTIVE', 'PAUSED')
      and (p_branch is null or c.branch_id = p_branch)
    group by enrollment.class_id
  ) occupancy on occupancy.class_id = class_row.id
  join public.branches branch on branch.id = class_row.branch_id
  left join public.courses course on course.id = class_row.course_id
  join public.curriculums curriculum on curriculum.id = coalesce(class_row.curriculum_id, course.curriculum_id)
  left join public.curriculum_levels from_level on from_level.id = class_row.accepted_from_level_id
  left join public.curriculum_levels to_level on to_level.id = class_row.accepted_to_level_id
  where class_row.status = 'ACTIVE'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
    and coalesce(occupancy.n, 0) < class_row.capacity
  order by class_row.name, class_row.id
$$;

create or replace function public.primary_recurring_overlap_blocked(
  p_class uuid,
  p_teacher uuid,
  p_day smallint,
  p_start time,
  p_end time,
  p_from date,
  p_to date
) returns boolean
language sql
stable
set search_path to public, pg_temp
as $$
  with others as (
    select s.class_id, s.start_time, s.end_time, s.effective_from, s.effective_to
    from public.class_teachers ct
    join public.schedules s on s.class_id = ct.class_id and s.status = 'ACTIVE'
    join public.classes c on c.id = s.class_id and c.status not in ('CANCELLED', 'COMPLETED')
    where ct.teacher_id = p_teacher
      and ct.teacher_role = 'PRIMARY'
      and ct.is_active
      and ct.class_id <> p_class
      and s.day_of_week = p_day
      and s.start_time < p_end
      and p_start < s.end_time
      and daterange(s.effective_from, coalesce(s.effective_to, 'infinity'::date), '[]')
          && daterange(p_from, coalesce(p_to, 'infinity'::date), '[]')
  )
  select exists (
    select 1
    from others a
    join others b on a.class_id < b.class_id
      and a.start_time < b.end_time
      and b.start_time < a.end_time
      and daterange(a.effective_from, coalesce(a.effective_to, 'infinity'::date), '[]')
          && daterange(b.effective_from, coalesce(b.effective_to, 'infinity'::date), '[]')
  );
$$;

create or replace function public.teacher_occurrence_overlap_blocked(
  p_class uuid,
  p_starts timestamptz,
  p_ends timestamptz,
  p_session_date date,
  p_exclude_occurrence uuid
) returns text
language plpgsql
stable
set search_path to public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.class_teachers current_assignment
    join public.class_teachers other_assignment
      on other_assignment.teacher_id = current_assignment.teacher_id
     and other_assignment.class_id <> current_assignment.class_id
    join public.schedules other_schedule on other_schedule.class_id = other_assignment.class_id
    join public.session_occurrences other_occurrence on other_occurrence.schedule_id = other_schedule.id
    where current_assignment.class_id = p_class
      and current_assignment.teacher_role = 'ASSISTANT'
      and current_assignment.is_active
      and current_assignment.assigned_at <= p_session_date
      and (current_assignment.ended_at is null or current_assignment.ended_at >= p_session_date)
      and other_assignment.is_active
      and other_assignment.assigned_at <= p_session_date
      and (other_assignment.ended_at is null or other_assignment.ended_at >= p_session_date)
      and other_occurrence.id is distinct from p_exclude_occurrence
      and other_occurrence.status <> 'CANCELLED'
      and other_occurrence.starts_at < p_ends
      and other_occurrence.ends_at > p_starts
  ) then
    return 'ASSISTANT_OVERLAP';
  end if;

  if exists (
    with slots as (
      select other_assignment.class_id, other_occurrence.starts_at, other_occurrence.ends_at
      from public.class_teachers current_assignment
      join public.class_teachers other_assignment
        on other_assignment.teacher_id = current_assignment.teacher_id
       and other_assignment.class_id <> current_assignment.class_id
       and other_assignment.teacher_role = 'PRIMARY'
      join public.schedules other_schedule on other_schedule.class_id = other_assignment.class_id
      join public.session_occurrences other_occurrence on other_occurrence.schedule_id = other_schedule.id
      where current_assignment.class_id = p_class
        and current_assignment.teacher_role = 'PRIMARY'
        and current_assignment.is_active
        and current_assignment.assigned_at <= p_session_date
        and (current_assignment.ended_at is null or current_assignment.ended_at >= p_session_date)
        and other_assignment.is_active
        and other_assignment.assigned_at <= p_session_date
        and (other_assignment.ended_at is null or other_assignment.ended_at >= p_session_date)
        and other_occurrence.id is distinct from p_exclude_occurrence
        and other_occurrence.status <> 'CANCELLED'
        and other_occurrence.starts_at < p_ends
        and other_occurrence.ends_at > p_starts
    )
    select 1 from slots a
    join slots b on a.class_id < b.class_id
      and a.starts_at < b.ends_at
      and b.starts_at < a.ends_at
  ) then
    return 'PRIMARY_LIMIT';
  end if;

  return 'CLEAR';
end;
$$;

create or replace function public.guard_schedule_teacher_overlap()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
declare
  teacher uuid;
begin
  if new.status <> 'ACTIVE' then
    return new;
  end if;

  if exists (
    select 1
    from public.class_teachers current_assignment
    join public.class_teachers other_assignment
      on other_assignment.teacher_id = current_assignment.teacher_id
     and other_assignment.class_id <> current_assignment.class_id
     and other_assignment.is_active
    join public.schedules other_schedule
      on other_schedule.class_id = other_assignment.class_id
     and other_schedule.status = 'ACTIVE'
    where current_assignment.class_id = new.class_id
      and current_assignment.is_active
      and current_assignment.teacher_role = 'ASSISTANT'
      and other_schedule.day_of_week = new.day_of_week
      and other_schedule.start_time < new.end_time
      and new.start_time < other_schedule.end_time
      and daterange(other_schedule.effective_from, coalesce(other_schedule.effective_to, 'infinity'::date), '[]')
          && daterange(new.effective_from, coalesce(new.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'A teacher assigned to this class is already teaching another class at that time'
      using errcode = 'P0001';
  end if;

  for teacher in
    select ct.teacher_id
    from public.class_teachers ct
    where ct.class_id = new.class_id
      and ct.is_active
      and ct.teacher_role = 'PRIMARY'
  loop
    if public.primary_recurring_overlap_blocked(
      new.class_id, teacher, new.day_of_week, new.start_time, new.end_time, new.effective_from, new.effective_to
    ) then
      raise exception 'A primary teacher already has two overlapping teaching shifts at that time'
        using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_guard_schedule_teacher_overlap on public.schedules;
create trigger trg_guard_schedule_teacher_overlap
before insert or update of class_id, day_of_week, start_time, end_time, effective_from, effective_to, status
on public.schedules
for each row execute function public.guard_schedule_teacher_overlap();

create or replace function public.guard_class_teacher_shift_overlap()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
declare
  slot record;
begin
  if new.is_active is not true then
    return new;
  end if;

  if new.teacher_role = 'ASSISTANT' and exists (
    select 1
    from public.schedules mine
    join public.class_teachers other_assignment
      on other_assignment.teacher_id = new.teacher_id
     and other_assignment.class_id <> new.class_id
     and other_assignment.is_active
    join public.schedules other_schedule
      on other_schedule.class_id = other_assignment.class_id
     and other_schedule.status = 'ACTIVE'
    where mine.class_id = new.class_id
      and mine.status = 'ACTIVE'
      and other_schedule.day_of_week = mine.day_of_week
      and other_schedule.start_time < mine.end_time
      and mine.start_time < other_schedule.end_time
      and daterange(other_schedule.effective_from, coalesce(other_schedule.effective_to, 'infinity'::date), '[]')
          && daterange(mine.effective_from, coalesce(mine.effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'A teacher assigned to this class is already teaching another class at that time'
      using errcode = 'P0001';
  end if;

  if new.teacher_role = 'PRIMARY' then
    for slot in
      select day_of_week, start_time, end_time, effective_from, effective_to
      from public.schedules
      where class_id = new.class_id and status = 'ACTIVE'
    loop
      if public.primary_recurring_overlap_blocked(
        new.class_id, new.teacher_id, slot.day_of_week, slot.start_time, slot.end_time, slot.effective_from, slot.effective_to
      ) then
        raise exception 'A primary teacher already has two overlapping teaching shifts at that time'
          using errcode = 'P0001';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_class_teacher_shift_overlap on public.class_teachers;
create trigger trg_guard_class_teacher_shift_overlap
before insert or update of class_id, teacher_id, teacher_role, is_active, assigned_at, ended_at
on public.class_teachers
for each row execute function public.guard_class_teacher_shift_overlap();

CREATE OR REPLACE FUNCTION public.list_current_student_enrollments(p_branch uuid, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text, course_name text, level_name text, class_name text, teacher_name text, schedule_label text, started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid, student_status text, enrollment_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select enrollment.id, student.id, student.student_code, student.full_name, branch.name,
    coalesce(shift_program.name, course.name),
    coalesce(
      public.student_program_level_name(student.id, coalesce(class_row.curriculum_id, course.curriculum_id)),
      (select level.name from public.curriculum_levels level where level.id = course.level_id)
    ),
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
  left join public.courses course on course.id = class_row.course_id
  left join public.curriculums shift_program on shift_program.id = coalesce(class_row.curriculum_id, course.curriculum_id)
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
$function$;



CREATE OR REPLACE FUNCTION public.list_current_student_enrollments_by_curriculum(p_curriculum uuid, p_branch uuid, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text, course_name text, level_name text, class_name text, teacher_name text, schedule_label text, started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid, student_status text, enrollment_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select enrollment.id, student.id, student.student_code, student.full_name, branch.name,
    coalesce(shift_program.name, course.name),
    coalesce(
      public.student_program_level_name(student.id, coalesce(class_row.curriculum_id, course.curriculum_id)),
      (select level.name from public.curriculum_levels level where level.id = course.level_id)
    ),
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
  left join public.courses course on course.id = class_row.course_id
  left join public.curriculums shift_program on shift_program.id = coalesce(class_row.curriculum_id, course.curriculum_id)
  where public.enrollment_lifecycle_state(enrollment.id, public.registration_vietnam_today()) = 'ACTIVE'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_curriculum is null or coalesce(class_row.curriculum_id, course.curriculum_id) = p_curriculum)
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



CREATE OR REPLACE FUNCTION public.list_paused_student_enrollments(p_branch uuid, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text, course_name text, level_name text, class_name text, teacher_name text, schedule_label text, started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid, student_status text, enrollment_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select enrollment.id, student.id, student.student_code, student.full_name, branch.name,
    coalesce(shift_program.name, course.name),
    coalesce(
      public.student_program_level_name(student.id, coalesce(class_row.curriculum_id, course.curriculum_id)),
      (select level.name from public.curriculum_levels level where level.id = course.level_id)
    ),
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
  left join public.courses course on course.id = class_row.course_id
  left join public.curriculums shift_program on shift_program.id = coalesce(class_row.curriculum_id, course.curriculum_id)
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
$function$;



CREATE OR REPLACE FUNCTION public.list_paused_student_enrollments_by_curriculum(p_curriculum uuid, p_branch uuid, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0, p_class uuid DEFAULT NULL::uuid, p_teacher uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrollment_id uuid, student_id uuid, student_code text, student_name text, branch_name text, course_name text, level_name text, class_name text, teacher_name text, schedule_label text, started_on date, package_name text, attendance_marked integer, class_id uuid, branch_id uuid, student_status text, enrollment_status text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select enrollment.id, student.id, student.student_code, student.full_name, branch.name,
    coalesce(shift_program.name, course.name),
    coalesce(
      public.student_program_level_name(student.id, coalesce(class_row.curriculum_id, course.curriculum_id)),
      (select level.name from public.curriculum_levels level where level.id = course.level_id)
    ),
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
  left join public.courses course on course.id = class_row.course_id
  left join public.curriculums shift_program on shift_program.id = coalesce(class_row.curriculum_id, course.curriculum_id)
  where public.enrollment_lifecycle_state(enrollment.id, public.registration_vietnam_today()) = 'PAUSED'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_curriculum is null or coalesce(class_row.curriculum_id, course.curriculum_id) = p_curriculum)
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



CREATE OR REPLACE FUNCTION public.list_future_start_placements(p_branch uuid, p_filter text, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
 RETURNS TABLE(placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text, branch_id uuid, branch_name text, program_name text, level_name text, desired_start date, preferred_schedule text, placement_status text, class_name text, teacher_name text, scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date, enrollment_id uuid, class_id uuid, course_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(shift_program.name, program.name, app.program_interest),
    coalesce(
      public.student_program_level_name(student.id, coalesce(app.curriculum_id, class_row.curriculum_id, program.curriculum_id)),
      (select level.name from public.curriculum_levels level where level.id = coalesce(app.level_id, program.level_id))
    ),
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
  left join public.curriculums shift_program on shift_program.id = coalesce(app.curriculum_id, class_row.curriculum_id, program.curriculum_id)
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
$function$;



CREATE OR REPLACE FUNCTION public.list_future_start_placements_by_curriculum(p_curriculum uuid, p_branch uuid, p_filter text, p_search text, p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
 RETURNS TABLE(placement_id uuid, placement_version integer, student_id uuid, student_name text, parent_name text, branch_id uuid, branch_name text, program_name text, level_name text, desired_start date, preferred_schedule text, placement_status text, class_name text, teacher_name text, scheduled_start date, owner_name text, completed_on date, days_waiting integer, opened_on date, enrollment_id uuid, class_id uuid, course_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select placement.id, placement.version, student.id, student.full_name, app.parent_name,
    placement.branch_id, branch.name,
    coalesce(shift_program.name, program.name, app.program_interest),
    coalesce(
      public.student_program_level_name(student.id, coalesce(app.curriculum_id, class_row.curriculum_id, program.curriculum_id)),
      (select level.name from public.curriculum_levels level where level.id = coalesce(app.level_id, program.level_id))
    ),
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
  left join public.curriculums shift_program on shift_program.id = coalesce(app.curriculum_id, class_row.curriculum_id, program.curriculum_id)
  where public.registration_can('student_placement.view', placement.branch_id)
    and (p_curriculum is null or coalesce(app.curriculum_id, class_row.curriculum_id, program.curriculum_id) = p_curriculum)
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



CREATE OR REPLACE FUNCTION public.assign_student_placement(p_request uuid, p_placement uuid, p_version integer, p_class uuid, p_start date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor uuid := auth.uid();
  row public.student_placement_cases%rowtype;
  class_row public.classes%rowtype;
  app public.registration_applications%rowtype;
  occupied integer;
  v_enrollment uuid;
  teacher_id uuid;
  scope_code text;
begin
  if actor is null or p_request is null or p_class is null or p_start is null then raise exception 'PLACEMENT_INVALID'; end if;
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then
    if exists(select 1 from public.student_placement_events where id = p_request and placement_id = p_placement
      and actor_id = actor and event_type = 'CLASS_ASSIGNED' and metadata->>'class_id' = p_class::text
      and metadata->>'start' = p_start::text) then return p_placement; end if;
    raise exception 'PLACEMENT_REQUEST_REUSED';
  end if;
  if row.version is distinct from p_version then raise exception 'PLACEMENT_STALE'; end if;
  if row.status not in ('UNASSIGNED', 'MATCHING') or row.enrollment_id is not null then raise exception 'PLACEMENT_TRANSITION_DENIED'; end if;
  select * into class_row from public.classes where id = p_class for update;
  if not found or class_row.branch_id <> row.branch_id or class_row.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  select * into app from public.registration_applications where id = row.registration_application_id;
  if public.registration_program_id(app.id) is distinct from public.shift_program_id(class_row.id) then
    raise exception 'PLACEMENT_PROGRAM_DENIED';
  end if;
  scope_code := public.class_enrollment_compatibility(class_row.id, row.student_id);
  if scope_code is distinct from 'IN_SCOPE' then raise exception 'PLACEMENT_LEVEL_DENIED'; end if;
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
  select (array_agg(ct.teacher_id))[1] into teacher_id
  from public.class_teachers ct
  where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY'
    and (ct.is_active or ct.ended_at is not null)
    and ct.assigned_at <= p_start and (ct.ended_at is null or ct.ended_at >= p_start)
  having count(*) = 1;
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
end;
$function$;



CREATE OR REPLACE FUNCTION public.change_future_student_placement(p_request uuid, p_placement uuid, p_version integer, p_enrollment uuid, p_class uuid, p_start date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  reason := public.placement_reason(p_reason);
  select * into row from public.student_placement_cases where id = p_placement for update;
  if not found or not public.registration_can('student_placement.manage', row.branch_id) then
    raise exception 'PLACEMENT_UNAUTHORIZED';
  end if;
  if row.enrollment_id is distinct from p_enrollment then raise exception 'PLACEMENT_UNAUTHORIZED'; end if;
  if exists(select 1 from public.student_placement_events where id = p_request) then
    if exists(select 1 from public.student_placement_events where id = p_request and placement_id=p_placement
      and actor_id=actor and event_type='PLACEMENT_CHANGED' and metadata->>'new_class_id'=p_class::text
      and metadata->>'new_start'=p_start::text) then return p_placement; end if;
    raise exception 'PLACEMENT_REQUEST_REUSED';
  end if;
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
  if not found or class_row.branch_id <> row.branch_id or class_row.status <> 'ACTIVE' then
    raise exception 'PLACEMENT_CLASS_DENIED';
  end if;
  if public.registration_program_id(row.registration_application_id) is distinct from public.shift_program_id(class_row.id) then
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
  select (array_agg(ct.teacher_id))[1] into teacher_id
  from public.class_teachers ct
  where ct.class_id = class_row.id and ct.teacher_role = 'PRIMARY'
    and (ct.is_active or ct.ended_at is not null)
    and ct.assigned_at <= p_start and (ct.ended_at is null or ct.ended_at >= p_start)
  having count(*)=1;
  if teacher_id is null then raise exception 'PLACEMENT_TEACHER_REQUIRED'; end if;
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
end $function$;



CREATE OR REPLACE FUNCTION public.placement_schedule_check(p_class uuid, p_student uuid, p_start date, p_end date DEFAULT NULL::date, p_exclude uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare horizon date; first_day date:=greatest(p_start,registration_vietnam_today()); result text;
begin
 if p_end is not null and p_end < registration_vietnam_today() then
   return 'CLEAR';
 end if;
 select greatest(first_day,
   (select max(start_date) from classes), (select max(end_date) from classes),
   (select max(effective_from) from schedules), (select max(effective_to) from schedules),
   (select max(assigned_at) from class_teachers), (select max(ended_at) from class_teachers),
   (select max((ends_at at time zone 'Asia/Ho_Chi_Minh')::date) from session_occurrences),
   (select max(started_at) from enrollments), (select max(ended_at) from enrollments),
   (select max(ends_on) from enrollment_pauses)) + 14 into horizon;
 horizon:=least(horizon,coalesce(p_end,horizon));
 if exists(select 1 from schedules s join classes c on c.id=s.class_id
   where s.status='ACTIVE' and s.timezone<>'Asia/Ho_Chi_Minh'
   and (c.branch_id=(select branch_id from classes where id=p_class)
     or exists(select 1 from enrollments e where e.class_id=c.id and e.student_id=p_student and e.status in ('ACTIVE','PAUSED')))) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 if not exists(select 1 from placement_timetable(p_class,first_day,horizon) where not makeup) then
   return 'PLACEMENT_SCHEDULE_REQUIRED';
 end if;
 if exists(select 1 from placement_timetable(p_class,first_day,horizon) where teacher_id is null or room_id is null) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 if exists(select 1 from enrollments e where e.student_id=p_student and e.id is distinct from p_exclude
   and e.class_id<>p_class and e.status in ('ACTIVE','PAUSED') and coalesce(e.ended_at,horizon)>=first_day
   and not exists(select 1 from placement_timetable(e.class_id,greatest(first_day,e.started_at),least(horizon,e.ended_at)))) then
   return 'PLACEMENT_SCHEDULE_UNKNOWN';
 end if;
 with target as materialized (select * from placement_timetable(p_class,first_day,horizon)),
 others as materialized (
   select c.id class_id,t.* from classes c
   cross join lateral placement_timetable(c.id,first_day,horizon) t
   where c.id<>p_class and c.status not in ('CANCELLED','COMPLETED')
 ), overlapping_slots as (
   select a.*,b.class_id other_class,b.session_id other_session,b.makeup other_makeup,
     b.room_id other_room,b.teacher_id other_teacher,b.starts_at other_starts,b.ends_at other_ends
   from target a join others b on a.starts_at<b.ends_at and b.starts_at<a.ends_at
 )
 select case
   when exists(select 1 from overlapping_slots where room_id=other_room) then 'PLACEMENT_ROOM_CONFLICT'
   when exists(
     select 1 from overlapping_slots x
     join overlapping_slots y
       on x.session_id = y.session_id
      and x.starts_at = y.starts_at
      and x.teacher_id = x.other_teacher
      and y.teacher_id = y.other_teacher
      and x.teacher_id = y.teacher_id
      and x.other_class < y.other_class
      and x.other_starts < y.other_ends
      and y.other_starts < x.other_ends
   ) then 'PLACEMENT_TEACHER_CONFLICT'
   when exists(select 1 from overlapping_slots o join enrollments e on e.class_id=o.other_class
     where not o.makeup and e.student_id=p_student and e.id is distinct from p_exclude
       and e.status in ('ACTIVE','PAUSED')
       and (o.starts_at at time zone 'Asia/Ho_Chi_Minh')::date between coalesce(e.started_at,e.enrolled_at) and coalesce(e.ended_at,horizon)
       and not is_enrollment_paused_on(e.id,(o.starts_at at time zone 'Asia/Ho_Chi_Minh')::date)
       and (not o.other_makeup or exists(select 1 from session_occurrence_participants sp where sp.session_occurrence_id=o.other_session and sp.enrollment_id=e.id))) then 'PLACEMENT_STUDENT_CONFLICT'
   when exists(select 1 from target a join session_actual_teachers v on a.starts_at<v.ends_at and v.starts_at<a.ends_at
     join session_occurrence_participants sp on sp.session_occurrence_id=v.session_id
     join enrollments e on e.id=sp.enrollment_id
     where not a.makeup and v.class_id<>p_class and v.status<>'CANCELLED' and e.student_id=p_student) then 'PLACEMENT_STUDENT_CONFLICT'
   when exists(select 1 from overlapping_slots o join classes c on c.id=o.other_class
     where (o.other_room is null or o.other_teacher is null)
     and (c.branch_id=(select branch_id from classes where id=p_class)
       or exists(select 1 from enrollments e where e.class_id=c.id and e.student_id=p_student and e.status in ('ACTIVE','PAUSED')))) then 'PLACEMENT_SCHEDULE_UNKNOWN'
   when exists(select 1 from target a join target b on a.starts_at<b.ends_at and b.starts_at<a.ends_at
     and (a.session_id,a.starts_at)<(b.session_id,b.starts_at)
     where a.room_id=b.room_id or a.teacher_id=b.teacher_id or (not a.makeup and not b.makeup)) then 'PLACEMENT_SCHEDULE_UNKNOWN'
   else 'CLEAR' end into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.reschedule_session_occurrence(p_occurrence_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_room_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_occurrence_status text;
  v_current_starts_at timestamptz;
  v_current_ends_at timestamptz;
  v_current_room_id uuid;
  v_class_id uuid;
  v_branch_id uuid;
  v_timezone text;
  v_session_date date;
  v_room_branch_id uuid;
  v_room_status text;
  v_result uuid;
  v_teacher_block text;
begin
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Session start and end time are required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'Reschedule reason is required';
  end if;

  select
    occurrence.status,
    occurrence.starts_at,
    occurrence.ends_at,
    occurrence.room_id,
    schedule.class_id,
    class.branch_id,
    schedule.timezone
  into
    v_occurrence_status,
    v_current_starts_at,
    v_current_ends_at,
    v_current_room_id,
    v_class_id,
    v_branch_id,
    v_timezone
  from public.session_occurrences as occurrence
  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id
  join public.classes as class
    on class.id = schedule.class_id
  where occurrence.id = p_occurrence_id
  for update of occurrence;

  if v_occurrence_status is null then
    raise exception 'Session not found';
  end if;

  if v_occurrence_status <> 'SCHEDULED' then
    raise exception 'Only scheduled sessions can be rescheduled';
  end if;

  if exists (
    select 1
    from public.attendance_records
    where session_occurrence_id = p_occurrence_id
  ) then
    raise exception 'Session with attendance cannot be rescheduled';
  end if;

  if
    p_starts_at = v_current_starts_at
    and p_ends_at = v_current_ends_at
    and p_room_id is not distinct from v_current_room_id
  then
    raise exception 'Reschedule must change the time or room';
  end if;

  if p_room_id is not null then
    select
      room.branch_id,
      room.status
    into
      v_room_branch_id,
      v_room_status
    from public.rooms as room
    where room.id = p_room_id;

    if v_room_status is distinct from 'ACTIVE' then
      raise exception 'Room is not available';
    end if;

    if v_room_branch_id is distinct from v_branch_id then
      raise exception
        'Room must belong to the same branch as the class';
    end if;
  end if;

  if exists (
    select 1
    from public.session_occurrences as other_occurrence
    join public.schedules as other_schedule
      on other_schedule.id = other_occurrence.schedule_id
    where other_occurrence.id <> p_occurrence_id
      and other_occurrence.status <> 'CANCELLED'
      and other_schedule.class_id = v_class_id
      and other_occurrence.starts_at < p_ends_at
      and other_occurrence.ends_at > p_starts_at
  ) then
    raise exception 'This class already has an overlapping session';
  end if;

  if
    p_room_id is not null
    and exists (
      select 1
      from public.session_occurrences as other_occurrence
      where other_occurrence.id <> p_occurrence_id
        and other_occurrence.status <> 'CANCELLED'
        and other_occurrence.room_id = p_room_id
        and other_occurrence.starts_at < p_ends_at
        and other_occurrence.ends_at > p_starts_at
    )
  then
    raise exception
      'This room is already occupied during that time';
  end if;

  v_session_date :=
    (p_starts_at at time zone v_timezone)::date;

  v_teacher_block := public.teacher_occurrence_overlap_blocked(v_class_id, p_starts_at, p_ends_at, v_session_date, p_occurrence_id);
  if v_teacher_block = 'PRIMARY_LIMIT' then
    raise exception 'A primary teacher already has two overlapping teaching shifts at that time';
  elsif v_teacher_block = 'ASSISTANT_OVERLAP' then
    raise exception 'A teacher assigned to this class is already teaching another class at that time';
  end if;

  update public.session_occurrences
  set
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    room_id = p_room_id,
    rescheduled_at = now(),
    rescheduled_by = auth.uid(),
    reschedule_reason = btrim(p_reason)
  where id = p_occurrence_id
  returning id into v_result;

  return v_result;
end;
$function$;



CREATE OR REPLACE FUNCTION public.create_makeup_session_occurrence(p_source_occurrence_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_room_id uuid, p_enrollment_ids uuid[], p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_source_schedule_id uuid;
  v_source_status text;
  v_source_type text;

  v_class_id uuid;
  v_branch_id uuid;
  v_timezone text;

  v_makeup_date date;

  v_room_branch_id uuid;
  v_room_status text;

  v_participant_count integer;
  v_result uuid;
  v_teacher_block text;
begin

  -- =======================================================
  -- BASIC INPUT VALIDATION
  -- =======================================================

  if p_starts_at is null or p_ends_at is null then
    raise exception
      'Session start and end time are required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception
      'End time must be after start time';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception
      'Makeup reason is required';
  end if;

  if coalesce(cardinality(p_enrollment_ids), 0) = 0 then
    raise exception
      'At least one makeup participant is required';
  end if;

  if exists (
    select 1
    from unnest(p_enrollment_ids)
      as participant(enrollment_id)
    where participant.enrollment_id is null
  ) then
    raise exception
      'Makeup participant is required';
  end if;


  select
    count(
      distinct participant.enrollment_id
    )::integer
  into v_participant_count
  from unnest(p_enrollment_ids)
    as participant(enrollment_id);


  if v_participant_count <>
    cardinality(p_enrollment_ids)
  then
    raise exception
      'Makeup participants must be unique';
  end if;


  -- =======================================================
  -- ANCHOR SESSION
  -- The anchor identifies the class.
  -- Individual credit lineage is stored per participant.
  -- =======================================================

  select
    occurrence.schedule_id,
    occurrence.status,
    occurrence.occurrence_type,
    schedule.class_id,
    class.branch_id,
    schedule.timezone
  into
    v_source_schedule_id,
    v_source_status,
    v_source_type,
    v_class_id,
    v_branch_id,
    v_timezone
  from public.session_occurrences
    as occurrence

  join public.schedules
    as schedule
    on schedule.id =
      occurrence.schedule_id

  join public.classes
    as class
    on class.id =
      schedule.class_id

  where occurrence.id =
    p_source_occurrence_id

  for update of occurrence;


  if v_source_schedule_id is null then
    raise exception
      'Source session not found';
  end if;


  if v_source_type <> 'REGULAR' then
    raise exception
      'A makeup session must reference a regular source occurrence';
  end if;


  if v_source_status not in (
    'COMPLETED',
    'CANCELLED'
  ) then
    raise exception
      'A makeup session requires a completed or cancelled source session';
  end if;


  -- =======================================================
  -- PARTICIPANTS
  -- They only need to belong to this class.
  --
  -- Their actual entitlement will be checked atomically by
  -- trg_zz_reserve_makeup_credit_for_participant.
  -- =======================================================

  if exists (
    select 1
    from unnest(p_enrollment_ids)
      as participant(enrollment_id)

    left join public.enrollments
      as enrollment
      on enrollment.id =
        participant.enrollment_id

    where enrollment.id is null
      or enrollment.class_id
        is distinct from v_class_id
  ) then
    raise exception
      'Every makeup participant must belong to the makeup class';
  end if;


  -- =======================================================
  -- ROOM
  -- =======================================================

  if p_room_id is not null then

    select
      room.branch_id,
      room.status
    into
      v_room_branch_id,
      v_room_status
    from public.rooms as room
    where room.id = p_room_id;


    if v_room_status is distinct from 'ACTIVE' then
      raise exception
        'Room is not available';
    end if;


    if v_room_branch_id
      is distinct from v_branch_id
    then
      raise exception
        'Room must belong to the same branch as the class';
    end if;

  end if;


  v_makeup_date :=
    (p_starts_at at time zone v_timezone)::date;


  -- =======================================================
  -- CLASS CONFLICT
  -- =======================================================

  if exists (
    select 1
    from public.session_occurrences
      as other_occurrence

    join public.schedules
      as other_schedule
      on other_schedule.id =
        other_occurrence.schedule_id

    where other_occurrence.status <>
        'CANCELLED'

      and other_schedule.class_id =
        v_class_id

      and other_occurrence.starts_at <
        p_ends_at

      and other_occurrence.ends_at >
        p_starts_at
  ) then
    raise exception
      'This class already has an overlapping session';
  end if;


  -- =======================================================
  -- ROOM CONFLICT
  -- =======================================================

  if
    p_room_id is not null
    and exists (
      select 1
      from public.session_occurrences
        as other_occurrence

      where other_occurrence.status <>
          'CANCELLED'

        and other_occurrence.room_id =
          p_room_id

        and other_occurrence.starts_at <
          p_ends_at

        and other_occurrence.ends_at >
          p_starts_at
    )
  then
    raise exception
      'This room is already occupied during that time';
  end if;


  -- =======================================================
  -- TEACHER CONFLICT
  -- =======================================================

  v_teacher_block := public.teacher_occurrence_overlap_blocked(v_class_id, p_starts_at, p_ends_at, v_makeup_date, null);
  if v_teacher_block = 'PRIMARY_LIMIT' then
    raise exception 'A primary teacher already has two overlapping teaching shifts at that time';
  elsif v_teacher_block = 'ASSISTANT_OVERLAP' then
    raise exception 'A teacher assigned to this class is already teaching another class at that time';
  end if;


  -- =======================================================
  -- CREATE MAKEUP SESSION
  -- =======================================================

  insert into public.session_occurrences (
    schedule_id,
    occurrence_date,
    starts_at,
    ends_at,
    room_id,
    status,
    notes,
    occurrence_type,
    source_occurrence_id
  )
  values (
    v_source_schedule_id,
    v_makeup_date,
    p_starts_at,
    p_ends_at,
    p_room_id,
    'SCHEDULED',
    btrim(p_reason),
    'MAKEUP',
    p_source_occurrence_id
  )
  returning id into v_result;


  -- Each INSERT below triggers credit reservation.
  --
  -- If even one student has no AVAILABLE credit,
  -- PostgreSQL rolls back the whole transaction.
  insert into
    public.session_occurrence_participants (
      session_occurrence_id,
      enrollment_id
    )
  select
    v_result,
    participant.enrollment_id
  from unnest(p_enrollment_ids)
    as participant(enrollment_id);


  return v_result;
end;
$function$;



notify pgrst, 'reload schema';
