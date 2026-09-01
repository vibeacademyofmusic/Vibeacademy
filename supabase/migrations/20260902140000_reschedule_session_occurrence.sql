-- =========================================================
-- VIBE ACADEMY
-- Reschedule & Makeup Phase 2: reschedule one occurrence
-- =========================================================

-- Rescheduling changes only the concrete time and room of a dated
-- occurrence. The recurring master schedule, occurrence_date and
-- original snapshot remain unchanged.

create or replace function
  public.reschedule_session_occurrence(
    p_occurrence_id uuid,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_room_id uuid,
    p_reason text
  )
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
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

  if exists (
    select 1
    from public.class_teachers as current_assignment
    join public.class_teachers as other_assignment
      on other_assignment.teacher_id =
        current_assignment.teacher_id
      and other_assignment.class_id <>
        current_assignment.class_id
    join public.schedules as other_schedule
      on other_schedule.class_id =
        other_assignment.class_id
    join public.session_occurrences as other_occurrence
      on other_occurrence.schedule_id = other_schedule.id
    where current_assignment.class_id = v_class_id
      and current_assignment.is_active = true
      and current_assignment.assigned_at <= v_session_date
      and (
        current_assignment.ended_at is null
        or current_assignment.ended_at >= v_session_date
      )
      and other_assignment.is_active = true
      and other_assignment.assigned_at <= v_session_date
      and (
        other_assignment.ended_at is null
        or other_assignment.ended_at >= v_session_date
      )
      and other_occurrence.id <> p_occurrence_id
      and other_occurrence.status <> 'CANCELLED'
      and other_occurrence.starts_at < p_ends_at
      and other_occurrence.ends_at > p_starts_at
  ) then
    raise exception
      'A teacher assigned to this class is already teaching another class at that time';
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
$$;

revoke all on function
  public.reschedule_session_occurrence(
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    text
  )
from public;

grant execute on function
  public.reschedule_session_occurrence(
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    text
  )
to authenticated;
