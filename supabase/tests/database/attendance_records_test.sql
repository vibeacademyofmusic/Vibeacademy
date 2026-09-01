begin;

create extension if not exists pgtap
with schema extensions;

select plan(7);

select has_table(
  'public',
  'attendance_records',
  'attendance records table exists'
);

select fk_ok(
  'public',
  'attendance_records',
  'session_occurrence_id',
  'public',
  'session_occurrences',
  'id',
  'attendance references a concrete session occurrence'
);

select fk_ok(
  'public',
  'attendance_records',
  'enrollment_id',
  'public',
  'enrollments',
  'id',
  'attendance references a class enrollment'
);

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

select lives_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '91000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      'PRESENT'
    )
  $$,
  'records attendance for an enrollment in the occurrence class'
);

select is(
  (
    select status
    from public.attendance_records
    where session_occurrence_id =
      '91000000-0000-0000-0000-000000000001'
      and enrollment_id =
        '71000000-0000-0000-0000-000000000001'
  ),
  'PRESENT',
  'stores the attendance status'
);

select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '91000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      'ABSENT'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "attendance_records_occurrence_enrollment_key"',
  'rejects duplicate attendance for the same occurrence and enrollment'
);

select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '91000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000002',
      'PRESENT'
    )
  $$,
  'P0001',
  'Attendance enrollment must belong to the occurrence class',
  'rejects an enrollment from another class'
);

select * from finish();

rollback;
