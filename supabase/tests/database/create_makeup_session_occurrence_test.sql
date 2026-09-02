begin;

create extension if not exists pgtap
with schema extensions;

select plan(16);

insert into public.branches (
  id,
  code,
  name
)
values
  (
    '15000000-0000-0000-0000-000000000001',
    'CREATE-MAKEUP-TEST-BRANCH-A',
    'Create Makeup Test Branch A'
  ),
  (
    '15000000-0000-0000-0000-000000000002',
    'CREATE-MAKEUP-TEST-BRANCH-B',
    'Create Makeup Test Branch B'
  );

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '25000000-0000-0000-0000-000000000001',
  'CREATE-MAKEUP-TEST-CURRICULUM',
  'Create Makeup Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '35000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  'CREATE-MAKEUP-TEST-LEVEL',
  'Create Makeup Test Level',
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
  '45000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001',
  'CREATE-MAKEUP-TEST-COURSE',
  'Create Makeup Test Course'
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
    '55000000-0000-0000-0000-000000000011',
    '15000000-0000-0000-0000-000000000001',
    '45000000-0000-0000-0000-000000000001',
    'CREATE-MAKEUP-TEST-CLASS-A',
    'Create Makeup Test Class A',
    'ACTIVE'
  ),
  (
    '55000000-0000-0000-0000-000000000012',
    '15000000-0000-0000-0000-000000000001',
    '45000000-0000-0000-0000-000000000001',
    'CREATE-MAKEUP-TEST-CLASS-B',
    'Create Makeup Test Class B',
    'ACTIVE'
  ),
  (
    '55000000-0000-0000-0000-000000000013',
    '15000000-0000-0000-0000-000000000001',
    '45000000-0000-0000-0000-000000000001',
    'CREATE-MAKEUP-TEST-CLASS-C',
    'Create Makeup Test Class C',
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
    '55000000-0000-0000-0000-000000000021',
    '15000000-0000-0000-0000-000000000001',
    'CREATE-MAKEUP-ROOM-A',
    'Create Makeup Room A',
    'ACTIVE'
  ),
  (
    '55000000-0000-0000-0000-000000000022',
    '15000000-0000-0000-0000-000000000001',
    'CREATE-MAKEUP-ROOM-B',
    'Create Makeup Room B',
    'ACTIVE'
  ),
  (
    '55000000-0000-0000-0000-000000000023',
    '15000000-0000-0000-0000-000000000001',
    'CREATE-MAKEUP-ROOM-INACTIVE',
    'Create Makeup Room Inactive',
    'INACTIVE'
  ),
  (
    '55000000-0000-0000-0000-000000000024',
    '15000000-0000-0000-0000-000000000002',
    'CREATE-MAKEUP-ROOM-OTHER-BRANCH',
    'Create Makeup Room Other Branch',
    'ACTIVE'
  );

insert into public.teachers (
  id,
  teacher_code,
  full_name,
  status
)
values (
  '65000000-0000-0000-0000-000000000001',
  'CREATE-MAKEUP-TEST-TEACHER',
  'Create Makeup Test Teacher',
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
    '75000000-0000-0000-0000-000000000011',
    '55000000-0000-0000-0000-000000000011',
    '65000000-0000-0000-0000-000000000001',
    'PRIMARY',
    true,
    '2026-09-01'
  ),
  (
    '75000000-0000-0000-0000-000000000012',
    '55000000-0000-0000-0000-000000000012',
    '65000000-0000-0000-0000-000000000001',
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
values
  (
    '65000000-0000-0000-0000-000000000011',
    'CREATE-MAKEUP-TEST-STUDENT-A1',
    '15000000-0000-0000-0000-000000000001',
    'Create Makeup Test Student A1'
  ),
  (
    '65000000-0000-0000-0000-000000000012',
    'CREATE-MAKEUP-TEST-STUDENT-A2',
    '15000000-0000-0000-0000-000000000001',
    'Create Makeup Test Student A2'
  ),
  (
    '65000000-0000-0000-0000-000000000013',
    'CREATE-MAKEUP-TEST-STUDENT-A3',
    '15000000-0000-0000-0000-000000000001',
    'Create Makeup Test Student A3'
  ),
  (
    '65000000-0000-0000-0000-000000000014',
    'CREATE-MAKEUP-TEST-STUDENT-B1',
    '15000000-0000-0000-0000-000000000001',
    'Create Makeup Test Student B1'
  );

insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  ended_at,
  status
)
values
  (
    '75000000-0000-0000-0000-000000000021',
    '65000000-0000-0000-0000-000000000011',
    '55000000-0000-0000-0000-000000000011',
    '2026-09-01',
    null,
    'ACTIVE'
  ),
  (
    '75000000-0000-0000-0000-000000000022',
    '65000000-0000-0000-0000-000000000012',
    '55000000-0000-0000-0000-000000000011',
    '2026-09-01',
    null,
    'ACTIVE'
  ),
  (
    '75000000-0000-0000-0000-000000000023',
    '65000000-0000-0000-0000-000000000013',
    '55000000-0000-0000-0000-000000000011',
    '2026-09-01',
    '2026-09-06',
    'WITHDRAWN'
  ),
  (
    '75000000-0000-0000-0000-000000000024',
    '65000000-0000-0000-0000-000000000014',
    '55000000-0000-0000-0000-000000000012',
    '2026-09-01',
    null,
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
    '85000000-0000-0000-0000-000000000011',
    '55000000-0000-0000-0000-000000000011',
    '55000000-0000-0000-0000-000000000021',
    1,
    '09:00',
    '10:00',
    '2026-09-01',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  ),
  (
    '85000000-0000-0000-0000-000000000012',
    '55000000-0000-0000-0000-000000000012',
    '55000000-0000-0000-0000-000000000022',
    1,
    '11:00',
    '12:00',
    '2026-09-01',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  ),
  (
    '85000000-0000-0000-0000-000000000013',
    '55000000-0000-0000-0000-000000000013',
    '55000000-0000-0000-0000-000000000021',
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
  status,
  occurrence_type,
  source_occurrence_id
)
values
  (
    '95000000-0000-0000-0000-000000000011',
    '85000000-0000-0000-0000-000000000011',
    '2026-09-07',
    '2026-09-07 09:00:00+07',
    '2026-09-07 10:00:00+07',
    '55000000-0000-0000-0000-000000000021',
    'SCHEDULED',
    'REGULAR',
    null
  ),
  (
    '95000000-0000-0000-0000-000000000012',
    '85000000-0000-0000-0000-000000000011',
    '2026-09-14',
    '2026-09-14 09:00:00+07',
    '2026-09-14 10:00:00+07',
    '55000000-0000-0000-0000-000000000021',
    'SCHEDULED',
    'REGULAR',
    null
  ),
  (
    '95000000-0000-0000-0000-000000000013',
    '85000000-0000-0000-0000-000000000011',
    '2026-09-15',
    '2026-09-15 09:00:00+07',
    '2026-09-15 10:00:00+07',
    '55000000-0000-0000-0000-000000000021',
    'SCHEDULED',
    'MAKEUP',
    '95000000-0000-0000-0000-000000000011'
  ),
  (
    '95000000-0000-0000-0000-000000000014',
    '85000000-0000-0000-0000-000000000011',
    '2026-09-21',
    '2026-09-20 14:00:00+07',
    '2026-09-20 15:00:00+07',
    '55000000-0000-0000-0000-000000000022',
    'SCHEDULED',
    'REGULAR',
    null
  ),
  (
    '95000000-0000-0000-0000-000000000015',
    '85000000-0000-0000-0000-000000000012',
    '2026-09-21',
    '2026-09-20 16:00:00+07',
    '2026-09-20 17:00:00+07',
    '55000000-0000-0000-0000-000000000022',
    'SCHEDULED',
    'REGULAR',
    null
  ),
  (
    '95000000-0000-0000-0000-000000000016',
    '85000000-0000-0000-0000-000000000013',
    '2026-09-21',
    '2026-09-20 18:00:00+07',
    '2026-09-20 19:00:00+07',
    '55000000-0000-0000-0000-000000000021',
    'SCHEDULED',
    'REGULAR',
    null
  );

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
values
  (
    '95000000-0000-0000-0000-000000000011',
    '75000000-0000-0000-0000-000000000021',
    'EXCUSED'
  ),
  (
    '95000000-0000-0000-0000-000000000011',
    '75000000-0000-0000-0000-000000000022',
    'EXCUSED'
  );

update public.session_occurrences
set status = 'COMPLETED'
where id = '95000000-0000-0000-0000-000000000011';

create temporary table makeup_test_result (
  id uuid not null
) on commit drop;

select lives_ok(
  $$
    insert into makeup_test_result (id)
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-19 10:00:00+07',
      '2026-09-19 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array[
        '75000000-0000-0000-0000-000000000021'::uuid,
        '75000000-0000-0000-0000-000000000022'::uuid
      ],
      '  Two students need a makeup class  '
    )
  $$,
  'creates a makeup occurrence and roster atomically'
);

select ok(
  (
    select
      occurrence.schedule_id =
        '85000000-0000-0000-0000-000000000011'
      and occurrence.occurrence_date = '2026-09-19'
      and occurrence.starts_at =
        '2026-09-19 10:00:00+07'::timestamptz
      and occurrence.ends_at =
        '2026-09-19 11:00:00+07'::timestamptz
      and occurrence.room_id =
        '55000000-0000-0000-0000-000000000022'
      and occurrence.status = 'SCHEDULED'
      and occurrence.occurrence_type = 'MAKEUP'
      and occurrence.source_occurrence_id =
        '95000000-0000-0000-0000-000000000011'
      and occurrence.original_starts_at = occurrence.starts_at
      and occurrence.original_ends_at = occurrence.ends_at
      and occurrence.original_room_id = occurrence.room_id
      and occurrence.notes =
        'Two students need a makeup class'
    from public.session_occurrences as occurrence
    join makeup_test_result as result
      on result.id = occurrence.id
  ),
  'stores makeup identity and its original snapshot'
);

select ok(
  (
    select
      count(*) = 2
      and count(*) filter (
        where participant.enrollment_id in (
          '75000000-0000-0000-0000-000000000021',
          '75000000-0000-0000-0000-000000000022'
        )
      ) = 2
    from public.session_occurrence_participants as participant
    join makeup_test_result as result
      on result.id = participant.session_occurrence_id
  ),
  'stores exactly the selected makeup participants'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000012',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Scheduled source'
    )
  $$,
  'P0001',
  'A makeup session requires a completed or cancelled source session',
  'rejects a scheduled source occurrence'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000013',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Makeup source'
    )
  $$,
  'P0001',
  'A makeup session must reference a regular source occurrence',
  'rejects a makeup occurrence as the source'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000099',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Missing source'
    )
  $$,
  'P0001',
  'Source session not found',
  'rejects an unknown source occurrence'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array[]::uuid[],
      'No participants'
    )
  $$,
  'P0001',
  'At least one makeup participant is required',
  'requires at least one participant'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array[
        '75000000-0000-0000-0000-000000000021'::uuid,
        '75000000-0000-0000-0000-000000000021'::uuid
      ],
      'Duplicate participant'
    )
  $$,
  'P0001',
  'Makeup participants must be unique',
  'rejects duplicate participants'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array['75000000-0000-0000-0000-000000000023'::uuid],
      'Participant outside source roster'
    )
  $$,
  'P0001',
  'Selected student does not have an available makeup credit for this class',
  'rejects a participant without an available makeup credit'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      '  '
    )
  $$,
  'P0001',
  'Makeup reason is required',
  'requires a makeup reason'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-21 11:00:00+07',
      '2026-09-21 10:00:00+07',
      '55000000-0000-0000-0000-000000000022',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Invalid time'
    )
  $$,
  'P0001',
  'End time must be after start time',
  'rejects an invalid time range'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000023',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Inactive room'
    )
  $$,
  'P0001',
  'Room is not available',
  'rejects an inactive room'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-21 10:00:00+07',
      '2026-09-21 11:00:00+07',
      '55000000-0000-0000-0000-000000000024',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Other branch room'
    )
  $$,
  'P0001',
  'Room must belong to the same branch as the class',
  'rejects a room from another branch'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-20 14:30:00+07',
      '2026-09-20 15:30:00+07',
      '55000000-0000-0000-0000-000000000022',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Class conflict'
    )
  $$,
  'P0001',
  'This class already has an overlapping session',
  'rejects an overlapping occurrence for the same class'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-20 18:30:00+07',
      '2026-09-20 18:45:00+07',
      '55000000-0000-0000-0000-000000000021',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Room conflict'
    )
  $$,
  'P0001',
  'This room is already occupied during that time',
  'rejects an overlapping occurrence in the same room'
);

select throws_ok(
  $$
    select public.create_makeup_session_occurrence(
      '95000000-0000-0000-0000-000000000011',
      '2026-09-20 16:30:00+07',
      '2026-09-20 16:45:00+07',
      '55000000-0000-0000-0000-000000000021',
      array['75000000-0000-0000-0000-000000000021'::uuid],
      'Teacher conflict'
    )
  $$,
  'P0001',
  'A teacher assigned to this class is already teaching another class at that time',
  'rejects an overlapping occurrence for the same teacher'
);

select * from finish();

rollback;
