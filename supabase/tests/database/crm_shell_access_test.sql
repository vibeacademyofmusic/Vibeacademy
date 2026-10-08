begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('c4120000-0000-4000-8000-000000000001', 'CRM-SH-A', 'CRM Shell A'),
  ('c4120000-0000-4000-8000-000000000002', 'CRM-SH-B', 'CRM Shell B');
insert into auth.users(id) values
  ('c4220000-0000-4000-8000-000000000001'),
  ('c4220000-0000-4000-8000-000000000002'),
  ('c4220000-0000-4000-8000-000000000003'),
  ('c4220000-0000-4000-8000-000000000004'),
  ('c4220000-0000-4000-8000-000000000005'),
  ('c4220000-0000-4000-8000-000000000006'),
  ('c4220000-0000-4000-8000-000000000007'),
  ('c4220000-0000-4000-8000-000000000008');
insert into public.profiles(id, full_name, status) values
  ('c4220000-0000-4000-8000-000000000001', 'Shell Super', 'ACTIVE'),
  ('c4220000-0000-4000-8000-000000000002', 'Shell Admin A', 'ACTIVE'),
  ('c4220000-0000-4000-8000-000000000003', 'Shell Admin B', 'ACTIVE'),
  ('c4220000-0000-4000-8000-000000000004', 'Shell Teacher', 'ACTIVE'),
  ('c4220000-0000-4000-8000-000000000005', 'Shell Disabled', 'INACTIVE'),
  ('c4220000-0000-4000-8000-000000000006', 'Shell No Role', 'ACTIVE'),
  ('c4220000-0000-4000-8000-000000000007', 'Shell Student', 'ACTIVE'),
  ('c4220000-0000-4000-8000-000000000008', 'Shell Parent', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c4220000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id)
select 'c4220000-0000-4000-8000-000000000005', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c4220000-0000-4000-8000-000000000002', id, 'c4120000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c4220000-0000-4000-8000-000000000003', id, 'c4120000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c4220000-0000-4000-8000-000000000004', id, 'c4120000-0000-4000-8000-000000000001' from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c4220000-0000-4000-8000-000000000007', id, 'c4120000-0000-4000-8000-000000000001' from public.roles where code = 'STUDENT';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c4220000-0000-4000-8000-000000000008', id, 'c4120000-0000-4000-8000-000000000001' from public.roles where code = 'PARENT';

select is(public.crm_shell_may_enter(), false, 'anonymous denied');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000001', true);
select is(public.crm_shell_may_enter(), true, 'super admin may enter');
select is(public.crm_can('crm.view', 'c4120000-0000-4000-8000-000000000001'), true, 'super admin views branch A');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000002', true);
select is(public.crm_shell_may_enter(), true, 'branch admin A may enter');
select is(public.crm_can('crm.view', 'c4120000-0000-4000-8000-000000000001'), true, 'branch admin A views own branch');
select is(public.crm_can('crm.view', 'c4120000-0000-4000-8000-000000000002'), false, 'branch admin A cannot view branch B');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000003', true);
select is(public.crm_can('crm.view', 'c4120000-0000-4000-8000-000000000001'), false, 'branch admin B cannot view branch A');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000006', true);
select is(public.crm_shell_may_enter(), false, 'authenticated account without a role denied');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000004', true);
select is(public.crm_shell_may_enter(), false, 'teacher without CRM permission denied');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000007', true);
select is(public.crm_shell_may_enter(), false, 'student denied');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000008', true);
select is(public.crm_shell_may_enter(), false, 'parent denied');

select set_config('request.jwt.claim.sub', 'c4220000-0000-4000-8000-000000000005', true);
select is(public.crm_shell_may_enter(), false, 'disabled user denied');

select * from finish();
rollback;
