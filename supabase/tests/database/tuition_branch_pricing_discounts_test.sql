begin;

create extension if not exists pgtap;

select plan(12);


-- =========================================================
-- VIBE ACADEMY
-- Tuition Branch Pricing & Discounts Tests
-- =========================================================


-- =========================================================
-- FIXTURES
-- =========================================================

-- Default / non-Can-Tho test branch

insert into public.branches (
  id,
  code,
  name
)
values (
  'c1000000-0000-0000-0000-000000000001',
  'TUITION-PRICE-TEST',
  'Tuition Pricing Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'c2000000-0000-0000-0000-000000000001',
  'TUITION-PRICE-CURRICULUM',
  'Tuition Pricing Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'c3000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'TUITION-PRICE-G1',
  'Tuition Pricing Grade 1',
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
  'c4000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000001',
  'TUITION-PRICE-COURSE',
  'Tuition Pricing Test Course'
);


-- ---------------------------------------------------------
-- Two classes:
-- 1. Default branch
-- 2. V01 = Vibe Academy Can Tho
-- ---------------------------------------------------------

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
values
(
  'c5000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c4000000-0000-0000-0000-000000000001',
  'TUITION-PRICE-DEFAULT',
  'Default Tuition Pricing Class',
  'GROUP',
  10,
  'ACTIVE'
),
(
  'c5000000-0000-0000-0000-000000000002',
  (
    select id
    from public.branches
    where code = 'V01'
  ),
  'c4000000-0000-0000-0000-000000000001',
  'TUITION-PRICE-V01',
  'Can Tho Tuition Pricing Class',
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
  'c6000000-0000-0000-0000-000000000001',
  'PRICE-STUDENT-DEFAULT',
  'c1000000-0000-0000-0000-000000000001',
  'Default Price Student'
),
(
  'c6000000-0000-0000-0000-000000000002',
  'PRICE-STUDENT-PERCENT',
  (
    select id
    from public.branches
    where code = 'V01'
  ),
  'Percent Discount Student'
),
(
  'c6000000-0000-0000-0000-000000000003',
  'PRICE-STUDENT-FIXED',
  (
    select id
    from public.branches
    where code = 'V01'
  ),
  'Fixed Discount Student'
),
(
  'c6000000-0000-0000-0000-000000000004',
  'PRICE-STUDENT-INVALID-PERCENT',
  (
    select id
    from public.branches
    where code = 'V01'
  ),
  'Invalid Percent Student'
),
(
  'c6000000-0000-0000-0000-000000000005',
  'PRICE-STUDENT-INVALID-FIXED',
  (
    select id
    from public.branches
    where code = 'V01'
  ),
  'Invalid Fixed Student'
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
  'c7000000-0000-0000-0000-000000000001',
  'c6000000-0000-0000-0000-000000000001',
  'c5000000-0000-0000-0000-000000000001',
  '2026-09-01',
  '2026-09-10',
  'ACTIVE'
),
(
  'c7000000-0000-0000-0000-000000000002',
  'c6000000-0000-0000-0000-000000000002',
  'c5000000-0000-0000-0000-000000000002',
  '2026-09-01',
  '2026-09-10',
  'ACTIVE'
),
(
  'c7000000-0000-0000-0000-000000000003',
  'c6000000-0000-0000-0000-000000000003',
  'c5000000-0000-0000-0000-000000000002',
  '2026-09-01',
  '2026-09-10',
  'ACTIVE'
),
(
  'c7000000-0000-0000-0000-000000000004',
  'c6000000-0000-0000-0000-000000000004',
  'c5000000-0000-0000-0000-000000000002',
  '2026-09-01',
  '2026-09-10',
  'ACTIVE'
),
(
  'c7000000-0000-0000-0000-000000000005',
  'c6000000-0000-0000-0000-000000000005',
  'c5000000-0000-0000-0000-000000000002',
  '2026-09-01',
  '2026-09-10',
  'ACTIVE'
);


-- =========================================================
-- 1. DEFAULT 3-MONTH PRICE = 4,500,000
-- =========================================================

select is(
  (
    select list_price
    from public.tuition_plan_branch_prices
    where tuition_plan_id =
      'a1000000-0000-0000-0000-000000000003'
      and branch_id is null
      and status = 'ACTIVE'
  ),
  4500000::numeric,
  'default VIBE 3 MONTHS price is 4,500,000 VND'
);


-- =========================================================
-- 2. DEFAULT 12-MONTH PRICE = 13,500,000
-- =========================================================

select is(
  (
    select list_price
    from public.tuition_plan_branch_prices
    where tuition_plan_id =
      'a1000000-0000-0000-0000-000000000012'
      and branch_id is null
      and status = 'ACTIVE'
  ),
  13500000::numeric,
  'default VIBE 12 MONTHS price is 13,500,000 VND'
);


-- =========================================================
-- 3. CAN THO V01 3-MONTH PRICE = 5,500,000
-- =========================================================

select is(
  (
    select p.list_price
    from public.tuition_plan_branch_prices p
    join public.branches b
      on b.id = p.branch_id
    where p.tuition_plan_id =
      'a1000000-0000-0000-0000-000000000003'
      and b.code = 'V01'
      and p.status = 'ACTIVE'
  ),
  5500000::numeric,
  'V01 Can Tho VIBE 3 MONTHS price is 5,500,000 VND'
);


-- =========================================================
-- 4. CAN THO V01 12-MONTH PRICE = 16,500,000
-- =========================================================

select is(
  (
    select p.list_price
    from public.tuition_plan_branch_prices p
    join public.branches b
      on b.id = p.branch_id
    where p.tuition_plan_id =
      'a1000000-0000-0000-0000-000000000012'
      and b.code = 'V01'
      and p.status = 'ACTIVE'
  ),
  16500000::numeric,
  'V01 Can Tho VIBE 12 MONTHS price is 16,500,000 VND'
);


-- =========================================================
-- 5. DEFAULT BRANCH USES FALLBACK PRICE
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
  'c8000000-0000-0000-0000-000000000001',
  'c7000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-10',
  'NONE',
  0
);


select ok(
  (
    select
      branch_code_snapshot = 'TUITION-PRICE-TEST'
      and list_price = 4500000
      and discount_amount = 0
      and amount = 4500000
    from public.enrollment_tuition
    where id =
      'c8000000-0000-0000-0000-000000000001'
  ),
  'non-V01 branch automatically uses default 4,500,000 price'
);


-- =========================================================
-- 6. CAN THO 10% DISCOUNT
--
-- 5,500,000
-- - 550,000
-- = 4,950,000
-- =========================================================

insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  discount_type,
  discount_value,
  discount_name
)
values (
  'c8000000-0000-0000-0000-000000000002',
  'c7000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-10',
  'PERCENT',
  10,
  'Test 10 Percent'
);


select ok(
  (
    select
      branch_code_snapshot = 'V01'
      and list_price = 5500000
      and discount_type = 'PERCENT'
      and discount_value = 10
      and discount_amount = 550000
      and amount = 4950000
    from public.enrollment_tuition
    where id =
      'c8000000-0000-0000-0000-000000000002'
  ),
  'Can Tho 10 percent discount calculates 5,500,000 -> 4,950,000'
);


-- =========================================================
-- 7. CAN THO FIXED DISCOUNT
--
-- 5,500,000
-- - 500,000
-- = 5,000,000
-- =========================================================

insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  discount_type,
  discount_value,
  discount_name
)
values (
  'c8000000-0000-0000-0000-000000000003',
  'c7000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-10',
  'FIXED',
  500000,
  'Test Fixed Discount'
);


select ok(
  (
    select
      list_price = 5500000
      and discount_type = 'FIXED'
      and discount_value = 500000
      and discount_amount = 500000
      and amount = 5000000
    from public.enrollment_tuition
    where id =
      'c8000000-0000-0000-0000-000000000003'
  ),
  'fixed 500,000 discount calculates final tuition of 5,000,000'
);


-- =========================================================
-- 8. PERCENT DISCOUNT > 100 MUST FAIL
-- =========================================================

select throws_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      discount_type,
      discount_value,
      discount_name
    )
    values (
      'c8000000-0000-0000-0000-000000000004',
      'c7000000-0000-0000-0000-000000000004',
      'a1000000-0000-0000-0000-000000000003',
      '2026-09-10',
      'PERCENT',
      101,
      'Invalid 101 Percent'
    )
  $$,
  'P0001',
  'Percentage discount cannot exceed 100',
  'rejects percentage discount greater than 100 percent'
);


-- =========================================================
-- 9. FIXED DISCOUNT > LIST PRICE MUST FAIL
-- =========================================================

select throws_ok(
  $$
    insert into public.enrollment_tuition (
      id,
      enrollment_id,
      tuition_plan_id,
      starts_on,
      discount_type,
      discount_value,
      discount_name
    )
    values (
      'c8000000-0000-0000-0000-000000000005',
      'c7000000-0000-0000-0000-000000000005',
      'a1000000-0000-0000-0000-000000000003',
      '2026-09-10',
      'FIXED',
      6000000,
      'Invalid Fixed Discount'
    )
  $$,
  'P0001',
  'Fixed discount cannot exceed tuition list price',
  'rejects fixed discount greater than tuition list price'
);


-- =========================================================
-- 10. MASTER PRICE CHANGE MUST NOT CHANGE HISTORY
-- =========================================================

update public.tuition_plan_branch_prices
set list_price = 5600000
where tuition_plan_id =
  'a1000000-0000-0000-0000-000000000003'
  and branch_id = (
    select id
    from public.branches
    where code = 'V01'
  );


select is(
  (
    select list_price
    from public.enrollment_tuition
    where id =
      'c8000000-0000-0000-0000-000000000002'
  ),
  5500000::numeric,
  'changing master branch price does not rewrite historical tuition list price'
);


-- =========================================================
-- 11. UPDATING DISCOUNT RECALCULATES FINAL AMOUNT
--
-- Historical list price remains 5,500,000
-- New fixed discount = 1,000,000
-- Final amount = 4,500,000
-- =========================================================

update public.enrollment_tuition
set
  discount_type = 'FIXED',
  discount_value = 1000000,
  discount_name = 'Adjusted Test Discount'
where id =
  'c8000000-0000-0000-0000-000000000002';


select ok(
  (
    select
      list_price = 5500000
      and discount_type = 'FIXED'
      and discount_value = 1000000
      and discount_amount = 1000000
      and amount = 4500000
    from public.enrollment_tuition
    where id =
      'c8000000-0000-0000-0000-000000000002'
  ),
  'updating discount recalculates discount amount and final tuition'
);


-- =========================================================
-- 12. HISTORICAL LIST PRICE IS IMMUTABLE
-- =========================================================

select throws_ok(
  $$
    update public.enrollment_tuition
    set list_price = 1234567
    where id =
      'c8000000-0000-0000-0000-000000000003'
  $$,
  'P0001',
  'Core tuition term snapshots are immutable',
  'rejects direct modification of historical tuition list price'
);


select * from finish();

rollback;