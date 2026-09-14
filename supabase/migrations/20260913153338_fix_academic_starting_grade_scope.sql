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
  v_vietnam_today date;
begin

  v_vietnam_today :=
    (now() at time zone 'Asia/Ho_Chi_Minh')::date;


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


  -- IMPORTANT:
  -- Compare against Vietnam calendar date,
  -- not PostgreSQL server UTC current_date.
  if p_started_at > v_vietnam_today then
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


  -- Only levels that are part of this student's actual academic journey
-- are prerequisites.
--
-- Example:
-- Student starts at Grade 3.
-- Grade 1 and Grade 2 have no student_level_progress rows,
-- therefore they must NOT block Grade 4.
--
-- Grade 3 must be COMPLETED before Grade 4 can start.
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