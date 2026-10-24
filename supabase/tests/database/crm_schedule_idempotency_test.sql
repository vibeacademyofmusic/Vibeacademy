begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id,code,name) values ('c4100000-0000-4000-8000-000000000001','CRM-SCHEDULE-TEST','CRM Schedule Test');
insert into auth.users(id) values ('c4200000-0000-4000-8000-000000000001');
insert into public.profiles(id,full_name,status) values ('c4200000-0000-4000-8000-000000000001','CRM Schedule Tester','ACTIVE');
insert into public.user_roles(user_id,role_id)
select 'c4200000-0000-4000-8000-000000000001',id from public.roles where code='SUPER_ADMIN';
select set_config('request.jwt.claim.sub','c4200000-0000-4000-8000-000000000001',true);

select ok(public.crm_validate_slots('[{"weekday":1,"start":"18:00","end":"19:30"},{"weekday":2,"start":"18:00","end":"19:30"}]'), 'independent weekdays accepted');
select ok(not public.crm_validate_slots('[{"weekday":1,"start":"18:00","end":"19:30"},{"weekday":1,"start":"19:00","end":"20:00"}]'), 'overlap rejected');
select ok(not public.crm_validate_slots('[{"weekday":1,"start":"18:00","end":"19:30"},{"weekday":1,"start":"18:00","end":"19:30"}]'), 'identical slots rejected');
select ok(not public.crm_validate_slots('[{"weekday":1,"start":"19:30","end":"18:00"}]'), 'reverse time rejected');
select ok(not public.crm_validate_slots('[{"start":"18:00","end":"19:30"}]'), 'missing weekday rejected');
select ok(not public.crm_validate_slots('[{"weekday":1,"end":"19:30"}]'), 'missing start rejected');
select ok(not public.crm_validate_slots('{"weekday":1}'), 'non-array schedule rejected');

select is(public.create_crm_lead_with_schedule(
  'c4300000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001',
  'TEST_CRM_PARENT','0000000000','', 'TEST_CRM_PARENT','TEST_CRM_A',null,
  'Piano','MANUAL','REFERENCE','2026-11-02',
  '[{"weekday":1,"start":"18:00","end":"19:30"},{"weekday":2,"start":"18:00","end":"19:30"}]',
  2,null), 'c4300000-0000-4000-8000-000000000001'::uuid, 'created lead ID equals request ID');
select is(public.create_crm_lead_with_schedule(
  'c4300000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001',
  'TEST_CRM_PARENT','0000000000','', 'TEST_CRM_PARENT','TEST_CRM_A',null,
  'Piano','MANUAL','REFERENCE','2026-11-02',
  '[{"weekday":1,"start":"18:00","end":"19:30"},{"weekday":2,"start":"18:00","end":"19:30"}]',
  2,null), 'c4300000-0000-4000-8000-000000000001'::uuid, 'replay returns same lead');
select throws_ok($$select public.create_crm_lead_with_schedule(
  'c4300000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001',
  'TEST_CRM_PARENT','0000000000','', 'TEST_CRM_PARENT','TEST_CRM_DIFFERENT',null,
  'Piano','MANUAL','REFERENCE','2026-11-02',
  '[{"weekday":1,"start":"18:00","end":"19:30"},{"weekday":2,"start":"18:00","end":"19:30"}]',
  2,null)$$, 'P0001','CRM_LEAD_REQUEST_MISMATCH','changed payload rejected');
select is((select count(*) from public.crm_leads where id='c4300000-0000-4000-8000-000000000001'),1::bigint,'one lead');
select is((select count(*) from public.crm_lead_events where lead_id='c4300000-0000-4000-8000-000000000001'),1::bigint,'one creation event');
select is((select desired_start_date from public.crm_leads where id='c4300000-0000-4000-8000-000000000001'),'2026-11-02'::date,'desired date stored');
select is((select jsonb_array_length(preferred_slots) from public.crm_leads where id='c4300000-0000-4000-8000-000000000001'),2,'two schedule slots stored on one lead');

select set_config('registration.write','on',true);
insert into public.registration_applications(id,application_code,crm_lead_id,branch_id,student_name,parent_name,created_by)
values ('c4400000-0000-4000-8000-000000000001','DK-CRM-SCHEDULE','c4300000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','TEST_CRM_A','TEST_CRM_PARENT','c4200000-0000-4000-8000-000000000001');
select is((select desired_start_date from public.registration_applications where id='c4400000-0000-4000-8000-000000000001'),'2026-11-02'::date,'registration inherits desired date');
select is((select preferred_slots from public.registration_applications where id='c4400000-0000-4000-8000-000000000001'),(select preferred_slots from public.crm_leads where id='c4300000-0000-4000-8000-000000000001'),'registration inherits both slots');
select is((select preferred_sessions_per_week from public.registration_applications where id='c4400000-0000-4000-8000-000000000001'),2,'registration inherits sessions per week');
select is((select preferred_schedule from public.registration_applications where id='c4400000-0000-4000-8000-000000000001'),public.crm_slots_summary((select preferred_slots from public.crm_leads where id='c4300000-0000-4000-8000-000000000001'),null),'legacy registration schedule is readable');

insert into public.students(id,student_code,full_name,default_branch_id,status)
values ('c4500000-0000-4000-8000-000000000001','CRM-SCHEDULE-TEST','TEST_CRM_A','c4100000-0000-4000-8000-000000000001','ACTIVE');
insert into public.student_placement_cases(id,student_id,registration_application_id,branch_id,status)
values ('c4600000-0000-4000-8000-000000000001','c4500000-0000-4000-8000-000000000001','c4400000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','UNASSIGNED');
select is((select desired_start_date from public.student_placement_cases where id='c4600000-0000-4000-8000-000000000001'),'2026-11-02'::date,'placement queue inherits desired date');
select is((select preferred_slots from public.student_placement_cases where id='c4600000-0000-4000-8000-000000000001'),(select preferred_slots from public.crm_leads where id='c4300000-0000-4000-8000-000000000001'),'placement queue inherits both slots');
select is((select preferred_sessions_per_week from public.student_placement_cases where id='c4600000-0000-4000-8000-000000000001'),2,'placement queue inherits sessions per week');
select set_config('registration.write','off',true);

select is(public.create_crm_lead_with_schedule(
  'c4300000-0000-4000-8000-000000000002','c4100000-0000-4000-8000-000000000001',
  'TEST_CRM_PARENT','0000000000','', 'TEST_CRM_PARENT','TEST_CRM_B',null,
  'Piano','MANUAL','INTERESTED',null,'[]',null,null),
  'c4300000-0000-4000-8000-000000000002'::uuid,'another student may share the parent phone');
select is(public.create_crm_lead_with_schedule(
  'c4300000-0000-4000-8000-000000000002','c4100000-0000-4000-8000-000000000001',
  'TEST_CRM_PARENT','0000000000','', 'TEST_CRM_PARENT','TEST_CRM_B',null,
  'Piano','MANUAL','INTERESTED',null,'[]',null,null),
  'c4300000-0000-4000-8000-000000000002'::uuid,'interested lead replay');
select is((select count(*) from public.crm_lead_events where lead_id='c4300000-0000-4000-8000-000000000002'),2::bigint,'interest audit event is written once');
select is((select version from public.crm_leads where id='c4300000-0000-4000-8000-000000000002'),2,'interest version is preserved');
select is((select count(*) from public.crm_leads where phone_key='0000000000' and branch_id='c4100000-0000-4000-8000-000000000001'),2::bigint,'phone is not a uniqueness key');

select * from finish();
rollback;
