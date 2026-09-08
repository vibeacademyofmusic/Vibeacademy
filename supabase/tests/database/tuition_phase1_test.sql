begin;

create extension if not exists pgtap;

select plan(18);


-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  '1a000000-0000-0000-0000-000000000001',
  'TUITION-TEST-BRANCH',
  'Tuition Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  '2a000000-0000-0000-0000-000000000001',
  'TUITION-TEST-CURRICULUM',
  'Tuition Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  '3a000000-0000-0000-0000-000000000001',
  '2a000000-0000-0000-0000-000000000001',
  'TUITION-G1',
  'Tuition Grade 1',
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
  '4a000000-0000-0000-0000-000000000001',
  '2a000000-0000-0000-0000-000000000001',
  '3a000000-0000-0000-0000-000000000001',
  'TUITION-COURSE',
  'Tuition Test Course'
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
  '5a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-000000000001',
  '4a000000-0000-0000-0000-000000000001',
  'TUITION-CLASS',
  'Tuition Test Class',
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
    '6a000000-0000-0000-0000-000000000001',
    'TUITION-STUDENT-A',
    '1a000000-0000-0000-0000-000000000001',
    'Tuition Student A'
  ),
  (
    '6a000000-0000-0000-0000-000000000002',
    'TUITION-STUDENT-B',
    '1a000000-0000-0000-0000-000000000001',
    'Tuition Student B'
  ),
  (
    '6a000000-0000-0000-0000-000000000003',
    'TUITION-STUDENT-C',
    '1a000000-0000-0000-0000-000000000001',
    'Tuition Student C'
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
    '7a000000-0000-0000-0000-000000000001',
    '6a000000-0000-0000-0000-000000000001',
    '5a000000-0000-0000-0000-000000000001',
    '2026-08-20',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    '7a000000-0000-0000-0000-000000000002',
    '6a000000-0000-0000-0000-000000000002',
    '5a000000-0000-0000-0000-000000000001',
    '2026-09-01',
    null,
    'ACTIVE'
  ),
  (
    '7a000000-0000-0000-0000-000000000003',
    '6a000000-0000-0000-0000-000000000003',
    '5a000000-0000-0000-0000-000000000001',
    '2026-09-01',
    '2026-09-15',
    'ACTIVE'
  );


-- =========================================================
-- 1–2. DEFAULT PLANS
-- =========================================================

select is(
  (
    select duration_months
    from public.tuition_plans
    where code = 'VIBE_3_MONTHS'
  ),
  3,
  'VIBE 3 MONTHS has a three-month duration'
);


select is(
  (
    select duration_months
    from public.tuition_plans
    where code = 'VIBE_12_MONTHS'
  ),
  12,
  'VIBE 12 MONTHS has a twelve-month duration'
);


-- =========================================================
-- 3. NO started_at = NO TUITION
-- =========================================================

select throws_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000004',
      '7a000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000003',
      '2026-09-01',
      3000000
    )
  $$,
  'P0001',
  'An enrollment must have a study start date before tuition can begin',
  'rejects tuition when enrollment started_at is null'
);


-- =========================================================
-- 4. FIRST TERM MUST START EXACTLY ON started_at
-- =========================================================

select throws_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000005',
      '7a000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000012',
      '2026-09-16',
      12000000
    )
  $$,
  'P0001',
  'The first tuition term must start on the enrollment study start date',
  'rejects first tuition term that starts after started_at'
);


-- =========================================================
-- 5. CREATE FIRST 3-MONTH TERM
-- =========================================================

select lives_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000001',
      '7a000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000003',
      '2026-09-01',
      3000000
    )
  $$,
  'creates first tuition term on enrollment started_at'
);


-- =========================================================
-- 6. TUITION CAN NEVER START BEFORE started_at
-- =========================================================

select throws_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000007',
      '7a000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000003',
      '2026-08-31',
      3000000
    )
  $$,
  'P0001',
  'Tuition cannot start before the enrollment study start date',
  'rejects any tuition term before enrollment started_at'
);


-- =========================================================
-- 7–8. DATE CALCULATION
-- =========================================================

select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'three-month tuition term calculates correct base end date'
);


select is(
  (
    select effective_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  '2026-11-30'::date,
  'effective end initially equals base end'
);


-- =========================================================
-- 9. PLAN SNAPSHOT
-- =========================================================

select ok(
  (
    select
      plan_code_snapshot = 'VIBE_3_MONTHS'
      and plan_name_snapshot = 'VIBE 3 MONTHS'
      and duration_months_snapshot = 3
      and amount = 3000000
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  'tuition term snapshots plan and agreed amount'
);


-- Change master plan after historical term already exists.

update public.tuition_plans
set name = 'VIBE 3 MONTHS UPDATED'
where id = 'a1000000-0000-0000-0000-000000000003';


-- =========================================================
-- 10. HISTORICAL SNAPSHOT MUST NOT CHANGE
-- =========================================================

select is(
  (
    select plan_name_snapshot
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  ),
  'VIBE 3 MONTHS',
  'changing tuition plan does not rewrite historical snapshot'
);


-- =========================================================
-- 11. OVERLAPPING TERM MUST BE BLOCKED
-- =========================================================

select throws_ok(
  $$
    do $block$
    begin
      begin
        insert into public.enrollment_tuition (
          id,
          enrollment_id,
          tuition_plan_id,
          starts_on,
          amount
        )
        values (
          'b1000000-0000-0000-0000-000000000006',
          '7a000000-0000-0000-0000-000000000001',
          'a1000000-0000-0000-0000-000000000003',
          '2026-11-30',
          3000000
        );
      exception
        when exclusion_violation then
          raise exception 'TUITION_OVERLAP_BLOCKED';
      end;
    end
    $block$;
  $$,
  'P0001',
  'TUITION_OVERLAP_BLOCKED',
  'rejects overlapping tuition terms for the same enrollment'
);


-- =========================================================
-- 12. CONTIGUOUS RENEWAL IS ALLOWED
-- =========================================================

select lives_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000002',
      '7a000000-0000-0000-0000-000000000001',
      'a1000000-0000-0000-0000-000000000003',
      '2026-12-01',
      3200000
    )
  $$,
  'allows renewal to begin the day after the previous term ends'
);


-- =========================================================
-- 13. RENEWAL DATE CALCULATION
-- =========================================================

select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000002'
  ),
  '2027-02-28'::date,
  'renewal calculates its own contractual end date'
);


-- =========================================================
-- 14. CORE HISTORICAL FIELDS ARE IMMUTABLE
-- =========================================================

select throws_ok(
  $$
    update public.enrollment_tuition
    set starts_on = '2026-09-02'
    where id = 'b1000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Core tuition term fields are immutable',
  'rejects rewriting core tuition history'
);


-- =========================================================
-- 15. EFFECTIVE END CANNOT SHRINK BELOW BASE END
-- =========================================================

select throws_ok(
  $$
    update public.enrollment_tuition
    set effective_ends_on = '2026-11-29'
    where id = 'b1000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Effective tuition end cannot be earlier than the base tuition end',
  'rejects shortening effective tuition entitlement below base term'
);


-- =========================================================
-- 16. FINANCIAL HISTORY CANNOT BE DELETED
-- =========================================================

select throws_ok(
  $$
    delete from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Tuition terms cannot be deleted; cancel the term instead',
  'rejects deletion of tuition history'
);


-- =========================================================
-- 17–18. 12-MONTH PLAN
-- =========================================================

select lives_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      amount
    )
    values (
      'b1000000-0000-0000-0000-000000000003',
      '7a000000-0000-0000-0000-000000000003',
      'a1000000-0000-0000-0000-000000000012',
      '2026-09-15',
      12000000
    )
  $$,
  'creates twelve-month tuition term on enrollment started_at'
);


select is(
  (
    select base_ends_on
    from public.enrollment_tuition
    where id = 'b1000000-0000-0000-0000-000000000003'
  ),
  '2027-09-14'::date,
  'twelve-month tuition term calculates correct base end date'
);


select * from finish();

rollback;