begin;

create extension if not exists pgtap;

select plan(14);

-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  'f1000000-0000-0000-0000-000000000001',
  'PAYMENT-TEST-BRANCH',
  'Payment Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'f1100000-0000-0000-0000-000000000001',
  'PAYMENT-TEST-CURRICULUM',
  'Payment Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'f1200000-0000-0000-0000-000000000001',
  'f1100000-0000-0000-0000-000000000001',
  'PAYMENT-G1',
  'Payment Grade 1',
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
  'f1300000-0000-0000-0000-000000000001',
  'f1100000-0000-0000-0000-000000000001',
  'f1200000-0000-0000-0000-000000000001',
  'PAYMENT-COURSE',
  'Payment Test Course'
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
  'f1400000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'f1300000-0000-0000-0000-000000000001',
  'PAYMENT-CLASS',
  'Payment Test Class',
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
  'f2000000-0000-0000-0000-000000000001',
  'PAYMENT-STUDENT-A',
  'f1000000-0000-0000-0000-000000000001',
  'Payment Student A'
),
(
  'f2000000-0000-0000-0000-000000000002',
  'PAYMENT-STUDENT-B',
  'f1000000-0000-0000-0000-000000000001',
  'Payment Student B'
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
  'f3000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001',
  'f1400000-0000-0000-0000-000000000001',
  '2026-08-20',
  '2026-09-01',
  'ACTIVE'
),
(
  'f3000000-0000-0000-0000-000000000002',
  'f2000000-0000-0000-0000-000000000002',
  'f1400000-0000-0000-0000-000000000001',
  '2026-08-20',
  '2026-09-01',
  'ACTIVE'
);


insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  amount
)
values
(
  'f4000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3000000
),
(
  'f4000000-0000-0000-0000-000000000002',
  'f3000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3500000
);


insert into auth.users (
  id
)
values (
  'ff000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;


insert into public.roles (
  code,
  name
)
values (
  'SUPER_ADMIN',
  'Super Admin'
)
on conflict (code) do nothing;


insert into public.user_roles (
  user_id,
  role_id
)
select
  'ff000000-0000-0000-0000-000000000001',
  role.id
from public.roles
as role
where role.code = 'SUPER_ADMIN'
on conflict do nothing;


set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  'ff000000-0000-0000-0000-000000000001',
  true
);


-- =========================================================
-- CREATE + ISSUE INVOICES
-- =========================================================

select public.create_tuition_invoice(
  'f4000000-0000-0000-0000-000000000001',
  null
);

select public.create_tuition_invoice(
  'f4000000-0000-0000-0000-000000000002',
  null
);

select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'f4000000-0000-0000-0000-000000000001'
  ),
  date '2026-09-15',
  date '2026-09-30'
);

select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'f4000000-0000-0000-0000-000000000002'
  ),
  date '2026-09-15',
  date '2026-09-30'
);


-- =========================================================
-- 1. CREATE PAYMENT
-- =========================================================

select lives_ok(
  $$
    select public.create_payment(
      'f2000000-0000-0000-0000-000000000001',
      'f1000000-0000-0000-0000-000000000001',
      3000000,
      'VND',
      'BANK_TRANSFER',
      timestamptz '2026-09-15 10:00:00+07',
      'BANK-001',
      'Partial tuition payment'
    )
  $$,
  'creates a posted payment'
);


-- =========================================================
-- 2. PAYMENT SNAPSHOT
-- =========================================================

select is(
  (
    select amount
    from public.payments
    where reference = 'BANK-001'
  ),
  3000000.00::numeric,
  'payment stores the received amount'
);


-- =========================================================
-- 3. PAYMENT STATUS
-- =========================================================

select is(
  (
    select status
    from public.payments
    where reference = 'BANK-001'
  ),
  'POSTED',
  'new payment is posted'
);


-- =========================================================
-- 4. PARTIAL ALLOCATION
-- =========================================================

select lives_ok(
  $$
    select public.allocate_payment_to_invoice(
      (
        select id
        from public.payments
        where reference = 'BANK-001'
      ),
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'f4000000-0000-0000-0000-000000000001'
      ),
      2000000
    )
  $$,
  'allocates part of a payment to an invoice'
);


-- =========================================================
-- 5. ALLOCATION AMOUNT
-- =========================================================

select is(
  (
    select amount
    from public.payment_allocations
    where payment_id = (
      select id
      from public.payments
      where reference = 'BANK-001'
    )
  ),
  2000000.00::numeric,
  'partial allocation is stored correctly'
);


-- =========================================================
-- 6. DUPLICATE PAYMENT/INVOICE PAIR BLOCKED
-- =========================================================

select throws_ok(
  $$
    select public.allocate_payment_to_invoice(
      (
        select id
        from public.payments
        where reference = 'BANK-001'
      ),
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'f4000000-0000-0000-0000-000000000001'
      ),
      500000
    )
  $$,
  'P0001',
  'This payment is already allocated to this invoice',
  'same payment cannot create a second allocation to same invoice'
);


-- =========================================================
-- 7. OVER-ALLOCATE PAYMENT BLOCKED
-- =========================================================

select throws_ok(
  $$
    select public.allocate_payment_to_invoice(
      (
        select id
        from public.payments
        where reference = 'BANK-001'
      ),
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'f4000000-0000-0000-0000-000000000002'
      ),
      1500000
    )
  $$,
  'P0001',
  'Payment and invoice must belong to the same student',
  'payment cannot be allocated to another student invoice'
);


-- =========================================================
-- CREATE SECOND PAYMENT FOR SAME STUDENT
-- =========================================================

select public.create_payment(
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  1000000,
  'VND',
  'CASH',
  timestamptz '2026-09-15 11:00:00+07',
  'CASH-001',
  null
);


-- =========================================================
-- 8. MULTIPLE PAYMENTS MAY PAY SAME INVOICE
-- =========================================================

select lives_ok(
  $$
    select public.allocate_payment_to_invoice(
      (
        select id
        from public.payments
        where reference = 'CASH-001'
      ),
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'f4000000-0000-0000-0000-000000000001'
      ),
      1000000
    )
  $$,
  'a second payment can be allocated to the same invoice'
);


-- =========================================================
-- 9. INVOICE OVERPAYMENT BLOCKED
-- =========================================================

select public.create_payment(
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  2000000,
  'VND',
  'CASH',
  timestamptz '2026-09-15 12:00:00+07',
  'CASH-002',
  null
);

select throws_ok(
  $$
    select public.allocate_payment_to_invoice(
      (
        select id
        from public.payments
        where reference = 'CASH-002'
      ),
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'f4000000-0000-0000-0000-000000000001'
      ),
      2000000
    )
  $$,
  'P0001',
  'Allocation exceeds the remaining invoice balance',
  'invoice cannot be overpaid'
);


-- =========================================================
-- 10. WRONG CURRENCY BLOCKED
-- =========================================================

select public.create_payment(
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  500000,
  'USD',
  'CASH',
  timestamptz '2026-09-15 13:00:00+07',
  'USD-001',
  null
);

select throws_ok(
  $$
    select public.allocate_payment_to_invoice(
      (
        select id
        from public.payments
        where reference = 'USD-001'
      ),
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'f4000000-0000-0000-0000-000000000001'
      ),
      500000
    )
  $$,
  'P0001',
  'Payment and invoice currencies must match',
  'payment currency must match invoice currency'
);


-- =========================================================
-- 11. PAYMENT FINANCIAL SNAPSHOT IMMUTABLE
-- =========================================================

reset role;

select throws_ok(
  $$
    update public.payments
    set amount = 1
    where reference = 'BANK-001'
  $$,
  'P0001',
  'Payment financial snapshots are immutable',
  'payment financial snapshots cannot be edited'
);

set local role authenticated;


-- =========================================================
-- 12. CANNOT CANCEL INVOICE WITH POSTED PAYMENT
-- =========================================================

select throws_ok(
  $$
    select public.cancel_invoice(
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'f4000000-0000-0000-0000-000000000001'
      ),
      'Cancel test'
    )
  $$,
  'P0001',
  'Cannot cancel an invoice with posted payment allocations',
  'issued invoice with posted allocation cannot be cancelled'
);


-- =========================================================
-- 13. VOID PAYMENT
-- =========================================================

select lives_ok(
  $$
    select public.void_payment(
      (
        select id
        from public.payments
        where reference = 'BANK-001'
      ),
      'Bank transaction reversed'
    )
  $$,
  'posted payment can be voided'
);


-- =========================================================
-- 14. VOIDED PAYMENT NO LONGER COUNTS AS POSTED
-- =========================================================

select is(
  (
    select status
    from public.payments
    where reference = 'BANK-001'
  ),
  'VOIDED',
  'voided payment keeps historical record with VOIDED status'
);


select * from finish();

rollback;
