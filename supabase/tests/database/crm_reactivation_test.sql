begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('c6100000-0000-4000-8000-000000000001', 'CRM-REACT-A', 'CRM Reactivation A'),
  ('c6100000-0000-4000-8000-000000000002', 'CRM-REACT-B', 'CRM Reactivation B');
insert into auth.users(id) values
  ('c6200000-0000-4000-8000-000000000001'),
  ('c6200000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
  ('c6200000-0000-4000-8000-000000000001', 'Reactivation Super', 'ACTIVE'),
  ('c6200000-0000-4000-8000-000000000002', 'Reactivation Admin B', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c6200000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c6200000-0000-4000-8000-000000000002', id, 'c6100000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';

insert into public.curriculums(id, code, name) values ('c6300000-0000-4000-8000-000000000001', 'CRM-REACT-CUR', 'CRM Reactivation Curriculum');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('c6300000-0000-4000-8000-000000000002', 'c6300000-0000-4000-8000-000000000001', 'CRM-REACT-L', 'Level', 1);
insert into public.courses(id, curriculum_id, level_id, code, name) values
  ('c6300000-0000-4000-8000-000000000003', 'c6300000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000002', 'CRM-REACT-COURSE', 'Piano Return');
insert into public.classes(id, branch_id, course_id, code, name, status) values
  ('c6300000-0000-4000-8000-000000000004', 'c6100000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000003', 'CRM-REACT-CLASS', 'Return class', 'ACTIVE'),
  ('c6300000-0000-4000-8000-000000000005', 'c6100000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000003', 'CRM-REACT-CLASS-2', 'Return class 2', 'ACTIVE'),
  ('c6300000-0000-4000-8000-000000000006', 'c6100000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000003', 'CRM-REACT-CLASS-3', 'Future class', 'ACTIVE'),
  ('c6300000-0000-4000-8000-000000000007', 'c6100000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000003', 'CRM-REACT-CLASS-4', 'Active class', 'ACTIVE');

insert into public.students(id, student_code, full_name, default_branch_id, status) values
  ('c6400000-0000-4000-8000-000000000001', 'CRM-REACT-PAUSE', 'Pause Student', 'c6100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('c6400000-0000-4000-8000-000000000002', 'CRM-REACT-FUTURE', 'Future Pause', 'c6100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('c6400000-0000-4000-8000-000000000003', 'CRM-REACT-STILL', 'Still Active', 'c6100000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('c6400000-0000-4000-8000-000000000004', 'CRM-REACT-INACTIVE', 'Inactive Student', 'c6100000-0000-4000-8000-000000000001', 'INACTIVE');

insert into public.enrollments(id, student_id, class_id, status, started_at) values
  ('c6500000-0000-4000-8000-000000000001', 'c6400000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000004', 'ACTIVE', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30),
  ('c6500000-0000-4000-8000-000000000002', 'c6400000-0000-4000-8000-000000000002', 'c6300000-0000-4000-8000-000000000006', 'ACTIVE', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30),
  ('c6500000-0000-4000-8000-000000000003', 'c6400000-0000-4000-8000-000000000003', 'c6300000-0000-4000-8000-000000000007', 'ACTIVE', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 30);

insert into public.enrollment_pauses(enrollment_id, starts_on, ends_on, reason) values
  ('c6500000-0000-4000-8000-000000000001', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 20, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1, 'Ended pause'),
  ('c6500000-0000-4000-8000-000000000002', (now() at time zone 'Asia/Ho_Chi_Minh')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date + 10, 'Future pause'),
  ('c6500000-0000-4000-8000-000000000003', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 20, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1, 'Ended but class still active');

update public.enrollments
set status = 'WITHDRAWN', ended_at = (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1
where id in ('c6500000-0000-4000-8000-000000000001', 'c6500000-0000-4000-8000-000000000002');

select set_config('request.jwt.claim.sub', 'c6200000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.refresh_crm_reactivation('c6100000-0000-4000-8000-000000000001')$$, 'refresh branch A');
select is((select count(*) from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000001'), 1::bigint, 'ended pause opens one case');
select is((select source_reason from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000001'), 'PAUSE_ENDED_NOT_RETURNED', 'pause reason');
select is((select count(*) from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000002'), 0::bigint, 'future pause opens nothing');
select is((select count(*) from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000003'), 0::bigint, 'active enrollment after pause end opens nothing');
select is((select count(*) from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000004'), 1::bigint, 'inactive student opens one case');
select lives_ok($$select public.refresh_crm_reactivation('c6100000-0000-4000-8000-000000000001')$$, 'refresh again');
select is((select count(*) from public.crm_reactivation_cases where branch_id = 'c6100000-0000-4000-8000-000000000001'), 2::bigint, 'rerun does not duplicate');

select throws_ok(
  $$select public.transition_crm_reactivation('c6600000-0000-4000-8000-000000000001', id, version, 'RETURNED', null) from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000004'$$,
  'P0001', 'CRM_REACTIVATION_TRANSITION_DENIED', 'return is not the next step from new'
);
select lives_ok(
  $$select public.transition_crm_reactivation('c6600000-0000-4000-8000-000000000002', id, version, 'LOST', 'Khong quay lai') from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000004'$$,
  'lost terminal'
);
select throws_ok(
  $$select public.transition_crm_reactivation('c6600000-0000-4000-8000-000000000003', id, version, 'CONTACTED', null) from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000004'$$,
  'P0001', 'CRM_REACTIVATION_TERMINAL', 'lost stays terminal'
);

insert into public.enrollments(id, student_id, class_id, status) values
  ('c6500000-0000-4000-8000-000000000004', 'c6400000-0000-4000-8000-000000000001', 'c6300000-0000-4000-8000-000000000005', 'ACTIVE');
select lives_ok($$select public.refresh_crm_reactivation('c6100000-0000-4000-8000-000000000001')$$, 'refresh after return');
select is((select status from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000001'), 'RETURNED', 'active enrollment closes the case as returned');
select is((select count(*) from public.crm_reactivation_events where case_id = (select id from public.crm_reactivation_cases where student_id = 'c6400000-0000-4000-8000-000000000001') and event_type = 'RETURNED'), 1::bigint, 'one returned event');

select is((select value from public.crm_reactivation_report((now() at time zone 'Asia/Ho_Chi_Minh')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'c6100000-0000-4000-8000-000000000001', null, null) where metric = 'opened'), 2::numeric, 'opened cohort');
select is((select value from public.crm_reactivation_report((now() at time zone 'Asia/Ho_Chi_Minh')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'c6100000-0000-4000-8000-000000000001', null, null) where metric = 'returned'), 1::numeric, 'returned cohort');

select set_config('request.jwt.claim.sub', 'c6200000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.refresh_crm_reactivation('c6100000-0000-4000-8000-000000000001')$$, 'P0001', 'CRM_REACTIVATION_UNAUTHORIZED', 'other branch cannot refresh');
set local role authenticated;
select is((select count(*) from public.crm_reactivation_cases), 0::bigint, 'other branch cannot read cases');
select throws_ok($$insert into public.crm_reactivation_cases(student_id, branch_id, source_reason) values ('c6400000-0000-4000-8000-000000000004', 'c6100000-0000-4000-8000-000000000001', 'INACTIVE_STUDENT')$$, '42501', 'permission denied for table crm_reactivation_cases', 'direct insert denied');
reset role;
select throws_ok($$update public.crm_reactivation_events set note = 'changed'$$, 'P0001', 'CRM_REACTIVATION_EVENT_IMMUTABLE', 'event history cannot be edited');

select * from finish();
rollback;
