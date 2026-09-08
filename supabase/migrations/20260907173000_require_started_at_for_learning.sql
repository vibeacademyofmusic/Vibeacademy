-- =========================================================
-- VIBE ACADEMY
-- Require started_at for learning activity
-- =========================================================
--
-- enrolled_at = administrative enrollment date
-- started_at  = actual learning start date
--
-- A class enrollment without started_at:
-- - is not part of a REGULAR attendance roster
-- - cannot receive attendance
-- - cannot receive cancelled-session makeup credit
-- - cannot create an enrollment pause
--
-- No fallback to enrolled_at is allowed.
-- =========================================================


-- =========================================================
-- ATTENDANCE WRITE VALIDATION
-- =========================================================

create or replace function
  public.validate_attendance_record_class()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence_class_id uuid;
  v_occurrence_status text;
  v_occurrence_type text;
  v_occurrence_date date;

  v_enrollment_class_id uuid;
  v_enrollment_started_at date;
  v_enrollment_ended_at date;
begin

  select
    schedule.class_id,
    occurrence.status,
    occurrence.occurrence_type,
    occurrence.occurrence_date
  into
    v_occurrence_class_id,
    v_occurrence_status,
    v_occurrence_type,
    v_occurrence_date
  from public.session_occurrences as occurrence

  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id

  where occurrence.id =
    new.session_occurrence_id;


  if v_occurrence_status = 'CANCELLED' then
    raise exception
      'Attendance cannot be recorded for a cancelled session';
  end if;


  select
    enrollment.class_id,
    enrollment.started_at,
    enrollment.ended_at
  into
    v_enrollment_class_id,
    v_enrollment_started_at,
    v_enrollment_ended_at
  from public.enrollments as enrollment
  where enrollment.id = new.enrollment_id;


  if v_occurrence_class_id is distinct from
    v_enrollment_class_id
  then
    raise exception
      'Attendance enrollment must belong to the occurrence class';
  end if;


  -- -------------------------------------------------------
  -- REGULAR SESSION STUDY PERIOD
  -- -------------------------------------------------------

  if
    v_occurrence_type = 'REGULAR'
    and (
      v_enrollment_started_at is null
      or v_enrollment_started_at > v_occurrence_date
      or (
        v_enrollment_ended_at is not null
        and v_enrollment_ended_at < v_occurrence_date
      )
    )
  then
    raise exception
      'Attendance cannot be recorded outside the enrollment study period';
  end if;


  -- -------------------------------------------------------
  -- REGULAR SESSION PAUSE RULE
  -- -------------------------------------------------------

  if
    v_occurrence_type = 'REGULAR'
    and public.is_enrollment_paused_on(
      new.enrollment_id,
      v_occurrence_date
    )
  then
    raise exception
      'Attendance cannot be recorded while the enrollment is paused';
  end if;


  -- -------------------------------------------------------
  -- MAKEUP SESSION EXPLICIT ROSTER
  -- -------------------------------------------------------

  if
    v_occurrence_type = 'MAKEUP'
    and not exists (
      select 1
      from public.session_occurrence_participants
      where session_occurrence_id =
          new.session_occurrence_id
        and enrollment_id =
          new.enrollment_id
    )
  then
    raise exception
      'Attendance enrollment must be a makeup participant';
  end if;


  return new;
end;
$$;


-- =========================================================
-- SESSION COMPLETION
-- REGULAR ROSTER REQUIRES started_at
-- =========================================================

create or replace function
  public.validate_session_occurrence_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_roster_count integer;
  v_attendance_count integer;
begin

  if new.status = old.status then
    return new;
  end if;


  if not (
    (
      old.status = 'SCHEDULED'
      and new.status in (
        'COMPLETED',
        'CANCELLED'
      )
    )
    or
    (
      old.status in (
        'COMPLETED',
        'CANCELLED'
      )
      and new.status = 'SCHEDULED'
    )
  ) then
    raise exception
      'Invalid session status transition from % to %',
      old.status,
      new.status;
  end if;


  if new.status = 'CANCELLED' then

    select count(*)::integer
    into v_attendance_count
    from public.attendance_records
    where session_occurrence_id = old.id;


    if v_attendance_count > 0 then
      raise exception
        'A session with attendance records cannot be cancelled';
    end if;

  end if;


  if new.status = 'COMPLETED' then

    -- MAKEUP: explicit participant roster.
    if old.occurrence_type = 'MAKEUP' then

      select count(*)::integer
      into v_roster_count
      from public.session_occurrence_participants
      where session_occurrence_id = old.id;


      select count(*)::integer
      into v_attendance_count
      from public.attendance_records as attendance

      join public.session_occurrence_participants
        as participant
        on participant.session_occurrence_id =
          attendance.session_occurrence_id
        and participant.enrollment_id =
          attendance.enrollment_id

      where attendance.session_occurrence_id =
        old.id;

    -- REGULAR: dated roster.
    else

      select schedule.class_id
      into v_class_id
      from public.schedules as schedule
      where schedule.id = old.schedule_id;


      select count(*)::integer
      into v_roster_count
      from public.enrollments as enrollment

      where enrollment.class_id = v_class_id

        and enrollment.started_at is not null

        and enrollment.started_at <=
          old.occurrence_date

        and (
          enrollment.ended_at is null
          or enrollment.ended_at >=
            old.occurrence_date
        )

        and not public.is_enrollment_paused_on(
          enrollment.id,
          old.occurrence_date
        );


      select count(*)::integer
      into v_attendance_count
      from public.attendance_records as attendance

      join public.enrollments as enrollment
        on enrollment.id =
          attendance.enrollment_id

      where attendance.session_occurrence_id =
          old.id

        and enrollment.class_id =
          v_class_id

        and enrollment.started_at is not null

        and enrollment.started_at <=
          old.occurrence_date

        and (
          enrollment.ended_at is null
          or enrollment.ended_at >=
            old.occurrence_date
        )

        and not public.is_enrollment_paused_on(
          enrollment.id,
          old.occurrence_date
        );

    end if;


    if v_attendance_count <>
      v_roster_count
    then
      raise exception
        'All students in the session roster must be marked before completion';
    end if;

  end if;


  return new;
end;
$$;


-- =========================================================
-- MAKEUP CREDIT
-- CANCELLED REGULAR SESSION REQUIRES started_at
-- =========================================================

create or replace function
  public.sync_makeup_credits_from_session_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  if new.status = old.status then
    return new;
  end if;


  -- REGULAR COMPLETED:
  -- EXCUSED students receive one credit.
  if
    new.occurrence_type = 'REGULAR'
    and new.status = 'COMPLETED'
  then

    insert into public.makeup_credits (
      enrollment_id,
      source_occurrence_id,
      source_attendance_record_id,
      source_reason,
      status
    )

    select
      attendance.enrollment_id,
      new.id,
      attendance.id,
      'EXCUSED',
      'AVAILABLE'

    from public.attendance_records
      as attendance

    where attendance.session_occurrence_id =
        new.id

      and attendance.status = 'EXCUSED'

    on conflict (
      source_occurrence_id,
      enrollment_id
    )

    do update
    set
      source_attendance_record_id =
        excluded.source_attendance_record_id,

      source_reason = 'EXCUSED',

      status = 'AVAILABLE',

      reserved_occurrence_id = null,
      reserved_at = null,
      used_at = null,
      cancelled_at = null

    where public.makeup_credits.status
      in (
        'AVAILABLE',
        'CANCELLED'
      );


    return new;

  end if;


  -- REGULAR CANCELLED:
  -- only the actual dated roster receives credit.
  if
    new.occurrence_type = 'REGULAR'
    and new.status = 'CANCELLED'
  then

    insert into public.makeup_credits (
      enrollment_id,
      source_occurrence_id,
      source_attendance_record_id,
      source_reason,
      status
    )

    select
      enrollment.id,
      new.id,
      null,
      'SESSION_CANCELLED',
      'AVAILABLE'

    from public.schedules as schedule

    join public.enrollments as enrollment
      on enrollment.class_id =
        schedule.class_id

    where schedule.id =
        new.schedule_id

      and enrollment.started_at is not null

      and enrollment.started_at <=
        new.occurrence_date

      and (
        enrollment.ended_at is null
        or enrollment.ended_at >=
          new.occurrence_date
      )

      and not public.is_enrollment_paused_on(
        enrollment.id,
        new.occurrence_date
      )

    on conflict (
      source_occurrence_id,
      enrollment_id
    )

    do update
    set
      source_attendance_record_id = null,

      source_reason =
        'SESSION_CANCELLED',

      status = 'AVAILABLE',

      reserved_occurrence_id = null,
      reserved_at = null,
      used_at = null,
      cancelled_at = null

    where public.makeup_credits.status
      in (
        'AVAILABLE',
        'CANCELLED'
      );


    return new;

  end if;


  -- REGULAR SOURCE REOPENED
  if
    new.occurrence_type = 'REGULAR'
    and new.status = 'SCHEDULED'
    and old.status in (
      'COMPLETED',
      'CANCELLED'
    )
  then

    update public.makeup_credits

    set
      status = 'CANCELLED',
      reserved_occurrence_id = null,
      reserved_at = null,
      used_at = null,
      cancelled_at = now()

    where source_occurrence_id =
        new.id

      and status = 'AVAILABLE';


    return new;

  end if;


  -- MAKEUP COMPLETED
  if
    new.occurrence_type = 'MAKEUP'
    and new.status = 'COMPLETED'
  then

    update public.makeup_credits

    set
      status = 'USED',
      used_at = now()

    where reserved_occurrence_id =
        new.id

      and status = 'RESERVED';


    return new;

  end if;


  -- MAKEUP CANCELLED
  if
    new.occurrence_type = 'MAKEUP'
    and new.status = 'CANCELLED'
  then

    update public.makeup_credits

    set
      status = 'AVAILABLE',
      reserved_occurrence_id = null,
      reserved_at = null,
      used_at = null,
      cancelled_at = null

    where reserved_occurrence_id =
        new.id

      and status = 'RESERVED';


    return new;

  end if;


  return new;

end;
$$;


-- =========================================================
-- ENROLLMENT PAUSE
-- REQUIRES ACTUAL LEARNING START
-- =========================================================

create or replace function
  public.guard_enrollment_pause_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  enrollment public.enrollments%rowtype;
begin

  if tg_op = 'DELETE' then
    raise exception
      'Pause history cannot be deleted; cancel the pause instead';
  end if;


  if tg_op = 'UPDATE' then

    if
      old.status = 'CANCELLED'
      or new.enrollment_id <> old.enrollment_id
      or new.starts_on <> old.starts_on
      or new.ends_on <> old.ends_on
      or new.reason <> old.reason
    then
      raise exception
        'Pause dates and history cannot be edited; cancel and create a new pause';
    end if;

  end if;


  select *
  into enrollment
  from public.enrollments
  where id = new.enrollment_id
  for update;


  if tg_op = 'INSERT' then

    if enrollment.status <> 'ACTIVE' then
      raise exception
        'Only active enrollments can receive a new pause';
    end if;


    if enrollment.started_at is null then
      raise exception
        'An enrollment must have a study start date before it can be paused';
    end if;


    if
      new.starts_on < enrollment.started_at
      or (
        enrollment.ended_at is not null
        and new.ends_on > enrollment.ended_at
      )
    then
      raise exception
        'Pause dates must fall within the enrollment study period';
    end if;

  end if;


  if
    tg_op = 'INSERT'
    or new.status is distinct from old.status
  then

    perform occurrence.id
    from public.session_occurrences occurrence

    join public.schedules schedule
      on schedule.id = occurrence.schedule_id

    where schedule.class_id = enrollment.class_id

      and occurrence.occurrence_type = 'REGULAR'

      and occurrence.occurrence_date
        between new.starts_on and new.ends_on

    order by occurrence.id
    for update of occurrence;


    if exists (

      select 1
      from public.session_occurrences occurrence

      join public.schedules schedule
        on schedule.id = occurrence.schedule_id

      where schedule.class_id = enrollment.class_id

        and occurrence.occurrence_type = 'REGULAR'

        and occurrence.occurrence_date
          between new.starts_on and new.ends_on

        and (
          occurrence.status <> 'SCHEDULED'
          or exists (
            select 1
            from public.attendance_records attendance
            where attendance.session_occurrence_id =
                occurrence.id
              and attendance.enrollment_id =
                new.enrollment_id
          )
        )

    ) then
      raise exception
        'Pause changes are blocked for dates with recorded attendance or finalized regular sessions';
    end if;

  end if;


  return new;
end;
$$;