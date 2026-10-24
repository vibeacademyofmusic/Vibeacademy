-- Synthetic placement and dated makeup bookings. This transaction never
-- changes real students, rooms, billing, or attendance.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('f3600000-0000-4000-8000-000000000001', 'TEST-SHIFT-SET', 'TEST Shift Set');
insert into public.curriculums(id, code, name) values
  ('f3600000-0000-4000-8000-000000000010', 'TEST-SHIFT-PIANO', 'TEST Piano');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('f3600000-0000-4000-8000-000000000020',
   'f3600000-0000-4000-8000-000000000010', 'TEST-L1', 'TEST Level', 1);
insert into public.courses(id, curriculum_id, code, name) values
  ('f3600000-0000-4000-8000-000000000030',
   'f3600000-0000-4000-8000-000000000010', 'TEST-SHIFT-COURSE', 'TEST Piano');
insert into public.classes(id, branch_id, course_id, code, name, class_type,
  capacity, status, accepted_from_level_id, accepted_to_level_id) values
  ('f3600000-0000-4000-8000-000000000040', 'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000030', 'TEST-SHIFT-A', 'TEST First Shift',
   'GROUP', 3, 'ACTIVE', 'f3600000-0000-4000-8000-000000000020',
   'f3600000-0000-4000-8000-000000000020'),
  ('f3600000-0000-4000-8000-000000000041', 'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000030', 'TEST-SHIFT-B', 'TEST Two-Day Shift',
   'GROUP', 2, 'ACTIVE', 'f3600000-0000-4000-8000-000000000020',
   'f3600000-0000-4000-8000-000000000020');
insert into public.rooms(id, branch_id, code, name, capacity, status) values
  ('f3600000-0000-4000-8000-000000000050', 'f3600000-0000-4000-8000-000000000001',
   'TEST-SHIFT-ROOM-A', 'TEST Room A', 3, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000051', 'f3600000-0000-4000-8000-000000000001',
   'TEST-SHIFT-ROOM-B', 'TEST Room B', 2, 'ACTIVE');
insert into public.teachers(id, teacher_code, full_name) values
  ('f3600000-0000-4000-8000-000000000060', 'TEST-SHIFT-TEACHER-A', 'TEST First Teacher'),
  ('f3600000-0000-4000-8000-000000000061', 'TEST-SHIFT-TEACHER-B', 'TEST Second Teacher');
insert into public.class_teachers(class_id, teacher_id, teacher_role, assigned_at)
values
  ('f3600000-0000-4000-8000-000000000040', 'f3600000-0000-4000-8000-000000000060',
   'PRIMARY', public.registration_vietnam_today()),
  ('f3600000-0000-4000-8000-000000000041', 'f3600000-0000-4000-8000-000000000061',
   'PRIMARY', public.registration_vietnam_today());
-- This two-day class simulates an already approved legacy class. New classes
-- cannot add a second simultaneous recurring schedule after the guard ships.
insert into maintenance_private.legacy_preexisting_class_ids(class_id) values
  ('f3600000-0000-4000-8000-000000000041');
insert into public.schedules(id, class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3600000-0000-4000-8000-000000000070', 'f3600000-0000-4000-8000-000000000040',
   'f3600000-0000-4000-8000-000000000050',
   extract(isodow from public.registration_vietnam_today() + 2)::smallint,
   '08:00', '09:00', public.registration_vietnam_today(), 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000071', 'f3600000-0000-4000-8000-000000000041',
   'f3600000-0000-4000-8000-000000000051',
   extract(isodow from public.registration_vietnam_today() + 3)::smallint,
   '10:00', '11:00', public.registration_vietnam_today(), 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000072', 'f3600000-0000-4000-8000-000000000041',
   'f3600000-0000-4000-8000-000000000051',
   extract(isodow from public.registration_vietnam_today() + 4)::smallint,
   '10:00', '11:00', public.registration_vietnam_today(), 'ACTIVE');

insert into auth.users(id) values ('f3600000-0000-4000-8000-000000000099');
insert into public.profiles(id, full_name, status) values
  ('f3600000-0000-4000-8000-000000000099', 'TEST Shift Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'f3600000-0000-4000-8000-000000000099', id
from public.roles where code = 'SUPER_ADMIN';
insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('f3600000-0000-4000-8000-000000000080', 'TEST-SHIFT-STUDENT', 'TEST Placement Student',
   'f3600000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000081', 'TEST-SHIFT-MAKEUP', 'TEST Existing Learner',
   'f3600000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.student_curriculum_enrollments(student_id, curriculum_id,
  current_level_id, started_at, status)
select student.id, 'f3600000-0000-4000-8000-000000000010',
  'f3600000-0000-4000-8000-000000000020', public.registration_vietnam_today(), 'ACTIVE'
from public.students student
where student.id in ('f3600000-0000-4000-8000-000000000080',
  'f3600000-0000-4000-8000-000000000081');
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status) values
  ('f3600000-0000-4000-8000-000000000090', 'f3600000-0000-4000-8000-000000000081',
   'f3600000-0000-4000-8000-000000000041', public.registration_vietnam_today(),
   public.registration_vietnam_today() + 1, 'ACTIVE');
-- Two cancelled regular sessions generate independent makeup credits. Their
-- dated makeup bookings use the same existing membership and do not turn it
-- into two permanent seats in the recurring teaching shift.
insert into public.session_occurrences(id, schedule_id, occurrence_date, starts_at,
  ends_at, room_id, status, occurrence_type) values
  ('f3600000-0000-4000-8000-000000000092', 'f3600000-0000-4000-8000-000000000071',
   public.registration_vietnam_today() + 10,
   (public.registration_vietnam_today() + 10 + time '10:00') at time zone 'Asia/Ho_Chi_Minh',
   (public.registration_vietnam_today() + 10 + time '11:00') at time zone 'Asia/Ho_Chi_Minh',
   'f3600000-0000-4000-8000-000000000051', 'CANCELLED', 'REGULAR'),
  ('f3600000-0000-4000-8000-000000000093', 'f3600000-0000-4000-8000-000000000072',
   public.registration_vietnam_today() + 11,
   (public.registration_vietnam_today() + 11 + time '10:00') at time zone 'Asia/Ho_Chi_Minh',
   (public.registration_vietnam_today() + 11 + time '11:00') at time zone 'Asia/Ho_Chi_Minh',
   'f3600000-0000-4000-8000-000000000051', 'CANCELLED', 'REGULAR');
insert into public.session_occurrences(id, schedule_id, occurrence_date, starts_at,
  ends_at, room_id, status, occurrence_type, source_occurrence_id) values
  ('f3600000-0000-4000-8000-000000000094', 'f3600000-0000-4000-8000-000000000071',
   public.registration_vietnam_today() + 17,
   (public.registration_vietnam_today() + 17 + time '14:00') at time zone 'Asia/Ho_Chi_Minh',
   (public.registration_vietnam_today() + 17 + time '15:00') at time zone 'Asia/Ho_Chi_Minh',
   'f3600000-0000-4000-8000-000000000051', 'SCHEDULED', 'MAKEUP',
   'f3600000-0000-4000-8000-000000000092'),
  ('f3600000-0000-4000-8000-000000000095', 'f3600000-0000-4000-8000-000000000072',
   public.registration_vietnam_today() + 18,
   (public.registration_vietnam_today() + 18 + time '14:00') at time zone 'Asia/Ho_Chi_Minh',
   (public.registration_vietnam_today() + 18 + time '15:00') at time zone 'Asia/Ho_Chi_Minh',
   'f3600000-0000-4000-8000-000000000051', 'SCHEDULED', 'MAKEUP',
   'f3600000-0000-4000-8000-000000000093');
insert into public.makeup_credits(enrollment_id, source_occurrence_id, source_reason)
values
  ('f3600000-0000-4000-8000-000000000090', 'f3600000-0000-4000-8000-000000000092', 'SESSION_CANCELLED'),
  ('f3600000-0000-4000-8000-000000000090', 'f3600000-0000-4000-8000-000000000093', 'SESSION_CANCELLED')
on conflict (source_occurrence_id, enrollment_id) do nothing;
insert into public.session_occurrence_participants(session_occurrence_id,
  enrollment_id, booking_status) values
  ('f3600000-0000-4000-8000-000000000094', 'f3600000-0000-4000-8000-000000000090', 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000095', 'f3600000-0000-4000-8000-000000000090', 'ACTIVE');

insert into public.parents(id, parent_code, status) values
  ('f3600000-0000-4000-8000-0000000000a0', 'TEST-SHIFT-PARENT', 'ACTIVE');
select set_config('registration.write', 'on', true);
insert into public.registration_applications(id, application_code, branch_id,
  course_id, status, linked_student_id, linked_parent_id, completed_at, created_by) values
  ('f3600000-0000-4000-8000-0000000000a1', 'TEST-SHIFT-APPLICATION',
   'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000030', 'COMPLETED',
   'f3600000-0000-4000-8000-000000000080', 'f3600000-0000-4000-8000-0000000000a0',
   clock_timestamp(), 'f3600000-0000-4000-8000-000000000099');
insert into public.student_placement_cases(id, student_id, registration_application_id,
  branch_id, status, required_weekly_sessions) values
  ('f3600000-0000-4000-8000-0000000000a2', 'f3600000-0000-4000-8000-000000000080',
   'f3600000-0000-4000-8000-0000000000a1',
   'f3600000-0000-4000-8000-000000000001', 'UNASSIGNED', 3);
select set_config('registration.write', 'off', true);
select set_config('request.jwt.claim.sub', 'f3600000-0000-4000-8000-000000000099', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$select public.set_placement_time_windows(
  'f3600000-0000-4000-8000-0000000000a2',
  array[extract(isodow from public.registration_vietnam_today() + 3)::smallint],
  array[time '10:00'], array[time '11:00'], 'HARD', null, 3)$$,
  'hard windows accept one explicit weekday and time');
select is((select preference_fit from public.placement_shift_decision(
  'f3600000-0000-4000-8000-0000000000a2',
  'f3600000-0000-4000-8000-000000000041',
  public.registration_vietnam_today() + 1)), 'PARTIAL',
  'two-day class matches only one of the approved windows');
select is((select reason_code from public.placement_shift_decision(
  'f3600000-0000-4000-8000-0000000000a2',
  'f3600000-0000-4000-8000-000000000041',
  public.registration_vietnam_today() + 1)), 'PLACEMENT_AVAILABILITY',
  'hard availability rejects a partially matching class');
select is((select outcome from public.placement_shift_decision(
  'f3600000-0000-4000-8000-0000000000a2',
  'f3600000-0000-4000-8000-000000000041',
  public.registration_vietnam_today() + 1)), 'INELIGIBLE',
  'hard partial does not permit assignment');
select throws_ok($$select public.assign_student_shift_set(
  'f3600000-0000-4000-8000-0000000000b0',
  'f3600000-0000-4000-8000-0000000000a2', 1,
  array['f3600000-0000-4000-8000-000000000041'::uuid],
  public.registration_vietnam_today() + 1)$$,
  'P0001', 'PLACEMENT_AVAILABILITY',
  'confirmation transaction also rejects a hard partial match');
select is((select count(*) from public.enrollments where student_id =
  'f3600000-0000-4000-8000-000000000080'), 0::bigint,
  'rejected hard partial creates no membership');
set local role authenticated;
select lives_ok($$select public.set_placement_availability(
  'f3600000-0000-4000-8000-0000000000a2',
  array[1,2,3,4,5,6,7]::smallint[],
  time '10:00', time '11:00', 'HARD', 'legacy editor')$$,
  'authenticated legacy client can call six-argument availability RPC');
reset role;
select is((select required_weekly_sessions from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'), 3::smallint,
  'legacy editor preserves the required weekly count');
select is((select count(*) from public.placement_time_windows
  where placement_id = 'f3600000-0000-4000-8000-0000000000a2'), 0::bigint,
  'legacy editor clears superseded exact windows');
select is((select preference_fit from public.placement_shift_decision(
  'f3600000-0000-4000-8000-0000000000a2',
  'f3600000-0000-4000-8000-000000000041',
  public.registration_vietnam_today() + 1)), 'MATCH',
  'availability decision now reads changed legacy days');
select lives_ok($$select public.set_placement_availability(
  'f3600000-0000-4000-8000-0000000000a2', null, null, null,
  'PREFERENCE', null, 4)$$, 'seven-argument RPC explicitly changes weekly count');
select is((select required_weekly_sessions from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'), 4::smallint,
  'seven-argument count was saved');
select lives_ok($$select public.set_placement_time_windows(
  'f3600000-0000-4000-8000-0000000000a2',
  null, null, null, 'PREFERENCE', null, 3)$$,
  'preference may leave time unstated without blocking a valid placement');
select is((select open_seats from public.placement_shift_decision(
  'f3600000-0000-4000-8000-0000000000a2',
  'f3600000-0000-4000-8000-000000000041',
  public.registration_vietnam_today() + 1)), 1,
  'two dated makeup bookings do not consume extra permanent seats');
select is((select outcome from public.placement_shift_decision(
  'f3600000-0000-4000-8000-0000000000a2',
  'f3600000-0000-4000-8000-000000000041',
  public.registration_vietnam_today() + 1)), 'ELIGIBLE',
  'one seat remains in the two-place class');

select lives_ok($$select public.assign_student_placement(
  'f3600000-0000-4000-8000-0000000000b1',
  'f3600000-0000-4000-8000-0000000000a2', 1,
  'f3600000-0000-4000-8000-000000000040'::uuid,
  public.registration_vietnam_today() + 1)$$,
  'legacy five-argument assignment keeps an incomplete week open');
select is((select status from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'), 'MATCHING',
  'partly filled week remains MATCHING');
select is((select assigned_teacher_id from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'),
  'f3600000-0000-4000-8000-000000000060'::uuid,
  'first primary teacher is retained');
select is((select enrollment_id from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'),
  (select id from public.enrollments where student_id =
    'f3600000-0000-4000-8000-000000000080'
    and class_id = 'f3600000-0000-4000-8000-000000000040'),
  'partial week links the first actual enrollment');
select is((select count(*) from public.list_waiting_placements_by_curriculum(
  'f3600000-0000-4000-8000-000000000010',
  'f3600000-0000-4000-8000-000000000001', 'MATCHING', null)),
  1::bigint, 'partly filled week remains visible in waiting placements');
select is((select count(*) from public.registration_application_events
  where application_id = 'f3600000-0000-4000-8000-0000000000a1'
    and event_type = 'ENROLLMENT_CREATED'), 1::bigint,
  'first newly inserted enrollment has one registration event');
select lives_ok($$select public.assign_student_placement(
  'f3600000-0000-4000-8000-0000000000b1',
  'f3600000-0000-4000-8000-0000000000a2', 1,
  'f3600000-0000-4000-8000-000000000040'::uuid,
  public.registration_vietnam_today() + 1)$$,
  'legacy assignment replay is idempotent through shift-set routing');
select is((select count(*) from public.registration_application_events
  where application_id = 'f3600000-0000-4000-8000-0000000000a1'
    and event_type = 'ENROLLMENT_CREATED'), 1::bigint,
  'legacy assignment replay does not add registration events');

-- These two active memberships carry schedule versions outside the first
-- requested week. They must not complete the weekly count or hide the queue.
insert into public.classes(id, branch_id, course_id, code, name, class_type,
  capacity, status, accepted_from_level_id, accepted_to_level_id) values
  ('f3600000-0000-4000-8000-000000000042', 'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000030', 'TEST-SHIFT-HIST', 'TEST Historical Shift',
   'GROUP', 2, 'ACTIVE', 'f3600000-0000-4000-8000-000000000020',
   'f3600000-0000-4000-8000-000000000020'),
  ('f3600000-0000-4000-8000-000000000043', 'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000030', 'TEST-SHIFT-FUTURE', 'TEST Future Shift',
   'GROUP', 2, 'ACTIVE', 'f3600000-0000-4000-8000-000000000020',
   'f3600000-0000-4000-8000-000000000020');
insert into public.class_teachers(class_id, teacher_id, teacher_role, assigned_at) values
  ('f3600000-0000-4000-8000-000000000042', 'f3600000-0000-4000-8000-000000000060',
   'PRIMARY', public.registration_vietnam_today() - 21),
  ('f3600000-0000-4000-8000-000000000043', 'f3600000-0000-4000-8000-000000000061',
   'PRIMARY', public.registration_vietnam_today());
insert into public.schedules(id, class_id, room_id, day_of_week, start_time,
  end_time, effective_from, effective_to, status) values
  ('f3600000-0000-4000-8000-000000000073', 'f3600000-0000-4000-8000-000000000042',
   'f3600000-0000-4000-8000-000000000050',
   extract(isodow from public.registration_vietnam_today() + 2)::smallint,
   time '12:00', time '13:00', public.registration_vietnam_today() - 21,
   null, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000074', 'f3600000-0000-4000-8000-000000000043',
   'f3600000-0000-4000-8000-000000000050',
   extract(isodow from public.registration_vietnam_today() + 3)::smallint,
   time '14:00', time '15:00', public.registration_vietnam_today() + 15,
   null, 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status) values
  ('f3600000-0000-4000-8000-000000000084', 'f3600000-0000-4000-8000-000000000080',
   'f3600000-0000-4000-8000-000000000042', public.registration_vietnam_today() - 21,
   public.registration_vietnam_today() - 21, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000085', 'f3600000-0000-4000-8000-000000000080',
   'f3600000-0000-4000-8000-000000000043', public.registration_vietnam_today(),
   public.registration_vietnam_today() + 15, 'ACTIVE');
-- End the first recurrence after its membership exists, creating a legacy
-- active enrollment whose schedule is historical for the requested week.
update public.schedules set effective_to = public.registration_vietnam_today() - 7
where id = 'f3600000-0000-4000-8000-000000000073';
select is(public.placement_weekly_session_count(
  'f3600000-0000-4000-8000-0000000000a2', public.registration_vietnam_today() + 1),
  1, 'historical and future schedules do not count in the start week');
select ok(public.placement_week_still_open('f3600000-0000-4000-8000-0000000000a2'),
  'placement remains open with only one current weekly slot');
select is((select count(*) from public.list_waiting_placements_by_curriculum(
  'f3600000-0000-4000-8000-000000000010',
  'f3600000-0000-4000-8000-000000000001', 'MATCHING', null)),
  1::bigint, 'queue still shows partial placement despite historical and future schedules');
-- The integrity guard correctly refuses to confirm a new class while an
-- ACTIVE legacy membership has no current timetable. Close that historical
-- fixture before checking the successful second assignment.
update public.enrollments set status = 'COMPLETED',
  ended_at = public.registration_vietnam_today() - 7
where id = 'f3600000-0000-4000-8000-000000000084';

select lives_ok($$select public.assign_student_shift_set(
  'f3600000-0000-4000-8000-0000000000b2',
  'f3600000-0000-4000-8000-0000000000a2', 2,
  array['f3600000-0000-4000-8000-000000000041'::uuid],
  public.registration_vietnam_today() + 2)$$,
  'second shift fills the three-session week despite separate makeup bookings');
select is((select status from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'), 'SCHEDULED',
  'filled week becomes SCHEDULED');
select is(public.placement_weekly_session_count(
  'f3600000-0000-4000-8000-0000000000a2', public.registration_vietnam_today() + 1),
  3, 'three current recurring slots complete the requested week');
select is((select enrollment_id from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'),
  (select id from public.enrollments where student_id =
    'f3600000-0000-4000-8000-000000000080'
    and class_id = 'f3600000-0000-4000-8000-000000000040'),
  'second shift cannot overwrite the first enrollment link');
select is((select assigned_teacher_id from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'),
  'f3600000-0000-4000-8000-000000000060'::uuid,
  'second shift cannot overwrite the first teacher');
select is((select scheduled_start_date from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a2'),
  public.registration_vietnam_today() + 1,
  'later shift preserves the first scheduled start date');
select is((select count(*) from public.registration_application_events
  where application_id = 'f3600000-0000-4000-8000-0000000000a1'
    and event_type = 'ENROLLMENT_CREATED'), 2::bigint,
  'each newly inserted enrollment has exactly one registration event');
select lives_ok($$select public.assign_student_shift_set(
  'f3600000-0000-4000-8000-0000000000b2',
  'f3600000-0000-4000-8000-0000000000a2', 2,
  array['f3600000-0000-4000-8000-000000000041'::uuid],
  public.registration_vietnam_today() + 2)$$,
  'same request can be replayed after a lost response');
select is((select count(*) from public.enrollments where student_id =
  'f3600000-0000-4000-8000-000000000080' and status = 'ACTIVE'
    and class_id in ('f3600000-0000-4000-8000-000000000040',
                     'f3600000-0000-4000-8000-000000000041')),
  2::bigint, 'retry leaves exactly two teaching memberships');
select is((select count(*) from public.student_placement_events where placement_id =
  'f3600000-0000-4000-8000-0000000000a2' and event_type = 'CLASS_ASSIGNED'),
  2::bigint, 'retry does not add an assignment event');
select is((select count(*) from public.registration_application_events
  where application_id = 'f3600000-0000-4000-8000-0000000000a1'
    and event_type = 'ENROLLMENT_CREATED'), 2::bigint,
  'retry does not add an enrollment registration event');

-- Existing live membership is linked when an operator confirms a placement
-- without inserting another enrollment row.
insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('f3600000-0000-4000-8000-000000000082', 'TEST-SHIFT-EXISTING',
   'TEST Already Enrolled', 'f3600000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.student_curriculum_enrollments(student_id, curriculum_id,
  current_level_id, started_at, status) values
  ('f3600000-0000-4000-8000-000000000082',
   'f3600000-0000-4000-8000-000000000010',
   'f3600000-0000-4000-8000-000000000020', public.registration_vietnam_today(), 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status) values
  ('f3600000-0000-4000-8000-000000000083',
   'f3600000-0000-4000-8000-000000000082',
   'f3600000-0000-4000-8000-000000000040', public.registration_vietnam_today(),
   public.registration_vietnam_today() + 1, 'ACTIVE');
select set_config('registration.write', 'on', true);
insert into public.registration_applications(id, application_code, branch_id,
  course_id, status, linked_student_id, linked_parent_id, completed_at, created_by) values
  ('f3600000-0000-4000-8000-0000000000a3', 'TEST-SHIFT-EXISTING-APPLICATION',
   'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000030', 'COMPLETED',
   'f3600000-0000-4000-8000-000000000082', 'f3600000-0000-4000-8000-0000000000a0',
   clock_timestamp(), 'f3600000-0000-4000-8000-000000000099');
insert into public.student_placement_cases(id, student_id, registration_application_id,
  branch_id, status, required_weekly_sessions) values
  ('f3600000-0000-4000-8000-0000000000a4', 'f3600000-0000-4000-8000-000000000082',
   'f3600000-0000-4000-8000-0000000000a3',
   'f3600000-0000-4000-8000-000000000001', 'UNASSIGNED', 1);
select set_config('registration.write', 'off', true);
select lives_ok($$select public.assign_student_shift_set(
  'f3600000-0000-4000-8000-0000000000b3',
  'f3600000-0000-4000-8000-0000000000a4', 1,
  array['f3600000-0000-4000-8000-000000000040'::uuid],
  public.registration_vietnam_today() + 1)$$,
  'confirming an existing compatible membership needs no duplicate insertion');
select is((select enrollment_id from public.student_placement_cases
  where id = 'f3600000-0000-4000-8000-0000000000a4'),
  'f3600000-0000-4000-8000-000000000083'::uuid,
  'existing membership is linked when the week is complete');
select is((select count(*) from public.enrollments where student_id =
  'f3600000-0000-4000-8000-000000000082'), 1::bigint,
  'confirmation keeps exactly one existing membership');
select is((select count(*) from public.registration_application_events
  where application_id = 'f3600000-0000-4000-8000-0000000000a3'
    and event_type = 'ENROLLMENT_CREATED'), 0::bigint,
  'linking a preexisting enrollment does not emit a new enrollment event');

select * from finish();
rollback;
