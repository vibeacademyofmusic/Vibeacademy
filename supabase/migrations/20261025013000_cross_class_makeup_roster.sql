-- A makeup booking from another class is a real occupied seat when the
-- destination class accepts that student's program. The week board, attendance
-- roster and attendance write all use these functions. Omitting the guest
-- while still publishing a headcount is not allowed.

create or replace function public.validate_makeup_participant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_occurrence_type text;
  v_occurrence_class_id uuid;
  v_enrollment_class_id uuid;
  v_student_id uuid;
begin
  select occurrence.occurrence_type, schedule.class_id
  into v_occurrence_type, v_occurrence_class_id
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

  if v_occurrence_type is distinct from 'MAKEUP' then
    raise exception 'Explicit participants are only allowed for makeup sessions';
  end if;

  select enrollment.class_id, enrollment.student_id
  into v_enrollment_class_id, v_student_id
  from public.enrollments enrollment
  where enrollment.id = new.enrollment_id;

  if v_occurrence_class_id is distinct from v_enrollment_class_id
    and public.class_enrollment_compatibility(v_occurrence_class_id, v_student_id) is distinct from 'IN_SCOPE'
  then
    raise exception 'Makeup participant must belong to the occurrence class or a compatible program';
  end if;

  return new;
end;
$$;

create or replace function public.session_teaching_roster(p_session uuid)
returns table(enrollment_id uuid, student_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.student_id
  from public.session_occurrences o
  join public.schedules sc on sc.id = o.schedule_id
  join public.enrollments e on true
  where o.id = p_session
    and (
      (
        o.occurrence_type = 'REGULAR'
        and e.class_id = sc.class_id
        and e.started_at <= o.occurrence_date
        and (e.ended_at is null or e.ended_at >= o.occurrence_date)
        and not public.is_enrollment_paused_on(e.id, o.occurrence_date)
      )
      or exists (
        select 1
        from public.session_occurrence_participants p
        where p.session_occurrence_id = o.id
          and p.enrollment_id = e.id
          and p.booking_status in ('ACTIVE', 'RELEASED')
          and (
            o.occurrence_type = 'MAKEUP'
            or e.class_id is distinct from sc.class_id
          )
      )
    )
$$;

create or replace function public.validate_attendance_record_class()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_occurrence_class_id uuid;
  v_occurrence_status text;
  v_occurrence_type text;
  v_occurrence_date date;
  v_enrollment_class_id uuid;
  v_enrollment_student_id uuid;
  v_enrollment_started_at date;
  v_enrollment_ended_at date;
begin
  select schedule.class_id, occurrence.status, occurrence.occurrence_type, occurrence.occurrence_date
  into v_occurrence_class_id, v_occurrence_status, v_occurrence_type, v_occurrence_date
  from public.session_occurrences occurrence
  join public.schedules schedule on schedule.id = occurrence.schedule_id
  where occurrence.id = new.session_occurrence_id;

  if v_occurrence_status = 'CANCELLED' then
    raise exception 'Attendance cannot be recorded for a cancelled session';
  end if;

  select enrollment.class_id, enrollment.student_id, enrollment.started_at, enrollment.ended_at
  into v_enrollment_class_id, v_enrollment_student_id, v_enrollment_started_at, v_enrollment_ended_at
  from public.enrollments enrollment
  where enrollment.id = new.enrollment_id;

  if v_occurrence_class_id is distinct from v_enrollment_class_id
    and not (
      exists (
        select 1 from public.session_occurrence_participants participant
        where participant.session_occurrence_id = new.session_occurrence_id
          and participant.enrollment_id = new.enrollment_id
          and participant.booking_status = 'ACTIVE'
      )
      and public.class_enrollment_compatibility(v_occurrence_class_id, v_enrollment_student_id) = 'IN_SCOPE'
    )
  then
    raise exception 'Attendance enrollment must belong to the occurrence class';
  end if;

  if v_occurrence_type = 'REGULAR'
    and (
      v_enrollment_started_at is null
      or v_enrollment_started_at > v_occurrence_date
      or (v_enrollment_ended_at is not null and v_enrollment_ended_at < v_occurrence_date)
    )
  then
    raise exception 'Attendance cannot be recorded outside the enrollment study period';
  end if;

  if v_occurrence_type = 'REGULAR'
    and public.is_enrollment_paused_on(new.enrollment_id, v_occurrence_date)
  then
    raise exception 'Attendance cannot be recorded while the enrollment is paused';
  end if;

  if v_occurrence_type = 'MAKEUP'
    and not exists (
      select 1 from public.session_occurrence_participants
      where session_occurrence_id = new.session_occurrence_id
        and booking_status = 'ACTIVE'
        and enrollment_id = new.enrollment_id
    )
  then
    raise exception 'Attendance enrollment must be a makeup participant';
  end if;

  return new;
end;
$$;

-- Writes stay open after this release. The guard rollback script stops them
-- in the same transaction that disables the eleven room and teacher guards.
-- Disabling those guards does not drop schema or data.
create table if not exists maintenance_private.teaching_shift_write_gate (
  singleton boolean primary key default true check (singleton),
  writes text not null check (writes in ('open', 'stopped')),
  reason text not null,
  changed_at timestamptz not null default now()
);

insert into maintenance_private.teaching_shift_write_gate (singleton, writes, reason)
values (true, 'open', 'Teaching-shift writes stay open until the guard rollback script stops them.')
on conflict (singleton) do nothing;

revoke all on table maintenance_private.teaching_shift_write_gate from public, anon, authenticated, service_role;

create or replace function maintenance_private.reject_stopped_teaching_shift_write()
returns trigger
language plpgsql
security definer
set search_path to pg_catalog, maintenance_private, pg_temp
as $$
declare
  state text;
begin
  select gate.writes into state
  from maintenance_private.teaching_shift_write_gate gate
  where gate.singleton for share;
  -- Hold the shared row lock until the write commits. Stopping the gate waits
  -- for in-flight writes; a missing gate must never silently reopen writes.
  if state is distinct from 'open' then
    raise exception 'TEACHING_SHIFT_WRITES_STOPPED';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function maintenance_private.reject_stopped_teaching_shift_write() from public, anon, authenticated, service_role;

do $$
declare
  target regclass;
begin
  foreach target in array array[
    'public.rooms'::regclass,
    'public.schedules'::regclass,
    'public.classes'::regclass,
    'public.class_teachers'::regclass,
    'public.session_occurrences'::regclass,
    'public.enrollments'::regclass,
    'public.attendance_records'::regclass,
    'public.session_occurrence_participants'::regclass,
    'public.placement_time_windows'::regclass
  ]
  loop
    execute format('drop trigger if exists trg_teaching_shift_write_gate on %s', target);
    execute format('drop trigger if exists trg_00_teaching_shift_write_gate on %s', target);
    execute format(
      'create trigger trg_00_teaching_shift_write_gate before insert or update or delete on %s for each row execute function maintenance_private.reject_stopped_teaching_shift_write()',
      target
    );
  end loop;
end;
$$;

create or replace function maintenance_private.stop_writes_when_teaching_shift_guard_disabled()
returns event_trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from pg_trigger
    where not tgisinternal
      and tgenabled <> 'O'
      and tgname in (
        'trg_schedule_single_weekly_shift',
        'trg_schedule_room_booking',
        'trg_zz_schedule_teacher_parallel_atomic',
        'trg_zz_class_teacher_parallel_atomic',
        'trg_zz_occurrence_teacher_atomic',
        'trg_zzz_class_teacher_occurrence_atomic',
        'trg_occurrence_room_booking',
        'trg_makeup_room_capacity',
        'trg_room_schedule_configuration',
        'trg_class_room_capacity',
        'trg_room_capacity_enrollment_guard'
      )
  ) then
    update maintenance_private.teaching_shift_write_gate
    set writes = 'stopped',
        reason = 'A teaching-shift guard is disabled. Related writes stay stopped until the guard restore script enables all eleven.',
        changed_at = now()
    where singleton
      and writes = 'open';
  end if;
end;
$$;

drop event trigger if exists caday_teaching_shift_guard_write_gate;
create event trigger caday_teaching_shift_guard_write_gate
  on ddl_command_end
  when tag in ('ALTER TABLE')
  execute function maintenance_private.stop_writes_when_teaching_shift_guard_disabled();

notify pgrst, 'reload schema';
