begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('e7100000-0000-4000-8000-000000000001', 'OPS-A', 'Ops A'),
  ('e7100000-0000-4000-8000-000000000002', 'OPS-B', 'Ops B');
insert into auth.users(id) values
  ('e7200000-0000-4000-8000-000000000001'),
  ('e7200000-0000-4000-8000-000000000002'),
  ('e7200000-0000-4000-8000-000000000003'),
  ('e7200000-0000-4000-8000-000000000004'),
  ('e7200000-0000-4000-8000-000000000005'),
  ('e7200000-0000-4000-8000-000000000006');
insert into public.profiles(id, full_name, status) values
  ('e7200000-0000-4000-8000-000000000001', 'Ops Super', 'ACTIVE'),
  ('e7200000-0000-4000-8000-000000000002', 'Ops Admin A', 'ACTIVE'),
  ('e7200000-0000-4000-8000-000000000003', 'Ops Admin B', 'ACTIVE'),
  ('e7200000-0000-4000-8000-000000000004', 'Ops Teacher', 'ACTIVE'),
  ('e7200000-0000-4000-8000-000000000005', 'Ops Disabled', 'INACTIVE'),
  ('e7200000-0000-4000-8000-000000000006', 'Ops None', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'e7200000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'e7200000-0000-4000-8000-000000000002', id, 'e7100000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'e7200000-0000-4000-8000-000000000003', id, 'e7100000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'e7200000-0000-4000-8000-000000000004', id, 'e7100000-0000-4000-8000-000000000001' from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'e7200000-0000-4000-8000-000000000005', id, 'e7100000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';

insert into public.curriculums(id, code, name) values ('e7300000-0000-4000-8000-000000000001', 'OPS-CUR', 'Ops Curriculum');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('e7300000-0000-4000-8000-000000000002', 'e7300000-0000-4000-8000-000000000001', 'OPS-L', 'So cap', 1);
insert into public.courses(id, curriculum_id, level_id, code, name) values
  ('e7300000-0000-4000-8000-000000000003', 'e7300000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000002', 'OPS-PIANO', 'Piano'),
  ('e7300000-0000-4000-8000-000000000013', 'e7300000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000002', 'OPS-GUITAR', 'Guitar');
insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
  ('e7300000-0000-4000-8000-000000000004', 'e7100000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000003', 'OPS-PIANO-A', 'Lop Piano A', 'GROUP', 8, 'ACTIVE'),
  ('e7300000-0000-4000-8000-000000000005', 'e7100000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000013', 'OPS-GUITAR-A', 'Lop Guitar A', 'GROUP', 8, 'ACTIVE'),
  ('e7300000-0000-4000-8000-000000000006', 'e7100000-0000-4000-8000-000000000002', 'e7300000-0000-4000-8000-000000000003', 'OPS-PIANO-B', 'Lop Piano B', 'GROUP', 8, 'ACTIVE');

select is(public.student_ops_may_enter(), false, 'anonymous denied');

select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000001', true);
select is(public.student_ops_may_enter(), true, 'super admin may enter');
select lives_ok($$select public.create_registration_application('e7600000-0000-4000-8000-a10000000001', 'e7100000-0000-4000-8000-000000000001', null, 'Shell Future', '2015-01-01', 'Phu Future', null, 'Piano', null, public.registration_vietnam_today() + 30, 'Thu 2 18:00')$$, 'future registration');
select lives_ok($$select public.transition_registration_application('e7610000-0000-4000-8000-000000000001', 'e7600000-0000-4000-8000-a10000000001', 1, 'SUBMIT')$$, 'future submit');
select lives_ok($$select public.transition_registration_application('e7610000-0000-4000-8000-000000000002', 'e7600000-0000-4000-8000-a10000000001', 2, 'VERIFY')$$, 'future verify');
select lives_ok($$select public.complete_registration_application('e7620000-0000-4000-8000-000000000001', 'e7600000-0000-4000-8000-a10000000001', 3, null, null)$$, 'future complete');
select lives_ok($$select public.create_registration_application('e7600000-0000-4000-8000-a10000000002', 'e7100000-0000-4000-8000-000000000001', null, 'Shell Today', '2014-02-02', 'Phu Today', null, 'Piano', null, public.registration_vietnam_today(), 'Thu 4 18:00')$$, 'today registration');
select lives_ok($$select public.transition_registration_application('e7610000-0000-4000-8000-000000000003', 'e7600000-0000-4000-8000-a10000000002', 1, 'SUBMIT')$$, 'today submit');
select lives_ok($$select public.transition_registration_application('e7610000-0000-4000-8000-000000000004', 'e7600000-0000-4000-8000-a10000000002', 2, 'VERIFY')$$, 'today verify');
select lives_ok($$select public.complete_registration_application('e7620000-0000-4000-8000-000000000002', 'e7600000-0000-4000-8000-a10000000002', 3, null, null)$$, 'today complete');
select lives_ok($$select public.create_registration_application('e7600000-0000-4000-8000-a10000000003', 'e7100000-0000-4000-8000-000000000002', null, 'Shell Other', '2013-03-03', 'Phu Other', null, 'Piano', null, null, null)$$, 'other branch registration');
select lives_ok($$select public.transition_registration_application('e7610000-0000-4000-8000-000000000005', 'e7600000-0000-4000-8000-a10000000003', 1, 'SUBMIT')$$, 'other submit');
select lives_ok($$select public.transition_registration_application('e7610000-0000-4000-8000-000000000006', 'e7600000-0000-4000-8000-a10000000003', 2, 'VERIFY')$$, 'other verify');
select lives_ok($$select public.complete_registration_application('e7620000-0000-4000-8000-000000000003', 'e7600000-0000-4000-8000-a10000000003', 3, null, null)$$, 'other complete');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'Shell')), 3::bigint, 'super admin sees every waiting placement');
select is((select count(*) from public.list_current_student_enrollments(null, 'Shell')), 0::bigint, 'completed registration is not current before class assignment');

select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000002', true);
select is(public.student_ops_may_enter(), true, 'branch admin A may enter');
select is(public.registration_can('student_placement.view', 'e7100000-0000-4000-8000-000000000001'), true, 'branch admin A can view own branch');
select is(public.registration_can('student_placement.view', 'e7100000-0000-4000-8000-000000000002'), false, 'branch admin A cannot view branch B');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'Shell')), 2::bigint, 'branch admin A sees only own waiting students');
select is((select count(*) from public.list_waiting_placements('e7100000-0000-4000-8000-000000000002', 'ALL', null)), 0::bigint, 'forged branch filter returns nothing');
select throws_ok($$select public.assign_student_placement('e7630000-0000-4000-8000-000000000099', 'e7640000-0000-4000-8000-000000000099', 1, 'e7300000-0000-4000-8000-000000000004', current_date)$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'forged placement denied without confirming it exists');
select throws_ok($$select public.assign_student_placement('e7630000-0000-4000-8000-000000000031', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 1, 'e7300000-0000-4000-8000-000000000006', public.registration_vietnam_today())$$, 'P0001', 'PLACEMENT_CLASS_DENIED', 'forged other-branch class denied');
select lives_ok($$select public.set_student_placement_matching('e7630000-0000-4000-8000-000000000001', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 1)$$, 'matching');
select lives_ok(format('select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 2, %L::uuid, %L::date)', 'e7630000-0000-4000-8000-000000000002', 'e7600000-0000-4000-8000-a10000000001', 'e7300000-0000-4000-8000-000000000004', public.registration_vietnam_today() + 30), 'future assign');
select is((select placement_status from public.list_waiting_placements(null, 'SCHEDULED_FUTURE', 'Shell Future')), 'SCHEDULED_FUTURE', 'future assignment stays waiting');
select is((select count(*) from public.list_current_student_enrollments(null, 'Shell Future')), 0::bigint, 'future start is not current');
select lives_ok(format('select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 1, %L::uuid, %L::date)', 'e7630000-0000-4000-8000-000000000003', 'e7600000-0000-4000-8000-a10000000002', 'e7300000-0000-4000-8000-000000000004', public.registration_vietnam_today()), 'today assign');
select is((select count(*) from public.list_current_student_enrollments(null, 'Shell Today')), 1::bigint, 'today start is current');
select throws_ok($$select public.assign_student_placement('e7630000-0000-4000-8000-000000000004', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000003'), 1, 'e7300000-0000-4000-8000-000000000006', public.registration_vietnam_today())$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'cross-branch placement denied');

select set_config('registration.write', 'on', true);
update public.registration_applications set course_id = 'e7300000-0000-4000-8000-000000000013' where id = 'e7600000-0000-4000-8000-a10000000003';
select set_config('registration.write', 'off', true);
select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000003', true);
select throws_ok($$select public.assign_student_placement('e7630000-0000-4000-8000-000000000005', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000003'), 1, 'e7300000-0000-4000-8000-000000000006', public.registration_vietnam_today())$$, 'P0001', 'PLACEMENT_PROGRAM_DENIED', 'different program class denied');

select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000002', true);
select is(public.registration_vietnam_today(), (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'placement boundary uses the Vietnam business date');
select is((select waiting_count from public.waiting_placement_summary(null)), 1, 'branch A KPI excludes branch B');
select is((select waiting_count from public.waiting_placement_summary('e7100000-0000-4000-8000-000000000002')), 0, 'forged branch KPI is empty');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'Shell Other')), 0::bigint, 'search does not expose branch B');
select is((select count(*) from public.list_current_student_enrollments(null, 'Shell Other')), 0::bigint, 'current search does not expose branch B');
select is((select student_name from public.list_waiting_placements(null, 'ALL', null, 1, 0)), 'Shell Future', 'first page stays inside branch A');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', null, 1, 1)), 0::bigint, 'next page does not reveal another branch');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', null)), 1::bigint, 'authorized waiting count excludes branch B');

insert into public.classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
  ('e7300000-0000-4000-8000-000000000007', 'e7100000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000003', 'OPS-PIANO-A2', 'Lop Piano A2', 'GROUP', 8, 'ACTIVE'),
  ('e7300000-0000-4000-8000-000000000008', 'e7100000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000003', 'OPS-FULL-A', 'Lop Full A', 'GROUP', 2, 'ACTIVE');
insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('e7400000-0000-4000-8000-000000000001', 'OPS-FILL-1', 'Ops Fill 1', 'e7100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('e7400000-0000-4000-8000-000000000002', 'OPS-FILL-2', 'Ops Fill 2', 'e7100000-0000-4000-8000-000000000001', 'ACTIVE');
insert into public.enrollments(id, student_id, class_id, enrolled_at, started_at, status) values
  ('e7500000-0000-4000-8000-000000000001', 'e7400000-0000-4000-8000-000000000001', 'e7300000-0000-4000-8000-000000000008', public.registration_vietnam_today(), public.registration_vietnam_today(), 'ACTIVE'),
  ('e7500000-0000-4000-8000-000000000002', 'e7400000-0000-4000-8000-000000000002', 'e7300000-0000-4000-8000-000000000008', public.registration_vietnam_today(), public.registration_vietnam_today(), 'ACTIVE');
select is((select count(*) from public.list_placement_class_options('e7100000-0000-4000-8000-000000000001') where id = 'e7300000-0000-4000-8000-000000000008'), 0::bigint, 'full class is not offered');
select is((select count(*) from public.list_placement_class_options('e7100000-0000-4000-8000-000000000002')), 0::bigint, 'class options hide the other branch');

select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000001', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 3, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000008', public.registration_vietnam_today() + 40, 'Lop day')$$, 'P0001', 'PLACEMENT_CLASS_FULL', 'full class rejected');
select is((select assigned_class_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000004'::uuid, 'rejected change leaves the original class');
select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000002', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 3, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000099', public.registration_vietnam_today() + 40, 'Lop khong ton tai')$$, 'P0001', 'PLACEMENT_CLASS_DENIED', 'forged class denied');
select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000003', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 3, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000006', public.registration_vietnam_today() + 40, 'Lop chi nhanh khac')$$, 'P0001', 'PLACEMENT_CLASS_DENIED', 'other-branch class denied with the same result');
select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000004', 'e7640000-0000-4000-8000-000000000099', 3, 'e7650000-0000-4000-8000-000000000099', 'e7300000-0000-4000-8000-000000000007', public.registration_vietnam_today() + 40, 'Ho so gia')$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'forged placement change denied');
select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000005', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000003'), 1, 'e7650000-0000-4000-8000-000000000099', 'e7300000-0000-4000-8000-000000000006', public.registration_vietnam_today() + 40, 'Chi nhanh khac')$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'other-branch change denied without a distinct error');

select set_config('registration.write', 'on', true);
update public.registration_applications set course_id = 'e7300000-0000-4000-8000-000000000003' where id = 'e7600000-0000-4000-8000-a10000000001';
select set_config('registration.write', 'off', true);
select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000006', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 3, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000005', public.registration_vietnam_today() + 40, 'Sai chuong trinh')$$, 'P0001', 'PLACEMENT_PROGRAM_DENIED', 'incompatible course rejected');
select is((select assigned_class_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000004'::uuid, 'rejected program change leaves the original class');

select lives_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000007', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 3, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000007', public.registration_vietnam_today() + 40, 'Doi sang lop piano A2')$$, 'future placement changes class');
select is((select class_name from public.list_waiting_placements(null, 'SCHEDULED_FUTURE', 'Shell Future')), 'Lop Piano A2', 'changed placement stays waiting on the new class');
select is((select count(*) from public.list_current_student_enrollments(null, 'Shell Future')), 0::bigint, 'changed future placement is not current');
select is((select metadata->>'reason' from public.student_placement_events where id = 'e7660000-0000-4000-8000-000000000007'), 'Doi sang lop piano A2', 'change records the reason');
select is((select actor_id from public.student_placement_events where id = 'e7660000-0000-4000-8000-000000000007'), 'e7200000-0000-4000-8000-000000000002'::uuid, 'change records the actor');
select is((select metadata->>'old_class_id' from public.student_placement_events where id = 'e7660000-0000-4000-8000-000000000007'), 'e7300000-0000-4000-8000-000000000004', 'change records the old class');
select is((select metadata->>'new_class_id' from public.student_placement_events where id = 'e7660000-0000-4000-8000-000000000007'), 'e7300000-0000-4000-8000-000000000007', 'change records the new class');
select is((select count(*) from public.enrollments where student_id = (select student_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001') and status = 'ACTIVE'), 1::bigint, 'change keeps a single enrollment');

select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000008', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000002'), 2, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000002'), 'e7300000-0000-4000-8000-000000000007', public.registration_vietnam_today() + 10, 'Da bat dau')$$, 'P0001', 'PLACEMENT_ALREADY_STARTED', 'started placement cannot change class');
select is((select class_id from public.enrollments where id = (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000002')), 'e7300000-0000-4000-8000-000000000004'::uuid, 'started enrollment stays on the original class');
select throws_ok($$select public.cancel_future_student_placement('e7660000-0000-4000-8000-000000000009', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000002'), 2, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000002'), 'Huy sau khi bat dau')$$, 'P0001', 'PLACEMENT_ALREADY_STARTED', 'started placement cannot be cancelled');

select lives_ok($$select public.cancel_future_student_placement('e7660000-0000-4000-8000-000000000010', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 4, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'Phu huynh doi lich')$$, 'future placement cancels');
select is((select placement_status from public.list_waiting_placements(null, 'UNASSIGNED', 'Shell Future')), 'UNASSIGNED', 'cancelled placement returns to waiting');
select is((select count(*) from public.list_current_student_enrollments(null, 'Shell Future')), 0::bigint, 'cancelled placement is not current');
select is((select status from public.registration_applications where id = 'e7600000-0000-4000-8000-a10000000001'), 'COMPLETED', 'cancellation keeps the registration');
select is((select status from public.students where id = (select student_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001')), 'ACTIVE', 'cancellation keeps the student');
select is((select status from public.enrollments where id = (select metadata->>'enrollment_id' from public.student_placement_events where id = 'e7660000-0000-4000-8000-000000000010')::uuid), 'WITHDRAWN', 'cancelled enrollment is withdrawn, not deleted');
select is((select metadata->>'reason' from public.student_placement_events where id = 'e7660000-0000-4000-8000-000000000010'), 'Phu huynh doi lich', 'cancel records the reason');
select lives_ok(format('select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 5, %L::uuid, %L::date)', 'e7660000-0000-4000-8000-000000000011', 'e7600000-0000-4000-8000-a10000000001', 'e7300000-0000-4000-8000-000000000007', public.registration_vietnam_today() + 20), 'same class can be assigned again after withdrawal');
select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000012', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 6, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000004', public.registration_vietnam_today() + 25, ' ')$$, 'P0001', 'PLACEMENT_REASON_REQUIRED', 'blank reason is rejected');

delete from public.role_permissions
where role_id = (select id from public.roles where code = 'BRANCH_ADMIN')
  and permission_id = (select id from public.permissions where code = 'student_placement.manage');
select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000002', true);
select is(public.student_ops_may_enter(), true, 'view without manage still enters');
select is((select count(*) from public.list_waiting_placements(null, 'ALL', 'Shell Future')) > 0, true, 'view without manage can list');
select throws_ok($$select public.set_student_placement_matching('e7630000-0000-4000-8000-000000000006', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000003'), 1)$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'view without manage cannot mutate');
select throws_ok($$select public.change_future_student_placement('e7660000-0000-4000-8000-000000000013', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 6, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'e7300000-0000-4000-8000-000000000004', public.registration_vietnam_today() + 25, 'Khong co quyen doi')$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'view without manage cannot change class');
select throws_ok($$select public.cancel_future_student_placement('e7660000-0000-4000-8000-000000000014', (select id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 6, (select enrollment_id from public.student_placement_cases where registration_application_id = 'e7600000-0000-4000-8000-a10000000001'), 'Khong co quyen huy')$$, 'P0001', 'PLACEMENT_UNAUTHORIZED', 'view without manage cannot cancel');

select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000004', true);
select is(public.student_ops_may_enter(), false, 'teacher without placement permission denied');
select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000006', true);
select is(public.student_ops_may_enter(), false, 'account without a role denied');
select set_config('request.jwt.claim.sub', 'e7200000-0000-4000-8000-000000000005', true);
select is(public.student_ops_may_enter(), false, 'disabled account denied');

set local role anon;
select throws_ok($$select public.student_ops_may_enter()$$, '42501', 'permission denied for function student_ops_may_enter', 'anonymous function denied');
reset role;

select * from finish();
rollback;
