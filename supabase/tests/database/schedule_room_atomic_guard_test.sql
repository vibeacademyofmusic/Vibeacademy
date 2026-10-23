-- Synthetic database fixtures only. Never interprets CT01's configured 4 as
-- an owner-approved physical limit. All data rolls back at the end.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('f3500000-0000-4000-8000-000000000001', 'TEST-ROOM-ATOMIC', 'TEST Room Atomic');
insert into public.curriculums(id, code, name) values
  ('f3500000-0000-4000-8000-000000000010', 'TEST-ROOM-PIANO', 'TEST Piano'),
  ('f3500000-0000-4000-8000-000000000011', 'TEST-ROOM-GUITAR', 'TEST Guitar');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('f3500000-0000-4000-8000-000000000020', 'f3500000-0000-4000-8000-000000000010', 'T1', 'TEST Level', 1);
insert into public.courses(id, curriculum_id, code, name) values
  ('f3500000-0000-4000-8000-000000000030', 'f3500000-0000-4000-8000-000000000010', 'TEST-ROOM-PIANO', 'TEST Piano'),
  ('f3500000-0000-4000-8000-000000000031', 'f3500000-0000-4000-8000-000000000011', 'TEST-ROOM-GUITAR', 'TEST Guitar');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity,
  status, accepted_from_level_id, accepted_to_level_id) values
  ('f3500000-0000-4000-8000-000000000040', 'f3500000-0000-4000-8000-000000000001',
   'f3500000-0000-4000-8000-000000000030', 'TEST-ROOM-A', 'TEST Piano A', 'GROUP', 6,
   'ACTIVE', 'f3500000-0000-4000-8000-000000000020', 'f3500000-0000-4000-8000-000000000020'),
  ('f3500000-0000-4000-8000-000000000041', 'f3500000-0000-4000-8000-000000000001',
   'f3500000-0000-4000-8000-000000000031', 'TEST-ROOM-B', 'TEST Guitar B', 'GROUP', 6,
   'ACTIVE', null, null),
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000001',
   'f3500000-0000-4000-8000-000000000031', 'TEST-ROOM-C', 'TEST Guitar C', 'GROUP', 2,
   'ACTIVE', null, null);
insert into public.rooms(id, branch_id, code, name, capacity, status) values
  ('f3500000-0000-4000-8000-000000000050', 'f3500000-0000-4000-8000-000000000001', 'TEST-ROOM-1', 'TEST Room 1', 6, 'ACTIVE'),
  ('f3500000-0000-4000-8000-000000000051', 'f3500000-0000-4000-8000-000000000001', 'TEST-ROOM-2', 'TEST Room 2', 6, 'ACTIVE'),
  ('f3500000-0000-4000-8000-000000000052', 'f3500000-0000-4000-8000-000000000001', 'TEST-ROOM-UNKNOWN', 'TEST Unknown', null, 'ACTIVE'),
  ('f3500000-0000-4000-8000-000000000053', 'f3500000-0000-4000-8000-000000000001', 'TEST-ROOM-TINY', 'TEST Tiny', 2, 'ACTIVE'),
  ('f3500000-0000-4000-8000-000000000054', 'f3500000-0000-4000-8000-000000000001', 'TEST-ROOM-CLOSED', 'TEST Closed', 6, 'INACTIVE');
insert into public.teachers(id, teacher_code, full_name) values
  ('f3500000-0000-4000-8000-000000000060', 'TEST-ROOM-PRIMARY', 'TEST Primary'),
  ('f3500000-0000-4000-8000-000000000061', 'TEST-ROOM-OTHER', 'TEST Other');
insert into public.class_teachers(class_id, teacher_id, teacher_role, assigned_at) values
  ('f3500000-0000-4000-8000-000000000040', 'f3500000-0000-4000-8000-000000000060', 'PRIMARY', current_date),
  ('f3500000-0000-4000-8000-000000000041', 'f3500000-0000-4000-8000-000000000060', 'PRIMARY', current_date),
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000061', 'PRIMARY', current_date);

insert into public.schedules(id, class_id, room_id, day_of_week, start_time, end_time,
  effective_from, effective_to, status) values
  ('f3500000-0000-4000-8000-000000000070', 'f3500000-0000-4000-8000-000000000040',
   'f3500000-0000-4000-8000-000000000050', extract(isodow from current_date + 1)::smallint,
   '18:00', '19:00', current_date + 1, current_date + 21, 'ACTIVE');
select lives_ok($$insert into public.schedules(id, class_id, room_id, day_of_week, start_time,
  end_time, effective_from, effective_to, status) values
  ('f3500000-0000-4000-8000-000000000071', 'f3500000-0000-4000-8000-000000000041',
   'f3500000-0000-4000-8000-000000000051', extract(isodow from current_date + 1)::smallint,
   '18:00', '19:00', current_date + 1, current_date + 21, 'ACTIVE')$$,
  'two simultaneous classes in different rooms may share one PRIMARY teacher');
select is((select count(*) from public.class_teachers
  where teacher_id = 'f3500000-0000-4000-8000-000000000060' and teacher_role = 'PRIMARY'),
  2::bigint, 'no extra supervisor is required by this database guard');

select throws_ok($$insert into public.schedules(class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000050',
   extract(isodow from current_date + 1)::smallint, '18:30', '19:30', current_date + 1, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_ROOM_CONFLICT', 'a second program cannot book overlapping room time');
select throws_ok($$update public.schedules set room_id = 'f3500000-0000-4000-8000-000000000050'
  where id = 'f3500000-0000-4000-8000-000000000071'$$,
  'P0001', 'SCHEDULE_ROOM_CONFLICT', 'moving a schedule into a booked room is rejected');
select throws_ok($$insert into public.schedules(class_id, room_id, day_of_week, start_time,
  end_time, effective_from, effective_to, status) values
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000050',
   extract(isodow from current_date + 1)::smallint, '18:00', '19:00',
   current_date + 15, current_date + 21, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_ROOM_CONFLICT', 'inclusive effective end date still reserves the final matching weekday');
select lives_ok($$insert into public.schedules(class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000050',
   extract(isodow from current_date + 1)::smallint, '18:00', '19:00', current_date + 22, 'ACTIVE')$$,
  'same room and time can be reused after the prior effective end');
select lives_ok($$insert into public.schedules(class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000050',
   extract(isodow from current_date + 1)::smallint, '19:00', '20:00', current_date + 1, 'ACTIVE')$$,
  'adjacent time is allowed');
select throws_ok($$insert into public.schedules(class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000052',
   extract(isodow from current_date + 2)::smallint, '18:00', '19:00', current_date + 2, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_ROOM_CAPACITY_UNKNOWN', 'unknown configured room capacity blocks booking');
select throws_ok($$insert into public.schedules(class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000041', 'f3500000-0000-4000-8000-000000000053',
   extract(isodow from current_date + 2)::smallint, '18:00', '19:00', current_date + 2, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_ROOM_TOO_SMALL', 'class configured capacity cannot exceed selected room');
select throws_ok($$insert into public.schedules(class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000041', 'f3500000-0000-4000-8000-000000000054',
   extract(isodow from current_date + 2)::smallint, '18:00', '19:00', current_date + 2, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_ROOM_UNAVAILABLE', 'inactive room cannot be booked');
select throws_ok($$update public.classes set capacity = 7
  where id = 'f3500000-0000-4000-8000-000000000040'$$,
  'P0001', 'SCHEDULE_ROOM_TOO_SMALL', 'class capacity change cannot exceed its booked room');
select throws_ok($$update public.rooms set capacity = 5
  where id = 'f3500000-0000-4000-8000-000000000050'$$,
  'P0001', 'SCHEDULE_ROOM_CONFIGURATION_CONFLICT', 'room capacity reduction cannot invalidate a class');
select throws_ok($$update public.rooms set status = 'INACTIVE'
  where id = 'f3500000-0000-4000-8000-000000000050'$$,
  'P0001', 'SCHEDULE_ROOM_CONFIGURATION_CONFLICT', 'occupied room cannot silently be deactivated');

insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('f3500000-0000-4000-8000-000000000080', 'TEST-ROOM-STUDENT', 'TEST Student',
   'f3500000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.student_curriculum_enrollments
  (student_id, curriculum_id, current_level_id, started_at, status) values
  ('f3500000-0000-4000-8000-000000000080', 'f3500000-0000-4000-8000-000000000010',
   'f3500000-0000-4000-8000-000000000020', current_date, 'ACTIVE');
select lives_ok($$insert into public.enrollments(id, student_id, class_id, started_at, status)
  values ('f3500000-0000-4000-8000-000000000090',
          'f3500000-0000-4000-8000-000000000080',
          'f3500000-0000-4000-8000-000000000040', current_date + 1, 'ACTIVE')$$,
  'first membership passes class and room capacity checks');
select throws_ok($$insert into public.enrollments(student_id, class_id, started_at, status)
  values ('f3500000-0000-4000-8000-000000000080',
          'f3500000-0000-4000-8000-000000000040', current_date + 1, 'ACTIVE')$$,
  'P0001', 'PLACEMENT_ALREADY_ENROLLED', 'replayed membership cannot duplicate student/class');
select is((select count(*) from public.enrollments where student_id =
  'f3500000-0000-4000-8000-000000000080' and class_id =
  'f3500000-0000-4000-8000-000000000040'), 1::bigint,
  'exactly one live membership remains');
select has_index('public', 'enrollments', 'enrollments_active_student_class_key',
  'partial unique enrollment index remains in place');

insert into public.students(id, student_code, full_name, default_branch_id, status)
select ('f3500000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'TEST-ROOM-STUDENT-' || i, 'TEST Student ' || i,
  'f3500000-0000-4000-8000-000000000001', 'ACTIVE'
from generate_series(81, 82) i;
insert into public.student_curriculum_enrollments
  (student_id, curriculum_id, current_level_id, started_at, status)
select id, 'f3500000-0000-4000-8000-000000000010',
  'f3500000-0000-4000-8000-000000000020', current_date, 'ACTIVE'
from public.students where id in ('f3500000-0000-4000-8000-000000000081',
  'f3500000-0000-4000-8000-000000000082');
insert into public.enrollments(student_id, class_id, started_at, status)
select id, 'f3500000-0000-4000-8000-000000000040', current_date + 1, 'ACTIVE'
from public.students where id in ('f3500000-0000-4000-8000-000000000081',
  'f3500000-0000-4000-8000-000000000082');
select throws_ok($$update public.classes set capacity = 2
  where id = 'f3500000-0000-4000-8000-000000000040'$$,
  'P0001', 'PLACEMENT_CLASS_CAPACITY_BELOW_OCCUPANCY',
  'class capacity cannot be reduced below three live memberships');

insert into auth.users(id) values ('f3500000-0000-4000-8000-000000000099');
insert into public.profiles(id, full_name, status) values
  ('f3500000-0000-4000-8000-000000000099', 'TEST Room Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'f3500000-0000-4000-8000-000000000099', id
from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'f3500000-0000-4000-8000-000000000099', true);
set local role authenticated;
select lives_ok($$insert into public.schedules(class_id, room_id, day_of_week,
  start_time, end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000051',
   extract(isodow from current_date + 3)::smallint, '10:00', '11:00', current_date + 3, 'ACTIVE')$$,
  'authenticated SUPER_ADMIN can book a room through the private trigger');
select throws_ok($$insert into public.schedules(class_id, room_id, day_of_week,
  start_time, end_time, effective_from, status) values
  ('f3500000-0000-4000-8000-000000000042', 'f3500000-0000-4000-8000-000000000050',
   extract(isodow from current_date + 1)::smallint, '18:30', '19:30', current_date + 1, 'ACTIVE')$$,
  'P0001', 'SCHEDULE_ROOM_CONFLICT',
  'authenticated role receives the room conflict rather than permission denied');
reset role;
select ok(not has_function_privilege('authenticated',
  'maintenance_private.schedule_room_conflict_code(uuid,uuid,smallint,time,time,date,date,text)',
  'EXECUTE'), 'private conflict helper is not directly callable by authenticated');

select * from finish();
rollback;
