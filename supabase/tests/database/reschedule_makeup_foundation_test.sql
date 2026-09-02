begin;

create extension if not exists pgtap
with schema extensions;

select plan(14);

insert into public.branches (
  id,
  code,
  name
)
values (
  '13000000-0000-0000-0000-000000000001',
  'MAKEUP-TEST-BRANCH',
  'Makeup Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  '23000000-0000-0000-0000-000000000001',
  'MAKEUP-TEST-CURRICULUM',
  'Makeup Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '33000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'MAKEUP-TEST-LEVEL',
  'Makeup Test Level',
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
  '43000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  'MAKEUP-TEST-COURSE',
  'Makeup Test Course'
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
    '53000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000001',
    'MAKEUP-TEST-CLASS-A',
    'Makeup Test Class A',
    'ACTIVE'
  ),
  (
    '53000000-0000-0000-0000-000000000002',
    '13000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000001',
    'MAKEUP-TEST-CLASS-B',
    'Makeup Test Class B',
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
    '54000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000001',
    'MAKEUP-ROOM-A',
    'Makeup Room A',
    'ACTIVE'
  ),
  (
    '54000000-0000-0000-0000-000000000002',
    '13000000-0000-0000-0000-000000000001',
    'MAKEUP-ROOM-B',
    'Makeup Room B',
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
    '63000000-0000-0000-0000-000000000001',
    'MAKEUP-TEST-STUDENT-A1',
    '13000000-0000-0000-0000-000000000001',
    'Makeup Test Student A1'
  ),
  (
    '63000000-0000-0000-0000-000000000002',
    'MAKEUP-TEST-STUDENT-A2',
    '13000000-0000-0000-0000-000000000001',
    'Makeup Test Student A2'
  ),
  (
    '63000000-0000-0000-0000-000000000003',
    'MAKEUP-TEST-STUDENT-A3',
    '13000000-0000-0000-0000-000000000001',
    'Makeup Test Student A3'
  ),
  (
    '63000000-0000-0000-0000-000000000004',
    'MAKEUP-TEST-STUDENT-B1',
    '13000000-0000-0000-0000-000000000001',
    'Makeup Test Student B1'
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
    '73000000-0000-0000-0000-000000000001',
    '63000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '73000000-0000-0000-0000-000000000002',
    '63000000-0000-0000-0000-000000000002',
    '53000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '73000000-0000-0000-0000-000000000003',
    '63000000-0000-0000-0000-000000000003',
    '53000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '73000000-0000-0000-0000-000000000004',
    '63000000-0000-0000-0000-000000000004',
    '53000000-0000-0000-0000-000000000002',
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
    '83000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    '54000000-0000-0000-0000-000000000001',
    1,
    '09:00',
    '10:00',
    '2026-09-01',
    'Asia/Ho_Chi_Minh',
    'ACTIVE'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '53000000-0000-0000-0000-000000000002',
    '54000000-0000-0000-0000-000000000002',
    1,
    '11:00',
    '12:00',
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
values (
  '93000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  '2026-09-07',
  '2026-09-07 09:00:00+07',
  '2026-09-07 10:00:00+07',
  '54000000-0000-0000-0000-000000000001',
  'SCHEDULED'
);

select public.generate_session_occurrences(
  '2026-09-14',
  '2026-09-14'
);

select is(
  (
    select occurrence_type
    from public.session_occurrences
    where schedule_id =
        '83000000-0000-0000-0000-000000000001'
      and occurrence_date = '2026-09-14'
  ),
  'REGULAR',
  'generator creates regular occurrences'
);

select ok(
  (
    select
      original_starts_at = starts_at
      and original_ends_at = ends_at
      and original_room_id = room_id
    from public.session_occurrences
    where schedule_id =
        '83000000-0000-0000-0000-000000000001'
      and occurrence_date = '2026-09-14'
  ),
  'generator snapshots the original time and room'
);

update public.session_occurrences
set
  starts_at = '2026-09-07 14:00:00+07',
  ends_at = '2026-09-07 15:00:00+07',
  room_id = '54000000-0000-0000-0000-000000000002',
  original_starts_at = '2026-09-07 14:00:00+07',
  original_ends_at = '2026-09-07 15:00:00+07',
  original_room_id =
    '54000000-0000-0000-0000-000000000002'
where id = '93000000-0000-0000-0000-000000000001';

select ok(
  (
    select
      starts_at = '2026-09-07 14:00:00+07'::timestamptz
      and original_starts_at =
        '2026-09-07 09:00:00+07'::timestamptz
      and original_ends_at =
        '2026-09-07 10:00:00+07'::timestamptz
      and original_room_id =
        '54000000-0000-0000-0000-000000000001'
    from public.session_occurrences
    where id = '93000000-0000-0000-0000-000000000001'
  ),
  'rescheduling preserves the immutable original snapshot'
);

select lives_ok(
  $$
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
    values (
      '93000000-0000-0000-0000-000000000002',
      '83000000-0000-0000-0000-000000000001',
      '2026-09-07',
      '2026-09-07 16:00:00+07',
      '2026-09-07 17:00:00+07',
      '54000000-0000-0000-0000-000000000001',
      'SCHEDULED',
      'MAKEUP',
      '93000000-0000-0000-0000-000000000001'
    )
  $$,
  'allows a makeup occurrence on the regular occurrence date'
);

select throws_ok(
  $$
    insert into public.session_occurrences (
      schedule_id,
      occurrence_date,
      starts_at,
      ends_at,
      status,
      occurrence_type,
      source_occurrence_id
    )
    values (
      '83000000-0000-0000-0000-000000000001',
      '2026-09-21',
      '2026-09-21 16:00:00+07',
      '2026-09-21 17:00:00+07',
      'SCHEDULED',
      'MAKEUP',
      '93000000-0000-0000-0000-000000000002'
    )
  $$,
  'P0001',
  'A makeup session must reference a regular source occurrence',
  'rejects a makeup occurrence as another makeup source'
);

select throws_ok(
  $$
    insert into public.session_occurrences (
      schedule_id,
      occurrence_date,
      starts_at,
      ends_at,
      status,
      occurrence_type,
      source_occurrence_id
    )
    values (
      '83000000-0000-0000-0000-000000000002',
      '2026-09-21',
      '2026-09-21 16:00:00+07',
      '2026-09-21 17:00:00+07',
      'SCHEDULED',
      'MAKEUP',
      '93000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'A makeup session must belong to the source occurrence class',
  'rejects makeup lineage across different classes'
);

update public.session_occurrences
set status = 'CANCELLED'
where id = '93000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    insert into public.session_occurrence_participants (
      session_occurrence_id,
      enrollment_id
    )
    values (
      '93000000-0000-0000-0000-000000000002',
      '73000000-0000-0000-0000-000000000001'
    )
  $$,
  'adds an enrollment from the makeup occurrence class'
);

select throws_ok(
  $$
    insert into public.session_occurrence_participants (
      session_occurrence_id,
      enrollment_id
    )
    values (
      '93000000-0000-0000-0000-000000000002',
      '73000000-0000-0000-0000-000000000004'
    )
  $$,
  'P0001',
  'Makeup participant must belong to the occurrence class',
  'rejects a participant from another class'
);

select throws_ok(
  $$
    insert into public.session_occurrence_participants (
      session_occurrence_id,
      enrollment_id
    )
    values (
      '93000000-0000-0000-0000-000000000001',
      '73000000-0000-0000-0000-000000000001'
    )
  $$,
  'P0001',
  'Explicit participants are only allowed for makeup sessions',
  'rejects an explicit participant on a regular occurrence'
);

insert into public.session_occurrence_participants (
  session_occurrence_id,
  enrollment_id
)
values (
  '93000000-0000-0000-0000-000000000002',
  '73000000-0000-0000-0000-000000000002'
);

select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '93000000-0000-0000-0000-000000000002',
      '73000000-0000-0000-0000-000000000003',
      'PRESENT'
    )
  $$,
  'P0001',
  'Attendance enrollment must be a makeup participant',
  'rejects attendance for a non-participant'
);

select lives_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '93000000-0000-0000-0000-000000000002',
      '73000000-0000-0000-0000-000000000001',
      'PRESENT'
    )
  $$,
  'records attendance for a makeup participant'
);

select throws_ok(
  $$
    select public.set_session_occurrence_status(
      '93000000-0000-0000-0000-000000000002',
      'COMPLETED'
    )
  $$,
  'P0001',
  'All students in the session roster must be marked before completion',
  'rejects makeup completion while participant attendance is incomplete'
);

select throws_ok(
  $$
    delete from public.session_occurrence_participants
    where session_occurrence_id =
        '93000000-0000-0000-0000-000000000002'
      and enrollment_id =
        '73000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'A makeup participant with attendance cannot be removed',
  'prevents removing a participant with attendance'
);

insert into public.attendance_records (
  session_occurrence_id,
  enrollment_id,
  status
)
values (
  '93000000-0000-0000-0000-000000000002',
  '73000000-0000-0000-0000-000000000002',
  'EXCUSED'
);

select is(
  public.set_session_occurrence_status(
    '93000000-0000-0000-0000-000000000002',
    'COMPLETED'
  ),
  'COMPLETED',
  'completes a makeup occurrence when every participant is marked'
);

select * from finish();

rollback;
