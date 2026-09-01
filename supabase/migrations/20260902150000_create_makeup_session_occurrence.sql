-- =========================================================
-- VIBE ACADEMY
-- Reschedule & Makeup Phase 3: create one makeup occurrence
-- =========================================================

-- A makeup occurrence is created atomically with its explicit
-- enrollment roster. It inherits its schedule and class identity
-- from one completed or cancelled regular source occurrence.

create or replace function
  public.create_makeup_session_occurrence(
    p_source_occurrence_id uuid,
    p_starts_at timestamptz,
    p_ends_at timestamptz,
    p_room_id uuid,
    p_enrollment_ids uuid[],
    p_reason text
  )
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_schedule_id uuid;
  v_source_occurrence_date date;
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
begin
  if p_starts_at is null or p_ends_at is null then
    raise exception 'Session start and end time are required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception 'End time must be after start time';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'Makeup reason is required';
  end if;

  if coalesce(cardinality(p_enrollment_ids), 0) = 0 then
    raise exception 'At least one makeup participant is required';
  end if;

  if exists (
    select 1
    from unnest(p_enrollment_ids) as participant(enrollment_id)
    where participant.enrollment_id is null
  ) then
    raise exception 'Makeup participant is required';
  end if;

  select count(distinct participant.enrollment_id)::integer
  into v_participant_count
  from unnest(p_enrollment_ids) as participant(enrollment_id);

  if v_participant_count <> cardinality(p_enrollment_ids) then
    raise exception 'Makeup participants must be unique';
  end if;

  select
    occurrence.schedule_id,
    occurrence.occurrence_date,
    occurrence.status,
    occurrence.occurrence_type,
    schedule.class_id,
    class.branch_id,
    schedule.timezone
  into
    v_source_schedule_id,
    v_source_occurrence_date,
    v_source_status,
    v_source_type,
    v_class_id,
    v_branch_id,
    v_timezone
  from public.session_occurrences as occurrence
  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id
  join public.classes as class
    on class.id = schedule.class_id
  where occurrence.id = p_source_occurrence_id
  for update of occurrence;

  if v_source_schedule_id is null then
    raise exception 'Source session not found';
  end if;

  if v_source_type <> 'REGULAR' then
    raise exception 'A makeup session must reference a regular source occurrence';
  end if;

  if v_source_status not in ('COMPLETED', 'CANCELLED') then
    raise exception
      'A makeup session requires a completed or cancelled source session';
  end if;

  if exists (
    select 1
    from unnest(p_enrollment_ids) as participant(enrollment_id)
    left join public.enrollments as enrollment
      on enrollment.id = participant.enrollment_id
    where enrollment.id is null
      or enrollment.class_id is distinct from v_class_id
      or coalesce(
        enrollment.started_at,
        enrollment.enrolled_at
      ) > v_source_occurrence_date
      or (
        enrollment.ended_at is not null
        and enrollment.ended_at < v_source_occurrence_date
      )
  ) then
    raise exception
      'Every makeup participant must belong to the source roster';
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

  v_makeup_date :=
    (p_starts_at at time zone v_timezone)::date;

  if exists (
    select 1
    from public.session_occurrences as other_occurrence
    join public.schedules as other_schedule
      on other_schedule.id = other_occurrence.schedule_id
    where other_occurrence.status <> 'CANCELLED'
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
      where other_occurrence.status <> 'CANCELLED'
        and other_occurrence.room_id = p_room_id
        and other_occurrence.starts_at < p_ends_at
        and other_occurrence.ends_at > p_starts_at
    )
  then
    raise exception
      'This room is already occupied during that time';
  end if;

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
      and current_assignment.assigned_at <= v_makeup_date
      and (
        current_assignment.ended_at is null
        or current_assignment.ended_at >= v_makeup_date
      )
      and other_assignment.is_active = true
      and other_assignment.assigned_at <= v_makeup_date
      and (
        other_assignment.ended_at is null
        or other_assignment.ended_at >= v_makeup_date
      )
      and other_occurrence.status <> 'CANCELLED'
      and other_occurrence.starts_at < p_ends_at
      and other_occurrence.ends_at > p_starts_at
  ) then
    raise exception
      'A teacher assigned to this class is already teaching another class at that time';
  end if;

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

  insert into public.session_occurrence_participants (
    session_occurrence_id,
    enrollment_id
  )
  select
    v_result,
    participant.enrollment_id
  from unnest(p_enrollment_ids) as participant(enrollment_id);

  return v_result;
end;
$$;

revoke all on function
  public.create_makeup_session_occurrence(
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    uuid[],
    text
  )
from public;

grant execute on function
  public.create_makeup_session_occurrence(
    uuid,
    timestamptz,
    timestamptz,
    uuid,
    uuid[],
    text
  )
to authenticated;
