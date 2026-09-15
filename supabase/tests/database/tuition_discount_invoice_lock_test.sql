begin;

create extension if not exists pgtap;

select plan(4);


-- =========================================================
-- FIXTURES
-- =========================================================

insert into public.branches (
  id,
  code,
  name
)
values (
  'c1000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-BRANCH',
  'Discount Lock Branch'
);


insert into public.curriculums (
  id,
  code,
  name
)
values (
  'c2000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-CURRICULUM',
  'Discount Lock Curriculum'
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
  'DISCOUNT-LOCK-G1',
  'Discount Lock Grade 1',
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
  'DISCOUNT-LOCK-COURSE',
  'Discount Lock Course'
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
  'c5000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c4000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-CLASS',
  'Discount Lock Class',
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
  'c6000000-0000-0000-0000-000000000001',
  'DISCOUNT-LOCK-STUDENT',
  'c1000000-0000-0000-0000-000000000001',
  'Discount Lock Student'
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
  'c7000000-0000-0000-0000-000000000001',
  'c6000000-0000-0000-0000-000000000001',
  'c5000000-0000-0000-0000-000000000001',
  '2026-08-20',
  '2026-09-01',
  'ACTIVE'
);


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
  'c8000000-0000-0000-0000-000000000001',
  'c7000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000003',
  '2026-09-01',
  'NONE',
  0,
  null
);


insert into auth.users (
  id
)
values (
  'cf000000-0000-0000-0000-000000000001'
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
insert into public.profiles(id, status) values ('cf000000-0000-0000-0000-000000000001', 'ACTIVE');
insert into public.user_roles (
  user_id,
  role_id
)
select
  'cf000000-0000-0000-0000-000000000001',
  role.id
from public.roles
as role
where role.code = 'SUPER_ADMIN'
on conflict do nothing;


select set_config(
  'request.jwt.claim.sub',
  'cf000000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;


-- =========================================================
-- 1. DISCOUNT MAY CHANGE BEFORE INVOICE
-- =========================================================

select lives_ok(
  $$
    update public.enrollment_tuition
    set
      discount_type = 'PERCENT',
      discount_value = 10,
      discount_name = 'Early Payment'
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'discount may change before invoice creation'
);


-- =========================================================
-- CREATE INVOICE
-- =========================================================

select public.create_tuition_invoice(
  'c8000000-0000-0000-0000-000000000001',
  null
);


-- =========================================================
-- 2. DISCOUNT CANNOT CHANGE AFTER INVOICE
-- =========================================================

select throws_ok(
  $$
    update public.enrollment_tuition
    set
      discount_type = 'FIXED',
      discount_value = 100000,
      discount_name = 'Manual Adjustment'
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Tuition discount cannot change after invoice creation',
  'discount is locked after invoice creation'
);


-- =========================================================
-- 3. EFFECTIVE END MAY STILL CHANGE
-- =========================================================

select lives_ok(
  $$
    update public.enrollment_tuition
    set effective_ends_on =
      effective_ends_on + 5
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'pause-style effective end update remains allowed'
);


-- =========================================================
-- 4. NO-OP DISCOUNT UPDATE REMAINS VALID
-- =========================================================

select lives_ok(
  $$
    update public.enrollment_tuition
    set
      discount_type = discount_type,
      discount_value = discount_value,
      discount_name = discount_name
    where id =
      'c8000000-0000-0000-0000-000000000001'
  $$,
  'unchanged discount values remain valid after invoice creation'
);


select * from finish();

rollback;
