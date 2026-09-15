begin;
\ir ../helpers/approved_finance.inc

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
  'd1000000-0000-0000-0000-000000000001',
  'DEBT-TEST-BRANCH',
  'Debt Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'd2000000-0000-0000-0000-000000000001',
  'DEBT-TEST-CURRICULUM',
  'Debt Test Curriculum'
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
  'DEBT-G1',
  'Debt Grade 1',
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
  'DEBT-COURSE',
  'Debt Test Course'
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
  'DEBT-CLASS',
  'Debt Test Class',
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
  'DEBT-STUDENT-A',
  'd1000000-0000-0000-0000-000000000001',
  'Debt Student A'
),
(
  'd6000000-0000-0000-0000-000000000002',
  'DEBT-STUDENT-B',
  'd1000000-0000-0000-0000-000000000001',
  'Debt Student B'
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


insert into public.enrollment_tuition (
  id,
  enrollment_id,
  tuition_plan_id,
  starts_on,
  amount
)
values
(
  'd8000000-0000-0000-0000-000000000001',
  'd7000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3000000
),
(
  'd8000000-0000-0000-0000-000000000002',
  'd7000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3000000
);


-- =========================================================
-- AUTHENTICATED SUPER ADMIN
-- =========================================================

insert into auth.users (
  id
)
values (
  'df000000-0000-0000-0000-000000000001'
);


insert into public.roles (
  code,
  name
)
values (
  'SUPER_ADMIN',
  'Super Admin'
)
on conflict (code) do nothing;


-- Authorization requires an active account as well as the role assignment.
insert into public.profiles(id, status) values ('df000000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (
  user_id,
  role_id
)
select
  'df000000-0000-0000-0000-000000000001',
  role.id
from public.roles
as role
where role.code = 'SUPER_ADMIN'
on conflict do nothing;


select set_config(
  'request.jwt.claim.sub',
  'df000000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;


-- =========================================================
-- CREATE + ISSUE INVOICES
-- =========================================================

select public.create_tuition_invoice(
  'd8000000-0000-0000-0000-000000000001',
  null
);

select public.create_tuition_invoice(
  'd8000000-0000-0000-0000-000000000002',
  null
);


-- Student A: deliberately far-future due date.
select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  date '2026-09-15',
  date '2099-12-31'
);


-- Student B: deliberately old due date so this test
-- remains stable regardless of the current test date.
select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000002'
  ),
  date '2000-01-01',
  date '2000-01-31'
);


-- =========================================================
-- 1. NEW ISSUED INVOICE IS UNPAID
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'UNPAID',
  'new issued invoice is unpaid'
);


-- =========================================================
-- 2. FULL AMOUNT IS OUTSTANDING BEFORE PAYMENT
-- =========================================================

select is(
  (
    select outstanding_balance
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  (
    select total_amount
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'unpaid invoice has full outstanding balance'
);


-- =========================================================
-- 3. PAST-DUE INVOICE IS OVERDUE
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000002'
  ),
  'OVERDUE',
  'past-due unpaid invoice is overdue'
);


-- =========================================================
-- 4. OVERDUE FLAG IS TRUE
-- =========================================================

select is(
  (
    select is_overdue
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000002'
  ),
  true,
  'overdue invoice is flagged as overdue'
);


-- =========================================================
-- FIRST PARTIAL PAYMENT
-- =========================================================

select public.create_payment(
  'd6000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  1000000,
  'VND',
  'BANK_TRANSFER',
  timestamptz '2026-09-15 10:00:00+07',
  'DEBT-PAY-001',
  'First partial payment'
);


select public.allocate_payment_to_invoice(
  (
    select id
    from public.payments
    where reference = 'DEBT-PAY-001'
  ),
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  1000000
);


-- =========================================================
-- 5. PARTIAL PAYMENT CHANGES STATUS
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'PARTIALLY_PAID',
  'partial payment changes receivable status'
);


-- =========================================================
-- 6. ALLOCATED AMOUNT COUNTS POSTED PAYMENT
-- =========================================================

select is(
  (
    select allocated_amount
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  1000000.00::numeric,
  'posted payment allocation reduces debt'
);


-- =========================================================
-- 7. OUTSTANDING BALANCE IS REDUCED
-- =========================================================

select is(
  (
    select outstanding_balance
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  (
    select total_amount - 1000000
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'partial payment reduces outstanding balance'
);


-- =========================================================
-- SECOND PAYMENT CLEARS REMAINING BALANCE
-- =========================================================

select public.create_payment(
  'd6000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  (
    select total_amount - 1000000
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'VND',
  'CASH',
  timestamptz '2026-09-15 11:00:00+07',
  'DEBT-PAY-002',
  'Final payment'
);


select public.allocate_payment_to_invoice(
  (
    select id
    from public.payments
    where reference = 'DEBT-PAY-002'
  ),
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  (
    select total_amount - 1000000
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  )
);


-- =========================================================
-- 8. FULL PAYMENT CHANGES STATUS TO PAID
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'PAID',
  'fully allocated invoice is paid'
);


-- =========================================================
-- 9. PAID INVOICE HAS ZERO OUTSTANDING
-- =========================================================

select is(
  (
    select outstanding_balance
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  0.00::numeric,
  'paid invoice has zero outstanding balance'
);


-- =========================================================
-- VOID SECOND PAYMENT
-- =========================================================

select pg_temp.void_payment(
  (
    select id
    from public.payments
    where reference = 'DEBT-PAY-002'
  ),
  'Reverse final payment'
);


-- =========================================================
-- 10. VOIDED PAYMENT RESTORES DEBT
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'PARTIALLY_PAID',
  'voided payment stops reducing receivable balance'
);


-- =========================================================
-- 11. STUDENT SUMMARY REFLECTS RESTORED BALANCE
-- =========================================================

select is(
  (
    select total_outstanding
    from public.student_receivable_summary
    where student_id =
      'd6000000-0000-0000-0000-000000000001'
      and currency = 'VND'
  ),
  (
    select total_amount - 1000000
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000001'
  ),
  'student summary derives current outstanding balance'
);


-- =========================================================
-- 12. BRANCH SUMMARY COUNTS OVERDUE INVOICE
-- =========================================================

select is(
  (
    select overdue_invoice_count
    from public.branch_receivable_summary
    where branch_id =
      'd1000000-0000-0000-0000-000000000001'
      and currency = 'VND'
  ),
  1::bigint,
  'branch summary counts overdue invoices'
);


-- =========================================================
-- 13. BRANCH OVERDUE TOTAL MATCHES OVERDUE INVOICE
-- =========================================================

select is(
  (
    select total_overdue
    from public.branch_receivable_summary
    where branch_id =
      'd1000000-0000-0000-0000-000000000001'
      and currency = 'VND'
  ),
  (
    select total_amount
    from public.invoices
    where enrollment_tuition_id =
      'd8000000-0000-0000-0000-000000000002'
  ),
  'branch overdue total matches overdue receivable'
);


-- =========================================================
-- 14. BRANCH TOTAL OUTSTANDING IS DERIVED CORRECTLY
-- =========================================================

select is(
  (
    select total_outstanding
    from public.branch_receivable_summary
    where branch_id =
      'd1000000-0000-0000-0000-000000000001'
      and currency = 'VND'
  ),
  (
    select
      sum(expected_balance)::numeric(14,2)
    from (
      select
        total_amount - 1000000
          as expected_balance
      from public.invoices
      where enrollment_tuition_id =
        'd8000000-0000-0000-0000-000000000001'

      union all

      select
        total_amount
      from public.invoices
      where enrollment_tuition_id =
        'd8000000-0000-0000-0000-000000000002'
    ) as balances
  ),
  'branch total outstanding matches all open receivables'
);


select * from finish();

rollback;
