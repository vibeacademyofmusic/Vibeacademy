begin;

-- Fixture prerequisite for the current enrollment guard. Does not change production rules.
create or replace function pg_temp.prepare_enrollment_fixture(p_class uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.classes%rowtype; course public.courses%rowtype; level_id uuid; t uuid; r uuid; slot int;
begin
 select * into c from public.classes where id=p_class;
 if not found or c.course_id is null or c.xmin::text is distinct from txid_current()::text then return; end if;
 select * into course from public.courses where id=c.course_id;
 if not found then return; end if;
 level_id := course.level_id;
 if level_id is null then
   select id into level_id from public.curriculum_levels where curriculum_id=course.curriculum_id order by sequence_no limit 1;
   if level_id is null then return; end if;
   update public.courses set level_id=level_id where id=course.id and xmin::text=txid_current()::text;
 end if;
 update public.classes set accepted_from_level_id=coalesce(accepted_from_level_id,level_id),
   accepted_to_level_id=coalesce(accepted_to_level_id,level_id) where id=c.id;
 update public.students set default_branch_id=c.branch_id
  where default_branch_id is null and status='ACTIVE' and xmin::text=txid_current()::text;
 insert into public.student_curriculum_enrollments(student_id,curriculum_id,current_level_id,started_at,status,is_primary)
 select s.id,course.curriculum_id,level_id,date '2000-01-01','ACTIVE',true
 from public.students s
 where s.default_branch_id=c.branch_id and s.xmin::text=txid_current()::text
   and not exists(select 1 from public.student_curriculum_enrollments a where a.student_id=s.id and a.status='ACTIVE' and (a.curriculum_id=course.curriculum_id or a.is_primary));
 if not exists(select 1 from public.class_teachers where class_id=c.id and teacher_role='PRIMARY' and (is_active or ended_at is not null)) then
   select id into t from public.teachers where teacher_code='FIX-'||c.id;
   if t is null then
     insert into public.teachers(teacher_code,full_name) values('FIX-'||c.id,'TEST prerequisite teacher') returning id into t;
     insert into public.teacher_branches(teacher_id,branch_id,is_primary) values(t,c.branch_id,true);
   end if;
   insert into public.class_teachers(class_id,teacher_id,teacher_role,assigned_at) values(c.id,t,'PRIMARY',date '2000-01-01');
 end if;
 if not exists(select 1 from public.rooms where branch_id=c.branch_id and code='FIX-'||c.id) then
   insert into public.rooms(branch_id,code,name,capacity) values(c.branch_id,'FIX-'||c.id,'TEST prerequisite room',30) returning id into r;
 else
   select id into r from public.rooms where branch_id=c.branch_id and code='FIX-'||c.id limit 1;
 end if;
 if exists(select 1 from public.schedules where class_id=c.id and status='ACTIVE') then
   update public.schedules set room_id=coalesce(room_id,r) where class_id=c.id and status='ACTIVE' and room_id is null;
 else
   slot := abs(hashtext(c.id::text));
   insert into public.schedules(class_id,room_id,day_of_week,start_time,end_time,effective_from,timezone,status)
   values(c.id,r,1+(slot%7),time '06:00'+(slot%10)*interval '1 hour',time '06:50'+(slot%10)*interval '1 hour',date '2000-01-01','Asia/Ho_Chi_Minh','ACTIVE');
 end if;
end $$;

\ir approved_finance.inc

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

select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
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
