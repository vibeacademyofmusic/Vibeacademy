-- A configured room is reserved in the same transaction as each recurring
-- schedule write. Physical room approval is separate from rooms.capacity:
-- this migration does not certify any existing value (including CT01's 4).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';

create schema if not exists maintenance_private;

create index if not exists schedules_active_room_weekly_slot_idx
  on public.schedules (room_id, day_of_week, start_time, end_time, effective_from, effective_to)
  where status = 'ACTIVE' and room_id is not null;

create function maintenance_private.schedule_room_conflict_code(
  p_exclude uuid, p_room uuid, p_day smallint, p_start time, p_end time,
  p_first date, p_last date, p_timezone text
)
returns text
language plpgsql
volatile
security definer
set search_path to public, pg_temp
as $$
begin
  if p_first > p_last then return 'CLEAR'; end if;
  if p_timezone <> 'Asia/Ho_Chi_Minh' then
    return 'SCHEDULE_ROOM_TIMEZONE_UNSUPPORTED';
  end if;
  if exists (
    select 1 from public.schedules other_slot
    where other_slot.room_id = p_room and other_slot.id <> p_exclude
      and other_slot.status = 'ACTIVE'
      and other_slot.timezone <> p_timezone
      and greatest(p_first, other_slot.effective_from)
          <= least(p_last, coalesce(other_slot.effective_to, 'infinity'::date))
  ) then
    return 'SCHEDULE_ROOM_TIMEZONE_UNSUPPORTED';
  end if;

  if exists (
    select 1
    from public.schedules other_slot
    cross join lateral (
      select greatest(p_first, other_slot.effective_from) as overlap_from,
             least(p_last, coalesce(other_slot.effective_to, 'infinity'::date)) as overlap_to
    ) bounds
    where other_slot.room_id = p_room
      and other_slot.id <> p_exclude
      and other_slot.status = 'ACTIVE'
      and other_slot.day_of_week = p_day
      and other_slot.start_time < p_end
      and p_start < other_slot.end_time
      and bounds.overlap_from <= bounds.overlap_to
      and bounds.overlap_from + (
        (p_day::integer - extract(isodow from bounds.overlap_from)::integer + 7) % 7
      ) <= bounds.overlap_to
  ) then
    return 'SCHEDULE_ROOM_CONFLICT';
  end if;

  -- A moved regular session or makeup may use this room even when its source
  -- recurring schedule points elsewhere. Include those concrete bookings.
  if exists (
    select 1 from public.session_occurrences occurrence
    cross join lateral generate_series(
      (occurrence.starts_at at time zone 'Asia/Ho_Chi_Minh')::date,
      ((occurrence.ends_at - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh')::date,
      interval '1 day'
    ) as occupied_day(day)
    where occurrence.room_id = p_room
      and occurrence.status <> 'CANCELLED'
      and occurrence.ends_at > now()
      and not (
        occurrence.schedule_id = p_exclude
        and occurrence.occurrence_type = 'REGULAR'
        and occupied_day.day::date = coalesce(
          (occurrence.original_starts_at at time zone 'Asia/Ho_Chi_Minh')::date,
          occurrence.occurrence_date
        )
      )
      and occupied_day.day::date between p_first and p_last
      and extract(isodow from occupied_day.day)::smallint = p_day
      and occurrence.starts_at < ((occupied_day.day::date + p_end) at time zone 'Asia/Ho_Chi_Minh')
      and occurrence.ends_at > ((occupied_day.day::date + p_start) at time zone 'Asia/Ho_Chi_Minh')
  ) then
    return 'SCHEDULE_ROOM_CONFLICT';
  end if;
  return 'CLEAR';
end;
$$;
revoke all on function maintenance_private.schedule_room_conflict_code(uuid,uuid,smallint,time,time,date,date,text)
  from public, anon, authenticated, service_role;

create function maintenance_private.guard_schedule_room_booking()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  class_row public.classes%rowtype;
  room_row public.rooms%rowtype;
  first_day date;
  last_day date;
  conflict_code text;
  occupied integer;
  occurrence_room uuid;
begin
  if tg_op = 'UPDATE' and new.class_id is distinct from old.class_id then
    select * into class_row from public.classes where id = new.class_id for update;
    for occurrence_room in
      select distinct occurrence.room_id
      from public.session_occurrences occurrence
      where occurrence.schedule_id = new.id
        and occurrence.status <> 'CANCELLED'
        and occurrence.ends_at > now()
        and occurrence.room_id is not null
      order by occurrence.room_id
    loop
      select * into room_row from public.rooms where id = occurrence_room for update;
      if room_row.status <> 'ACTIVE'
        or room_row.branch_id is distinct from class_row.branch_id then
        raise exception 'OCCURRENCE_ROOM_UNAVAILABLE';
      end if;
      if room_row.capacity is null then
        raise exception 'OCCURRENCE_ROOM_CAPACITY_UNKNOWN';
      end if;
      if class_row.capacity > room_row.capacity and exists (
        select 1 from public.session_occurrences occurrence
        where occurrence.schedule_id = new.id
          and occurrence.room_id = occurrence_room
          and occurrence.occurrence_type = 'REGULAR'
          and occurrence.status <> 'CANCELLED'
          and occurrence.ends_at > now()
      ) then raise exception 'OCCURRENCE_ROOM_TOO_SMALL'; end if;
    end loop;
  end if;

  -- An unassigned schedule can remain a planning record. The existing
  -- enrollment guard does not permit an operational membership in it.
  if new.status <> 'ACTIVE' or new.room_id is null then
    return new;
  end if;

  -- All class/schedule/enrollment writes acquire class before room. Locking
  -- the stable room row serializes two requests that try to book an empty slot.
  select * into class_row from public.classes where id = new.class_id for update;
  if not found then raise exception 'SCHEDULE_CLASS_UNKNOWN'; end if;
  select * into room_row from public.rooms where id = new.room_id for update;
  if not found or room_row.status <> 'ACTIVE' or room_row.branch_id is distinct from class_row.branch_id then
    raise exception 'SCHEDULE_ROOM_UNAVAILABLE';
  end if;
  if room_row.capacity is null then
    raise exception 'SCHEDULE_ROOM_CAPACITY_UNKNOWN';
  end if;
  select count(*) into occupied from public.enrollments enrollment
  where enrollment.class_id = new.class_id
    and enrollment.status in ('ACTIVE', 'PAUSED');
  if class_row.capacity > room_row.capacity or occupied > room_row.capacity then
    raise exception 'SCHEDULE_ROOM_TOO_SMALL';
  end if;
  -- The occurrence generator currently uses schedule effective dates, so room
  -- booking must use those exact dates as well.
  first_day := new.effective_from;
  last_day := coalesce(new.effective_to, 'infinity'::date);
  conflict_code := maintenance_private.schedule_room_conflict_code(
    new.id, new.room_id, new.day_of_week, new.start_time, new.end_time,
    first_day, last_day, new.timezone
  );
  if conflict_code <> 'CLEAR' then raise exception '%', conflict_code; end if;
  return new;
end;
$$;
revoke all on function maintenance_private.guard_schedule_room_booking() from public, anon, authenticated, service_role;

create trigger trg_schedule_room_booking
before insert or update of class_id, room_id, day_of_week, start_time, end_time,
  effective_from, effective_to, timezone, status
on public.schedules
for each row execute function maintenance_private.guard_schedule_room_booking();

create function maintenance_private.guard_occurrence_room_booking()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  source_schedule public.schedules%rowtype;
  class_row public.classes%rowtype;
  room_row public.rooms%rowtype;
  occupied integer;
begin
  -- A historical session is a record, not a future physical reservation.
  if new.status = 'CANCELLED' or new.room_id is null or new.ends_at <= now() then return new; end if;

  -- A schedule may change class_id. Pin that row before choosing the class;
  -- then use the same class -> room lock order as enrollment and recurrence.
  select * into source_schedule from public.schedules where id = new.schedule_id for share;
  select * into class_row from public.classes where id = source_schedule.class_id for update;
  select * into room_row from public.rooms where id = new.room_id for update;
  if not found or room_row.status <> 'ACTIVE' or room_row.branch_id is distinct from class_row.branch_id then
    raise exception 'OCCURRENCE_ROOM_UNAVAILABLE';
  end if;
  if room_row.capacity is null then raise exception 'OCCURRENCE_ROOM_CAPACITY_UNKNOWN'; end if;
  if new.occurrence_type = 'MAKEUP' then
    select count(*) into occupied from public.session_occurrence_participants participant
    where participant.session_occurrence_id = new.id
      and participant.booking_status = 'ACTIVE';
  else
    select count(*) into occupied from public.enrollments enrollment
    where enrollment.class_id = class_row.id
      and enrollment.status in ('ACTIVE', 'PAUSED');
  end if;
  if (new.occurrence_type = 'REGULAR' and class_row.capacity > room_row.capacity)
    or occupied > room_row.capacity then
    raise exception 'OCCURRENCE_ROOM_TOO_SMALL';
  end if;
  if source_schedule.timezone <> 'Asia/Ho_Chi_Minh' then
    raise exception 'OCCURRENCE_ROOM_TIMEZONE_UNSUPPORTED';
  end if;

  if exists (
    select 1 from public.session_occurrences other_occurrence
    where other_occurrence.id <> new.id
      and other_occurrence.room_id = new.room_id
      and other_occurrence.status <> 'CANCELLED'
      and other_occurrence.starts_at < new.ends_at
      and new.starts_at < other_occurrence.ends_at
  ) then
    raise exception 'OCCURRENCE_ROOM_CONFLICT';
  end if;

  -- Materialized REGULAR rows replace their virtual recurring source slot;
  -- a MAKEUP does not. Check every local date touched by this occurrence so
  -- sessions crossing midnight cannot bypass the booking rule.
  if exists (
    select 1 from public.schedules recurring
    cross join lateral generate_series(
      (new.starts_at at time zone 'Asia/Ho_Chi_Minh')::date,
      ((new.ends_at - interval '1 microsecond') at time zone 'Asia/Ho_Chi_Minh')::date,
      interval '1 day'
    ) as occupied_day(day)
    where recurring.room_id = new.room_id
      and recurring.status = 'ACTIVE'
      and recurring.day_of_week = extract(isodow from occupied_day.day)::smallint
      and occupied_day.day::date between recurring.effective_from
        and coalesce(recurring.effective_to, 'infinity'::date)
      and (
        recurring.timezone <> 'Asia/Ho_Chi_Minh'
        or (
          ((occupied_day.day::date + recurring.start_time) at time zone 'Asia/Ho_Chi_Minh') < new.ends_at
          and new.starts_at < ((occupied_day.day::date + recurring.end_time) at time zone 'Asia/Ho_Chi_Minh')
        )
      )
      and not exists (
        select 1 from public.session_occurrences existing_regular
        where existing_regular.schedule_id = recurring.id
          and existing_regular.occurrence_type = 'REGULAR'
          and coalesce((existing_regular.original_starts_at at time zone 'Asia/Ho_Chi_Minh')::date,
                       existing_regular.occurrence_date) = occupied_day.day::date
      )
      and not (
        recurring.id = new.schedule_id
        and new.occurrence_type = 'REGULAR'
        and coalesce((new.original_starts_at at time zone 'Asia/Ho_Chi_Minh')::date,
                     new.occurrence_date) = occupied_day.day::date
      )
  ) then
    raise exception 'OCCURRENCE_ROOM_CONFLICT';
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.guard_occurrence_room_booking() from public, anon, authenticated, service_role;

create trigger trg_occurrence_room_booking
before insert or update of schedule_id, room_id, starts_at, ends_at, status, occurrence_type
on public.session_occurrences
for each row execute function maintenance_private.guard_occurrence_room_booking();

create function maintenance_private.guard_makeup_room_capacity()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  occurrence_row public.session_occurrences%rowtype;
  room_row public.rooms%rowtype;
  occupied integer;
begin
  if new.booking_status <> 'ACTIVE' then return new; end if;
  select * into occurrence_row from public.session_occurrences
  where id = new.session_occurrence_id for update;
  if occurrence_row.status = 'CANCELLED' or occurrence_row.room_id is null
    or occurrence_row.ends_at <= now() then return new; end if;
  select * into room_row from public.rooms where id = occurrence_row.room_id for update;
  if room_row.capacity is null then raise exception 'OCCURRENCE_ROOM_CAPACITY_UNKNOWN'; end if;
  select count(*) into occupied from public.session_occurrence_participants participant
  where participant.session_occurrence_id = new.session_occurrence_id
    and participant.id <> new.id
    and participant.booking_status = 'ACTIVE';
  if occupied >= room_row.capacity then raise exception 'OCCURRENCE_ROOM_FULL'; end if;
  return new;
end;
$$;
revoke all on function maintenance_private.guard_makeup_room_capacity() from public, anon, authenticated, service_role;

create trigger trg_makeup_room_capacity
before insert or update of session_occurrence_id, enrollment_id, booking_status
on public.session_occurrence_participants
for each row execute function maintenance_private.guard_makeup_room_capacity();

-- Changing configured capacity or availability must not silently invalidate
-- a room that an ACTIVE recurring schedule already uses.
create function maintenance_private.guard_room_schedule_configuration()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
begin
  if exists (
    select 1 from public.schedules schedule
    join public.classes class_row on class_row.id = schedule.class_id
    where schedule.room_id = new.id and schedule.status = 'ACTIVE'
      and (
        new.status <> 'ACTIVE'
        or new.branch_id is distinct from class_row.branch_id
        or new.capacity is null
        or class_row.capacity > new.capacity
        or (select count(*) from public.enrollments enrollment
            where enrollment.class_id = class_row.id
              and enrollment.status in ('ACTIVE', 'PAUSED')) > new.capacity
      )
  ) then
    raise exception 'SCHEDULE_ROOM_CONFIGURATION_CONFLICT';
  end if;
  if exists (
    select 1 from public.session_occurrences occurrence
    join public.schedules schedule on schedule.id = occurrence.schedule_id
    join public.classes class_row on class_row.id = schedule.class_id
    where occurrence.room_id = new.id
      and occurrence.status <> 'CANCELLED'
      and occurrence.ends_at > now()
      and (
        new.status <> 'ACTIVE'
        or new.branch_id is distinct from class_row.branch_id
        or new.capacity is null
        or case when occurrence.occurrence_type = 'MAKEUP' then
          (select count(*) from public.session_occurrence_participants participant
           where participant.session_occurrence_id = occurrence.id
             and participant.booking_status = 'ACTIVE') > new.capacity
          else class_row.capacity > new.capacity
            or (select count(*) from public.enrollments enrollment
                where enrollment.class_id = class_row.id
                  and enrollment.status in ('ACTIVE', 'PAUSED')) > new.capacity
          end
      )
  ) then
    raise exception 'OCCURRENCE_ROOM_CONFIGURATION_CONFLICT';
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.guard_room_schedule_configuration() from public, anon, authenticated, service_role;

create trigger trg_room_schedule_configuration
before update of branch_id, capacity, status on public.rooms
for each row execute function maintenance_private.guard_room_schedule_configuration();

create function maintenance_private.guard_class_room_capacity()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  selected_room uuid;
  room_row public.rooms%rowtype;
begin
  if new.capacity < old.capacity and new.capacity < (
    select count(*) from public.enrollments enrollment
    where enrollment.class_id = new.id and enrollment.status in ('ACTIVE', 'PAUSED')
  ) then
    raise exception 'PLACEMENT_CLASS_CAPACITY_BELOW_OCCUPANCY';
  end if;
  for selected_room in
    select room_id from (
      select schedule.room_id
      from public.schedules schedule
      where schedule.class_id = new.id
        and schedule.status = 'ACTIVE'
        and schedule.room_id is not null
      union
      select occurrence.room_id
      from public.session_occurrences occurrence
      join public.schedules schedule on schedule.id = occurrence.schedule_id
      where schedule.class_id = new.id
        and occurrence.occurrence_type = 'REGULAR'
        and occurrence.status <> 'CANCELLED'
        and occurrence.ends_at > now()
        and occurrence.room_id is not null
    ) booked_rooms
    order by room_id
  loop
    select * into room_row from public.rooms where id = selected_room for update;
    if room_row.status <> 'ACTIVE' or room_row.branch_id is distinct from new.branch_id then
      raise exception 'SCHEDULE_ROOM_UNAVAILABLE';
    end if;
    if room_row.capacity is null then
      raise exception 'SCHEDULE_ROOM_CAPACITY_UNKNOWN';
    end if;
    if new.capacity > room_row.capacity or
       (select count(*) from public.enrollments enrollment
        where enrollment.class_id = new.id
          and enrollment.status in ('ACTIVE', 'PAUSED')) > room_row.capacity then
      raise exception 'SCHEDULE_ROOM_TOO_SMALL';
    end if;
  end loop;
  if exists (
    select 1 from public.session_occurrences occurrence
    join public.schedules schedule on schedule.id = occurrence.schedule_id
    join public.rooms makeup_room on makeup_room.id = occurrence.room_id
    where schedule.class_id = new.id
      and occurrence.occurrence_type = 'MAKEUP'
      and occurrence.status <> 'CANCELLED'
      and occurrence.ends_at > now()
      and (makeup_room.status <> 'ACTIVE' or makeup_room.branch_id is distinct from new.branch_id)
  ) then raise exception 'OCCURRENCE_ROOM_UNAVAILABLE'; end if;
  return new;
end;
$$;
revoke all on function maintenance_private.guard_class_room_capacity() from public, anon, authenticated, service_role;

create trigger trg_class_room_capacity
before update of capacity, branch_id, status on public.classes
for each row execute function maintenance_private.guard_class_room_capacity();

-- The pre-existing placement trigger locks the class and student and checks
-- class capacity; the partial unique index guarantees one live membership per
-- student/class. This extra guard locks every assigned room and checks the
-- configured room capacity in the same enrollment transaction.
create function maintenance_private.guard_enrollment_room_capacity()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  selected_room uuid;
  room_row public.rooms%rowtype;
  class_branch uuid;
  occupied integer;
begin
  if new.status not in ('ACTIVE', 'PAUSED') then return new; end if;
  if tg_op = 'UPDATE'
    and (new.class_id, new.student_id, new.status, new.started_at, new.ended_at)
      is not distinct from
      (old.class_id, old.student_id, old.status, old.started_at, old.ended_at)
  then return new; end if;

  select branch_id into class_branch from public.classes where id = new.class_id for update;
  select count(*) into occupied from public.enrollments existing
  where existing.class_id = new.class_id
    and existing.id <> new.id
    and existing.status in ('ACTIVE', 'PAUSED');

  for selected_room in
    select room_id from (
      select schedule.room_id from public.schedules schedule
      where schedule.class_id = new.class_id and schedule.status = 'ACTIVE'
        and schedule.room_id is not null
      union
      select occurrence.room_id from public.session_occurrences occurrence
      join public.schedules schedule on schedule.id = occurrence.schedule_id
      where schedule.class_id = new.class_id
        and occurrence.occurrence_type = 'REGULAR'
        and occurrence.status <> 'CANCELLED'
        and occurrence.ends_at > now()
        and occurrence.room_id is not null
    ) booked_rooms
    order by room_id
  loop
    select * into room_row from public.rooms where id = selected_room for update;
    if room_row.status <> 'ACTIVE' or room_row.branch_id is distinct from class_branch then
      raise exception 'PLACEMENT_ROOM_UNAVAILABLE';
    end if;
    if room_row.capacity is null then
      raise exception 'PLACEMENT_ROOM_CAPACITY_UNKNOWN';
    end if;
    if occupied >= room_row.capacity then
      raise exception 'PLACEMENT_ROOM_FULL';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function maintenance_private.guard_enrollment_room_capacity() from public, anon, authenticated, service_role;

create trigger trg_room_capacity_enrollment_guard
before insert or update of class_id, student_id, status, started_at, ended_at
on public.enrollments
for each row execute function maintenance_private.guard_enrollment_room_capacity();

commit;
