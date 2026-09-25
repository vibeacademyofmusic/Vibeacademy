begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
('e9300000-0000-4000-8000-000000000001', 'AGREE-T', 'Agreed tuition branch');
insert into auth.users(id) values ('e9300000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
('e9300000-0000-4000-8000-000000000002', 'Agreed Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'e9300000-0000-4000-8000-000000000002', id from public.roles where code = 'SUPER_ADMIN';
insert into public.tuition_plans(id, code, name, duration_months) values
('e9300000-0000-4000-8000-000000000010', 'AGREE-P', 'Agreed plan', 3);
insert into public.tuition_plan_branch_prices(id, tuition_plan_id, branch_id, list_price, currency) values
('e9300000-0000-4000-8000-000000000011', 'e9300000-0000-4000-8000-000000000010',
 'e9300000-0000-4000-8000-000000000001', 1000001, 'VND');
insert into public.curriculums(id, code, name, status) values
('e9300000-0000-4000-8000-000000000020', 'AGREE-C', 'Guitar Agreed', 'ACTIVE');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status) values
('e9300000-0000-4000-8000-000000000021', 'e9300000-0000-4000-8000-000000000020', 'AGREE-L', 'Grade 1', 1, 'ACTIVE');
insert into public.curriculum_subjects(id, level_id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status) values
('e9300000-0000-4000-8000-000000000022', 'e9300000-0000-4000-8000-000000000021', 'TECHNIQUE', 'AGREE-S', 'Technique', 1, true, 'DIRECT_ASSESSMENT', 1, 'ACTIVE');
insert into public.courses(id, curriculum_id, level_id, code, name) values
('e9300000-0000-4000-8000-000000000023', 'e9300000-0000-4000-8000-000000000020',
 'e9300000-0000-4000-8000-000000000021', 'AGREE-COURSE', 'Agreed course');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
('e9300000-0000-4000-8000-000000000024', 'e9300000-0000-4000-8000-000000000001',
 'e9300000-0000-4000-8000-000000000023', 'AGREE-CLASS', 'Agreed class', 'GROUP', 8, 'ACTIVE');

select set_config('request.jwt.claim.sub', 'e9300000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$select public.create_registration_application_with_academics(
  'e9300000-0000-4000-8000-000000000003',
  'e9300000-0000-4000-8000-000000000001', null,
  'Agreed Student', '2014-02-02', 'Agreed Parent', '0901000002',
  'e9300000-0000-4000-8000-000000000020',
  'e9300000-0000-4000-8000-000000000021',
  'e9300000-0000-4000-8000-000000000022',
  '2026-10-01', 'T7 15:00')$$, 'create application with academic ids');
select lives_ok($$select public.transition_registration_application(
  'e9300000-0000-4000-8000-000000000004',
  'e9300000-0000-4000-8000-000000000003', 1, 'SUBMIT')$$, 'submit');
select lives_ok($$select public.transition_registration_application(
  'e9300000-0000-4000-8000-000000000005',
  'e9300000-0000-4000-8000-000000000003', 2, 'VERIFY')$$, 'verify');
select throws_ok($$select public.set_registration_deposit_quote(
  'e9300000-0000-4000-8000-000000000003', 3,
  'e9300000-0000-4000-8000-000000000010', 'PERCENT', 10, 'Ten percent')$$,
  'P0001', 'REGISTRATION_DISCOUNT_NOT_WHOLE_VND', 'fractional VND discount is rejected');
select lives_ok($$select public.set_registration_deposit_quote(
  'e9300000-0000-4000-8000-000000000003', 3,
  'e9300000-0000-4000-8000-000000000010', 'FIXED', 1, 'Preview offer')$$, 'quote agreed tuition');
select is((select list_amount from public.registration_deposit_terms
  where application_id = 'e9300000-0000-4000-8000-000000000003'), 1000001::bigint, 'list price is snapshotted');
select is((select tuition_amount from public.registration_deposit_terms
  where application_id = 'e9300000-0000-4000-8000-000000000003'), 1000000::bigint, 'agreed total subtracts the approved discount');
select is((select deposit_due from public.registration_deposit_terms
  where application_id = 'e9300000-0000-4000-8000-000000000003'), 500000::bigint, 'deposit is half the agreed total, not half the list price');

select lives_ok($$select public.reserve_registration_momo_order(
  'e9300000-0000-4000-8000-000000000003',
  'e9300000-0000-4000-8000-000000000006', 3, 400000)$$, 'reserve under-threshold order');
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.activate_registration_momo_order(
  'VIBEE9300000000040008000000000000006', 'TEST', 400000,
  'https://test-payment.momo.vn/pay/agreed-1')$$, 'activate under-threshold checkout');
select is((select public.record_verified_momo_ipn(
  'VIBEE9300000000040008000000000000006', 'TEST', '200', 400000, 0)),
  'PARTIAL_DEPOSIT', 'under-threshold deposit stays pending');
select is((select count(*) from public.students where full_name = 'Agreed Student'), 0::bigint, 'no student below the threshold');
select is((select count(*) from public.notification_jobs where entity_id = 'e9300000-0000-4000-8000-000000000003'),
  0::bigint, 'no registration notice before completion');
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$select public.transition_registration_application(
  'e9300000-0000-4000-8000-000000000008',
  'e9300000-0000-4000-8000-000000000003', 4, 'CANCEL')$$,
  'P0001', 'REGISTRATION_PAID_DEPOSIT_REQUIRES_REFUND_REVIEW', 'paid deposit cannot be cancelled');
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.reserve_registration_momo_order(
  'e9300000-0000-4000-8000-000000000003',
  'e9300000-0000-4000-8000-000000000007', 4, 100000)$$, 'reserve remaining deposit');
select lives_ok($$select public.activate_registration_momo_order(
  'VIBEE9300000000040008000000000000007', 'TEST', 100000,
  'https://test-payment.momo.vn/pay/agreed-2')$$, 'activate threshold checkout');
select is((select public.record_verified_momo_ipn(
  'VIBEE9300000000040008000000000000007', 'TEST', '201', 100000, 0)),
  'COMPLETED', 'threshold completes once');
select is((select public.complete_momo_deposit_registration('e9300000-0000-4000-8000-000000000003')),
  'ALREADY_COMPLETED', 'completion replay does not create another student');
select is((select count(*) from public.students where full_name = 'Agreed Student'), 1::bigint, 'one student');
select is((select count(distinct student_code) from public.students where full_name = 'Agreed Student' and student_code is not null),
  1::bigint, 'one student code');
select is((select count(*) from public.student_placement_cases placement
  where placement.registration_application_id = 'e9300000-0000-4000-8000-000000000003'
    and placement.status = 'UNASSIGNED'
    and placement.curriculum_id = 'e9300000-0000-4000-8000-000000000020'
    and placement.level_id = 'e9300000-0000-4000-8000-000000000021'
    and placement.subject_id = 'e9300000-0000-4000-8000-000000000022'
    and placement.assigned_class_id is null), 1::bigint, 'one unassigned waiting placement keeps academic ids');
select is((select count(*) from public.payments where reference in ('MOMO:200', 'MOMO:201')),
  2::bigint, 'one receipt per verified transaction');
select is((select count(*) from public.notification_jobs
  where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'e9300000-0000-4000-8000-000000000003'),
  1::bigint, 'one registration notification job');
select is((select payload->'parameters' ?& array['customer_name','registration_code','student_name','program_name','branch_name','order_code','payment_status']
  from public.notification_jobs
  where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'e9300000-0000-4000-8000-000000000003'),
  true, 'job payload uses the seven template 640377 parameter names');
select is((select payload->'parameters'->>'program_name' from public.notification_jobs
  where entity_id = 'e9300000-0000-4000-8000-000000000003'),
  'Guitar Agreed', 'program name comes from the selected curriculum');

select set_config('request.jwt.claim.role', 'authenticated', true);
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status)
select 'e9300000-0000-4000-8000-000000000030', linked_student_id,
  'e9300000-0000-4000-8000-000000000024', '2026-10-01', '2026-10-01', 'ACTIVE'
from public.registration_applications where id = 'e9300000-0000-4000-8000-000000000003';
select public.create_tuition_term(
  'e9300000-0000-4000-8000-000000000030',
  'e9300000-0000-4000-8000-000000000010', null, 'FIXED', 1, 'Preview offer');
select public.create_tuition_invoice(
  (select id from public.enrollment_tuition where enrollment_id = 'e9300000-0000-4000-8000-000000000030'),
  'Cong no noi bo');
select public.issue_invoice(
  (select id from public.invoices where enrollment_id_snapshot = 'e9300000-0000-4000-8000-000000000030'),
  current_date, current_date);
select is((select public.allocate_registration_deposits_to_invoice(
  'e9300000-0000-4000-8000-000000000003',
  (select id from public.invoices where enrollment_id_snapshot = 'e9300000-0000-4000-8000-000000000030'))),
  2, 'both deposit receipts allocate once');
select is((select public.allocate_registration_deposits_to_invoice(
  'e9300000-0000-4000-8000-000000000003',
  (select id from public.invoices where enrollment_id_snapshot = 'e9300000-0000-4000-8000-000000000030'))),
  0, 'allocation replay does not apply the deposit again');
select is((select outstanding_balance from public.invoice_receivables
  where enrollment_id_snapshot = 'e9300000-0000-4000-8000-000000000030'),
  500000::numeric, 'remaining balance is agreed tuition minus allocated deposits');
select is((select count(*) from public.students where full_name = 'Agreed Student'), 1::bigint, 'class creation does not duplicate the student');

select * from finish();
rollback;
