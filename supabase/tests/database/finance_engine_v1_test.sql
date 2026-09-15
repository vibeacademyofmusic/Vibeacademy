begin;
\ir ../helpers/approved_finance.inc

create extension if not exists pgtap;

select plan(10);

-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  'aa100000-0000-0000-0000-000000000001',
  'FINANCE-TEST-BRANCH',
  'Finance Test Branch'
);

insert into public.curriculums (
  id,
  code,
  name
)
values (
  'aa200000-0000-0000-0000-000000000001',
  'FINANCE-TEST-CURRICULUM',
  'Finance Test Curriculum'
);

insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'aa300000-0000-0000-0000-000000000001',
  'aa200000-0000-0000-0000-000000000001',
  'FINANCE-G1',
  'Finance Grade 1',
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
  'aa400000-0000-0000-0000-000000000001',
  'aa200000-0000-0000-0000-000000000001',
  'aa300000-0000-0000-0000-000000000001',
  'FINANCE-COURSE',
  'Finance Test Course'
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
  'aa500000-0000-0000-0000-000000000001',
  'aa100000-0000-0000-0000-000000000001',
  'aa400000-0000-0000-0000-000000000001',
  'FINANCE-CLASS',
  'Finance Test Class',
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
values (
  'aa600000-0000-0000-0000-000000000001',
  'FINANCE-STUDENT',
  'aa100000-0000-0000-0000-000000000001',
  'Finance Student'
);

insert into public.enrollments (
  id,
  student_id,
  class_id,
  enrolled_at,
  started_at,
  status
)
values (
  'aa700000-0000-0000-0000-000000000001',
  'aa600000-0000-0000-0000-000000000001',
  'aa500000-0000-0000-0000-000000000001',
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
values (
  'aa800000-0000-0000-0000-000000000001',
  'aa700000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3000000
);

insert into auth.users (
  id
)
values (
  'aaf00000-0000-0000-0000-000000000001'
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
insert into public.profiles(id, status) values ('aaf00000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (
  user_id,
  role_id
)
select
  'aaf00000-0000-0000-0000-000000000001',
  role.id
from public.roles
as role
where role.code = 'SUPER_ADMIN'
on conflict do nothing;

select set_config(
  'request.jwt.claim.sub',
  'aaf00000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;

-- =========================================================
-- CREATE + ISSUE INVOICE
-- =========================================================

select public.create_tuition_invoice(
  'aa800000-0000-0000-0000-000000000001',
  null
);

select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'aa800000-0000-0000-0000-000000000001'
  ),
  date '2026-09-15',
  date '2099-12-31'
);

-- =========================================================
-- CREATE + ALLOCATE PAYMENT
-- =========================================================

select public.create_payment(
  'aa600000-0000-0000-0000-000000000001',
  'aa100000-0000-0000-0000-000000000001',
  2000000,
  'VND',
  'BANK_TRANSFER',
  timestamptz '2026-09-15 10:00:00+07',
  'FINANCE-PAY-001',
  null
);

select public.allocate_payment_to_invoice(
  (
    select id
    from public.payments
    where reference = 'FINANCE-PAY-001'
  ),
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'aa800000-0000-0000-0000-000000000001'
  ),
  2000000
);

-- =========================================================
-- 1. CASH LEDGER PAYMENT ROW
-- =========================================================

select is(
  (
    select cash_in
    from public.finance_cash_ledger
    where transaction_number = (
      select payment_number
      from public.payments
      where reference = 'FINANCE-PAY-001'
    )
  ),
  2000000.00::numeric,
  'posted payment appears as cash in'
);

-- =========================================================
-- 2. PAYMENT NET CASH POSITIVE
-- =========================================================

select is(
  (
    select net_cash
    from public.finance_cash_ledger
    where transaction_number = (
      select payment_number
      from public.payments
      where reference = 'FINANCE-PAY-001'
    )
  ),
  2000000.00::numeric,
  'payment contributes positive net cash'
);

-- =========================================================
-- CREATE + ALLOCATE REFUND
-- =========================================================

select pg_temp.create_refund(
  (
    select id
    from public.payments
    where reference = 'FINANCE-PAY-001'
  ),
  500000,
  timestamptz '2026-09-16 09:00:00+07',
  'Finance test refund',
  null
);

select pg_temp.allocate_refund_to_payment_allocation(
  (
    select id
    from public.refunds
    where reason = 'Finance test refund'
  ),
  (
    select allocation.id
    from public.payment_allocations
      as allocation
    join public.invoices
      as invoice
      on invoice.id = allocation.invoice_id
    where invoice.enrollment_tuition_id =
      'aa800000-0000-0000-0000-000000000001'
  ),
  500000
);

-- =========================================================
-- 3. CASH LEDGER REFUND ROW
-- =========================================================

select is(
  (
    select cash_out
    from public.finance_cash_ledger
    where transaction_number = (
      select refund_number
      from public.refunds
      where reason = 'Finance test refund'
    )
  ),
  500000.00::numeric,
  'posted refund appears as cash out'
);

-- =========================================================
-- 4. REFUND NET CASH NEGATIVE
-- =========================================================

select is(
  (
    select net_cash
    from public.finance_cash_ledger
    where transaction_number = (
      select refund_number
      from public.refunds
      where reason = 'Finance test refund'
    )
  ),
  (-500000.00)::numeric,
  'refund contributes negative net cash'
);

-- =========================================================
-- 5. DAILY PAYMENT SUMMARY
-- =========================================================

select is(
  (
    select net_cash
    from public.branch_daily_cash_summary
    where branch_id =
      'aa100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and occurred_on = date '2026-09-15'
  ),
  2000000.00::numeric,
  'daily cash summary groups payment by Vietnam date'
);

-- =========================================================
-- 6. DAILY REFUND SUMMARY
-- =========================================================

select is(
  (
    select net_cash
    from public.branch_daily_cash_summary
    where branch_id =
      'aa100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and occurred_on = date '2026-09-16'
  ),
  (-500000.00)::numeric,
  'daily cash summary groups refund by Vietnam date'
);

-- =========================================================
-- 7. MONTHLY NET CASH
-- =========================================================

select is(
  (
    select net_cash
    from public.branch_monthly_cash_summary
    where branch_id =
      'aa100000-0000-0000-0000-000000000001'
      and currency = 'VND'
      and month_start = date '2026-09-01'
  ),
  1500000.00::numeric,
  'monthly cash summary equals payments minus refunds'
);

-- =========================================================
-- 8. CURRENT FINANCE NET CASH
-- =========================================================

select is(
  (
    select net_cash
    from public.branch_finance_summary
    where branch_id =
      'aa100000-0000-0000-0000-000000000001'
      and currency = 'VND'
  ),
  1500000.00::numeric,
  'branch finance summary reports net cash'
);

-- =========================================================
-- 9. APPLIED PAYMENT NET OF REFUND
-- =========================================================

select is(
  (
    select applied_payment_amount
    from public.branch_finance_summary
    where branch_id =
      'aa100000-0000-0000-0000-000000000001'
      and currency = 'VND'
  ),
  1500000.00::numeric,
  'applied payment amount is net of refund allocations'
);

-- =========================================================
-- 10. OUTSTANDING MATCHES RECEIVABLE ENGINE
-- =========================================================

select is(
  (
    select outstanding_amount
    from public.branch_finance_summary
    where branch_id =
      'aa100000-0000-0000-0000-000000000001'
      and currency = 'VND'
  ),
  (
    select outstanding_balance
    from public.invoice_receivables
    where enrollment_tuition_id =
      'aa800000-0000-0000-0000-000000000001'
  ),
  'finance outstanding equals receivable engine balance'
);

select * from finish();

rollback;
