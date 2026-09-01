begin;

create extension if not exists pgtap
with schema extensions;

select plan(10);

insert into public.branches (
  id,
  code,
  name
)
values (
  '12000000-0000-0000-0000-000000000001',
  'STATUS-TEST-BRANCH',
  'Status Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '22000000-0000-0000-0000-000000000001',
  'STATUS-TEST-CURRICULUM',
  'Status Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '32000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'STATUS-TEST-LEVEL',
  'Status Test Level',
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
  '42000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '32000000-0000-0000-0000-000000000001',
  'STATUS-TEST-COURSE',
  'Status Test Course'
);

insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  status
)
values (
  '52000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  'STATUS-TEST-CLASS',
  'Status Test Class',
  'ACTIVE'
);

insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values (
  '62000000-0000-0000-0000-000000000001',
  'STATUS-TEST-STUDENT',
  '12000000-0000-0000-0000-000000000001',
  'Status Test Student'
);

insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  status
)
values (
  '72000000-0000-0000-0000-000000000001',
  '62000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
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
  '82000000-0000-0000-0000-000000000001',
  '52000000-0000-0000-0000-000000000001',
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
values
  (
    '92000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000001',
    '2026-09-07',
    '2026-09-07 09:00:00+07',
    '2026-09-07 10:00:00+07',
    'SCHEDULED'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000001',
    '2026-09-14',
    '2026-09-14 09:00:00+07',
    '2026-09-14 10:00:00+07',
    'SCHEDULED'
  );

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '92000000-0000-0000-0000-000000000001',
      'COMPLETED'
    )
  $$,
  'P0001',
  'All students in the session roster must be marked before completion',
  'rejects completion while attendance is incomplete'
);

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
values (
  '92000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000001',
  'PRESENT'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000001',
    'COMPLETED'
  ),
  'COMPLETED',
  'completes a fully marked session'
);

select is(
  (
    select status
    from public.session_occurrences
    where id =
      '92000000-0000-0000-0000-000000000001'
  ),
  'COMPLETED',
  'stores the completed status'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '92000000-0000-0000-0000-000000000001',
      'CANCELLED'
    )
  $$,
  'P0001',
  'Invalid session status transition from COMPLETED to CANCELLED',
  'rejects a direct completed-to-cancelled transition'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000001',
    'SCHEDULED'
  ),
  'SCHEDULED',
  'reopens a completed session'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '92000000-0000-0000-0000-000000000001',
      'CANCELLED'
    )
  $$,
  'P0001',
  'A session with attendance records cannot be cancelled',
  'rejects cancellation when attendance exists'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000002',
    'CANCELLED'
  ),
  'CANCELLED',
  'cancels a session without attendance'
);

select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '92000000-0000-0000-0000-000000000002',
      '72000000-0000-0000-0000-000000000001',
      'PRESENT'
    )
  $$,
  'P0001',
  'Attendance cannot be recorded for a cancelled session',
  'rejects attendance for a cancelled session'
);

select is(
  public.set_session_occurrence_status(
    '92000000-0000-0000-0000-000000000002',
    'SCHEDULED'
  ),
  'SCHEDULED',
  'restores a cancelled session'
);

select lives_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '92000000-0000-0000-0000-000000000002',
      '72000000-0000-0000-0000-000000000001',
      'PRESENT'
    )
  $$,
  'allows attendance after a cancelled session is restored'
);

select * from finish();

rollback;
