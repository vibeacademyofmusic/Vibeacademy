begin;

create extension if not exists pgtap;

select no_plan();

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
  'INTEGRITY-TEST-BRANCH',
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
  list_price,
  amount
)
values
(
  'f4000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3000000,
  3000000
),
(
  'f4000000-0000-0000-0000-000000000002',
  'f3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2027-09-01',
  3500000,
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


-- Authorization requires an active account as well as the role assignment.
insert into public.profiles(id, status) values ('ff000000-0000-0000-0000-000000000001', 'ACTIVE');
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
  current_date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date
);

select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'f4000000-0000-0000-0000-000000000002'
  ),
  current_date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date
);


-- =========================================================

create function pg_temp.receipt(k uuid, amt numeric) returns uuid language sql as $$
 select public.create_payment_once(k,'f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',amt,'VND','CASH',current_date::timestamptz,'INTEGRITY',null)
$$;
create function pg_temp.inv(n integer) returns uuid language sql as $$
 select id from public.invoices where enrollment_tuition_id=('f4000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
create temp table receipts(id uuid);
insert into receipts select pg_temp.receipt('ff900000-0000-0000-0000-000000000001',3000000);
select is(pg_temp.receipt('ff900000-0000-0000-0000-000000000001',3000000),(select id from receipts),'replay returns same payment');
select is((select count(*) from public.payments where reference='INTEGRITY'),1::bigint,'exactly one POSTED payment after replay');
select throws_ok($$select pg_temp.receipt('ff900000-0000-0000-0000-000000000001',3000001)$$,'P0001','Payment request key reused with different input','changed payload rejected');
create temp table before_forecast as select * from public.branch_monthly_revenue_forecast where branch_id='f1000000-0000-0000-0000-000000000001';
select is((select sum(cash_in) from public.finance_cash_ledger where branch_id='f1000000-0000-0000-0000-000000000001'),3000000::numeric,'cash received once');
select public.allocate_payment_to_invoice((select id from receipts),pg_temp.inv(1),2000000);
select is((select receivable_status from public.invoice_receivables where invoice_id=pg_temp.inv(1)),'PARTIALLY_PAID','partial payment status');
select is((select allocated_amount from public.invoice_receivables where invoice_id=pg_temp.inv(1)),2000000::numeric,'allocated increases');
select is((select outstanding_balance from public.invoice_receivables where invoice_id=pg_temp.inv(1)),2500000::numeric,'outstanding decreases');
select throws_ok($$select public.allocate_payment_to_invoice((select id from receipts),pg_temp.inv(1),1)$$,'P0001','This payment is already allocated to this invoice','duplicate allocation blocked');
select throws_ok($$select public.allocate_payment_to_invoice((select id from receipts),pg_temp.inv(2),1000001)$$,'P0001','Allocation exceeds the remaining payment amount','payment over-allocation blocked');
select public.allocate_payment_to_invoice((select id from receipts),pg_temp.inv(2),1000000);
select is((select count(*) from public.payment_allocations where payment_id=(select id from receipts)),2::bigint,'one payment pays multiple invoices');
select is((select count(*) from public.payments where reference='INTEGRITY'),1::bigint,'allocation creates no payment');
select is((select sum(cash_in) from public.finance_cash_ledger where branch_id='f1000000-0000-0000-0000-000000000001'),3000000::numeric,'allocation changes no cash');
select is((select sum(expected_cash_due) from public.branch_monthly_revenue_forecast where branch_id='f1000000-0000-0000-0000-000000000001'),(select sum(expected_cash_due)-3000000 from before_forecast),'forecast due decreases by allocations');
select is((select sum(projected_renewal_amount) from public.branch_monthly_revenue_forecast where branch_id='f1000000-0000-0000-0000-000000000001'),(select sum(projected_renewal_amount) from before_forecast),'allocation never increases renewal projection');
create temp table second_receipt as select pg_temp.receipt('ff900000-0000-0000-0000-000000000002',6500000) id;
select public.allocate_payment_to_invoice((select id from second_receipt),pg_temp.inv(1),2500000);
select public.allocate_payment_to_invoice((select id from second_receipt),pg_temp.inv(2),3500000);
select is((select receivable_status from public.invoice_receivables where invoice_id=pg_temp.inv(1)),'PAID','multiple payments finish one invoice');
select is((select invoice_status from public.invoice_receivables where invoice_id=pg_temp.inv(1)),'ISSUED','paid invoice lifecycle remains issued');
select is((select outstanding_balance from public.invoice_receivables where invoice_id=pg_temp.inv(2)),0::numeric,'second invoice fully paid');
select is((select sum(expected_cash_due) from public.branch_monthly_revenue_forecast where branch_id='f1000000-0000-0000-0000-000000000001'),0::numeric,'fully paid invoices no longer expected cash');
select is((select sum(cash_in) from public.finance_cash_ledger where branch_id='f1000000-0000-0000-0000-000000000001'),9500000::numeric,'only actual payments increase cash');
select is(pg_temp.receipt('ff900000-0000-0000-0000-000000000001',3000000),(select id from receipts),'replay after allocation still returns original');
select throws_ok($$select public.create_payment_once(null,'f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',1,'VND','CASH',current_date::timestamptz)$$,'P0001','Payment request key required','key cannot be omitted');
select set_config('request.jwt.claim.sub','f2000000-0000-0000-0000-000000000002',true);
select throws_ok($$select pg_temp.receipt('ff900000-0000-0000-0000-000000000001',3000000)$$,'P0001','SUPER_ADMIN role required','replay still requires authorization');
select * from finish();
rollback;
