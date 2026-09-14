-- ============================================================
-- VIBE ACADEMY
-- Future Academic Start Scheduling
--
-- Business rules:
-- 1. Academic programs and next levels may be scheduled
--    with a future start date.
-- 2. We keep existing database statuses.
--    IN_PROGRESS + future started_at is interpreted by the app
--    as SCHEDULED / "Đã lên lịch".
-- 3. Academic progress cannot be edited before the level's
--    scheduled start time.
-- ============================================================


-- ============================================================
-- 1. ASSIGN ACADEMIC PROGRAM
-- Allow future p_started_at.
-- All existing validation is preserved.
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

  if auth.uid() is not null
     and not public.has_role('SUPER_ADMIN')
  then
    raise exception
      'Only SUPER_ADMIN can assign an academic program';
  end if;


  if p_student_id is null
     or p_curriculum_id is null
     or p_level_id is null
     or p_started_at is null
  then
    raise exception
      'Student, curriculum, level and start date are required';
  end if;


  -- Serialize assignment / primary changes for this student.
  perform 1
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'Student does not exist';
  end if;


  if not exists (
    select 1
    from public.curriculums
    where id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Curriculum does not exist or is inactive';
  end if;


  if not exists (
    select 1
    from public.curriculum_levels
    where id = p_level_id
      and curriculum_id = p_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Level does not belong to this curriculum or is inactive';
  end if;


  if exists (
    select 1
    from public.student_curriculum_enrollments
    where student_id = p_student_id
      and curriculum_id = p_curriculum_id
      and status in ('ACTIVE', 'PAUSED')
  ) then
    raise exception
      'Student already has an active enrollment in this curriculum';
  end if;


  if not exists (
    select 1
    from public.curriculum_subjects
    where level_id = p_level_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Selected level has no active subjects';
  end if;


  if exists (
    select 1
    from public.curriculum_subjects s
    where s.level_id = p_level_id
      and s.status = 'ACTIVE'
      and s.is_required = true
      and s.completion_rule = 'ALL_REQUIRED_COMPONENTS'
      and not exists (
        select 1
        from public.curriculum_subject_components c
        where c.subject_id = s.id
          and c.is_required = true
          and c.status = 'ACTIVE'
      )
  ) then
    raise exception
      'A required subject has no required active components';
  end if;


  if p_is_primary then
    update public.student_curriculum_enrollments
    set
      is_primary = false,
      updated_at = now()
    where student_id = p_student_id
      and is_primary = true
      and status in ('ACTIVE', 'PAUSED');
  end if;


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
-- 2. START NEXT ACADEMIC LEVEL
-- Allow future p_started_at.
-- ============================================================

create or replace function public.start_student_academic_level(
  p_enrollment_id uuid,
  p_level_id uuid,
  p_started_at date default (
    (now() at time zone 'Asia/Ho_Chi_Minh')::date
  )
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_curriculum_id uuid;
  v_enrollment_status text;
  v_level_progress_id uuid;
  v_level_sequence integer;
begin

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


  select
    curriculum_id,
    status
  into
    v_curriculum_id,
    v_enrollment_status
  from public.student_curriculum_enrollments
  where id = p_enrollment_id
  for update;


  if v_curriculum_id is null then
    raise exception
      'Academic enrollment not found';
  end if;


  if v_enrollment_status <> 'ACTIVE' then
    raise exception
      'Academic enrollment must be ACTIVE';
  end if;


  if not exists (
    select 1
    from public.curriculums
    where id = v_curriculum_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Curriculum does not exist or is inactive';
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


  if not exists (
    select 1
    from public.curriculum_subjects
    where level_id = p_level_id
      and status = 'ACTIVE'
  ) then
    raise exception
      'Academic level has no active subjects';
  end if;


  -- Only grades that are actually part of this student's
  -- academic journey are prerequisites.
  if exists (
    select 1
    from public.student_level_progress previous_progress
    join public.curriculum_levels previous_level
      on previous_level.id = previous_progress.level_id
    where previous_progress.enrollment_id = p_enrollment_id
      and previous_level.curriculum_id = v_curriculum_id
      and previous_level.sequence_no < v_level_sequence
      and previous_progress.status <> 'COMPLETED'
  ) then
    raise exception
      'Previous academic levels in this student journey must be completed first';
  end if;


  if exists (
    select 1
    from public.curriculum_subjects s
    where s.level_id = p_level_id
      and s.status = 'ACTIVE'
      and s.is_required = true
      and s.completion_rule = 'ALL_REQUIRED_COMPONENTS'
      and not exists (
        select 1
        from public.curriculum_subject_components c
        where c.subject_id = s.id
          and c.status = 'ACTIVE'
          and c.is_required = true
      )
  ) then
    raise exception
      'A required subject has no required active components';
  end if;


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


  update public.student_curriculum_enrollments
  set
    current_level_id = p_level_id,
    updated_at = now()
  where id = p_enrollment_id;


  return v_level_progress_id;

end;
$function$;


-- ============================================================
-- 3. PROTECT FUTURE-SCHEDULED PROGRESS
--
-- A future scheduled level already has its Subject / Component
-- progress rows, but those rows must stay untouched until the
-- scheduled start time arrives.
-- ============================================================

create or replace function public.guard_future_academic_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level_started_at timestamptz;
begin

  if tg_table_name = 'student_subject_progress' then

    select slp.started_at
    into v_level_started_at
    from public.student_level_progress slp
    where slp.id = new.level_progress_id;

  elsif tg_table_name = 'student_component_progress' then

    select slp.started_at
    into v_level_started_at
    from public.student_subject_progress ssp
    join public.student_level_progress slp
      on slp.id = ssp.level_progress_id
    where ssp.id = new.subject_progress_id;

  else
    raise exception
      'Unsupported academic progress table';
  end if;


  if v_level_started_at is null then
    raise exception
      'Academic level has no start date';
  end if;


  if v_level_started_at > now() then
    raise exception
      'Academic progress cannot be updated before the scheduled start date';
  end if;


  return new;
end;
$$;


drop trigger if exists
  trg_guard_future_subject_progress
on public.student_subject_progress;

create trigger trg_guard_future_subject_progress
before update of
  status,
  score,
  started_at,
  passed_at,
  notes
on public.student_subject_progress
for each row
execute function public.guard_future_academic_progress();


drop trigger if exists
  trg_guard_future_component_progress
on public.student_component_progress;

create trigger trg_guard_future_component_progress
before update of
  status,
  score,
  started_at,
  passed_at,
  notes
on public.student_component_progress
for each row
execute function public.guard_future_academic_progress();