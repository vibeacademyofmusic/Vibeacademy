-- ============================================================
-- VIBE ACADEMY
-- Academic Assignment Engine
--
-- Student
--   ↓
-- Curriculum Enrollment
--   ↓
-- Current Level Progress
--   ↓
-- Subject Progress
--   ↓
-- Component Progress
-- ============================================================

create or replace function public.assign_student_academic_program(
  p_student_id uuid,
  p_curriculum_id uuid,
  p_level_id uuid,
  p_started_at date,
  p_is_primary boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
  v_level_progress_id uuid;
begin

  -- ----------------------------------------------------------
  -- Permission
  -- ----------------------------------------------------------

  if auth.uid() is not null
     and not public.has_role('SUPER_ADMIN')
  then
    raise exception 'Only SUPER_ADMIN can assign an academic program';
  end if;


  -- ----------------------------------------------------------
  -- Required data
  -- ----------------------------------------------------------

  if p_student_id is null
     or p_curriculum_id is null
     or p_level_id is null
     or p_started_at is null
  then
    raise exception 'Student, curriculum, level and start date are required';
  end if;


  -- ----------------------------------------------------------
  -- Student must exist
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.students
    where id = p_student_id
  ) then
    raise exception 'Student does not exist';
  end if;


  -- ----------------------------------------------------------
  -- Curriculum must be active
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.curriculums
    where id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception 'Curriculum does not exist or is inactive';
  end if;


  -- ----------------------------------------------------------
  -- Level must belong to curriculum
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.curriculum_levels
    where id = p_level_id
      and curriculum_id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception 'Level does not belong to this curriculum or is inactive';
  end if;


  -- ----------------------------------------------------------
  -- Prevent duplicate active academic enrollment
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.student_curriculum_enrollments
    where student_id = p_student_id
      and curriculum_id = p_curriculum_id
      and status in ('ACTIVE', 'PAUSED')
  ) then
    raise exception 'Student already has an active enrollment in this curriculum';
  end if;


  -- ----------------------------------------------------------
  -- Level must contain subjects
  -- ----------------------------------------------------------

  if not exists (
    select 1
    from public.curriculum_subjects
    where level_id = p_level_id
      and status = 'ACTIVE'
  ) then
    raise exception 'Selected level has no active subjects';
  end if;


  -- ----------------------------------------------------------
  -- Validate component-based subjects
  -- ----------------------------------------------------------

  if exists (
    select 1
    from public.curriculum_subjects s
    where s.level_id = p_level_id
      and s.status = 'ACTIVE'
      and s.completion_rule = 'ALL_REQUIRED_COMPONENTS'
      and not exists (
        select 1
        from public.curriculum_subject_components c
        where c.subject_id = s.id
          and c.status = 'ACTIVE'
      )
  ) then
    raise exception
      'A subject using ALL_REQUIRED_COMPONENTS has no active components';
  end if;


  -- ----------------------------------------------------------
  -- If this becomes Primary Program,
  -- remove Primary flag from other active academic programs
  -- ----------------------------------------------------------

  if p_is_primary then
    update public.student_curriculum_enrollments
    set
      is_primary = false,
      updated_at = now()
    where student_id = p_student_id
      and is_primary = true
      and status in ('ACTIVE', 'PAUSED');
  end if;


  -- ----------------------------------------------------------
  -- Create Academic Enrollment
  -- ----------------------------------------------------------

  insert into public.student_curriculum_enrollments (
    student_id,
    curriculum_id,
    current_level_id,
    is_primary,
    status,
    started_at
  )
  values (
    p_student_id,
    p_curriculum_id,
    p_level_id,
    p_is_primary,
    'ACTIVE',
    p_started_at
  )
  returning id
  into v_enrollment_id;


  -- ----------------------------------------------------------
  -- Create Current Level Progress
  -- ----------------------------------------------------------

  insert into public.student_level_progress (
    enrollment_id,
    level_id,
    status,
    unlocked_at,
    started_at
  )
  values (
    v_enrollment_id,
    p_level_id,
    'IN_PROGRESS',
    now(),
    p_started_at::timestamp
      at time zone 'Asia/Ho_Chi_Minh'
  )
  returning id
  into v_level_progress_id;


  -- ----------------------------------------------------------
  -- Create Subject Progress
  -- and Component Progress
  -- ----------------------------------------------------------

  with inserted_subjects as (

    insert into public.student_subject_progress (
      level_progress_id,
      subject_id,
      status
    )

    select
      v_level_progress_id,
      s.id,
      'NOT_STARTED'

    from public.curriculum_subjects s

    where s.level_id = p_level_id
      and s.status = 'ACTIVE'

    order by s.sort_order

    returning
      id,
      subject_id
  )

  insert into public.student_component_progress (
    subject_progress_id,
    component_id,
    status
  )

  select
    isp.id,
    c.id,
    'NOT_STARTED'

  from inserted_subjects isp

  join public.curriculum_subject_components c
    on c.subject_id = isp.subject_id
   and c.status = 'ACTIVE'

  order by
    isp.subject_id,
    c.sort_order;


  return v_enrollment_id;

end;
$$;


-- ============================================================
-- Permissions
-- ============================================================

revoke all
on function public.assign_student_academic_program(
  uuid,
  uuid,
  uuid,
  date,
  boolean
)
from public;

revoke all
on function public.assign_student_academic_program(
  uuid,
  uuid,
  uuid,
  date,
  boolean
)
from anon;

grant execute
on function public.assign_student_academic_program(
  uuid,
  uuid,
  uuid,
  date,
  boolean
)
to authenticated;

grant execute
on function public.assign_student_academic_program(
  uuid,
  uuid,
  uuid,
  date,
  boolean
)
to service_role;


comment on function public.assign_student_academic_program(
  uuid,
  uuid,
  uuid,
  date,
  boolean
)
is
'Atomically assigns a Vibe Academy student to a curriculum and current level, creating level, subject and component progress.';