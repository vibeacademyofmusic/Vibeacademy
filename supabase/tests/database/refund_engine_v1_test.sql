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

select plan(12);


-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  'b1000000-0000-0000-0000-000000000001',
  'REFUND-TEST-BRANCH',
  'Refund Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'b2000000-0000-0000-0000-000000000001',
  'REFUND-TEST-CURRICULUM',
  'Refund Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'b3000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  'REFUND-G1',
  'Refund Grade 1',
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
  'b4000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',
  'b3000000-0000-0000-0000-000000000001',
  'REFUND-COURSE',
  'Refund Test Course'
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
  'b5000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b4000000-0000-0000-0000-000000000001',
  'REFUND-CLASS',
  'Refund Test Class',
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
  'b6000000-0000-0000-0000-000000000001',
  'REFUND-STUDENT-A',
  'b1000000-0000-0000-0000-000000000001',
  'Refund Student A'
),
(
  'b6000000-0000-0000-0000-000000000002',
  'REFUND-STUDENT-B',
  'b1000000-0000-0000-0000-000000000001',
  'Refund Student B'
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
  'b7000000-0000-0000-0000-000000000001',
  'b6000000-0000-0000-0000-000000000001',
  'b5000000-0000-0000-0000-000000000001',
  '2026-08-20',
  '2026-09-01',
  'ACTIVE'
),
(
  'b7000000-0000-0000-0000-000000000002',
  'b6000000-0000-0000-0000-000000000002',
  'b5000000-0000-0000-0000-000000000001',
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
  'b8000000-0000-0000-0000-000000000001',
  'b7000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3000000
),
(
  'b8000000-0000-0000-0000-000000000002',
  'b7000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  3000000
);


insert into auth.users (
  id
)
values (
  'bf000000-0000-0000-0000-000000000001'
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
insert into public.profiles(id, status) values ('bf000000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (
  user_id,
  role_id
)
select
  'bf000000-0000-0000-0000-000000000001',
  role.id
from public.roles
as role
where role.code = 'SUPER_ADMIN'
on conflict do nothing;


select set_config(
  'request.jwt.claim.sub',
  'bf000000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;


-- =========================================================
-- CREATE + ISSUE INVOICES
-- =========================================================

select public.create_tuition_invoice(
  'b8000000-0000-0000-0000-000000000001',
  null
);

select public.create_tuition_invoice(
  'b8000000-0000-0000-0000-000000000002',
  null
);


select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  date '2026-09-15',
  date '2099-12-31'
);


select public.issue_invoice(
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000002'
  ),
  date '2026-09-15',
  date '2099-12-31'
);


-- =========================================================
-- CREATE + ALLOCATE PAYMENT FOR STUDENT A
-- =========================================================

select public.create_payment(
  'b6000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  (
    select total_amount
    from public.invoices
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  'VND',
  'BANK_TRANSFER',
  timestamptz '2026-09-15 10:00:00+07',
  'REFUND-PAY-A',
  null
);


select public.allocate_payment_to_invoice(
  (
    select id
    from public.payments
    where reference = 'REFUND-PAY-A'
  ),
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  (
    select total_amount
    from public.invoices
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  )
);


-- =========================================================
-- 1. FULLY PAID BEFORE REFUND
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  'PAID',
  'invoice is paid before refund'
);


-- =========================================================
-- CREATE PARTIAL REFUND
-- =========================================================

select pg_temp.create_refund(
  (
    select id
    from public.payments
    where reference = 'REFUND-PAY-A'
  ),
  1000000,
  timestamptz '2026-09-16 10:00:00+07',
  'Partial refund',
  null
);


-- =========================================================
-- 2. REFUND IS POSTED
-- =========================================================

select is(
  (
    select status
    from public.refunds
    where reason = 'Partial refund'
  ),
  'POSTED',
  'new refund is posted'
);


-- =========================================================
-- 3. REFUND SNAPSHOTS ORIGINAL PAYMENT CURRENCY
-- =========================================================

select is(
  (
    select currency
    from public.refunds
    where reason = 'Partial refund'
  ),
  'VND',
  'refund snapshots payment currency'
);


-- =========================================================
-- ALLOCATE REFUND BACK TO ORIGINAL PAYMENT ALLOCATION
-- =========================================================

select pg_temp.allocate_refund_to_payment_allocation(
  (
    select id
    from public.refunds
    where reason = 'Partial refund'
  ),
  (
    select allocation.id
    from public.payment_allocations
      as allocation
    join public.invoices
      as invoice
      on invoice.id =
        allocation.invoice_id
    where invoice.enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  1000000
);


-- =========================================================
-- 4. REFUND REOPENS RECEIVABLE
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  'PARTIALLY_PAID',
  'posted refund reopens invoice receivable'
);


-- =========================================================
-- 5. REFUNDED AMOUNT IS EXPOSED
-- =========================================================

select is(
  (
    select refunded_amount
    from public.invoice_receivables
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  1000000.00::numeric,
  'refund-aware receivable exposes refunded amount'
);


-- =========================================================
-- 6. OUTSTANDING BALANCE EQUALS REFUND
-- =========================================================

select is(
  (
    select outstanding_balance
    from public.invoice_receivables
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  1000000.00::numeric,
  'refund restores outstanding balance'
);


-- =========================================================
-- 7. OVER-REFUND PAYMENT BLOCKED
-- =========================================================

select throws_ok(
  $$
    select pg_temp.create_refund(
      (
        select id
        from public.payments
        where reference = 'REFUND-PAY-A'
      ),
      (
        select amount
        from public.payments
        where reference = 'REFUND-PAY-A'
      ),
      timestamptz '2026-09-17 10:00:00+07',
      'Too much refund',
      null
    )
  $$,
  'P0001',
  'Refund exceeds the remaining refundable payment amount',
  'refund cannot exceed remaining payment amount'
);


-- =========================================================
-- CREATE PAYMENT FOR STUDENT B
-- =========================================================

select public.create_payment(
  'b6000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000001',
  500000,
  'VND',
  'CASH',
  timestamptz '2026-09-15 12:00:00+07',
  'REFUND-PAY-B',
  null
);


select public.allocate_payment_to_invoice(
  (
    select id
    from public.payments
    where reference = 'REFUND-PAY-B'
  ),
  (
    select id
    from public.invoices
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000002'
  ),
  500000
);


-- =========================================================
-- 8. WRONG PAYMENT ALLOCATION BLOCKED
-- =========================================================

select throws_ok(
  $$
    select pg_temp.allocate_refund_to_payment_allocation(
      (
        select id
        from public.refunds
        where reason = 'Partial refund'
      ),
      (
        select allocation.id
        from public.payment_allocations
          as allocation
        join public.invoices
          as invoice
          on invoice.id =
            allocation.invoice_id
        where invoice.enrollment_tuition_id =
          'b8000000-0000-0000-0000-000000000002'
      ),
      100000
    )
  $$,
  'P0001',
  'Refund must be allocated against its original payment',
  'refund cannot be allocated against another payment'
);


-- =========================================================
-- 9. REFUND FINANCIAL SNAPSHOT IMMUTABLE
-- =========================================================

reset role;

select throws_ok(
  $$
    update public.refunds
    set amount = 1
    where reason = 'Partial refund'
  $$,
  'P0001',
  'Refund financial snapshots are immutable',
  'refund financial snapshots cannot be edited'
);

set local role authenticated;


-- =========================================================
-- 10. VOID REFUND
-- =========================================================

select lives_ok(
  $$
    select pg_temp.void_refund(
      (
        select id
        from public.refunds
        where reason = 'Partial refund'
      ),
      'Refund entered by mistake'
    )
  $$,
  'posted refund can be voided'
);


-- =========================================================
-- 11. VOIDED REFUND RESTORES PAID STATUS
-- =========================================================

select is(
  (
    select receivable_status
    from public.invoice_receivables
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  'PAID',
  'voided refund stops affecting receivable'
);


-- =========================================================
-- 12. VOIDED REFUND NO LONGER COUNTS
-- =========================================================

select is(
  (
    select refunded_amount
    from public.invoice_receivables
    where enrollment_tuition_id =
      'b8000000-0000-0000-0000-000000000001'
  ),
  0.00::numeric,
  'voided refund no longer reduces net allocated amount'
);


select * from finish();

rollback;
