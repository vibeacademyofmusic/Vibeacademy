-- Restore the full-class exclusion dropped when list_placement_class_options
-- was widened in 20260928190000. Assignment still rejects PLACEMENT_CLASS_FULL;
-- the option list must not offer a class that assignment will refuse.

create or replace function public.list_placement_class_options(p_branch uuid)
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
language sql
stable
security definer
set search_path = public, pg_temp
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
  join public.courses course on course.id = class_row.course_id
  join public.curriculums curriculum on curriculum.id = course.curriculum_id
  left join public.curriculum_levels from_level on from_level.id = class_row.accepted_from_level_id
  left join public.curriculum_levels to_level on to_level.id = class_row.accepted_to_level_id
  where class_row.status = 'ACTIVE'
    and public.registration_can('student_placement.view', class_row.branch_id)
    and (p_branch is null or class_row.branch_id = p_branch)
    and coalesce(occupancy.n, 0) < class_row.capacity
  order by class_row.name, class_row.id
$$;
