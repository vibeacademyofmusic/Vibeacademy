-- =========================================================
-- VIBE ACADEMY
-- Session Engine: occurrence status workflow
-- =========================================================

-- Enforces occurrence status transitions at the database layer so
-- the rules apply to every client, not only the admin UI.

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
    select schedule.class_id
    into v_class_id
    from public.schedules as schedule
    where schedule.id = old.schedule_id;

    select count(*)::integer
    into v_roster_count
    from public.enrollments as enrollment
    where enrollment.class_id = v_class_id
      and coalesce(
        enrollment.started_at,
        enrollment.enrolled_at
      ) <= old.occurrence_date
      and (
        enrollment.ended_at is null
        or enrollment.ended_at >=
          old.occurrence_date
      );

    select count(*)::integer
    into v_attendance_count
    from public.attendance_records as attendance
    join public.enrollments as enrollment
      on enrollment.id = attendance.enrollment_id
    where attendance.session_occurrence_id =
        old.id
      and enrollment.class_id = v_class_id
      and coalesce(
        enrollment.started_at,
        enrollment.enrolled_at
      ) <= old.occurrence_date
      and (
        enrollment.ended_at is null
        or enrollment.ended_at >=
          old.occurrence_date
      );

    if v_attendance_count <> v_roster_count then
      raise exception
        'All students in the session roster must be marked before completion';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validate_session_occurrence_status
before update of status
on public.session_occurrences
for each row
execute function
  public.validate_session_occurrence_status();


-- Prevent attendance from being inserted or changed after a session
-- has been cancelled.
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
  v_enrollment_class_id uuid;
begin
  select
    schedule.class_id,
    occurrence.status
  into
    v_occurrence_class_id,
    v_occurrence_status
  from public.session_occurrences as occurrence
  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

  if v_occurrence_status = 'CANCELLED' then
    raise exception
      'Attendance cannot be recorded for a cancelled session';
  end if;

  select enrollment.class_id
  into v_enrollment_class_id
  from public.enrollments as enrollment
  where enrollment.id = new.enrollment_id;

  if v_occurrence_class_id is distinct from
    v_enrollment_class_id
  then
    raise exception
      'Attendance enrollment must belong to the occurrence class';
  end if;

  return new;
end;
$$;


-- A small RPC keeps the UI mutation narrow. RLS still controls which
-- authenticated users may update session_occurrences.
create or replace function
  public.set_session_occurrence_status(
    p_occurrence_id uuid,
    p_status text
  )
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
begin
  if p_status not in (
    'SCHEDULED',
    'COMPLETED',
    'CANCELLED'
  ) then
    raise exception 'Invalid session status';
  end if;

  update public.session_occurrences
  set status = p_status
  where id = p_occurrence_id
  returning status into v_status;

  if v_status is null then
    raise exception 'Session not found';
  end if;

  return v_status;
end;
$$;

revoke all on function
  public.set_session_occurrence_status(uuid, text)
from public;

grant execute on function
  public.set_session_occurrence_status(uuid, text)
to authenticated;
