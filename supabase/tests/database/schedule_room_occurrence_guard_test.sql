-- Synthetic room bookings only. The transaction rolls back every fixture.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('f3600000-0000-4000-8000-000000000001', 'TEST-OCC-ROOM', 'TEST occurrence room');
insert into public.curriculums(id, code, name) values
  ('f3600000-0000-4000-8000-000000000010', 'TEST-OCC-PIANO', 'TEST occurrence Piano');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('f3600000-0000-4000-8000-000000000011', 'f3600000-0000-4000-8000-000000000010',
   'TEST-OCC-L1', 'TEST occurrence level', 1);
insert into public.courses(id, curriculum_id, code, name) values
  ('f3600000-0000-4000-8000-000000000020', 'f3600000-0000-4000-8000-000000000010',
   'TEST-OCC-COURSE', 'TEST occurrence course');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status,
  accepted_from_level_id, accepted_to_level_id) values
  ('f3600000-0000-4000-8000-000000000030', 'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000020', 'TEST-OCC-A', 'TEST occurrence class A', 'GROUP', 6, 'ACTIVE',
   'f3600000-0000-4000-8000-000000000011', 'f3600000-0000-4000-8000-000000000011'),
  ('f3600000-0000-4000-8000-000000000031', 'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000020', 'TEST-OCC-B', 'TEST occurrence class B', 'GROUP', 6, 'ACTIVE',
   'f3600000-0000-4000-8000-000000000011', 'f3600000-0000-4000-8000-000000000011'),
  ('f3600000-0000-4000-8000-000000000032', 'f3600000-0000-4000-8000-000000000001',
   'f3600000-0000-4000-8000-000000000020', 'TEST-OCC-C', 'TEST occurrence class C', 'GROUP', 2, 'ACTIVE',
   'f3600000-0000-4000-8000-000000000011', 'f3600000-0000-4000-8000-000000000011');
insert into public.rooms(id, branch_id, code, name, capacity, status) values
  ('f3600000-0000-4000-8000-000000000040', 'f3600000-0000-4000-8000-000000000001',
   'TEST-OCC-R1', 'TEST occurrence room 1', 6, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000041', 'f3600000-0000-4000-8000-000000000001',
   'TEST-OCC-R2', 'TEST occurrence room 2', 6, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000042', 'f3600000-0000-4000-8000-000000000001',
   'TEST-OCC-TINY', 'TEST occurrence tiny room', 2, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000043', 'f3600000-0000-4000-8000-000000000001',
   'TEST-OCC-OVERRIDE', 'TEST occurrence override room', 6, 'ACTIVE');
insert into public.teachers(id, teacher_code, full_name) values
  ('f3600000-0000-4000-8000-000000000070', 'TEST-OCC-TEACHER-A', 'TEST teacher A'),
  ('f3600000-0000-4000-8000-000000000071', 'TEST-OCC-TEACHER-B', 'TEST teacher B'),
  ('f3600000-0000-4000-8000-000000000072', 'TEST-OCC-TEACHER-C', 'TEST teacher C');
insert into public.class_teachers(class_id, teacher_id, teacher_role, assigned_at) values
  ('f3600000-0000-4000-8000-000000000030', 'f3600000-0000-4000-8000-000000000070', 'PRIMARY', current_date),
  ('f3600000-0000-4000-8000-000000000031', 'f3600000-0000-4000-8000-000000000071', 'PRIMARY', current_date),
  ('f3600000-0000-4000-8000-000000000032', 'f3600000-0000-4000-8000-000000000072', 'PRIMARY', current_date);

-- Each recurring master lasts exactly one local day. The next-day fixture
-- proves the guard compares dates, while the 19:00 boundary proves [start,end).
insert into public.schedules(id, class_id, room_id, day_of_week, start_time, end_time,
  effective_from, effective_to, timezone, status) values
  ('f3600000-0000-4000-8000-000000000050', 'f3600000-0000-4000-8000-000000000030',
   'f3600000-0000-4000-8000-000000000040', extract(isodow from current_date + 8)::smallint,
   '18:00', '19:00', current_date + 8, current_date + 8, 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000051', 'f3600000-0000-4000-8000-000000000031',
   'f3600000-0000-4000-8000-000000000041', extract(isodow from current_date + 8)::smallint,
   '18:00', '19:00', current_date + 8, current_date + 8, 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000052', 'f3600000-0000-4000-8000-000000000032',
   'f3600000-0000-4000-8000-000000000042', extract(isodow from current_date + 9)::smallint,
   '18:00', '19:00', current_date + 9, current_date + 9, 'Asia/Ho_Chi_Minh', 'ACTIVE');

-- Three confirmed synthetic memberships fill three physical seats, regardless
-- of the class's larger configured maximum of six.
insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('f3600000-0000-4000-8000-000000000080', 'TEST-OCC-STUDENT-1', 'TEST student 1',
   'f3600000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000081', 'TEST-OCC-STUDENT-2', 'TEST student 2',
   'f3600000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000082', 'TEST-OCC-STUDENT-3', 'TEST student 3',
   'f3600000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.student_curriculum_enrollments
  (student_id, curriculum_id, current_level_id, started_at, status, is_primary) values
  ('f3600000-0000-4000-8000-000000000080', 'f3600000-0000-4000-8000-000000000010',
   'f3600000-0000-4000-8000-000000000011', current_date, 'ACTIVE', true),
  ('f3600000-0000-4000-8000-000000000081', 'f3600000-0000-4000-8000-000000000010',
   'f3600000-0000-4000-8000-000000000011', current_date, 'ACTIVE', true),
  ('f3600000-0000-4000-8000-000000000082', 'f3600000-0000-4000-8000-000000000010',
   'f3600000-0000-4000-8000-000000000011', current_date, 'ACTIVE', true);
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status) values
  ('f3600000-0000-4000-8000-000000000090', 'f3600000-0000-4000-8000-000000000080',
   'f3600000-0000-4000-8000-000000000030', current_date, current_date + 8, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000091', 'f3600000-0000-4000-8000-000000000081',
   'f3600000-0000-4000-8000-000000000030', current_date, current_date + 8, 'ACTIVE'),
  ('f3600000-0000-4000-8000-000000000092', 'f3600000-0000-4000-8000-000000000082',
   'f3600000-0000-4000-8000-000000000030', current_date, current_date + 8, 'ACTIVE');

select lives_ok($$insert into public.session_occurrences
  (id, schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type)
  values ('f3600000-0000-4000-8000-000000000060',
          'f3600000-0000-4000-8000-000000000050', current_date + 8,
          ((current_date + 8) + time '18:00') at time zone 'Asia/Ho_Chi_Minh',
          ((current_date + 8) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
          'f3600000-0000-4000-8000-000000000040', 'SCHEDULED', 'REGULAR')$$,
  'regular occurrence materializes its own recurring slot');
select lives_ok($$insert into public.session_occurrences
  (id, schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type)
  values ('f3600000-0000-4000-8000-000000000061',
          'f3600000-0000-4000-8000-000000000051', current_date + 8,
          ((current_date + 8) + time '18:00') at time zone 'Asia/Ho_Chi_Minh',
          ((current_date + 8) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
          'f3600000-0000-4000-8000-000000000041', 'SCHEDULED', 'REGULAR')$$,
  'another regular occurrence may use a separate room at the same hour');

select throws_ok($$update public.session_occurrences set
  room_id = 'f3600000-0000-4000-8000-000000000040'
  where id = 'f3600000-0000-4000-8000-000000000061'$$,
  'P0001', 'OCCURRENCE_ROOM_CONFLICT', 'rescheduled regular occurrence cannot occupy a booked room');
select throws_ok($$update public.session_occurrences set
  room_id = 'f3600000-0000-4000-8000-000000000042'
  where id = 'f3600000-0000-4000-8000-000000000060'$$,
  'P0001', 'OCCURRENCE_ROOM_TOO_SMALL', 'three enrolled students cannot move into a two-seat room');

select lives_ok($$update public.session_occurrences set
  starts_at = ((current_date + 8) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
  ends_at = ((current_date + 8) + time '20:00') at time zone 'Asia/Ho_Chi_Minh',
  room_id = 'f3600000-0000-4000-8000-000000000040'
  where id = 'f3600000-0000-4000-8000-000000000061'$$,
  'a scheduled occurrence can move at the exact end boundary without overlap');
select throws_ok($$insert into public.schedules
  (class_id, room_id, day_of_week, start_time, end_time, effective_from, effective_to, status)
  values ('f3600000-0000-4000-8000-000000000032',
          'f3600000-0000-4000-8000-000000000040',
          extract(isodow from current_date + 8)::smallint, '19:30', '20:30',
          current_date + 8, current_date + 8, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_ROOM_CONFLICT', 'new recurring booking sees a moved concrete occurrence');
select lives_ok($$update public.session_occurrences set
  room_id = 'f3600000-0000-4000-8000-000000000043'
  where id = 'f3600000-0000-4000-8000-000000000061'$$,
  'an existing occurrence may move into a free configured room');
select throws_ok($$update public.rooms set status = 'INACTIVE'
  where id = 'f3600000-0000-4000-8000-000000000043'$$,
  'P0001', 'OCCURRENCE_ROOM_CONFIGURATION_CONFLICT',
  'room with a future moved occurrence cannot be deactivated');

-- Cancelled source permits a makeup; its attempted placement must still obey
-- the physical room guard. No makeup participant or entitlement is fabricated.
update public.session_occurrences set status = 'CANCELLED'
where id = 'f3600000-0000-4000-8000-000000000061';
select throws_ok($$insert into public.session_occurrences
  (schedule_id, occurrence_date, starts_at, ends_at, room_id, status,
   occurrence_type, source_occurrence_id)
  values ('f3600000-0000-4000-8000-000000000051', current_date + 8,
          ((current_date + 8) + time '18:30') at time zone 'Asia/Ho_Chi_Minh',
          ((current_date + 8) + time '19:30') at time zone 'Asia/Ho_Chi_Minh',
          'f3600000-0000-4000-8000-000000000040', 'SCHEDULED', 'MAKEUP',
          'f3600000-0000-4000-8000-000000000061')$$,
  'P0001', 'OCCURRENCE_ROOM_CONFLICT', 'makeup cannot overlap a regular occurrence in another room');

select lives_ok($$insert into public.session_occurrences
  (id, schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type)
  values ('f3600000-0000-4000-8000-000000000062',
          'f3600000-0000-4000-8000-000000000052', current_date + 9,
          ((current_date + 9) + time '18:00') at time zone 'Asia/Ho_Chi_Minh',
          ((current_date + 9) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
          'f3600000-0000-4000-8000-000000000040', 'SCHEDULED', 'REGULAR')$$,
  'next local day can reuse the room without overlapping the prior day');

-- A regular session moved to the following week still occupies its actual
-- date. Editing its own recurring master must not hide that concrete booking.
select lives_ok($$update public.session_occurrences set
  starts_at = ((current_date + 16) + time '18:00') at time zone 'Asia/Ho_Chi_Minh',
  ends_at = ((current_date + 16) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
  room_id = 'f3600000-0000-4000-8000-000000000043'
  where id = 'f3600000-0000-4000-8000-000000000062'$$,
  'a regular occurrence may move to a free room in the next week');
select throws_ok($$update public.schedules set
  room_id = 'f3600000-0000-4000-8000-000000000043',
  effective_to = current_date + 16
  where id = 'f3600000-0000-4000-8000-000000000052'$$,
  'P0001', 'SCHEDULE_ROOM_CONFLICT',
  'recurring edit sees its own occurrence moved to another source date');

select is((select count(*) from public.session_occurrences where id in
  ('f3600000-0000-4000-8000-000000000060', 'f3600000-0000-4000-8000-000000000061',
   'f3600000-0000-4000-8000-000000000062')), 3::bigint,
  'failed writes leave only the three expected synthetic occurrences');
select * from finish();
rollback;
