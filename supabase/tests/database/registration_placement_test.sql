begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('d8100000-0000-4000-8000-000000000001', 'REG-A', 'Registration A'),
  ('d8100000-0000-4000-8000-000000000002', 'REG-B', 'Registration B');
insert into auth.users(id) values
  ('d8200000-0000-4000-8000-000000000001'),
  ('d8200000-0000-4000-8000-000000000002'),
  ('d8200000-0000-4000-8000-000000000003'),
  ('d8200000-0000-4000-8000-000000000004'),
  ('d8200000-0000-4000-8000-000000000005');
insert into public.profiles(id, full_name, status) values
  ('d8200000-0000-4000-8000-000000000001', 'Registration Super', 'ACTIVE'),
  ('d8200000-0000-4000-8000-000000000002', 'Registration Admin A', 'ACTIVE'),
  ('d8200000-0000-4000-8000-000000000003', 'Registration Admin B', 'ACTIVE'),
  ('d8200000-0000-4000-8000-000000000004', 'Registration Teacher', 'ACTIVE'),
  ('d8200000-0000-4000-8000-000000000005', 'Registration No Role', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'd8200000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'd8200000-0000-4000-8000-000000000002', id, 'd8100000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'd8200000-0000-4000-8000-000000000003', id, 'd8100000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'd8200000-0000-4000-8000-000000000004', id, 'd8100000-0000-4000-8000-000000000001' from public.roles where code = 'TEACHER';

insert into public.curriculums(id, code, name) values ('d8300000-0000-4000-8000-000000000001', 'REG-CUR', 'Registration Curriculum');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('d8300000-0000-4000-8000-000000000002', 'd8300000-0000-4000-8000-000000000001', 'REG-L1', 'So cap', 1);
insert into public.courses(id, curriculum_id, level_id, code, name) values
  ('d8300000-0000-4000-8000-000000000003', 'd8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000002', 'REG-PIANO', 'Piano'),
  ('d8300000-0000-4000-8000-000000000013', 'd8300000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000002', 'REG-GUITAR', 'Guitar');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
  ('d8300000-0000-4000-8000-000000000004', 'd8100000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000003', 'REG-GROUP', 'Nhom Piano', 'GROUP', 4, 'ACTIVE'),
  ('d8300000-0000-4000-8000-000000000005', 'd8100000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000003', 'REG-SOLO', 'Solo Piano', 'ONE_ON_ONE', 1, 'ACTIVE'),
  ('d8300000-0000-4000-8000-000000000006', 'd8100000-0000-4000-8000-000000000002', 'd8300000-0000-4000-8000-000000000003', 'REG-OTHER', 'Lop chi nhanh khac', 'GROUP', 4, 'ACTIVE'),
  ('d8300000-0000-4000-8000-000000000007', 'd8100000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000013', 'REG-SONG', 'Lop dang hoc', 'GROUP', 4, 'ACTIVE');
insert into public.teachers(id, teacher_code, full_name) values ('d8700000-0000-4000-8000-000000000001', 'REG-T', 'GV Piano');
insert into public.class_teachers(class_id, teacher_id, teacher_role, is_active, assigned_at) values
  ('d8300000-0000-4000-8000-000000000004', 'd8700000-0000-4000-8000-000000000001', 'PRIMARY', true, '2020-01-01');

insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, status) values
  ('d8400000-0000-4000-8000-000000000001', 'REG-REUSE', 'Regplace Reuse', '2014-02-02', 'd8100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('d8400000-0000-4000-8000-000000000002', 'REG-TRUNG-1', 'Regplace Trung', '2013-03-03', 'd8100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('d8400000-0000-4000-8000-000000000003', 'REG-TRUNG-2', 'Regplace Trung', '2013-03-03', 'd8100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('d8400000-0000-4000-8000-000000000004', 'REG-SONG', 'Regplace Song', '2012-04-04', 'd8100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('d8400000-0000-4000-8000-000000000005', 'REG-FULL', 'Regplace Occupant', '2011-05-05', 'd8100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('d8400000-0000-4000-8000-000000000006', 'REG-INV-0', 'Regplace Invoice Zero', '2010-06-06', 'd8100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('d8400000-0000-4000-8000-000000000007', 'REG-INV-1', 'Regplace Invoice Due', '2010-07-07', 'd8100000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.parents(id, parent_code, status) values ('d8500000-0000-4000-8000-000000000001', 'REG-PAR', 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status) values
  ('d8500000-0000-4000-8000-000000000004', 'd8400000-0000-4000-8000-000000000004', 'd8300000-0000-4000-8000-000000000007', public.registration_vietnam_today() - 30, public.registration_vietnam_today() - 20, 'ACTIVE'),
  ('d8500000-0000-4000-8000-000000000005', 'd8400000-0000-4000-8000-000000000005', 'd8300000-0000-4000-8000-000000000005', public.registration_vietnam_today() - 10, public.registration_vietnam_today() - 5, 'ACTIVE'),
  ('d8500000-0000-4000-8000-000000000006', 'd8400000-0000-4000-8000-000000000006', 'd8300000-0000-4000-8000-000000000004', public.registration_vietnam_today() - 10, public.registration_vietnam_today() - 5, 'ACTIVE'),
  ('d8500000-0000-4000-8000-000000000007', 'd8400000-0000-4000-8000-000000000007', 'd8300000-0000-4000-8000-000000000007', public.registration_vietnam_today() - 10, public.registration_vietnam_today() - 5, 'ACTIVE');
insert into public.tuition_plans(id, code, name, duration_months) values
  ('d8800000-0000-4000-8000-000000000001', 'REG-PLAN-0', 'Goi 0', 3),
  ('d8800000-0000-4000-8000-000000000011', 'REG-PLAN-DUE', 'Goi con no', 3);
insert into public.tuition_plan_branch_prices(tuition_plan_id, branch_id, list_price, currency) values
  ('d8800000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001', 0, 'VND'),
  ('d8800000-0000-4000-8000-000000000011', 'd8100000-0000-4000-8000-000000000001', 1500000, 'VND');
insert into public.enrollment_tuition(id, enrollment_id, tuition_plan_id, starts_on, amount) values
  ('d8800000-0000-4000-8000-000000000002', 'd8500000-0000-4000-8000-000000000006', 'd8800000-0000-4000-8000-000000000001', public.registration_vietnam_today() - 5, 0),
  ('d8800000-0000-4000-8000-000000000003', 'd8500000-0000-4000-8000-000000000007', 'd8800000-0000-4000-8000-000000000011', public.registration_vietnam_today() - 5, 1500000);

select throws_ok(
  $$insert into public.registration_applications(id, application_code, branch_id, created_by) values ('d8600000-0000-4000-8000-000000000099', 'DK-DIRECT', 'd8100000-0000-4000-8000-000000000001', 'd8200000-0000-4000-8000-000000000001')$$,
  'P0001', 'REGISTRATION_DIRECT_WRITE_DENIED', 'direct registration write denied'
);

select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.create_tuition_invoice('d8800000-0000-4000-8000-000000000002', null)$$, 'zero tuition invoice');
select lives_ok($$select public.create_tuition_invoice('d8800000-0000-4000-8000-000000000003', null)$$, 'unpaid tuition invoice');
select lives_ok($$select public.issue_invoice((select id from public.invoices where enrollment_tuition_id = 'd8800000-0000-4000-8000-000000000002'), public.registration_vietnam_today(), public.registration_vietnam_today())$$, 'issue zero invoice');
select lives_ok($$select public.issue_invoice((select id from public.invoices where enrollment_tuition_id = 'd8800000-0000-4000-8000-000000000003'), public.registration_vietnam_today(), public.registration_vietnam_today())$$, 'issue unpaid invoice');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Moi', '2015-01-01', 'Phu Moi', '0901000001', 'Piano', 'Piano', public.registration_vietnam_today(), 'Thu 2 18:00')$$, 'create registration');
select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Moi', '2015-01-01', 'Phu Moi', '0901000001', 'Piano', 'Piano', public.registration_vietnam_today(), 'Thu 2 18:00')$$, 'create replay');
select is((select count(*) from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000001'), 1::bigint, 'one application');
select is((select status from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000001'), 'DRAFT', 'draft status');
select throws_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000099', 'd8600000-0000-4000-8000-000000000001', 9, 'SUBMIT')$$, 'P0001', 'REGISTRATION_STALE', 'stale submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000001', 'd8600000-0000-4000-8000-000000000001', 1, 'SUBMIT')$$, 'submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000002', 'd8600000-0000-4000-8000-000000000001', 2, 'VERIFY')$$, 'verify');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000001', 'd8600000-0000-4000-8000-000000000001', 3, null, null)$$, 'complete new identity');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000001', 'd8600000-0000-4000-8000-000000000001', 3, null, null)$$, 'complete replay');
select is((select count(*) from public.students where full_name = 'Regplace Moi'), 1::bigint, 'one new student');
select is((select count(*) from public.student_parents sp join public.students s on s.id = sp.student_id where s.full_name = 'Regplace Moi'), 1::bigint, 'one parent link');
select is((select count(*) from public.enrollments e join public.students s on s.id = e.student_id where s.full_name = 'Regplace Moi'), 0::bigint, 'completion does not enroll');
select is((select payment_confirmed_at is null from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000001'), true, 'no invoice does not fake payment');
select is((select status from public.student_placement_cases where registration_application_id = 'd8600000-0000-4000-8000-000000000001'), 'UNASSIGNED', 'waiting placement opened');
select is((select count(*) from public.list_waiting_placements(null, 'UNASSIGNED', 'Regplace Moi')), 1::bigint, 'unassigned is waiting');
select is((select count(*) from public.list_current_student_enrollments(null, 'Regplace Moi')), 0::bigint, 'new student is not current');

select lives_ok($$select public.set_student_placement_matching('d8630000-0000-4000-8000-000000000001', (select id from public.student_placement_cases where registration_application_id = 'd8600000-0000-4000-8000-000000000001'), 1)$$, 'matching');
select is((select count(*) from public.list_waiting_placements(null, 'MATCHING', 'Regplace Moi')), 1::bigint, 'matching stays waiting');
select lives_ok(format('select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 2, %L::uuid, %L::date)', 'd8630000-0000-4000-8000-000000000002', 'd8600000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000004', public.registration_vietnam_today() + 30), 'future assign');
select lives_ok(format('select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 2, %L::uuid, %L::date)', 'd8630000-0000-4000-8000-000000000002', 'd8600000-0000-4000-8000-000000000001', 'd8300000-0000-4000-8000-000000000004', public.registration_vietnam_today() + 30), 'assign replay');
select is((select count(*) from public.enrollments e join public.students s on s.id = e.student_id where s.full_name = 'Regplace Moi'), 1::bigint, 'one enrollment after assign');
select is((select placement_status from public.list_waiting_placements(null, 'SCHEDULED_FUTURE', 'Regplace Moi')), 'SCHEDULED_FUTURE', 'future stays waiting');
select is((select count(*) from public.list_current_student_enrollments(null, 'Regplace Moi')), 0::bigint, 'future start is not current');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000002', 'd8100000-0000-4000-8000-000000000001', null, null, null, null, null, null, null, null, null)$$, 'blank draft');
select throws_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000012', 'd8600000-0000-4000-8000-000000000002', 1, 'SUBMIT')$$, 'P0001', 'REGISTRATION_INCOMPLETE', 'incomplete submit');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000003', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Reuse', '2014-02-02', 'Phu Reuse', null, 'Piano', null, null, null)$$, 'reuse draft');
select throws_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000013', 'd8600000-0000-4000-8000-000000000003', 1, null, null)$$, 'P0001', 'REGISTRATION_TRANSITION_DENIED', 'complete before verify');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000013', 'd8600000-0000-4000-8000-000000000003', 1, 'SUBMIT')$$, 'reuse submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000014', 'd8600000-0000-4000-8000-000000000003', 2, 'VERIFY')$$, 'reuse verify');
select throws_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000014', 'd8600000-0000-4000-8000-000000000003', 3, null, null)$$, 'P0001', 'REGISTRATION_REVIEW_REQUIRED', 'existing identity needs review');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000015', 'd8600000-0000-4000-8000-000000000003', 3, 'd8400000-0000-4000-8000-000000000001', 'd8500000-0000-4000-8000-000000000001')$$, 'confirmed reuse');
select is((select count(*) from public.students where full_name = 'Regplace Reuse'), 1::bigint, 'reused student not duplicated');
select is((select count(*) from public.parents where id = 'd8500000-0000-4000-8000-000000000001'), 1::bigint, 'reused parent not duplicated');
select is((select count(*) from public.student_parents where student_id = 'd8400000-0000-4000-8000-000000000001' and parent_id = 'd8500000-0000-4000-8000-000000000001'), 1::bigint, 'one student parent link');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000004', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Trung', '2013-03-03', 'Phu Trung', null, 'Piano', null, null, null)$$, 'ambiguous draft');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000021', 'd8600000-0000-4000-8000-000000000004', 1, 'SUBMIT')$$, 'ambiguous submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000022', 'd8600000-0000-4000-8000-000000000004', 2, 'VERIFY')$$, 'ambiguous verify');
select throws_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000021', 'd8600000-0000-4000-8000-000000000004', 3, null, null)$$, 'P0001', 'REGISTRATION_REVIEW_REQUIRED', 'ambiguous identity blocked');
select is((select count(*) from public.students where full_name = 'Regplace Trung'), 2::bigint, 'ambiguous match creates nobody');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000005', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Unpaid', '2009-08-08', 'Phu Unpaid', null, 'Piano', null, null, null)$$, 'unpaid draft');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000031', 'd8600000-0000-4000-8000-000000000005', 1, 'SUBMIT')$$, 'unpaid submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000032', 'd8600000-0000-4000-8000-000000000005', 2, 'VERIFY')$$, 'unpaid verify');
select lives_ok($$select public.attach_registration_invoice('d8610000-0000-4000-8000-000000000033', 'd8600000-0000-4000-8000-000000000005', 3, (select id from public.invoices where enrollment_tuition_id = 'd8800000-0000-4000-8000-000000000003'))$$, 'attach unpaid invoice');
select is((select status from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000005'), 'PAYMENT_PENDING', 'payment pending');
select throws_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000031', 'd8600000-0000-4000-8000-000000000005', 4, null, null)$$, 'P0001', 'REGISTRATION_PAYMENT_REQUIRED', 'unsettled invoice blocks completion');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000006', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Paid', '2009-09-09', 'Phu Paid', null, 'Piano', null, null, null)$$, 'paid draft');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000041', 'd8600000-0000-4000-8000-000000000006', 1, 'SUBMIT')$$, 'paid submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000042', 'd8600000-0000-4000-8000-000000000006', 2, 'VERIFY')$$, 'paid verify');
select lives_ok($$select public.attach_registration_invoice('d8610000-0000-4000-8000-000000000043', 'd8600000-0000-4000-8000-000000000006', 3, (select id from public.invoices where enrollment_tuition_id = 'd8800000-0000-4000-8000-000000000002'))$$, 'attach settled invoice');
select is((select status from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000006'), 'PAID', 'settled invoice is paid');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000041', 'd8600000-0000-4000-8000-000000000006', 4, null, null)$$, 'complete after settlement');
select is((select payment_confirmed_at is not null from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000006'), true, 'settlement records payment time');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000007', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Today', '2008-01-01', 'Phu Today', null, 'Piano', null, null, null)$$, 'today draft');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000051', 'd8600000-0000-4000-8000-000000000007', 1, 'SUBMIT')$$, 'today submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000052', 'd8600000-0000-4000-8000-000000000007', 2, 'VERIFY')$$, 'today verify');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000051', 'd8600000-0000-4000-8000-000000000007', 3, null, null)$$, 'today complete');
select lives_ok(format('select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 1, %L::uuid, %L::date)', 'd8630000-0000-4000-8000-000000000011', 'd8600000-0000-4000-8000-000000000007', 'd8300000-0000-4000-8000-000000000004', public.registration_vietnam_today()), 'start today');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'Regplace Today')), 0::bigint, 'today start leaves waiting');
select is((select count(*) from public.list_current_student_enrollments(null, 'Regplace Today')), 1::bigint, 'today start is current');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000008', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Song', '2012-04-04', 'Phu Song', null, 'Guitar', null, null, null)$$, 'second program draft');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000061', 'd8600000-0000-4000-8000-000000000008', 1, 'SUBMIT')$$, 'second program submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000062', 'd8600000-0000-4000-8000-000000000008', 2, 'VERIFY')$$, 'second program verify');
select throws_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000061', 'd8600000-0000-4000-8000-000000000008', 3, null, null)$$, 'P0001', 'REGISTRATION_REVIEW_REQUIRED', 'studying student still needs review');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000062', 'd8600000-0000-4000-8000-000000000008', 3, 'd8400000-0000-4000-8000-000000000004', null)$$, 'second program complete');
select is((select count(*) from public.students where full_name = 'Regplace Song'), 1::bigint, 'second program reuses the student');
select is((select count(*) from public.list_current_student_enrollments(null, 'Regplace Song')), 1::bigint, 'current program remains');
select is((select count(*) from public.list_waiting_placements(null, 'UNASSIGNED', 'Regplace Song')), 1::bigint, 'new program waits');
select throws_ok($$select public.assign_student_placement('d8630000-0000-4000-8000-000000000021', (select id from public.student_placement_cases where registration_application_id = 'd8600000-0000-4000-8000-000000000008'), 1, 'd8300000-0000-4000-8000-000000000007', public.registration_vietnam_today())$$, 'P0001', 'PLACEMENT_ALREADY_ENROLLED', 'duplicate class enrollment denied');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000009', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Cheo', '2007-02-02', 'Phu Cheo', null, 'Piano', null, null, null)$$, 'cross class draft');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000071', 'd8600000-0000-4000-8000-000000000009', 1, 'SUBMIT')$$, 'cross class submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000072', 'd8600000-0000-4000-8000-000000000009', 2, 'VERIFY')$$, 'cross class verify');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000071', 'd8600000-0000-4000-8000-000000000009', 3, null, null)$$, 'cross class complete');
select throws_ok($$select public.assign_student_placement('d8630000-0000-4000-8000-000000000031', (select id from public.student_placement_cases where registration_application_id = 'd8600000-0000-4000-8000-000000000009'), 1, 'd8300000-0000-4000-8000-000000000006', public.registration_vietnam_today())$$, 'P0001', 'PLACEMENT_CLASS_DENIED', 'other branch class denied');

select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000010', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Full', '2007-03-03', 'Phu Full', null, 'Piano', null, null, null)$$, 'full class draft');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000081', 'd8600000-0000-4000-8000-000000000010', 1, 'SUBMIT')$$, 'full class submit');
select lives_ok($$select public.transition_registration_application('d8610000-0000-4000-8000-000000000082', 'd8600000-0000-4000-8000-000000000010', 2, 'VERIFY')$$, 'full class verify');
select lives_ok($$select public.complete_registration_application('d8620000-0000-4000-8000-000000000081', 'd8600000-0000-4000-8000-000000000010', 3, null, null)$$, 'full class complete');
select throws_ok($$select public.assign_student_placement('d8630000-0000-4000-8000-000000000041', (select id from public.student_placement_cases where registration_application_id = 'd8600000-0000-4000-8000-000000000010'), 1, 'd8300000-0000-4000-8000-000000000005', public.registration_vietnam_today())$$, 'P0001', 'PLACEMENT_CLASS_FULL', 'full class denied');

select lives_ok($$select public.create_crm_lead('d8900000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000001', 'Phu Lead', '0901888888', null, 'Phu Lead', 'Be Lead', '2016-04-02', 'Guitar', 'Guitar', 'MANUAL', null)$$, 'crm lead');
select throws_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000020', 'd8100000-0000-4000-8000-000000000001', 'd8900000-0000-4000-8000-000000000001', null, null, null, null, null, null, null, null)$$, 'P0001', 'REGISTRATION_LEAD_DENIED', 'lead before won denied');
select lives_ok($$select public.transition_crm_lead('d8910000-0000-4000-8000-000000000001', 'd8900000-0000-4000-8000-000000000001', 1, 'CONTACTED', null, null)$$, 'lead contacted');
select lives_ok($$select public.transition_crm_lead('d8910000-0000-4000-8000-000000000002', 'd8900000-0000-4000-8000-000000000001', 2, 'QUALIFIED', null, null)$$, 'lead qualified');
select lives_ok($$select public.transition_crm_lead('d8910000-0000-4000-8000-000000000003', 'd8900000-0000-4000-8000-000000000001', 3, 'TRIAL_BOOKED', null, null)$$, 'lead trial booked');
select lives_ok($$select public.transition_crm_lead('d8910000-0000-4000-8000-000000000004', 'd8900000-0000-4000-8000-000000000001', 4, 'TRIAL_COMPLETED', null, null)$$, 'lead trial done');
select lives_ok($$select public.transition_crm_lead('d8910000-0000-4000-8000-000000000005', 'd8900000-0000-4000-8000-000000000001', 5, 'PROPOSAL_SENT', null, null)$$, 'lead proposal');
select lives_ok($$select public.transition_crm_lead('d8910000-0000-4000-8000-000000000006', 'd8900000-0000-4000-8000-000000000001', 6, 'NEGOTIATING', null, null)$$, 'lead negotiating');
select lives_ok($$select public.transition_crm_lead('d8910000-0000-4000-8000-000000000007', 'd8900000-0000-4000-8000-000000000001', 7, 'WON', null, null)$$, 'lead won');
select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000021', 'd8100000-0000-4000-8000-000000000001', 'd8900000-0000-4000-8000-000000000001', null, null, null, null, null, null, null, null)$$, 'registration from won lead');
select is((select student_name from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000021'), 'Be Lead', 'won lead prefills student');
select is((select parent_name from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000021'), 'Phu Lead', 'won lead prefills parent');
select is((select count(*) from public.students where full_name = 'Be Lead'), 0::bigint, 'won lead is not a student');

select set_config('registration.write', 'on', true);
update public.student_placement_cases
set opened_at = ((public.registration_vietnam_today() - 8)::timestamp at time zone 'Asia/Ho_Chi_Minh')
where registration_application_id = 'd8600000-0000-4000-8000-000000000009';
select set_config('registration.write', 'off', true);
select is(
  (select over_7 from public.waiting_placement_summary('d8100000-0000-4000-8000-000000000001')),
  (select count(*)::integer from public.student_placement_cases placement
    where placement.branch_id = 'd8100000-0000-4000-8000-000000000001'
      and public.registration_vietnam_today() - placement.opened_at::date > 7
      and (placement.status in ('UNASSIGNED', 'MATCHING') or (placement.status = 'SCHEDULED' and placement.scheduled_start_date > public.registration_vietnam_today()))),
  'waiting over 7 days uses opened date'
);
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'khong-co-regplace')), 0::bigint, 'search miss');
select is((select count(*) from public.list_waiting_placements('d8100000-0000-4000-8000-000000000001', 'UNASSIGNED', null)) > 0, true, 'unassigned filter returns rows');

select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000022', 'd8100000-0000-4000-8000-000000000002', null, 'Regplace BranchB', '2006-08-08', 'Phu BranchB', null, null, null, null, null)$$, 'other branch application');

select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000030', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Cheo Branch', '2006-01-01', 'Phu Cheo', null, null, null, null, null)$$, 'P0001', 'REGISTRATION_UNAUTHORIZED', 'cross branch registration denied');
select throws_ok($$select public.assign_student_placement('d8630000-0000-4000-8000-000000000051', (select id from public.student_placement_cases where registration_application_id = 'd8600000-0000-4000-8000-000000000009'), 1, 'd8300000-0000-4000-8000-000000000004', public.registration_vietnam_today())$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'cross branch placement denied');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'Regplace Cheo')), 0::bigint, 'other branch cannot see placement');

select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000002', true);
select lives_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000031', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Own', '2006-02-02', 'Phu Own', null, null, null, null, null)$$, 'own branch registration allowed');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'Regplace Moi')) > 0, true, 'own branch can see waiting');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000022'), 0::bigint, 'branch admin cannot read the other branch');
select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.registration_applications where id = 'd8600000-0000-4000-8000-000000000022'), 1::bigint, 'branch admin can read own branch');
reset role;

select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000004', true);
select throws_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000032', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace Teacher', '2006-03-03', 'Phu Teacher', null, null, null, null, null)$$, 'P0001', 'REGISTRATION_UNAUTHORIZED', 'teacher cannot register');
select set_config('request.jwt.claim.sub', 'd8200000-0000-4000-8000-000000000005', true);
select throws_ok($$select public.create_registration_application('d8600000-0000-4000-8000-000000000033', 'd8100000-0000-4000-8000-000000000001', null, 'Regplace None', '2006-04-04', 'Phu None', null, null, null, null, null)$$, 'P0001', 'REGISTRATION_UNAUTHORIZED', 'user without a role cannot register');

select set_config('registration.write', 'on', true);
select throws_ok(
  $$insert into public.student_placement_cases(id, student_id, registration_application_id, branch_id, status) values ('d8640000-0000-4000-8000-000000000099', 'd8400000-0000-4000-8000-000000000004', 'd8600000-0000-4000-8000-000000000008', 'd8100000-0000-4000-8000-000000000001', 'UNASSIGNED')$$,
  '23505', 'duplicate key value violates unique constraint "student_placement_cases_registration_application_id_key"', 'duplicate open placement prevented'
);
select set_config('registration.write', 'off', true);

set local role anon;
select throws_ok(
  $$select public.create_registration_application('d8600000-0000-4000-8000-000000000040', 'd8100000-0000-4000-8000-000000000001', null, 'Anon', '2006-05-05', 'Phu', null, null, null, null, null)$$,
  '42501', 'permission denied for function create_registration_application', 'anonymous denied'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.create_registration_application('d8600000-0000-4000-8000-000000000041', 'd8100000-0000-4000-8000-000000000001', null, 'No Session', '2006-06-06', 'Phu', null, null, null, null, null)$$,
  'P0001', 'REGISTRATION_UNAUTHORIZED', 'missing session denied'
);
select throws_ok(
  $$insert into public.registration_applications(id, application_code, branch_id, created_by) values ('d8600000-0000-4000-8000-000000000098', 'DK-AUTH', 'd8100000-0000-4000-8000-000000000001', 'd8200000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for table registration_applications', 'authenticated direct write denied'
);
reset role;

select is(to_regclass('public.waiting_students') is null, true, 'no waiting students table');

select * from finish();
rollback;
