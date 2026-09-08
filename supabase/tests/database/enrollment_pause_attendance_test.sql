begin;

create extension if not exists pgtap
with schema extensions;

select plan(12);


-- =========================================================
-- TEST DATA
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  '18000000-0000-0000-0000-000000000001',
  'PAUSE-ATTENDANCE-BRANCH',
  'Pause Attendance Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  '28000000-0000-0000-0000-000000000001',
  'PAUSE-ATTENDANCE-CURRICULUM',
  'Pause Attendance Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '38000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  'PAUSE-ATTENDANCE-LEVEL',
  'Pause Attendance Level',
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
  '48000000-0000-0000-0000-000000000001',
  '28000000-0000-0000-0000-000000000001',
  '38000000-0000-0000-0000-000000000001',
  'PAUSE-ATTENDANCE-COURSE',
  'Pause Attendance Course'
);


insert into public.classes (
  id,
  branch_id,
  course_id,
  code,
  name,
  class_type,
  capacity,
  status
)
values (
  '58000000-0000-0000-0000-000000000001',
  '18000000-0000-0000-0000-000000000001',
  '48000000-0000-0000-0000-000000000001',
  'PAUSE-ATTENDANCE-CLASS',
  'Pause Attendance Class',
  'GROUP',
  5,
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
    '68000000-0000-0000-0000-000000000001',
    'PAUSE-ATTENDANCE-STUDENT-A',
    '18000000-0000-0000-0000-000000000001',
    'Paused Student'
  ),
  (
    '68000000-0000-0000-0000-000000000002',
    'PAUSE-ATTENDANCE-STUDENT-B',
    '18000000-0000-0000-0000-000000000001',
    'Active Student'

  );
insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values
  (
    '68000000-0000-0000-0000-000000000003',
    'PAUSE-ATTENDANCE-STUDENT-C',
    '18000000-0000-0000-0000-000000000001',
    'Not Started Student'
  ),
  (
    '68000000-0000-0000-0000-000000000004',
    'PAUSE-ATTENDANCE-STUDENT-D',
    '18000000-0000-0000-0000-000000000001',
    'Future Start Student'
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
    '78000000-0000-0000-0000-000000000001',
    '68000000-0000-0000-0000-000000000001',
    '58000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '78000000-0000-0000-0000-000000000002',
    '68000000-0000-0000-0000-000000000002',
    '58000000-0000-0000-0000-000000000001',
    '2026-09-01',
    'ACTIVE'
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
    '78000000-0000-0000-0000-000000000003',
    '68000000-0000-0000-0000-000000000003',
    '58000000-0000-0000-0000-000000000001',
    null,
    'ACTIVE'
  ),
  (
    '78000000-0000-0000-0000-000000000004',
    '68000000-0000-0000-0000-000000000004',
    '58000000-0000-0000-0000-000000000001',
    '2026-09-21',
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
  '88000000-0000-0000-0000-000000000001',
  '58000000-0000-0000-0000-000000000001',
  1,
  '09:00',
  '10:00',
  '2026-09-01',
  'Asia/Ho_Chi_Minh',
  'ACTIVE'
);


-- Student A is paused from 14 Sep through 20 Sep.

select lives_ok(
  $$
    insert into public.enrollment_pauses (
      enrollment_id,
      starts_on,
      ends_on,
      reason
    )
    values (
      '78000000-0000-0000-0000-000000000001',
      '2026-09-14',
      '2026-09-20',
      'Family travel'
    )
  $$,
  'creates the active pause'
);


-- =========================================================
-- REGULAR SESSION WHILE ONE STUDENT IS PAUSED
-- =========================================================

insert into public.session_occurrences (
  id,
  schedule_id,
  occurrence_date,
  starts_at,
  ends_at,
  status,
  occurrence_type
)
values (
  '98000000-0000-0000-0000-000000000001',
  '88000000-0000-0000-0000-000000000001',
  '2026-09-14',
  '2026-09-14 09:00:00+07',
  '2026-09-14 10:00:00+07',
  'SCHEDULED',
  'REGULAR'
);

select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '98000000-0000-0000-0000-000000000001',
      '78000000-0000-0000-0000-000000000003',
      'PRESENT'
    )
  $$,
  'P0001',
  'Attendance cannot be recorded outside the enrollment study period',
  'rejects regular attendance when started_at is null'
);

select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '98000000-0000-0000-0000-000000000001',
      '78000000-0000-0000-0000-000000000004',
      'PRESENT'
    )
  $$,
  'P0001',
  'Attendance cannot be recorded outside the enrollment study period',
  'rejects regular attendance before started_at'
);
select ok(
  not exists (
    select 1
    from public.makeup_credits
    where source_occurrence_id =
      '98000000-0000-0000-0000-000000000002'
      and enrollment_id in (
        '78000000-0000-0000-0000-000000000003',
        '78000000-0000-0000-0000-000000000004'
      )
  ),
  'cancelled regular session grants no credit before learning has started'
);

select throws_ok(
  $$
    insert into public.enrollment_pauses (
      enrollment_id,
      starts_on,
      ends_on,
      reason
    )
    values (
      '78000000-0000-0000-0000-000000000003',
      '2026-09-21',
      '2026-09-22',
      'Pause before study begins'
    )
  $$,
  'P0001',
  'An enrollment must have a study start date before it can be paused',
  'rejects pause when started_at is null'
);
select throws_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '98000000-0000-0000-0000-000000000001',
      '78000000-0000-0000-0000-000000000001',
      'PRESENT'
    )
  $$,
  'P0001',
  'Attendance cannot be recorded while the enrollment is paused',
  'rejects attendance for the paused student'
);


select lives_ok(
  $$
    insert into public.attendance_records (
      session_occurrence_id,
      enrollment_id,
      status
    )
    values (
      '98000000-0000-0000-0000-000000000001',
      '78000000-0000-0000-0000-000000000002',
      'PRESENT'
    )
  $$,
  'records attendance for the active student'
);


select is(
  public.set_session_occurrence_status(
    '98000000-0000-0000-0000-000000000001',
    'COMPLETED'
  ),
  'COMPLETED',
  'completes the regular session without requiring paused student attendance'
);


-- =========================================================
-- CANCELLED SESSION DURING PAUSE
-- Paused student must NOT receive makeup credit.
-- =========================================================

insert into public.session_occurrences (
  id,
  schedule_id,
  occurrence_date,
  starts_at,
  ends_at,
  status,
  occurrence_type
)
values (
  '98000000-0000-0000-0000-000000000002',
  '88000000-0000-0000-0000-000000000001',
  '2026-09-16',
  '2026-09-16 09:00:00+07',
  '2026-09-16 10:00:00+07',
  'SCHEDULED',
  'REGULAR'
);


select is(
  public.set_session_occurrence_status(
    '98000000-0000-0000-0000-000000000002',
    'CANCELLED'
  ),
  'CANCELLED',
  'cancels a regular session during the pause period'
);


select ok(
  (
    select
      count(*) = 1
      and bool_and(
        enrollment_id =
          '78000000-0000-0000-0000-000000000002'
      )
    from public.makeup_credits
    where source_occurrence_id =
      '98000000-0000-0000-0000-000000000002'
  ),
  'cancelled session grants credit only to students who were actually in the dated roster'
);


select throws_ok(
  $$insert into public.enrollment_pauses (enrollment_id, starts_on, ends_on, reason)
    values ('78000000-0000-0000-0000-000000000002', '2026-09-14', '2026-09-20', 'Retroactive pause')$$,
  'P0001', 'Pause changes are blocked for dates with recorded attendance or finalized regular sessions',
  'rejects a retroactive pause that would invalidate attendance and credits'
);
select throws_ok(
  $$update public.enrollment_pauses set status = 'CANCELLED', cancelled_at = now()
    where enrollment_id = '78000000-0000-0000-0000-000000000001'$$,
  'P0001', 'Pause changes are blocked for dates with recorded attendance or finalized regular sessions',
  'rejects cancellation after affected sessions are finalized'
);
select * from finish();

rollback;