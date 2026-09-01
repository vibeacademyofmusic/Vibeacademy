begin;

create extension if not exists pgtap
with schema extensions;

select plan(13);

insert into public.branches (
  id,
  code,
  name
)
values
  (
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-BRANCH-A',
    'Reschedule Test Branch A'
  ),
  (
    '14000000-0000-0000-0000-000000000002',
    'RESCHEDULE-TEST-BRANCH-B',
    'Reschedule Test Branch B'
  );

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '24000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-CURRICULUM',
  'Reschedule Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '34000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-LEVEL',
  'Reschedule Test Level',
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
  '44000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-COURSE',
  'Reschedule Test Course'
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
    '54000000-0000-0000-0000-000000000011',
    '14000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-CLASS-A',
    'Reschedule Test Class A',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000012',
    '14000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-CLASS-B',
    'Reschedule Test Class B',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000013',
    '14000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    'RESCHEDULE-TEST-CLASS-C',
    'Reschedule Test Class C',
    'ACTIVE'
  );

insert into public.rooms (
  id,
  branch_id,
  code,
  name,
  status
)
values
  (
    '54000000-0000-0000-0000-000000000021',
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-ROOM-A',
    'Reschedule Room A',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000022',
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-ROOM-B',
    'Reschedule Room B',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000023',
    '14000000-0000-0000-0000-000000000001',
    'RESCHEDULE-ROOM-INACTIVE',
    'Reschedule Room Inactive',
    'INACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000024',
    '14000000-0000-0000-0000-000000000002',
    'RESCHEDULE-ROOM-OTHER-BRANCH',
    'Reschedule Room Other Branch',
    'ACTIVE'
  );

insert into public.teachers (
  id,
  teacher_code,
  full_name,
  status
)
values (
  '64000000-0000-0000-0000-000000000001',
  'RESCHEDULE-TEST-TEACHER',
  'Reschedule Test Teacher',
  'ACTIVE'
);

insert into public.class_teachers (
  id,
  class_id,
  teacher_id,
  teacher_role,
  is_active,
  assigned_at
)
values
  (
    '74000000-0000-0000-0000-000000000011',
    '54000000-0000-0000-0000-000000000011',
    '64000000-0000-0000-0000-000000000001',
    'PRIMARY',
    true,
    '2026-09-01'
  ),
  (
    '74000000-0000-0000-0000-000000000012',
    '54000000-0000-0000-0000-000000000012',
    '64000000-0000-0000-0000-000000000001',
    'PRIMARY',
    true,
    '2026-09-01'
  );

insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values (
  '64000000-0000-0000-0000-000000000002',
  'RESCHEDULE-TEST-STUDENT',
  '14000000-0000-0000-0000-000000000001',
  'Reschedule Test Student'
);

insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  status
)
values (
  '74000000-0000-0000-0000-000000000021',
  '64000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000011',
  '2026-09-01',
  'ACTIVE'
);

insert into public.schedules (
  id,
  class_id,
  room_id,
  day_of_week,
  start_time,
  end_time,
  effective_from,
  timezone,
  status
)
values
  (
    '84000000-0000-0000-0000-000000000011',
    '54000000-0000-0000-0000-000000000011',
    '54000000-0000-0000-0000-000000000021',
    1,
    '09:00',
    '10:00',
    '2026-09-01',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  ),
  (
    '84000000-0000-0000-0000-000000000012',
    '54000000-0000-0000-0000-000000000012',
    '54000000-0000-0000-0000-000000000022',
    1,
    '11:00',
    '12:00',
    '2026-09-01',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  ),
  (
    '84000000-0000-0000-0000-000000000013',
    '54000000-0000-0000-0000-000000000013',
    '54000000-0000-0000-0000-000000000021',
    1,
    '13:00',
    '14:00',
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
  room_id,
  status
)
values
  (
    '94000000-0000-0000-0000-000000000011',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-07',
    '2026-09-07 09:00:00+07',
    '2026-09-07 10:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000012',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-14',
    '2026-09-10 14:00:00+07',
    '2026-09-10 15:00:00+07',
    '54000000-0000-0000-0000-000000000022',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000013',
    '84000000-0000-0000-0000-000000000012',
    '2026-09-14',
    '2026-09-10 16:00:00+07',
    '2026-09-10 17:00:00+07',
    '54000000-0000-0000-0000-000000000022',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000014',
    '84000000-0000-0000-0000-000000000013',
    '2026-09-14',
    '2026-09-10 18:00:00+07',
    '2026-09-10 19:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'SCHEDULED'
  ),
  (
    '94000000-0000-0000-0000-000000000015',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-21',
    '2026-09-21 09:00:00+07',
    '2026-09-21 10:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'COMPLETED'
  ),
  (
    '94000000-0000-0000-0000-000000000016',
    '84000000-0000-0000-0000-000000000011',
    '2026-09-28',
    '2026-09-28 09:00:00+07',
    '2026-09-28 10:00:00+07',
    '54000000-0000-0000-0000-000000000021',
    'SCHEDULED'
  );

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
values (
  '94000000-0000-0000-0000-000000000016',
  '74000000-0000-0000-0000-000000000021',
  'PRESENT'
);

select is(
  public.reschedule_session_occurrence(
    '94000000-0000-0000-0000-000000000011',
    '2026-09-09 10:00:00+07',
    '2026-09-09 11:00:00+07',
    '54000000-0000-0000-0000-000000000022',
    '  Student requested a different day  '
  ),
  '94000000-0000-0000-0000-000000000011'::uuid,
  'reschedules a scheduled occurrence without conflicts'
);

select ok(
  (
    select
      starts_at = '2026-09-09 10:00:00+07'::timestamptz
      and ends_at = '2026-09-09 11:00:00+07'::timestamptz
      and room_id =
        '54000000-0000-0000-0000-000000000022'
      and occurrence_date = '2026-09-07'
      and original_starts_at =
        '2026-09-07 09:00:00+07'::timestamptz
      and original_ends_at =
        '2026-09-07 10:00:00+07'::timestamptz
      and original_room_id =
        '54000000-0000-0000-0000-000000000021'
      and rescheduled_at is not null
      and reschedule_reason =
        'Student requested a different day'
    from public.session_occurrences
    where id = '94000000-0000-0000-0000-000000000011'
  ),
  'stores the new slot while preserving occurrence identity'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      '  '
    )
  $$,
  'P0001',
  'Reschedule reason is required',
  'requires a reschedule reason'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 13:00:00+07',
      '2026-09-09 12:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Invalid time'
    )
  $$,
  'P0001',
  'End time must be after start time',
  'rejects an invalid time range'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 10:00:00+07',
      '2026-09-09 11:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'No change'
    )
  $$,
  'P0001',
  'Reschedule must change the time or room',
  'rejects a reschedule with no changes'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000099',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Missing session'
    )
  $$,
  'P0001',
  'Session not found',
  'rejects an unknown occurrence'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000015',
      '2026-09-21 12:00:00+07',
      '2026-09-21 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Completed session'
    )
  $$,
  'P0001',
  'Only scheduled sessions can be rescheduled',
  'rejects a completed occurrence'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000016',
      '2026-09-28 12:00:00+07',
      '2026-09-28 13:00:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Attendance exists'
    )
  $$,
  'P0001',
  'Session with attendance cannot be rescheduled',
  'rejects an occurrence with attendance'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000023',
      'Inactive room'
    )
  $$,
  'P0001',
  'Room is not available',
  'rejects an inactive room'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-09 12:00:00+07',
      '2026-09-09 13:00:00+07',
      '54000000-0000-0000-0000-000000000024',
      'Other branch room'
    )
  $$,
  'P0001',
  'Room must belong to the same branch as the class',
  'rejects a room from another branch'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-10 14:30:00+07',
      '2026-09-10 15:30:00+07',
      '54000000-0000-0000-0000-000000000022',
      'Class conflict'
    )
  $$,
  'P0001',
  'This class already has an overlapping session',
  'rejects an overlapping occurrence for the same class'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-10 18:30:00+07',
      '2026-09-10 18:45:00+07',
      '54000000-0000-0000-0000-000000000021',
      'Room conflict'
    )
  $$,
  'P0001',
  'This room is already occupied during that time',
  'rejects an overlapping occurrence in the same room'
);

select throws_ok(
  $$
    select public.reschedule_session_occurrence(
      '94000000-0000-0000-0000-000000000011',
      '2026-09-10 16:30:00+07',
      '2026-09-10 16:45:00+07',
      '54000000-0000-0000-0000-000000000021',
      'Teacher conflict'
    )
  $$,
  'P0001',
  'A teacher assigned to this class is already teaching another class at that time',
  'rejects an overlapping occurrence for the same teacher'
);

select * from finish();

rollback;
