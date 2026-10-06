begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email) values
  ('0e210000-0000-4000-8000-000000000001', 'owner-ops-lead-test@example.com'),
  ('0e210000-0000-4000-8000-000000000002', 'lead-ops-lead-test@example.com'),
  ('0e210000-0000-4000-8000-000000000003', 'other-ops-lead-test@example.com');
insert into public.profiles(id)
select id from auth.users where id in (
  '0e210000-0000-4000-8000-000000000001',
  '0e210000-0000-4000-8000-000000000002',
  '0e210000-0000-4000-8000-000000000003'
);
insert into public.branches(id, code, name) values
  ('0e220000-0000-4000-8000-000000000001', 'OL-A', 'Operations lead A');
insert into public.user_roles(user_id, role_id)
select '0e210000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id)
select '0e210000-0000-4000-8000-000000000002', id from public.roles where code = 'OPERATIONS_LEAD';
insert into public.user_roles(user_id, role_id, branch_id)
select '0e210000-0000-4000-8000-000000000003', id, '0e220000-0000-4000-8000-000000000001'
from public.roles where code = 'BRANCH_ADMIN';

select is(
  (select count(*) from public.role_permissions grant_row
    join public.roles role on role.id = grant_row.role_id
    join public.permissions permission on permission.id = grant_row.permission_id
    where role.code = 'OPERATIONS_LEAD' and permission.code = 'finance.report.view'),
  0::bigint,
  'operations lead is not granted the financial report permission'
);
select ok(
  exists (
    select 1 from public.role_permissions grant_row
    join public.roles role on role.id = grant_row.role_id
    join public.permissions permission on permission.id = grant_row.permission_id
    where role.code = 'FINANCE' and permission.code = 'finance.report.view'
  ),
  'finance keeps explicit financial report permission'
);
select ok(
  exists (
    select 1 from public.role_permissions grant_row
    join public.roles role on role.id = grant_row.role_id
    join public.permissions permission on permission.id = grant_row.permission_id
    where role.code = 'OPERATIONS_LEAD' and permission.code = 'finance.payment.record'
  ),
  'operations lead keeps operational payment permission'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '0e210000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"0e210000-0000-4000-8000-000000000002"}', true);
select is(public.has_role('SUPER_ADMIN'), false, 'operations lead is not super admin');
select is(public.is_operations_lead(), true, 'operations lead identity');
select is(public.operational_admin(), true, 'operations lead can operate');
select is(public.is_global_super_admin(), false, 'operations lead is not the unrestricted owner');
select is(public.can_view_financial_reports(null), false, 'no consolidated financial report');
select is(public.can_view_financial_reports('0e220000-0000-4000-8000-000000000001'), false, 'no branch financial report');
select is(public.has_permission('finance.report.view', '0e220000-0000-4000-8000-000000000001'), false, 'report permission stays denied');
select throws_ok(
  $$select public.get_financial_management_report('2026-10-01', null, 'VND')$$,
  'P0001',
  'FINANCIAL_REPORT_UNAUTHORIZED',
  'management report RPC denies operations lead'
);
select throws_ok(
  $$select public.get_financial_management_report('2026-10-01', '0e220000-0000-4000-8000-000000000001', 'VND')$$,
  'P0001',
  'FINANCIAL_REPORT_UNAUTHORIZED',
  'branch management report RPC denies operations lead'
);
select is((select count(*) from public.branch_finance_summary), 0::bigint, 'finance summary view returns no rows');
select is((select count(*) from public.system_monthly_revenue_forecast), 0::bigint, 'revenue forecast view returns no rows');
select throws_ok(
  $$select public.create_payment(null, null, null, null, null)$$,
  'P0001',
  'Student id is required',
  'payment gate accepts operations lead and still validates the payment'
);

do $$
begin
  insert into public.user_roles(user_id, role_id)
  select '0e210000-0000-4000-8000-000000000002', id from public.roles where code = 'SUPER_ADMIN';
exception when others then
  null;
end $$;
select is(public.has_role('SUPER_ADMIN'), false, 'operations lead cannot grant itself super admin');

reset role;
select set_config('request.jwt.claim.sub', '0e210000-0000-4000-8000-000000000001', true);
set local role authenticated;
select is(public.can_view_financial_reports(null), true, 'owner still reads consolidated financial reports');
select is(public.has_role('SUPER_ADMIN'), true, 'owner remains super admin');
select is(
  (select count(*) from public.user_roles where user_id = '0e210000-0000-4000-8000-000000000003'),
  1::bigint,
  'another user assignment is unchanged'
);

select * from finish();
rollback;
