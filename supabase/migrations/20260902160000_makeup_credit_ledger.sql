-- =========================================================
-- VIBE ACADEMY
-- Makeup Credit Ledger Phase 1
-- =========================================================
--
-- Business rules:
-- - PRESENT -> no makeup credit
-- - ABSENT  -> no automatic makeup credit
-- - LATE    -> no makeup credit
-- - EXCUSED -> one makeup credit
-- - A cancelled REGULAR session may grant one credit to each
--   eligible enrollment.
--
-- Credit lifecycle:
-- AVAILABLE -> RESERVED -> USED
-- RESERVED  -> AVAILABLE when the makeup session is cancelled
-- AVAILABLE -> CANCELLED when the entitlement is revoked
--
-- One enrollment can receive at most one credit from one
-- source occurrence.
-- =========================================================


create table public.makeup_credits (
  id uuid primary key default gen_random_uuid(),

  enrollment_id uuid not null
    references public.enrollments(id)
    on delete restrict,

  source_occurrence_id uuid not null
    references public.session_occurrences(id)
    on delete restrict,

  source_attendance_record_id uuid
    references public.attendance_records(id)
    on delete restrict,

  source_reason text not null
    check (
      source_reason in (
        'EXCUSED',
        'SESSION_CANCELLED'
      )
    ),

  status text not null default 'AVAILABLE'
    check (
      status in (
        'AVAILABLE',
        'RESERVED',
        'USED',
        'CANCELLED'
      )
    ),

  reserved_occurrence_id uuid
    references public.session_occurrences(id)
    on delete restrict,

  reserved_at timestamptz,
  used_at timestamptz,
  cancelled_at timestamptz,

  notes text,

  created_by uuid default auth.uid()
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint makeup_credits_source_enrollment_key
    unique (
      source_occurrence_id,
      enrollment_id
    ),

  constraint makeup_credits_excused_attendance_check
    check (
      (
        source_reason = 'EXCUSED'
        and source_attendance_record_id is not null
      )
      or
      (
        source_reason = 'SESSION_CANCELLED'
        and source_attendance_record_id is null
      )
    ),

  constraint makeup_credits_reservation_state_check
    check (
      (
        status = 'AVAILABLE'
        and reserved_occurrence_id is null
        and reserved_at is null
        and used_at is null
        and cancelled_at is null
      )
      or
      (
        status = 'RESERVED'
        and reserved_occurrence_id is not null
        and reserved_at is not null
        and used_at is null
        and cancelled_at is null
      )
      or
      (
        status = 'USED'
        and reserved_occurrence_id is not null
        and reserved_at is not null
        and used_at is not null
        and cancelled_at is null
      )
      or
      (
        status = 'CANCELLED'
        and reserved_occurrence_id is null
        and used_at is null
        and cancelled_at is not null
      )
    )
);


create unique index
  makeup_credits_source_attendance_key
on public.makeup_credits(source_attendance_record_id)
where source_attendance_record_id is not null;


create index makeup_credits_enrollment_status_idx
  on public.makeup_credits(
    enrollment_id,
    status
  );


create index makeup_credits_source_occurrence_idx
  on public.makeup_credits(source_occurrence_id);


create index makeup_credits_reserved_occurrence_idx
  on public.makeup_credits(reserved_occurrence_id)
where reserved_occurrence_id is not null;


create trigger trg_makeup_credits_updated_at
before update on public.makeup_credits
for each row
execute function public.set_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.makeup_credits
  enable row level security;


create policy "super_admin_manage_makeup_credits"
on public.makeup_credits
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);
-- =========================================================
-- SESSION STATUS -> MAKEUP CREDIT AUTOMATION
-- =========================================================


-- Protect ledger integrity when an already-finalized source
-- session is reopened.
create or replace function
  public.guard_makeup_credit_session_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  -- A regular source session may only be reopened while all
  -- credits created from it are still unused/unreserved.
  if
    old.occurrence_type = 'REGULAR'
    and old.status in ('COMPLETED', 'CANCELLED')
    and new.status = 'SCHEDULED'
    and exists (
      select 1
      from public.makeup_credits
      where source_occurrence_id = old.id
        and status in ('RESERVED', 'USED')
    )
  then
    raise exception
      'Cannot reopen a source session while its makeup credit is reserved or used';
  end if;

  -- Keep makeup sessions terminal once finalized.
  -- This avoids reopening a makeup after its credit has already
  -- been consumed or released.
  if
    old.occurrence_type = 'MAKEUP'
    and old.status in ('COMPLETED', 'CANCELLED')
    and new.status = 'SCHEDULED'
  then
    raise exception
      'Completed or cancelled makeup sessions cannot be reopened';
  end if;

  return new;
end;
$$;


create trigger trg_guard_makeup_credit_session_status
before update of status
on public.session_occurrences
for each row
execute function
  public.guard_makeup_credit_session_status();



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


  -- =======================================================
  -- REGULAR SESSION COMPLETED
  -- EXCUSED students receive exactly one credit.
  -- =======================================================

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
    from public.attendance_records as attendance
    where attendance.session_occurrence_id = new.id
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
      in ('AVAILABLE', 'CANCELLED');

    return new;
  end if;


  -- =======================================================
  -- REGULAR SESSION CANCELLED BY SCHOOL / TEACHER
  -- Every student who belonged to that dated roster receives
  -- one credit.
  -- =======================================================

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
      on enrollment.class_id = schedule.class_id
    where schedule.id = new.schedule_id
      and coalesce(
        enrollment.started_at,
        enrollment.enrolled_at
      ) <= new.occurrence_date
      and (
        enrollment.ended_at is null
        or enrollment.ended_at >= new.occurrence_date
      )

    on conflict (
      source_occurrence_id,
      enrollment_id
    )
    do update
    set
      source_attendance_record_id = null,

      source_reason = 'SESSION_CANCELLED',

      status = 'AVAILABLE',

      reserved_occurrence_id = null,
      reserved_at = null,
      used_at = null,
      cancelled_at = null

    where public.makeup_credits.status
      in ('AVAILABLE', 'CANCELLED');

    return new;
  end if;


  -- =======================================================
  -- REGULAR SESSION REOPENED
  -- Any unused credits from that source become cancelled.
  -- RESERVED / USED were blocked by the BEFORE trigger.
  -- =======================================================

  if
    new.occurrence_type = 'REGULAR'
    and new.status = 'SCHEDULED'
    and old.status in ('COMPLETED', 'CANCELLED')
  then
    update public.makeup_credits
    set
      status = 'CANCELLED',
      reserved_occurrence_id = null,
      reserved_at = null,
      used_at = null,
      cancelled_at = now()
    where source_occurrence_id = new.id
      and status = 'AVAILABLE';

    return new;
  end if;


  -- =======================================================
  -- MAKEUP SESSION COMPLETED
  -- Reserved credit is consumed even if the student was absent
  -- from the makeup itself.
  -- =======================================================

  if
    new.occurrence_type = 'MAKEUP'
    and new.status = 'COMPLETED'
  then
    update public.makeup_credits
    set
      status = 'USED',
      used_at = now()
    where reserved_occurrence_id = new.id
      and status = 'RESERVED';

    return new;
  end if;


  -- =======================================================
  -- MAKEUP SESSION CANCELLED BY VIBE
  -- Return the credit to the student.
  -- =======================================================

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
    where reserved_occurrence_id = new.id
      and status = 'RESERVED';

    return new;
  end if;


  return new;
end;
$$;


create trigger trg_sync_makeup_credits_from_session_status
after update of status
on public.session_occurrences
for each row
execute function
  public.sync_makeup_credits_from_session_status();
  -- =========================================================
-- ATTENDANCE IMMUTABILITY AFTER SESSION FINALIZATION
-- =========================================================

create or replace function
  public.guard_attendance_mutation_for_finalized_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence_id uuid;
  v_occurrence_status text;
begin

  -- Attendance identity is immutable.
  -- A record always belongs to the same dated session
  -- and the same enrollment.
  if tg_op = 'UPDATE' then

    if
      new.session_occurrence_id
        is distinct from old.session_occurrence_id
      or new.enrollment_id
        is distinct from old.enrollment_id
    then
      raise exception
        'Attendance record identity cannot be changed';
    end if;

  end if;


  if tg_op = 'DELETE' then
    v_occurrence_id :=
      old.session_occurrence_id;
  else
    v_occurrence_id :=
      new.session_occurrence_id;
  end if;


  select status
  into v_occurrence_status
  from public.session_occurrences
  where id = v_occurrence_id;


  if v_occurrence_status is null then
    raise exception
      'Session occurrence not found';
  end if;


  if v_occurrence_status <> 'SCHEDULED' then
    raise exception
      'Attendance can only be changed while the session is scheduled';
  end if;


  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


create trigger trg_zz_guard_attendance_mutation_for_finalized_session
before insert or update or delete
on public.attendance_records
for each row
execute function
  public.guard_attendance_mutation_for_finalized_session();
  -- =========================================================
-- MAKEUP PARTICIPANT <-> CREDIT RESERVATION
-- Supports combining credits from different source sessions.
-- =========================================================


alter table public.session_occurrence_participants
  add column makeup_credit_id uuid
    references public.makeup_credits(id)
    on delete restrict;


create unique index
  session_occurrence_participants_credit_idx
on public.session_occurrence_participants(
  makeup_credit_id
)
where makeup_credit_id is not null;



-- Participant identity should never be silently changed.
create or replace function
  public.guard_makeup_participant_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if
    new.session_occurrence_id
      is distinct from old.session_occurrence_id
    or new.enrollment_id
      is distinct from old.enrollment_id
    or new.makeup_credit_id
      is distinct from old.makeup_credit_id
  then
    raise exception
      'Makeup participant identity cannot be changed';
  end if;

  return new;
end;
$$;


create trigger trg_guard_makeup_participant_identity_change
before update of
  session_occurrence_id,
  enrollment_id,
  makeup_credit_id
on public.session_occurrence_participants
for each row
execute function
  public.guard_makeup_participant_identity_change();



-- Reserve the oldest AVAILABLE credit belonging to this
-- enrollment and this makeup class.
--
-- The credit may come from ANY earlier eligible source
-- occurrence of the same class.
create or replace function
  public.reserve_makeup_credit_for_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence_type text;
  v_occurrence_status text;
  v_makeup_class_id uuid;

  v_credit_id uuid;
begin
  select
    occurrence.occurrence_type,
    occurrence.status,
    schedule.class_id
  into
    v_occurrence_type,
    v_occurrence_status,
    v_makeup_class_id
  from public.session_occurrences as occurrence
  join public.schedules as schedule
    on schedule.id = occurrence.schedule_id
  where occurrence.id =
    new.session_occurrence_id;


  if v_occurrence_type is distinct from 'MAKEUP' then
    raise exception
      'Makeup credit can only be reserved for a makeup session';
  end if;


  if v_occurrence_status is distinct from 'SCHEDULED' then
    raise exception
      'Students can only be added to a scheduled makeup session';
  end if;


  -- FIFO:
  -- if a student has multiple makeup credits,
  -- use the oldest entitlement first.
  select credit.id
  into v_credit_id
  from public.makeup_credits as credit

  join public.session_occurrences
    as source_occurrence
    on source_occurrence.id =
      credit.source_occurrence_id

  join public.schedules
    as source_schedule
    on source_schedule.id =
      source_occurrence.schedule_id

  where credit.enrollment_id =
      new.enrollment_id

    and credit.status = 'AVAILABLE'

    and source_schedule.class_id =
      v_makeup_class_id

  order by
    source_occurrence.occurrence_date,
    credit.created_at,
    credit.id

  for update of credit
  skip locked

  limit 1;


  if v_credit_id is null then
    raise exception
      'Selected student does not have an available makeup credit for this class';
  end if;


  update public.makeup_credits
  set
    status = 'RESERVED',

    reserved_occurrence_id =
      new.session_occurrence_id,

    reserved_at = now(),

    used_at = null,
    cancelled_at = null

  where id = v_credit_id
    and status = 'AVAILABLE';


  if not found then
    raise exception
      'Makeup credit is no longer available';
  end if;


  new.makeup_credit_id := v_credit_id;

  return new;
end;
$$;


create trigger trg_zz_reserve_makeup_credit_for_participant
before insert
on public.session_occurrence_participants
for each row
execute function
  public.reserve_makeup_credit_for_participant();



-- Removing a participant from a still-scheduled makeup
-- returns that reserved credit.
create or replace function
  public.release_makeup_credit_for_removed_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.makeup_credit_id is not null then

    update public.makeup_credits
    set
      status = 'AVAILABLE',

      reserved_occurrence_id = null,
      reserved_at = null,
      used_at = null,
      cancelled_at = null

    where id = old.makeup_credit_id

      and reserved_occurrence_id =
        old.session_occurrence_id

      and status = 'RESERVED';

  end if;

  return old;
end;
$$;


create trigger trg_release_makeup_credit_for_removed_participant
after delete
on public.session_occurrence_participants
for each row
execute function
  public.release_makeup_credit_for_removed_participant();
  -- =========================================================
-- CREATE MAKEUP SESSION V2
-- Supports participants whose credits come from different
-- source occurrences of the same class.
-- =========================================================

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

  -- =======================================================
  -- BASIC INPUT VALIDATION
  -- =======================================================

  if p_starts_at is null or p_ends_at is null then
    raise exception
      'Session start and end time are required';
  end if;

  if p_ends_at <= p_starts_at then
    raise exception
      'End time must be after start time';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception
      'Makeup reason is required';
  end if;

  if coalesce(cardinality(p_enrollment_ids), 0) = 0 then
    raise exception
      'At least one makeup participant is required';
  end if;

  if exists (
    select 1
    from unnest(p_enrollment_ids)
      as participant(enrollment_id)
    where participant.enrollment_id is null
  ) then
    raise exception
      'Makeup participant is required';
  end if;


  select
    count(
      distinct participant.enrollment_id
    )::integer
  into v_participant_count
  from unnest(p_enrollment_ids)
    as participant(enrollment_id);


  if v_participant_count <>
    cardinality(p_enrollment_ids)
  then
    raise exception
      'Makeup participants must be unique';
  end if;


  -- =======================================================
  -- ANCHOR SESSION
  -- The anchor identifies the class.
  -- Individual credit lineage is stored per participant.
  -- =======================================================

  select
    occurrence.schedule_id,
    occurrence.status,
    occurrence.occurrence_type,
    schedule.class_id,
    class.branch_id,
    schedule.timezone
  into
    v_source_schedule_id,
    v_source_status,
    v_source_type,
    v_class_id,
    v_branch_id,
    v_timezone
  from public.session_occurrences
    as occurrence

  join public.schedules
    as schedule
    on schedule.id =
      occurrence.schedule_id

  join public.classes
    as class
    on class.id =
      schedule.class_id

  where occurrence.id =
    p_source_occurrence_id

  for update of occurrence;


  if v_source_schedule_id is null then
    raise exception
      'Source session not found';
  end if;


  if v_source_type <> 'REGULAR' then
    raise exception
      'A makeup session must reference a regular source occurrence';
  end if;


  if v_source_status not in (
    'COMPLETED',
    'CANCELLED'
  ) then
    raise exception
      'A makeup session requires a completed or cancelled source session';
  end if;


  -- =======================================================
  -- PARTICIPANTS
  -- They only need to belong to this class.
  --
  -- Their actual entitlement will be checked atomically by
  -- trg_zz_reserve_makeup_credit_for_participant.
  -- =======================================================

  if exists (
    select 1
    from unnest(p_enrollment_ids)
      as participant(enrollment_id)

    left join public.enrollments
      as enrollment
      on enrollment.id =
        participant.enrollment_id

    where enrollment.id is null
      or enrollment.class_id
        is distinct from v_class_id
  ) then
    raise exception
      'Every makeup participant must belong to the makeup class';
  end if;


  -- =======================================================
  -- ROOM
  -- =======================================================

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
      raise exception
        'Room is not available';
    end if;


    if v_room_branch_id
      is distinct from v_branch_id
    then
      raise exception
        'Room must belong to the same branch as the class';
    end if;

  end if;


  v_makeup_date :=
    (p_starts_at at time zone v_timezone)::date;


  -- =======================================================
  -- CLASS CONFLICT
  -- =======================================================

  if exists (
    select 1
    from public.session_occurrences
      as other_occurrence

    join public.schedules
      as other_schedule
      on other_schedule.id =
        other_occurrence.schedule_id

    where other_occurrence.status <>
        'CANCELLED'

      and other_schedule.class_id =
        v_class_id

      and other_occurrence.starts_at <
        p_ends_at

      and other_occurrence.ends_at >
        p_starts_at
  ) then
    raise exception
      'This class already has an overlapping session';
  end if;


  -- =======================================================
  -- ROOM CONFLICT
  -- =======================================================

  if
    p_room_id is not null
    and exists (
      select 1
      from public.session_occurrences
        as other_occurrence

      where other_occurrence.status <>
          'CANCELLED'

        and other_occurrence.room_id =
          p_room_id

        and other_occurrence.starts_at <
          p_ends_at

        and other_occurrence.ends_at >
          p_starts_at
    )
  then
    raise exception
      'This room is already occupied during that time';
  end if;


  -- =======================================================
  -- TEACHER CONFLICT
  -- =======================================================

  if exists (
    select 1

    from public.class_teachers
      as current_assignment

    join public.class_teachers
      as other_assignment
      on other_assignment.teacher_id =
        current_assignment.teacher_id

      and other_assignment.class_id <>
        current_assignment.class_id

    join public.schedules
      as other_schedule
      on other_schedule.class_id =
        other_assignment.class_id

    join public.session_occurrences
      as other_occurrence
      on other_occurrence.schedule_id =
        other_schedule.id

    where current_assignment.class_id =
        v_class_id

      and current_assignment.is_active =
        true

      and current_assignment.assigned_at <=
        v_makeup_date

      and (
        current_assignment.ended_at is null
        or current_assignment.ended_at >=
          v_makeup_date
      )

      and other_assignment.is_active =
        true

      and other_assignment.assigned_at <=
        v_makeup_date

      and (
        other_assignment.ended_at is null
        or other_assignment.ended_at >=
          v_makeup_date
      )

      and other_occurrence.status <>
        'CANCELLED'

      and other_occurrence.starts_at <
        p_ends_at

      and other_occurrence.ends_at >
        p_starts_at
  ) then
    raise exception
      'A teacher assigned to this class is already teaching another class at that time';
  end if;


  -- =======================================================
  -- CREATE MAKEUP SESSION
  -- =======================================================

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


  -- Each INSERT below triggers credit reservation.
  --
  -- If even one student has no AVAILABLE credit,
  -- PostgreSQL rolls back the whole transaction.
  insert into
    public.session_occurrence_participants (
      session_occurrence_id,
      enrollment_id
    )
  select
    v_result,
    participant.enrollment_id
  from unnest(p_enrollment_ids)
    as participant(enrollment_id);


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
