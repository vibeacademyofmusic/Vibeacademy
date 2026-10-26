-- Emergency application rollback for the eleven schedule/room/capacity/teacher
-- guards. This does not drop tables, functions, or rows, and it is not a schema
-- rollback. First point manage.vibe.edu.vn back at the verified previous
-- deployment. In this same transaction the write gate stops inserts, updates,
-- and deletes on the teaching-shift tables, including API and background
-- writers, and then the eleven guards are disabled.
begin;
set local lock_timeout = '5s';

-- Drain writers before taking the gate row lock, in a stable table order.
lock table public.attendance_records, public.class_teachers, public.classes,
  public.enrollments, public.placement_time_windows, public.rooms,
  public.schedules, public.session_occurrence_participants, public.session_occurrences
  in share row exclusive mode;

do $guard$
begin
  if (
    select count(*)
    from pg_trigger
    where not tgisinternal and tgenabled = 'O'
      and (tgrelid, tgname) in (
        ('public.schedules'::regclass, 'trg_schedule_single_weekly_shift'::name),
        ('public.schedules'::regclass, 'trg_schedule_room_booking'::name),
        ('public.schedules'::regclass, 'trg_zz_schedule_teacher_parallel_atomic'::name),
        ('public.class_teachers'::regclass, 'trg_zz_class_teacher_parallel_atomic'::name),
        ('public.session_occurrences'::regclass, 'trg_zz_occurrence_teacher_atomic'::name),
        ('public.class_teachers'::regclass, 'trg_zzz_class_teacher_occurrence_atomic'::name),
        ('public.session_occurrences'::regclass, 'trg_occurrence_room_booking'::name),
        ('public.session_occurrence_participants'::regclass, 'trg_makeup_room_capacity'::name),
        ('public.rooms'::regclass, 'trg_room_schedule_configuration'::name),
        ('public.classes'::regclass, 'trg_class_room_capacity'::name),
        ('public.enrollments'::regclass, 'trg_room_capacity_enrollment_guard'::name)
      )
  ) <> 11 then
    raise exception 'CADAY_ROLLBACK_GUARD_SET_CHANGED';
  end if;
  if (
    select count(*)
    from pg_trigger
    where not tgisinternal and tgenabled = 'O' and tgname = 'trg_00_teaching_shift_write_gate'
      and tgrelid in (
        'public.rooms'::regclass,
        'public.schedules'::regclass,
        'public.classes'::regclass,
        'public.class_teachers'::regclass,
        'public.session_occurrences'::regclass,
        'public.enrollments'::regclass,
        'public.attendance_records'::regclass,
        'public.session_occurrence_participants'::regclass,
        'public.placement_time_windows'::regclass
      )
  ) <> 9 then
    raise exception 'CADAY_WRITE_GATE_TRIGGER_SET_CHANGED';
  end if;
  update maintenance_private.teaching_shift_write_gate
  set writes = 'stopped',
      reason = 'Eleven room and teacher guards are being disabled. Related writes stay stopped until those guards are enabled again.',
      changed_at = now()
  where singleton and writes = 'open';
  if not found then
    raise exception 'CADAY_WRITE_GATE_NOT_OPEN';
  end if;
end;
$guard$;

alter table public.schedules disable trigger trg_schedule_single_weekly_shift;
alter table public.schedules disable trigger trg_schedule_room_booking;
alter table public.schedules disable trigger trg_zz_schedule_teacher_parallel_atomic;
alter table public.class_teachers disable trigger trg_zz_class_teacher_parallel_atomic;
alter table public.session_occurrences disable trigger trg_zz_occurrence_teacher_atomic;
alter table public.class_teachers disable trigger trg_zzz_class_teacher_occurrence_atomic;
alter table public.session_occurrences disable trigger trg_occurrence_room_booking;
alter table public.session_occurrence_participants disable trigger trg_makeup_room_capacity;
alter table public.rooms disable trigger trg_room_schedule_configuration;
alter table public.classes disable trigger trg_class_room_capacity;
alter table public.enrollments disable trigger trg_room_capacity_enrollment_guard;

commit;
