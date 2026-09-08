begin;
create extension if not exists pgtap with schema extensions;
select plan(12);
insert into public.branches (
  id,
  code,
  name
)
values (
  '11000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-BRANCH',
  'Attendance Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '21000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-CURRICULUM',
  'Attendance Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '31000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-LEVEL',
  'Attendance Test Level',
  1
);

insert into public.courses (
  id,
  curriculum_id,
  level_id,
  code,
  name
)
values (
  '41000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'ATTENDANCE-TEST-COURSE',
  'Attendance Test Course'
);

insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  status
)
values
  (
    '51000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-CLASS-A',
    'Attendance Test Class A',
    'ACTIVE'
  ),
  (
    '51000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000001',
    '41000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-CLASS-B',
    'Attendance Test Class B',
    'ACTIVE'
  );

insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values
  (
    '61000000-0000-0000-0000-000000000001',
    'ATTENDANCE-TEST-STUDENT-A',
    '11000000-0000-0000-0000-000000000001',
    'Attendance Test Student A'
  ),
  (
    '61000000-0000-0000-0000-000000000002',
    'ATTENDANCE-TEST-STUDENT-B',
    '11000000-0000-0000-0000-000000000001',
    'Attendance Test Student B'
  );

insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  status
)
values
  (
    '71000000-0000-0000-0000-000000000001',
    '61000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '71000000-0000-0000-0000-000000000002',
    '61000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000002',
    '2026-09-01',
    'ACTIVE'
  );

insert into public.schedules (
  id,
  class_id,
  day_of_week,
  start_time,
  end_time,
  effective_from,
  timezone,
  status
)
values (
  '81000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  1,
  '09:00',
  '10:00',
  '2026-09-01',
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
);

insert into public.session_occurrences (
  id,
  schedule_id,
  occurrence_date,
  starts_at,
  ends_at,
  status
)
values (
  '91000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '2026-09-07',
  '2026-09-07 09:00:00+07',
  '2026-09-07 10:00:00+07',
  'SCHEDULED'
);

insert into public.attendance_records (id, session_occurrence_id, enrollment_id, status)
values ('a1000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'PRESENT');
insert into auth.users (id) values ('b1000000-0000-0000-0000-000000000001'), ('b1000000-0000-0000-0000-000000000002');
insert into public.roles (code, name) values ('SUPER_ADMIN', 'Admin') on conflict (code) do nothing;
insert into public.user_roles (user_id, role_id) select 'b1000000-0000-0000-0000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select lives_ok($$insert into public.learning_journals (attendance_record_id, content, homework, observation)
values ('a1000000-0000-0000-0000-000000000001', 'Luyện tiết tấu', 'Ôn bài 1', 'PRACTICING')$$, 'admin writes a journal attached to attendance');
select is((select created_by from public.learning_journals where attendance_record_id = 'a1000000-0000-0000-0000-000000000001'), 'b1000000-0000-0000-0000-000000000001'::uuid, 'author comes from authenticated identity');
select throws_ok($$insert into public.learning_journals (attendance_record_id, content) values ('a1000000-0000-0000-0000-000000000001', 'Duplicate')$$, '23505', null, 'duplicate journals are rejected');
select throws_ok($$update public.learning_journals set content = ' ' $$, '23514', null, 'blank content is rejected');
select throws_ok($$update public.learning_journals set skills = repeat('x', 2001) $$, '23514', null, 'oversized skills are rejected');
select throws_ok($$update public.learning_journals set observation = 'PASS' $$, '23514', null, 'academic grades cannot be used as journal observations');
select throws_ok($$update public.learning_journals set created_by = null $$, '42501', null, 'admin cannot erase authorship');
select lives_ok($$update public.learning_journals set content = 'Luyện tiết tấu và đọc nốt' $$, 'admin edits journal content');
select is((select status from public.attendance_records where id = 'a1000000-0000-0000-0000-000000000001'), 'PRESENT', 'journal editing does not change attendance');

select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.learning_journals), 0::bigint, 'ordinary users cannot read journals');
select throws_ok($$insert into public.learning_journals (attendance_record_id, content) values ('a1000000-0000-0000-0000-000000000001', 'Unauthorized')$$, '42501', null, 'ordinary users cannot write journals');
reset role;
select throws_ok($$delete from public.attendance_records where id = 'a1000000-0000-0000-0000-000000000001'$$, '23503', null, 'journal keeps its source attendance from being deleted');
select * from finish();
rollback;
