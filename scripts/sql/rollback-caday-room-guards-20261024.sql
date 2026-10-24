-- Manual emergency rollback for ONLY the eleven schedule/room/capacity/teacher
-- guards introduced by 20261024030000, 20261024040000 and 20261024050000.
-- Do not run during normal use.
-- First revert the Vercel alias to the verified previous deployment and stop
-- new teaching-shift writes. This leaves all data and helper functions intact.
begin;
set local lock_timeout = '5s';

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
