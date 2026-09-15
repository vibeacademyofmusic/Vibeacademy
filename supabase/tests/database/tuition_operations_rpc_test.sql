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



select is((public.preview_tuition_discount('c8000000-0000-0000-0000-000000000001','PERCENT',10,'Test')->>'amount')::numeric,4050000::numeric,'discount preview uses immutable list price');
select lives_ok($$select public.update_tuition_discount('c8000000-0000-0000-0000-000000000001','PERCENT',10,'Test')$$,'discount RPC before invoice');
select is((select amount from public.enrollment_tuition where id='c8000000-0000-0000-0000-000000000001'),4050000::numeric,'trigger and preview agree');
select throws_ok($$select public.preview_tuition_discount('c8000000-0000-0000-0000-000000000001','PERCENT',101,'Test')$$,'P0001',null,'invalid percentage rejected');
select public.create_tuition_invoice('c8000000-0000-0000-0000-000000000001',null);
select throws_ok($$select public.update_tuition_discount('c8000000-0000-0000-0000-000000000001','PERCENT',20,'Test')$$,'P0001','Tuition discount cannot change after invoice creation','invoice locks RPC');
select is((public.preview_tuition_term('c7000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',null,'NONE',0,null)->>'starts_on')::date,date '2026-12-01','renewal starts after effective end');
select is((public.preview_tuition_term('c7000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',null,'NONE',0,null)->>'base_ends_on')::date,date '2027-02-28','calendar base end');
select throws_ok($$select public.create_tuition_term('c7000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','2026-10-01','NONE',0,null)$$,'P0001','Tuition periods overlap','overlap rejected');
select lives_ok($$select public.create_tuition_term('c7000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',null,'FIXED',500000,'Offer')$$,'create with pricing trigger');
select is((select amount from public.enrollment_tuition where enrollment_id='c7000000-0000-0000-0000-000000000001' and starts_on='2026-12-01'),4000000::numeric,'created snapshot price');

reset role;
insert into students(id,student_code,full_name,default_branch_id) values('c6000000-0000-0000-0000-000000000002','OPS-FIRST-TERM','First Term Student','c1000000-0000-0000-0000-000000000001');
insert into enrollments(id,student_id,class_id,enrolled_at,started_at,status) values('c7000000-0000-0000-0000-000000000002','c6000000-0000-0000-0000-000000000002','c5000000-0000-0000-0000-000000000001','2026-08-20','2026-09-01','ACTIVE');
insert into tuition_plan_branch_prices(tuition_plan_id,branch_id,list_price,currency) values('a1000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000001',5500000,'VND');
set local role authenticated;
select throws_ok($$select preview_tuition_term('c7000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003','2026-09-02','NONE',0,null)$$,'P0001','Invalid tuition study start date','first term must use actual study start');
select is((preview_tuition_term('c7000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003',null,'PERCENT',10,'Offer')->>'amount')::numeric,4950000::numeric,'preview resolves branch override before default');
select lives_ok($$select create_tuition_term('c7000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003',null,'PERCENT',10,'Offer')$$,'first term RPC succeeds');
select is((select amount from enrollment_tuition where enrollment_id='c7000000-0000-0000-0000-000000000002'),4950000::numeric,'branch quote and actual snapshot agree');
select is((select starts_on from enrollment_tuition where enrollment_id='c7000000-0000-0000-0000-000000000002'),date '2026-09-01','actual study date is the anchor');
select is((select currency from enrollment_tuition where enrollment_id='c7000000-0000-0000-0000-000000000002'),'VND','currency resolved by database');
update tuition_plans set status='INACTIVE' where id='a1000000-0000-0000-0000-000000000003';
select throws_ok($$select preview_tuition_term('c7000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003',null,'NONE',0,null)$$,'P0001','Tuition plan does not exist or is inactive','inactive plan rejected');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
select throws_ok($$select public.preview_tuition_discount('c8000000-0000-0000-0000-000000000001','NONE',0,null)$$,'P0001','SUPER_ADMIN role required','preview requires admin');
select throws_ok($$select public.create_tuition_term('c7000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003',null,'NONE',0,null)$$,'P0001','SUPER_ADMIN role required','create requires admin');
select throws_ok($$select public.update_tuition_discount('c8000000-0000-0000-0000-000000000001','NONE',0,null)$$,'P0001','SUPER_ADMIN role required','edit requires admin');
select * from finish(); rollback;
