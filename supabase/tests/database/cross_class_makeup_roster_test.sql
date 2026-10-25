begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into public.branches (id, code, name)
values ('cc250000-0000-4000-8000-000000000001', 'CROSS-MAKEUP-BRANCH', 'Cross Makeup Branch');

insert into public.curriculums (id, code, name)
values
  ('cc250000-0000-4000-8000-000000000002', 'CROSS-MAKEUP-PROGRAM', 'Cross Makeup Program'),
  ('cc250000-0000-4000-8000-000000000003', 'CROSS-MAKEUP-OTHER', 'Cross Makeup Other Program');

insert into public.curriculum_levels (id, curriculum_id, code, name, sequence_no)
values
  ('cc250000-0000-4000-8000-000000000004', 'cc250000-0000-4000-8000-000000000002', 'CROSS-MAKEUP-LEVEL', 'Cross Makeup Level', 1),
  ('cc250000-0000-4000-8000-000000000007', 'cc250000-0000-4000-8000-000000000003', 'CROSS-MAKEUP-OTHER-LEVEL', 'Cross Makeup Other Level', 1);

insert into public.courses (id, curriculum_id, level_id, code, name)
values
  ('cc250000-0000-4000-8000-000000000005', 'cc250000-0000-4000-8000-000000000002', 'cc250000-0000-4000-8000-000000000004', 'CROSS-MAKEUP-COURSE', 'Cross Makeup Course'),
  ('cc250000-0000-4000-8000-000000000006', 'cc250000-0000-4000-8000-000000000003', 'cc250000-0000-4000-8000-000000000007', 'CROSS-MAKEUP-OTHER-COURSE', 'Cross Makeup Other Course');

insert into public.classes (id, branch_id, course_id, curriculum_id, code, name, class_type, status, accepted_from_level_id, accepted_to_level_id, capacity)
values
  ('cc250000-0000-4000-8000-000000000011', 'cc250000-0000-4000-8000-000000000001', 'cc250000-0000-4000-8000-000000000005', 'cc250000-0000-4000-8000-000000000002', 'CROSS-MAKEUP-A', 'Cross Makeup A', 'GROUP', 'ACTIVE', 'cc250000-0000-4000-8000-000000000004', 'cc250000-0000-4000-8000-000000000004', 6),
  ('cc250000-0000-4000-8000-000000000012', 'cc250000-0000-4000-8000-000000000001', 'cc250000-0000-4000-8000-000000000005', 'cc250000-0000-4000-8000-000000000002', 'CROSS-MAKEUP-B', 'Cross Makeup B', 'GROUP', 'ACTIVE', 'cc250000-0000-4000-8000-000000000004', 'cc250000-0000-4000-8000-000000000004', 6),
  ('cc250000-0000-4000-8000-000000000013', 'cc250000-0000-4000-8000-000000000001', 'cc250000-0000-4000-8000-000000000006', 'cc250000-0000-4000-8000-000000000003', 'CROSS-MAKEUP-C', 'Cross Makeup C', 'GROUP', 'ACTIVE', 'cc250000-0000-4000-8000-000000000007', 'cc250000-0000-4000-8000-000000000007', 6);

insert into public.rooms (id, branch_id, code, name, status, capacity)
values
  ('cc250000-0000-4000-8000-000000000021', 'cc250000-0000-4000-8000-000000000001', 'CROSS-MAKEUP-ROOM-A', 'Cross Makeup Room A', 'ACTIVE', 6),
  ('cc250000-0000-4000-8000-000000000022', 'cc250000-0000-4000-8000-000000000001', 'CROSS-MAKEUP-ROOM-B', 'Cross Makeup Room B', 'ACTIVE', 6),
  ('cc250000-0000-4000-8000-000000000023', 'cc250000-0000-4000-8000-000000000001', 'CROSS-MAKEUP-ROOM-C', 'Cross Makeup Room C', 'ACTIVE', 6);

insert into public.teachers (id, teacher_code, full_name, status)
values ('cc250000-0000-4000-8000-000000000031', 'CROSS-MAKEUP-TEACHER', 'Cross Makeup Teacher', 'ACTIVE');

insert into public.teacher_branches (teacher_id, branch_id, is_primary)
values ('cc250000-0000-4000-8000-000000000031', 'cc250000-0000-4000-8000-000000000001', true);

insert into public.class_teachers (id, class_id, teacher_id, teacher_role, is_active, assigned_at)
values
  ('cc250000-0000-4000-8000-000000000041', 'cc250000-0000-4000-8000-000000000011', 'cc250000-0000-4000-8000-000000000031', 'PRIMARY', true, '2026-09-01'),
  ('cc250000-0000-4000-8000-000000000042', 'cc250000-0000-4000-8000-000000000012', 'cc250000-0000-4000-8000-000000000031', 'PRIMARY', true, '2026-09-01'),
  ('cc250000-0000-4000-8000-000000000043', 'cc250000-0000-4000-8000-000000000013', 'cc250000-0000-4000-8000-000000000031', 'PRIMARY', true, '2026-09-01');

insert into public.students (id, student_code, default_branch_id, full_name, status)
values
  ('cc250000-0000-4000-8000-000000000051', 'CROSS-MAKEUP-HOST', 'cc250000-0000-4000-8000-000000000001', 'Cross Makeup Host', 'ACTIVE'),
  ('cc250000-0000-4000-8000-000000000052', 'CROSS-MAKEUP-GUEST', 'cc250000-0000-4000-8000-000000000001', 'Cross Makeup Guest', 'ACTIVE'),
  ('cc250000-0000-4000-8000-000000000053', 'CROSS-MAKEUP-OTHER', 'cc250000-0000-4000-8000-000000000001', 'Cross Makeup Other', 'ACTIVE');

insert into public.student_curriculum_enrollments (student_id, curriculum_id, current_level_id, started_at, status, is_primary)
values
  ('cc250000-0000-4000-8000-000000000051', 'cc250000-0000-4000-8000-000000000002', 'cc250000-0000-4000-8000-000000000004', '2026-09-01', 'ACTIVE', true),
  ('cc250000-0000-4000-8000-000000000052', 'cc250000-0000-4000-8000-000000000002', 'cc250000-0000-4000-8000-000000000004', '2026-09-01', 'ACTIVE', true),
  ('cc250000-0000-4000-8000-000000000053', 'cc250000-0000-4000-8000-000000000003', 'cc250000-0000-4000-8000-000000000007', '2026-09-01', 'ACTIVE', true);

insert into public.schedules (id, class_id, room_id, day_of_week, start_time, end_time, effective_from, timezone, status)
values
  ('cc250000-0000-4000-8000-000000000071', 'cc250000-0000-4000-8000-000000000011', 'cc250000-0000-4000-8000-000000000021', 1, '09:00', '10:00', '2026-09-01', 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('cc250000-0000-4000-8000-000000000072', 'cc250000-0000-4000-8000-000000000012', 'cc250000-0000-4000-8000-000000000022', 1, '11:00', '12:00', '2026-09-01', 'Asia/Ho_Chi_Minh', 'ACTIVE'),
  ('cc250000-0000-4000-8000-000000000073', 'cc250000-0000-4000-8000-000000000013', 'cc250000-0000-4000-8000-000000000023', 3, '09:00', '10:00', '2026-09-01', 'Asia/Ho_Chi_Minh', 'ACTIVE');

insert into public.enrollments (id, student_id, class_id, started_at, status)
values
  ('cc250000-0000-4000-8000-000000000061', 'cc250000-0000-4000-8000-000000000051', 'cc250000-0000-4000-8000-000000000011', '2026-09-01', 'ACTIVE'),
  ('cc250000-0000-4000-8000-000000000062', 'cc250000-0000-4000-8000-000000000052', 'cc250000-0000-4000-8000-000000000012', '2026-09-01', 'ACTIVE'),
  ('cc250000-0000-4000-8000-000000000063', 'cc250000-0000-4000-8000-000000000053', 'cc250000-0000-4000-8000-000000000013', '2026-09-01', 'ACTIVE');

insert into public.session_occurrences (id, schedule_id, occurrence_date, starts_at, ends_at, room_id, status, occurrence_type, source_occurrence_id)
values
  ('cc250000-0000-4000-8000-000000000081', 'cc250000-0000-4000-8000-000000000072', '2026-09-07', '2026-09-07 11:00:00+07', '2026-09-07 12:00:00+07', 'cc250000-0000-4000-8000-000000000022', 'SCHEDULED', 'REGULAR', null),
  ('cc250000-0000-4000-8000-000000000084', 'cc250000-0000-4000-8000-000000000073', '2026-09-09', '2026-09-09 09:00:00+07', '2026-09-09 10:00:00+07', 'cc250000-0000-4000-8000-000000000023', 'SCHEDULED', 'REGULAR', null),
  ('cc250000-0000-4000-8000-000000000083', 'cc250000-0000-4000-8000-000000000071', '2026-09-07', '2026-09-07 09:00:00+07', '2026-09-07 10:00:00+07', 'cc250000-0000-4000-8000-000000000021', 'SCHEDULED', 'REGULAR', null),
  ('cc250000-0000-4000-8000-000000000082', 'cc250000-0000-4000-8000-000000000071', '2026-09-16', '2026-09-16 09:00:00+07', '2026-09-16 10:00:00+07', 'cc250000-0000-4000-8000-000000000021', 'SCHEDULED', 'MAKEUP', 'cc250000-0000-4000-8000-000000000083');

insert into public.makeup_credits (id, enrollment_id, source_occurrence_id, source_reason, status)
values
  ('cc250000-0000-4000-8000-000000000091', 'cc250000-0000-4000-8000-000000000062', 'cc250000-0000-4000-8000-000000000081', 'SESSION_CANCELLED', 'AVAILABLE'),
  ('cc250000-0000-4000-8000-000000000092', 'cc250000-0000-4000-8000-000000000063', 'cc250000-0000-4000-8000-000000000084', 'SESSION_CANCELLED', 'AVAILABLE');

select lives_ok(
  $$insert into public.session_occurrence_participants (session_occurrence_id, enrollment_id, makeup_credit_id, booking_status)
    values ('cc250000-0000-4000-8000-000000000082', 'cc250000-0000-4000-8000-000000000062', 'cc250000-0000-4000-8000-000000000091', 'ACTIVE')$$,
  'a compatible student from another class can take the makeup seat'
);

select is(
  (select count(*) from public.session_teaching_roster('cc250000-0000-4000-8000-000000000082')
    where enrollment_id = 'cc250000-0000-4000-8000-000000000062'),
  1::bigint,
  'week and attendance roster includes the cross-class makeup student'
);

select lives_ok(
  $$insert into public.attendance_records (session_occurrence_id, enrollment_id, status)
    values ('cc250000-0000-4000-8000-000000000082', 'cc250000-0000-4000-8000-000000000062', 'PRESENT')$$,
  'attendance can be recorded for the cross-class makeup student'
);

select is(
  (select count(*) from public.session_teaching_roster('cc250000-0000-4000-8000-000000000082')),
  1::bigint,
  'headcount is the booked makeup roster, not the empty host-class list'
);

select throws_ok(
  $$insert into public.session_occurrence_participants (session_occurrence_id, enrollment_id, makeup_credit_id, booking_status)
    values ('cc250000-0000-4000-8000-000000000082', 'cc250000-0000-4000-8000-000000000063', 'cc250000-0000-4000-8000-000000000092', 'ACTIVE')$$,
  'P0001',
  'Makeup participant must belong to the occurrence class or a compatible program',
  'a student outside the program is not added to the roster'
);

select * from finish();

rollback;
