-- =========================================================
-- VIBE ACADEMY
-- Reschedule & Makeup Phase 1: data foundation
-- =========================================================

-- A reschedule updates the concrete starts_at, ends_at and room_id
-- while occurrence_date and the original snapshot stay unchanged.
-- A makeup is a separate occurrence linked to a regular source
-- occurrence and has an explicit enrollment roster.

alter table public.session_occurrences
  add column occurrence_type text not null
    default 'REGULAR'
    check (
      occurrence_type in (
        'REGULAR',
        'MAKEUP'
      )
    ),

  add column source_occurrence_id uuid
    references public.session_occurrences(id)
    on delete restrict,

  add column original_starts_at timestamptz,
  add column original_ends_at timestamptz,

  add column original_room_id uuid
    references public.rooms(id)
    on delete restrict,

  add column rescheduled_at timestamptz,

  add column rescheduled_by uuid
    references auth.users(id)
    on delete set null,

  add column reschedule_reason text,

  add constraint session_occurrences_type_source_check
    check (
      (
        occurrence_type = 'REGULAR'
        and source_occurrence_id is null
      )
      or
      (
        occurrence_type = 'MAKEUP'
        and source_occurrence_id is not null
      )
    ),

  add constraint session_occurrences_source_not_self_check
    check (
      source_occurrence_id is null
      or source_occurrence_id <> id
    );

update public.session_occurrences
set
  original_starts_at = starts_at,
  original_ends_at = ends_at,
  original_room_id = room_id;

alter table public.session_occurrences
  alter column original_starts_at set not null,
  alter column original_ends_at set not null;


-- Preserve the original snapshot and validate makeup lineage.
create or replace function
  public.prepare_session_occurrence_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text;
  v_source_class_id uuid;
  v_occurrence_class_id uuid;
begin
  if tg_op = 'INSERT' then
    new.original_starts_at := coalesce(
      new.original_starts_at,
      new.starts_at
    );

    new.original_ends_at := coalesce(
      new.original_ends_at,
      new.ends_at
    );

    if new.original_room_id is null then
      new.original_room_id := new.room_id;
    end if;
  else
    new.original_starts_at :=
      old.original_starts_at;

    new.original_ends_at :=
      old.original_ends_at;

    new.original_room_id :=
      old.original_room_id;
  end if;

  if new.occurrence_type = 'MAKEUP' then
    select
      source.occurrence_type,
      source_schedule.class_id
    into
      v_source_type,
      v_source_class_id
    from public.session_occurrences as source
    join public.schedules as source_schedule
      on source_schedule.id = source.schedule_id
    where source.id = new.source_occurrence_id;

    if v_source_type is distinct from 'REGULAR' then
      raise exception
        'A makeup session must reference a regular source occurrence';
    end if;

    select schedule.class_id
    into v_occurrence_class_id
    from public.schedules as schedule
    where schedule.id = new.schedule_id;

    if v_source_class_id is distinct from
      v_occurrence_class_id
    then
      raise exception
        'A makeup session must belong to the source occurrence class';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_prepare_session_occurrence_identity
before insert or update of
  schedule_id,
  occurrence_type,
  source_occurrence_id,
  original_starts_at,
  original_ends_at,
  original_room_id
on public.session_occurrences
for each row
execute function
  public.prepare_session_occurrence_identity();


-- Regular generated sessions remain unique. Makeup sessions may share
-- a date with a regular session or with another individual makeup.
alter table public.session_occurrences
  drop constraint
    session_occurrences_schedule_date_key;

create unique index
  session_occurrences_regular_schedule_date_key
on public.session_occurrences(
  schedule_id,
  occurrence_date
)
where occurrence_type = 'REGULAR';

create index session_occurrences_type_idx
  on public.session_occurrences(occurrence_type);

create index session_occurrences_source_idx
  on public.session_occurrences(source_occurrence_id);


-- =========================================================
-- MAKEUP PARTICIPANTS
-- =========================================================

create table public.session_occurrence_participants (
  id uuid primary key default gen_random_uuid(),

  session_occurrence_id uuid not null
    references public.session_occurrences(id)
    on delete restrict,

  enrollment_id uuid not null
    references public.enrollments(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  constraint session_occurrence_participants_key
    unique (
      session_occurrence_id,
      enrollment_id
    )
);

create index
  session_occurrence_participants_enrollment_idx
on public.session_occurrence_participants(
  enrollment_id
);


create or replace function
  public.validate_makeup_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence_type text;
  v_occurrence_class_id uuid;
  v_enrollment_class_id uuid;
begin
  select
    occurrence.occurrence_type,
    schedule.class_id
  into
    v_occurrence_type,
    v_occurrence_class_id
  from public.session_occurrences as occurrence
  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

  if v_occurrence_type is distinct from 'MAKEUP' then
    raise exception
      'Explicit participants are only allowed for makeup sessions';
  end if;

  select enrollment.class_id
  into v_enrollment_class_id
  from public.enrollments as enrollment
  where enrollment.id = new.enrollment_id;

  if v_occurrence_class_id is distinct from
    v_enrollment_class_id
  then
    raise exception
      'Makeup participant must belong to the occurrence class';
  end if;

  return new;
end;
$$;

create trigger trg_validate_makeup_participant
before insert or update of
  session_occurrence_id,
  enrollment_id
on public.session_occurrence_participants
for each row
execute function
  public.validate_makeup_participant();


create or replace function
  public.prevent_attended_makeup_participant_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.attendance_records
    where session_occurrence_id =
        old.session_occurrence_id
      and enrollment_id = old.enrollment_id
  ) then
    raise exception
      'A makeup participant with attendance cannot be removed';
  end if;

  return old;
end;
$$;

create trigger
  trg_prevent_attended_makeup_participant_delete
before delete
on public.session_occurrence_participants
for each row
execute function
  public.prevent_attended_makeup_participant_delete();


alter table public.session_occurrence_participants
  enable row level security;

create policy
  "super_admin_manage_session_occurrence_participants"
on public.session_occurrence_participants
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);


-- =========================================================
-- REGULAR OCCURRENCE GENERATOR
-- =========================================================

create or replace function public.generate_session_occurrences(
  p_from date,
  p_to date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inserted_count integer;
begin
  if p_from is null or p_to is null then
    raise exception 'Generation date range is required';
  end if;

  if p_to < p_from then
    raise exception 'Generation end date cannot be before start date';
  end if;

  if p_to - p_from > 366 then
    raise exception 'Generation date range cannot exceed 366 days';
  end if;

  insert into public.session_occurrences (
    schedule_id,
    occurrence_date,
    starts_at,
    ends_at,
    room_id,
    status,
    occurrence_type
  )
  select
    schedule.id,
    generated.occurrence_date,
    (
      generated.occurrence_date
      + schedule.start_time
    ) at time zone schedule.timezone,
    (
      generated.occurrence_date
      + schedule.end_time
    ) at time zone schedule.timezone,
    schedule.room_id,
    'SCHEDULED',
    'REGULAR'
  from public.schedules as schedule
  cross join lateral (
    select generated_at::date as occurrence_date
    from generate_series(
      greatest(
        p_from,
        schedule.effective_from
      )::timestamp,
      least(
        p_to,
        coalesce(schedule.effective_to, p_to)
      )::timestamp,
      interval '1 day'
    ) as generated_at
  ) as generated
  where schedule.status = 'ACTIVE'
    and schedule.effective_from <= p_to
    and (
      schedule.effective_to is null
      or schedule.effective_to >= p_from
    )
    and extract(
      isodow from generated.occurrence_date
    )::smallint = schedule.day_of_week
  on conflict (
    schedule_id,
    occurrence_date
  ) where occurrence_type = 'REGULAR'
  do nothing;

  get diagnostics
    v_inserted_count = row_count;

  return v_inserted_count;
end;
$$;


-- =========================================================
-- ATTENDANCE VALIDATION
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
  v_enrollment_class_id uuid;
begin
  select
    schedule.class_id,
    occurrence.status,
    occurrence.occurrence_type
  into
    v_occurrence_class_id,
    v_occurrence_status,
    v_occurrence_type
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

  if
    v_occurrence_type = 'MAKEUP'
    and not exists (
      select 1
      from public.session_occurrence_participants
      where session_occurrence_id =
          new.session_occurrence_id
        and enrollment_id = new.enrollment_id
    )
  then
    raise exception
      'Attendance enrollment must be a makeup participant';
  end if;

  return new;
end;
$$;


-- =========================================================
-- STATUS COMPLETION VALIDATION
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
    else
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
    end if;

    if v_attendance_count <> v_roster_count then
      raise exception
        'All students in the session roster must be marked before completion';
    end if;
  end if;

  return new;
end;
$$;
