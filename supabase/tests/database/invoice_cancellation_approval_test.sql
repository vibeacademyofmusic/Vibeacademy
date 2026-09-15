begin;
\ir ../helpers/approved_finance.inc

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



reset role;
insert into auth.users(id) values('ef000000-0000-0000-0000-000000000002'),('ef000000-0000-0000-0000-000000000003');
insert into profiles(id) values('ef000000-0000-0000-0000-000000000002'),('ef000000-0000-0000-0000-000000000003');
insert into user_roles(user_id,role_id,branch_id) select 'ef000000-0000-0000-0000-000000000002',id,'e1000000-0000-0000-0000-000000000001' from roles where code='BRANCH_ADMIN';
insert into user_roles(user_id,role_id,branch_id) select 'ef000000-0000-0000-0000-000000000003',id,'e1000000-0000-0000-0000-000000000001' from roles where code='FINANCE';
set local role authenticated;
create temp table cancellation_fixture as select public.create_tuition_invoice('e8000000-0000-0000-0000-000000000001','Approval invoice') invoice_id;
select public.issue_invoice(invoice_id,'2026-09-01','2026-09-30') from cancellation_fixture;
select throws_ok($$select public.cancel_invoice(invoice_id,'Direct bypass') from cancellation_fixture$$,'P0001','Financial approval required','Issued invoice direct cancellation closed');
create temp table cancel_request as select public.request_financial_action('CANCEL_INVOICE',invoice_id,'{}','Correct issued invoice',gen_random_uuid()) request_id from cancellation_fixture;
select is((select status from public.invoices where id=(select invoice_id from cancellation_fixture)),'ISSUED','Pending cancellation preserves invoice');
select throws_ok($$select public.approve_financial_action(request_id,'Checked') from cancel_request$$,'P0001','Maker cannot approve own financial request','Invoice maker cannot self approve');
select set_config('request.jwt.claim.sub','ef000000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.approve_financial_action(request_id,'Checked') from cancel_request$$,'P0001','Unauthorized','Branch cannot approve debt-changing cancellation');
select set_config('request.jwt.claim.sub','ef000000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.approve_financial_action(request_id,'Finance checked invoice cancellation') from cancel_request$$,'Different FINANCE checker cancels invoice');
select is((select status from public.invoices where id=(select invoice_id from cancellation_fixture)),'CANCELLED','Approved cancellation posts status');
select is((select count(*) from public.financial_approval_events where request_id=(select request_id from cancel_request) and event='POSTED' and before_snapshot->>'status'='ISSUED' and after_snapshot->>'status'='CANCELLED'),1::bigint,'Invoice audit records before and after');
select lives_ok($$select public.approve_financial_action(request_id,'Retry') from cancel_request$$,'Invoice cancellation retry idempotent');
select is((select count(*) from public.financial_approval_events where request_id=(select request_id from cancel_request)),3::bigint,'Invoice retry does not duplicate audit');
select throws_ok($$select finance_private.cancel_invoice(invoice_id,'Bypass') from cancellation_fixture$$,'42501',null,'Private invoice engine inaccessible');
select * from finish();
rollback;
