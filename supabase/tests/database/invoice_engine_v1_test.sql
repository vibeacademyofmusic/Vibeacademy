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
  'e1000000-0000-0000-0000-000000000001',
  'INVOICE-TEST-BRANCH',
  'Invoice Test Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'e2000000-0000-0000-0000-000000000001',
  'INVOICE-TEST-CURRICULUM',
  'Invoice Test Curriculum'
);


insert into public.curriculum_levels (
  id,
  curriculum_id,
  code,
  name,
  sequence_no
)
values (
  'e3000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001',
  'INVOICE-G1',
  'Invoice Grade 1',
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
  'e4000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001',
  'e3000000-0000-0000-0000-000000000001',
  'INVOICE-COURSE',
  'Invoice Test Course'
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
  'e5000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'e4000000-0000-0000-0000-000000000001',
  'INVOICE-CLASS',
  'Invoice Test Class',
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
    'e6000000-0000-0000-0000-000000000001',
    'INVOICE-STUDENT-A',
    'e1000000-0000-0000-0000-000000000001',
    'Invoice Student A'
  ),
  (
    'e6000000-0000-0000-0000-000000000002',
    'INVOICE-STUDENT-B',
    'e1000000-0000-0000-0000-000000000001',
    'Invoice Student B'
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
    'e7000000-0000-0000-0000-000000000001',
    'e6000000-0000-0000-0000-000000000001',
    'e5000000-0000-0000-0000-000000000001',
    '2026-08-20',
    '2026-09-01',
    'ACTIVE'
  ),
  (
    'e7000000-0000-0000-0000-000000000002',
    'e6000000-0000-0000-0000-000000000002',
    'e5000000-0000-0000-0000-000000000001',
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
    'e8000000-0000-0000-0000-000000000001',
    'e7000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000003',
    '2026-09-01',
    3000000
  ),
  (
    'e8000000-0000-0000-0000-000000000002',
    'e7000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000003',
    '2026-09-01',
    3500000
  );


update public.enrollment_tuition
set status = 'CANCELLED'
where id = 'e8000000-0000-0000-0000-000000000002';


-- =========================================================
-- AUTHENTICATED SUPER ADMIN
-- =========================================================

insert into auth.users (
  id
)
values (
  'ef000000-0000-0000-0000-000000000001'
);


insert into public.roles (
  code,
  name
)
values (
  'SUPER_ADMIN',
  'Admin'
)
on conflict (code) do nothing;


-- Authorization requires an active account as well as the role assignment.
insert into public.profiles(id, status) values ('ef000000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (
  user_id,
  role_id
)
select
  'ef000000-0000-0000-0000-000000000001',
  id
from public.roles
where code = 'SUPER_ADMIN';


select set_config(
  'request.jwt.claim.sub',
  'ef000000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;


-- =========================================================
-- 1. CREATE DRAFT INVOICE
-- =========================================================

select ok(
  public.create_tuition_invoice(
    'e8000000-0000-0000-0000-000000000001',
    'Invoice test'
  ) is not null,
  'creates a draft invoice from an active tuition term'
);


-- =========================================================
-- 2. INVOICE STATUS
-- =========================================================

select is(
  (
    select status
    from public.invoices
    where enrollment_tuition_id =
      'e8000000-0000-0000-0000-000000000001'
  ),
  'DRAFT',
  'new tuition invoice starts as DRAFT'
);


-- =========================================================
-- 3. AMOUNT SNAPSHOT
-- =========================================================

select is(
  (
    select total_amount
    from public.invoices
    where enrollment_tuition_id =
      'e8000000-0000-0000-0000-000000000001'
  ),
  (
    select amount
    from public.enrollment_tuition
    where id =
      'e8000000-0000-0000-0000-000000000001'
  ),
  'invoice snapshots the final tuition amount'
);


-- =========================================================
-- 4. BRANCH SNAPSHOT
-- =========================================================

select is(
  (
    select branch_code_snapshot
    from public.invoices
    where enrollment_tuition_id =
      'e8000000-0000-0000-0000-000000000001'
  ),
  'INVOICE-TEST-BRANCH',
  'invoice snapshots the tuition branch'
);


-- =========================================================
-- 5. TUITION LINE ITEM
-- =========================================================

select is(
  (
    select line_total
    from public.invoice_items
    where invoice_id = (
      select id
      from public.invoices
      where enrollment_tuition_id =
        'e8000000-0000-0000-0000-000000000001'
    )
      and line_no = 1
  ),
  (
    select amount
    from public.enrollment_tuition
    where id =
      'e8000000-0000-0000-0000-000000000001'
  ),
  'invoice creates one tuition line item with the correct amount'
);


-- =========================================================
-- 6. DUPLICATE INVOICE BLOCKED
-- =========================================================

select throws_ok(
  $$
    select public.create_tuition_invoice(
      'e8000000-0000-0000-0000-000000000001',
      null
    )
  $$,
  'P0001',
  'An invoice already exists for this tuition term',
  'a tuition term cannot create a duplicate invoice'
);


-- =========================================================
-- 7. INVALID DUE DATE BLOCKED
-- =========================================================

select throws_ok(
  $$
    select public.issue_invoice(
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'e8000000-0000-0000-0000-000000000001'
      ),
      '2026-09-15',
      '2026-09-14'
    )
  $$,
  'P0001',
  'Invoice due date cannot be earlier than issue date',
  'invoice due date cannot be before issue date'
);


-- =========================================================
-- 8. ISSUE INVOICE
-- =========================================================

select lives_ok(
  $$
    select public.issue_invoice(
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'e8000000-0000-0000-0000-000000000001'
      ),
      '2026-09-15',
      '2026-09-22'
    )
  $$,
  'draft invoice can be issued'
);


-- =========================================================
-- 9. ISSUED STATE STORED
-- =========================================================

select is(
  (
    select
      status || ':' ||
      issued_on::text || ':' ||
      due_on::text
    from public.invoices
    where enrollment_tuition_id =
      'e8000000-0000-0000-0000-000000000001'
  ),
  'ISSUED:2026-09-15:2026-09-22',
  'issued invoice stores issue and due dates'
);


-- =========================================================
-- 10. FINANCIAL SNAPSHOT IMMUTABLE
--
-- Direct authenticated updates are already blocked by RLS.
-- Reset role here so this test exercises the database guard
-- trigger itself rather than the RLS policy.
-- =========================================================

reset role;

select throws_ok(
  $$
    update public.invoices
    set total_amount = 1
    where enrollment_tuition_id =
      'e8000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Invoice financial snapshots are immutable',
  'invoice financial snapshots cannot be edited'
);

set local role authenticated;


-- =========================================================
-- 11. CANCEL ISSUED INVOICE
-- =========================================================

select lives_ok(
  $$
    select pg_temp.cancel_invoice(
      (
        select id
        from public.invoices
        where enrollment_tuition_id =
          'e8000000-0000-0000-0000-000000000001'
      ),
      'Test cancellation'
    )
  $$,
  'issued invoice can be cancelled with a reason'
);


-- =========================================================
-- 12. CANCELLED TUITION CANNOT CREATE INVOICE
-- =========================================================

select throws_ok(
  $$
    select public.create_tuition_invoice(
      'e8000000-0000-0000-0000-000000000002',
      null
    )
  $$,
  'P0001',
  'Cannot create an invoice from a cancelled tuition term',
  'cancelled tuition term cannot create an invoice'
);


reset role;

select * from finish();

rollback;
