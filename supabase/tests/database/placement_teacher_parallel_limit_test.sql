-- The owner permits one PRIMARY teacher on two simultaneous teaching shifts
-- in separate rooms; a third concurrent shift still exceeds that limit.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('f3800000-0000-4000-8000-000000000001', 'TEST-TEACHER-PARALLEL', 'TEST Parallel');
insert into public.curriculums(id, code, name) values
  ('f3800000-0000-4000-8000-000000000010', 'TEST-TEACHER-PIANO', 'TEST Piano');
insert into public.courses(id, curriculum_id, code, name) values
  ('f3800000-0000-4000-8000-000000000030',
   'f3800000-0000-4000-8000-000000000010', 'TEST-TEACHER-COURSE', 'TEST Piano');
insert into public.classes(id, branch_id, course_id, code, name, class_type,
  capacity, status) values
  ('f3800000-0000-4000-8000-000000000040', 'f3800000-0000-4000-8000-000000000001',
   'f3800000-0000-4000-8000-000000000030', 'TEST-TEACHER-A', 'TEST Shift A', 'GROUP', 2, 'ACTIVE'),
  ('f3800000-0000-4000-8000-000000000041', 'f3800000-0000-4000-8000-000000000001',
   'f3800000-0000-4000-8000-000000000030', 'TEST-TEACHER-B', 'TEST Shift B', 'GROUP', 2, 'ACTIVE'),
  ('f3800000-0000-4000-8000-000000000042', 'f3800000-0000-4000-8000-000000000001',
   'f3800000-0000-4000-8000-000000000030', 'TEST-TEACHER-C', 'TEST Shift C', 'GROUP', 2, 'ACTIVE');
insert into public.rooms(id, branch_id, code, name, capacity, status) values
  ('f3800000-0000-4000-8000-000000000050', 'f3800000-0000-4000-8000-000000000001',
   'TEST-TEACHER-ROOM-A', 'TEST Room A', 2, 'ACTIVE'),
  ('f3800000-0000-4000-8000-000000000051', 'f3800000-0000-4000-8000-000000000001',
   'TEST-TEACHER-ROOM-B', 'TEST Room B', 2, 'ACTIVE'),
  ('f3800000-0000-4000-8000-000000000052', 'f3800000-0000-4000-8000-000000000001',
   'TEST-TEACHER-ROOM-C', 'TEST Room C', 2, 'ACTIVE');
insert into public.teachers(id, teacher_code, full_name) values
  ('f3800000-0000-4000-8000-000000000060', 'TEST-TEACHER-PRIMARY', 'TEST Primary'),
  ('f3800000-0000-4000-8000-000000000061', 'TEST-TEACHER-SECOND', 'TEST Second');
insert into public.class_teachers(class_id, teacher_id, teacher_role, assigned_at) values
  ('f3800000-0000-4000-8000-000000000040', 'f3800000-0000-4000-8000-000000000060',
   'PRIMARY', current_date),
  ('f3800000-0000-4000-8000-000000000041', 'f3800000-0000-4000-8000-000000000060',
   'PRIMARY', current_date),
  ('f3800000-0000-4000-8000-000000000042', 'f3800000-0000-4000-8000-000000000060',
   'PRIMARY', current_date);
insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('f3800000-0000-4000-8000-000000000080', 'TEST-TEACHER-STUDENT', 'TEST Learner',
   'f3800000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.schedules(id, class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3800000-0000-4000-8000-000000000070', 'f3800000-0000-4000-8000-000000000040',
   'f3800000-0000-4000-8000-000000000050',
   extract(isodow from current_date + 1)::smallint,
   time '18:00', time '19:00', current_date + 1, 'ACTIVE'),
  ('f3800000-0000-4000-8000-000000000071', 'f3800000-0000-4000-8000-000000000041',
   'f3800000-0000-4000-8000-000000000051',
   extract(isodow from current_date + 1)::smallint,
   time '18:00', time '19:00', current_date + 1, 'ACTIVE');

select is(public.placement_schedule_check(
  'f3800000-0000-4000-8000-000000000041',
  'f3800000-0000-4000-8000-000000000080', current_date + 1),
  'CLEAR', 'second concurrent shift in another room is allowed');

select throws_ok($$insert into public.schedules(id, class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3800000-0000-4000-8000-000000000072', 'f3800000-0000-4000-8000-000000000042',
   'f3800000-0000-4000-8000-000000000052',
   extract(isodow from current_date + 1)::smallint,
   time '18:00', time '19:00', current_date + 1, 'ACTIVE')$$,
  'P0001', 'A primary teacher already has two overlapping teaching shifts at that time',
  'third simultaneous shift for one PRIMARY teacher is rejected at write time');

update public.class_teachers set teacher_id = 'f3800000-0000-4000-8000-000000000061'
where class_id = 'f3800000-0000-4000-8000-000000000042';
insert into public.schedules(id, class_id, room_id, day_of_week, start_time,
  end_time, effective_from, status) values
  ('f3800000-0000-4000-8000-000000000072', 'f3800000-0000-4000-8000-000000000042',
   'f3800000-0000-4000-8000-000000000052',
   extract(isodow from current_date + 1)::smallint,
   time '18:00', time '19:00', current_date + 1, 'ACTIVE');
select is(public.placement_schedule_check(
  'f3800000-0000-4000-8000-000000000042',
  'f3800000-0000-4000-8000-000000000080', current_date + 1),
  'CLEAR', 'separately staffed third shift is allowed');

select * from finish();
rollback;
