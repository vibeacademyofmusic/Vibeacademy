-- Re-enable guards only after resolving the incident and rechecking existing
-- room/schedule/enrollment/teacher state. All eleven changes commit together.
begin;
set local lock_timeout = '5s';

lock table public.attendance_records, public.class_teachers, public.classes,
  public.enrollments, public.placement_time_windows, public.rooms,
  public.schedules, public.session_occurrence_participants, public.session_occurrences
  in share row exclusive mode;

do $guard$
begin
  if (
    select count(*)
    from pg_trigger
    where not tgisinternal and tgenabled = 'D'
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
    raise exception 'CADAY_RESTORE_GUARD_SET_CHANGED';
  end if;
end;
$guard$;

alter table public.schedules enable trigger trg_schedule_single_weekly_shift;
alter table public.schedules enable trigger trg_schedule_room_booking;
alter table public.schedules enable trigger trg_zz_schedule_teacher_parallel_atomic;
alter table public.class_teachers enable trigger trg_zz_class_teacher_parallel_atomic;
alter table public.session_occurrences enable trigger trg_zz_occurrence_teacher_atomic;
alter table public.class_teachers enable trigger trg_zzz_class_teacher_occurrence_atomic;
alter table public.session_occurrences enable trigger trg_occurrence_room_booking;
alter table public.session_occurrence_participants enable trigger trg_makeup_room_capacity;
alter table public.rooms enable trigger trg_room_schedule_configuration;
alter table public.classes enable trigger trg_class_room_capacity;
alter table public.enrollments enable trigger trg_room_capacity_enrollment_guard;

do $gate$
begin
  if (
    select count(*) from pg_trigger
    where not tgisinternal and tgenabled = 'O'
      and tgname = 'trg_00_teaching_shift_write_gate'
      and tgrelid in (
        'public.rooms'::regclass, 'public.schedules'::regclass,
        'public.classes'::regclass, 'public.class_teachers'::regclass,
        'public.session_occurrences'::regclass, 'public.enrollments'::regclass,
        'public.attendance_records'::regclass,
        'public.session_occurrence_participants'::regclass,
        'public.placement_time_windows'::regclass
      )
  ) <> 9 then
    raise exception 'CADAY_WRITE_GATE_TRIGGER_SET_CHANGED';
  end if;
  update maintenance_private.teaching_shift_write_gate
  set writes = 'open',
      reason = 'All eleven room and teacher guards are enabled again.',
      changed_at = now()
  where singleton and writes = 'stopped';
  if not found then
    raise exception 'CADAY_WRITE_GATE_NOT_STOPPED';
  end if;
end;
$gate$;

commit;
