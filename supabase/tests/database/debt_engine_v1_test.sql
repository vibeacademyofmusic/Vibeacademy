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


select pg_temp.prepare_enrollment_fixture(id) from public.classes where xmin::text = txid_current()::text;
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
