begin;

create extension if not exists pgtap
with schema extensions;

select plan(10);


-- =========================================================
-- STRUCTURE
-- =========================================================

select has_table(
  'public',
  'enrollment_pauses',
  'enrollment pauses table exists'
);

select has_function(
  'public',
  'is_enrollment_paused_on',
  array['uuid', 'date'],
  'pause lookup function exists'
);


-- =========================================================
-- TEST DATA
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  '17000000-0000-0000-0000-000000000001',
  'PAUSE-TEST-BRANCH',
  'Pause Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  '27000000-0000-0000-0000-000000000001',
  'PAUSE-TEST-CURRICULUM',
  'Pause Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '37000000-0000-0000-0000-000000000001',
  '27000000-0000-0000-0000-000000000001',
  'PAUSE-TEST-LEVEL',
  'Pause Test Level',
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
  '47000000-0000-0000-0000-000000000001',
  '27000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000001',
  'PAUSE-TEST-COURSE',
  'Pause Test Course'
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
  '57000000-0000-0000-0000-000000000001',
  '17000000-0000-0000-0000-000000000001',
  '47000000-0000-0000-0000-000000000001',
  'PAUSE-TEST-CLASS',
  'Pause Test Class',
  'ACTIVE'
);


insert into public.students (
  id,
  student_code,
  default_branch_id,
  full_name
)
values (
  '67000000-0000-0000-0000-000000000001',
  'PAUSE-TEST-STUDENT',
  '17000000-0000-0000-0000-000000000001',
  'Pause Test Student'
);


insert into public.enrollments (
  id,
  student_id,
  class_id,
  started_at,
  status
)
values (
  '77000000-0000-0000-0000-000000000001',
  '67000000-0000-0000-0000-000000000001',
  '57000000-0000-0000-0000-000000000001',
  '2026-09-01',
  'ACTIVE'
);


-- =========================================================
-- CREATE PAUSE
-- =========================================================

select lives_ok(
  $$
    insert into public.enrollment_pauses (
      id,
      enrollment_id,
      starts_on,
      ends_on,
      reason
    )
    values (
      '87000000-0000-0000-0000-000000000001',
      '77000000-0000-0000-0000-000000000001',
      '2026-09-10',
      '2026-09-20',
      'Family travel'
    )
  $$,
  'creates an enrollment pause'
);


-- =========================================================
-- DATE BEHAVIOUR
-- =========================================================

select is(
  public.is_enrollment_paused_on(
    '77000000-0000-0000-0000-000000000001',
    '2026-09-09'
  ),
  false,
  'student is active before the pause'
);


select ok(
  public.is_enrollment_paused_on(
    '77000000-0000-0000-0000-000000000001',
    '2026-09-10'
  )
  and
  public.is_enrollment_paused_on(
    '77000000-0000-0000-0000-000000000001',
    '2026-09-20'
  ),
  'pause includes both start and end dates'
);


select is(
  public.is_enrollment_paused_on(
    '77000000-0000-0000-0000-000000000001',
    '2026-09-21'
  ),
  false,
  'student is active after the pause'
);


-- =========================================================
-- OVERLAP PROTECTION
-- =========================================================

select throws_like(
  $$
    insert into public.enrollment_pauses (
      enrollment_id,
      starts_on,
      ends_on,
      reason
    )
    values (
      '77000000-0000-0000-0000-000000000001',
      '2026-09-15',
      '2026-09-25',
      'Overlapping pause'
    )
  $$,
  '%exclusion constraint%',
  'rejects overlapping active pause periods'
);


-- =========================================================
-- CANCEL PAUSE
-- =========================================================

select lives_ok(
  $$
    update public.enrollment_pauses
    set
      status = 'CANCELLED',
      cancelled_at = now(),
      cancel_reason = 'Pause request withdrawn'
    where id =
      '87000000-0000-0000-0000-000000000001'
  $$,
  'cancels an existing pause'
);


select is(
  public.is_enrollment_paused_on(
    '77000000-0000-0000-0000-000000000001',
    '2026-09-15'
  ),
  false,
  'cancelled pause no longer suspends the enrollment'
);


select is(
  (
    select status
    from public.enrollment_pauses
    where id =
      '87000000-0000-0000-0000-000000000001'
  ),
  'CANCELLED',
  'keeps cancelled pause in history'
);


select * from finish();

rollback;
