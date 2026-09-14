-- ============================================================
-- VIBE ACADEMY
-- Academic Level Progression
--
-- COMPLETED current grade
--        ↓
-- AVAILABLE next grade
--        ↓
-- Admin starts next grade
--        ↓
-- IN_PROGRESS
-- ============================================================


-- ============================================================
-- 1. UNLOCK NEXT LEVEL WHEN CURRENT LEVEL IS COMPLETED
-- ============================================================

create or replace function public.unlock_next_academic_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curriculum_id uuid;
  v_current_sequence integer;
  v_next_level_id uuid;
begin

  -- Only react when the level has just become COMPLETED.
  if new.status <> 'COMPLETED'
     or old.status = 'COMPLETED'
  then
    return new;
  end if;


  select
    sce.curriculum_id,
    cl.sequence_no
  into
    v_curriculum_id,
    v_current_sequence
  from public.student_curriculum_enrollments sce
  join public.curriculum_levels cl
    on cl.id = new.level_id
  where sce.id = new.enrollment_id;


  if v_curriculum_id is null then
    return new;
  end if;


  -- Find the next ACTIVE level in the same curriculum.
  select cl.id
  into v_next_level_id
  from public.curriculum_levels cl
  where cl.curriculum_id = v_curriculum_id
    and cl.status = 'ACTIVE'
    and cl.sequence_no > v_current_sequence
  order by cl.sequence_no
  limit 1;


  -- No next level means the whole academic program is complete.
  if v_next_level_id is null then

    update public.student_curriculum_enrollments
    set
      status = 'COMPLETED',
      completed_at = coalesce(
        completed_at,
        (now() at time zone 'Asia/Ho_Chi_Minh')::date
      ),
      updated_at = now()
    where id = new.enrollment_id;

    return new;

  end if;


  -- Create / unlock only the next level.
  insert into public.student_level_progress (
    enrollment_id,
    level_id,
    status,
    unlocked_at
  )
  values (
    new.enrollment_id,
    v_next_level_id,
    'AVAILABLE',
    now()
  )
  on conflict (enrollment_id, level_id)
  do update
  set
    status =
      case
        when student_level_progress.status = 'LOCKED'
          then 'AVAILABLE'
        else student_level_progress.status
      end,

    unlocked_at =
      coalesce(
        student_level_progress.unlocked_at,
        now()
      ),

    updated_at = now();


  return new;
end;
$$;


drop trigger if exists
  trg_unlock_next_academic_level
on public.student_level_progress;


create trigger trg_unlock_next_academic_level
after update of status
on public.student_level_progress
for each row
execute function public.unlock_next_academic_level();



-- ============================================================
-- 2. START AN AVAILABLE LEVEL
-- ============================================================

create or replace function public.start_student_academic_level(
  p_enrollment_id uuid,
  p_level_id uuid,
  p_started_at date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_curriculum_id uuid;
  v_enrollment_status text;
  v_level_progress_id uuid;
  v_level_sequence integer;
begin

  -- Only SUPER_ADMIN may start a grade from the application.
  -- service_role / direct migration execution is still allowed.
  if auth.uid() is not null
     and not public.has_role('SUPER_ADMIN')
  then
    raise exception
      'Only SUPER_ADMIN can start an academic level';
  end if;


  if p_enrollment_id is null
     or p_level_id is null
     or p_started_at is null
  then
    raise exception
      'Enrollment, level and start date are required';
  end if;


  -- Academic start date represents an actual start,
  -- not a future scheduled date.
  if p_started_at > current_date then
    raise exception
      'Academic level start date cannot be in the future';
  end if;


  select
    curriculum_id,
    status
  into
    v_curriculum_id,
    v_enrollment_status
  from public.student_curriculum_enrollments
  where id = p_enrollment_id;


  if v_curriculum_id is null then
    raise exception
      'Academic enrollment not found';
  end if;


  if v_enrollment_status <> 'ACTIVE' then
    raise exception
      'Academic enrollment must be ACTIVE';
  end if;


  select sequence_no
  into v_level_sequence
  from public.curriculum_levels
  where id = p_level_id
    and curriculum_id = v_curriculum_id
    and status = 'ACTIVE';


  if v_level_sequence is null then
    raise exception
      'Level does not belong to this active curriculum';
  end if;


  select id
  into v_level_progress_id
  from public.student_level_progress
  where enrollment_id = p_enrollment_id
    and level_id = p_level_id
    and status = 'AVAILABLE';


  if v_level_progress_id is null then
    raise exception
      'Academic level is not available to start';
  end if;


  -- Do not allow two grades to be IN_PROGRESS
  -- within the same academic program.
  if exists (
    select 1
    from public.student_level_progress
    where enrollment_id = p_enrollment_id
      and status = 'IN_PROGRESS'
      and id <> v_level_progress_id
  ) then
    raise exception
      'Another academic level is already in progress';
  end if;


  -- All previous ACTIVE grades must already be completed.
  if exists (
    select 1
    from public.curriculum_levels previous_level

    where previous_level.curriculum_id = v_curriculum_id
      and previous_level.status = 'ACTIVE'
      and previous_level.sequence_no < v_level_sequence

      and not exists (
        select 1
        from public.student_level_progress previous_progress
        where previous_progress.enrollment_id = p_enrollment_id
          and previous_progress.level_id = previous_level.id
          and previous_progress.status = 'COMPLETED'
      )
  ) then
    raise exception
      'Previous academic levels must be completed first';
  end if;


  -- Level must contain academic subjects.
  if not exists (
    select 1
    from public.curriculum_subjects
    where level_id = p_level_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Academic level has no active subjects';
  end if;


  -- Component-based subjects must contain
  -- at least one required active component.
  if exists (
    select 1
    from public.curriculum_subjects cs
    where cs.level_id = p_level_id
      and cs.status = 'ACTIVE'
      and cs.is_required = true
      and cs.completion_rule = 'ALL_REQUIRED_COMPONENTS'

      and not exists (
        select 1
        from public.curriculum_subject_components csc
        where csc.subject_id = cs.id
          and csc.status = 'ACTIVE'
          and csc.is_required = true
      )
  ) then
    raise exception
      'A required subject has no required active components';
  end if;


  -- Start the level.
  update public.student_level_progress
  set
    status = 'IN_PROGRESS',
    unlocked_at = coalesce(unlocked_at, now()),
    started_at =
      p_started_at::timestamp
      at time zone 'Asia/Ho_Chi_Minh',
    completed_at = null,
    updated_at = now()
  where id = v_level_progress_id;


  -- Create Subject Progress for the new level.
  insert into public.student_subject_progress (
    level_progress_id,
    subject_id,
    status
  )
  select
    v_level_progress_id,
    cs.id,
    'NOT_STARTED'
  from public.curriculum_subjects cs
  where cs.level_id = p_level_id
    and cs.status = 'ACTIVE'
  on conflict (level_progress_id, subject_id)
  do nothing;


  -- Create Component Progress.
  insert into public.student_component_progress (
    subject_progress_id,
    component_id,
    status
  )
  select
    ssp.id,
    csc.id,
    'NOT_STARTED'

  from public.student_subject_progress ssp

  join public.curriculum_subjects cs
    on cs.id = ssp.subject_id

  join public.curriculum_subject_components csc
    on csc.subject_id = cs.id
    and csc.status = 'ACTIVE'

  where ssp.level_progress_id = v_level_progress_id

  on conflict (
    subject_progress_id,
    component_id
  )
  do nothing;


  -- Only now does the student's current grade move forward.
  update public.student_curriculum_enrollments
  set
    current_level_id = p_level_id,
    updated_at = now()
  where id = p_enrollment_id;


  return v_level_progress_id;
end;
$$;



-- ============================================================
-- 3. PERMISSIONS
-- ============================================================

revoke all
on function public.start_student_academic_level(
  uuid,
  uuid,
  date
)
from public;

revoke all
on function public.start_student_academic_level(
  uuid,
  uuid,
  date
)
from anon;

grant execute
on function public.start_student_academic_level(
  uuid,
  uuid,
  date
)
to authenticated;

grant execute
on function public.start_student_academic_level(
  uuid,
  uuid,
  date
)
to service_role;



-- ============================================================
-- 4. BACKFILL NEXT AVAILABLE LEVEL FOR EXISTING COMPLETIONS
-- ============================================================

insert into public.student_level_progress (
  enrollment_id,
  level_id,
  status,
  unlocked_at
)
select
  completed_progress.enrollment_id,
  next_level.id,
  'AVAILABLE',
  now()

from public.student_level_progress completed_progress

join public.curriculum_levels completed_level
  on completed_level.id = completed_progress.level_id

join lateral (
  select cl.id
  from public.curriculum_levels cl
  where cl.curriculum_id =
    completed_level.curriculum_id

    and cl.status = 'ACTIVE'

    and cl.sequence_no >
      completed_level.sequence_no

  order by cl.sequence_no
  limit 1
) next_level
  on true

where completed_progress.status = 'COMPLETED'

on conflict (enrollment_id, level_id)
do nothing;