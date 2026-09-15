-- Security-only hardening: keep calculations and record-state guards unchanged.
revoke execute on function public.calculate_enrollment_tuition_effective_end(uuid),public.recalculate_enrollment_tuition_effective_end(uuid),public.is_enrollment_paused_on(uuid,date) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.update_student_academic_enrollment_start_date(p_enrollment_id uuid, p_started_at date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_enrollment public.student_curriculum_enrollments%rowtype;
  v_level_progress_id uuid;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
  if p_enrollment_id is null then
    raise exception 'Academic enrollment is required';
  end if;

  if p_started_at is null then
    raise exception 'Academic enrollment start date is required';
  end if;

  select *
  into v_enrollment
  from public.student_curriculum_enrollments
  where id = p_enrollment_id
  for update;

  if not found then
    raise exception 'Academic enrollment does not exist';
  end if;

  -- Saving the same value is harmless.
  if v_enrollment.started_at = p_started_at then
    return;
  end if;

  -- -------------------------------------------------------
  -- Completed academic history must never be rewritten.
  --
  -- Check this before enrollment status because completing
  -- a grade may also automatically change enrollment status.
  -- -------------------------------------------------------
  if exists (
    select 1
    from public.student_level_progress slp
    where slp.enrollment_id = p_enrollment_id
      and (
        slp.status = 'COMPLETED'
        or slp.completed_at is not null
      )
  ) then
    raise exception
      'Academic enrollment start date cannot be changed after a grade has been completed';
  end if;

  if v_enrollment.status <> 'ACTIVE' then
    raise exception
      'Only active academic enrollments can change their start date';
  end if;

  -- -------------------------------------------------------
  -- Component activity is checked first because component
  -- workflow may also promote its parent subject status.
  -- -------------------------------------------------------
  if exists (
    select 1
    from public.student_component_progress scp
    join public.student_subject_progress ssp
      on ssp.id = scp.subject_progress_id
    join public.student_level_progress slp
      on slp.id = ssp.level_progress_id
    where slp.enrollment_id = p_enrollment_id
      and (
        scp.status <> 'NOT_STARTED'
        or scp.score is not null
        or scp.started_at is not null
        or scp.passed_at is not null
      )
  ) then
    raise exception
      'Academic enrollment start date cannot be changed after component progress has started';
  end if;

  -- -------------------------------------------------------
  -- Subject activity makes the original start date
  -- historical.
  -- -------------------------------------------------------
  if exists (
    select 1
    from public.student_subject_progress ssp
    join public.student_level_progress slp
      on slp.id = ssp.level_progress_id
    where slp.enrollment_id = p_enrollment_id
      and (
        ssp.status <> 'NOT_STARTED'
        or ssp.score is not null
        or ssp.started_at is not null
        or ssp.passed_at is not null
      )
  ) then
    raise exception
      'Academic enrollment start date cannot be changed after subject progress has started';
  end if;

  -- -------------------------------------------------------
  -- v1 edits only the current IN_PROGRESS grade.
  -- -------------------------------------------------------
  select slp.id
  into v_level_progress_id
  from public.student_level_progress slp
  where slp.enrollment_id = p_enrollment_id
    and slp.level_id = v_enrollment.current_level_id
    and slp.status = 'IN_PROGRESS'
  for update;

  if not found then
    raise exception
      'Academic enrollment does not have a current in-progress grade';
  end if;

  -- Keep enrollment and current grade dates synchronized.
  update public.student_curriculum_enrollments
  set
    started_at = p_started_at,
    updated_at = now()
  where id = p_enrollment_id;

  update public.student_level_progress
  set
    started_at =
      p_started_at::timestamp
      at time zone 'Asia/Ho_Chi_Minh',
    updated_at = now()
  where id = v_level_progress_id;
end;
$function$
