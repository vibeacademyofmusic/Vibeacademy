begin;

create extension if not exists pgtap;

select plan(8);


-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  'd1000000-0000-0000-0000-000000000001',
  'PAUSE-TUITION-TEST',
  'Pause Tuition Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'd2000000-0000-0000-0000-000000000001',
  'PAUSE-TUITION-CURRICULUM',
  'Pause Tuition Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'd3000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  'PAUSE-TUITION-G1',
  'Pause Tuition Grade 1',
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
  'd4000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  'd3000000-0000-0000-0000-000000000001',
  'PAUSE-TUITION-COURSE',
  'Pause Tuition Test Course'
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
  'd5000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000001',
  'PAUSE-TUITION-CLASS',
  'Pause Tuition Test Class',
  'GROUP',
  10,
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
  'd6000000-0000-0000-0000-000000000001',
  'PAUSE-TUITION-STUDENT-A',
  'd1000000-0000-0000-0000-000000000001',
  'Pause Tuition Student A'
),
(
  'd6000000-0000-0000-0000-000000000002',
  'PAUSE-TUITION-STUDENT-B',
  'd1000000-0000-0000-0000-000000000001',
  'Pause Tuition Student B'
);


insert into public.enrollments (
  id,
  student_id,
  class_id,
  enrolled_at,
  started_at,
  status
)
values
(
  'd7000000-0000-0000-0000-000000000001',
  'd6000000-0000-0000-0000-000000000001',
  'd5000000-0000-0000-0000-000000000001',
  '2026-08-20',
  '2026-09-01',
  'ACTIVE'
),
(
  'd7000000-0000-0000-0000-000000000002',
  'd6000000-0000-0000-0000-000000000002',
  'd5000000-0000-0000-0000-000000000001',
  '2026-08-20',
  '2026-09-01',
  'ACTIVE'
);


-- =========================================================
-- STUDENT A
-- Tuition exists first, then pauses are added.
-- =========================================================

insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  discount_type,
  discount_value
)
values (
  'd8000000-0000-0000-0000-000000000001',
  'd7000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  'NONE',
  0
);


-- =========================================================
-- 1. BASE TERM
-- =========================================================

select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'three-month tuition term keeps the contractual base end date'
);


-- =========================================================
-- 2. EFFECTIVE END INITIALLY EQUALS BASE END
-- =========================================================

select is(
  (
    select effective_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'effective end initially equals base end'
);


-- =========================================================
-- FIRST PAUSE = 10 DAYS
-- =========================================================

insert into public.enrollment_pauses (
  id,
  enrollment_id,
  starts_on,
  ends_on,
  reason
)
values (
  'd9000000-0000-0000-0000-000000000001',
  'd7000000-0000-0000-0000-000000000001',
  '2026-10-10',
  '2026-10-19',
  'Ten day tuition extension test'
);


-- =========================================================
-- 3. ONE PAUSE EXTENDS EFFECTIVE END
-- =========================================================

select is(
  (
    select effective_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  '2026-12-10'::date,
  'ten active pause days extend effective end by ten days'
);


-- =========================================================
-- SECOND PAUSE
--
-- This pause begins AFTER the contractual base end.
-- It only becomes relevant because the first pause extended
-- effective_ends_on through 10 December.
-- =========================================================

insert into public.enrollment_pauses (
  id,
  enrollment_id,
  starts_on,
  ends_on,
  reason
)
values (
  'd9000000-0000-0000-0000-000000000002',
  'd7000000-0000-0000-0000-000000000001',
  '2026-12-05',
  '2026-12-09',
  'Chained five day tuition extension test'
);


-- =========================================================
-- 4. CHAINED PAUSE ALSO EXTENDS THE TERM
-- =========================================================

select is(
  (
    select effective_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  '2026-12-15'::date,
  'a later pause inside the extended window extends the term again'
);


-- =========================================================
-- 5. BASE END NEVER CHANGES
-- =========================================================

select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'pause extensions never rewrite the contractual base end date'
);


-- =========================================================
-- CANCEL FIRST PAUSE
--
-- Once the first pause disappears, effective end returns to
-- 30 Nov. The second pause begins on 05 Dec, so it is no
-- longer inside the entitlement window and contributes zero.
-- =========================================================

update public.enrollment_pauses
set
  status = 'CANCELLED',
  cancelled_at = now(),
  cancel_reason = 'Test cancellation'
where id =
  'd9000000-0000-0000-0000-000000000001';


-- =========================================================
-- 6. CANCELLATION RECALCULATES FROM SOURCE HISTORY
-- =========================================================

select is(
  (
    select effective_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'cancelling a pause rebuilds effective end instead of subtracting blindly'
);


-- =========================================================
-- STUDENT B
--
-- Pause exists BEFORE tuition term creation.
-- =========================================================

insert into public.enrollment_pauses (
  id,
  enrollment_id,
  starts_on,
  ends_on,
  reason
)
values (
  'd9000000-0000-0000-0000-000000000003',
  'd7000000-0000-0000-0000-000000000002',
  '2026-10-01',
  '2026-10-03',
  'Existing pause before tuition creation'
);


insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  discount_type,
  discount_value
)
values (
  'd8000000-0000-0000-0000-000000000002',
  'd7000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  'NONE',
  0
);


-- =========================================================
-- 7. NEW TUITION TERM SEES EXISTING PAUSE
-- =========================================================

select is(
  (
    select effective_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000002'
  ),
  '2026-12-03'::date,
  'a tuition term created after an active pause includes that pause automatically'
);


-- =========================================================
-- 8. SECOND TERM BASE END ALSO REMAINS IMMUTABLE
-- =========================================================

select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id =
      'd8000000-0000-0000-0000-000000000002'
  ),
  '2026-11-30'::date,
  'existing pauses extend only effective end and never base end'
);


select * from finish();

rollback;
