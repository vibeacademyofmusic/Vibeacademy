begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('c3120000-0000-4000-8000-000000000001', 'CRM-SEC-A', 'CRM Security A'),
  ('c3120000-0000-4000-8000-000000000002', 'CRM-SEC-B', 'CRM Security B');
insert into auth.users(id) values
  ('c3220000-0000-4000-8000-000000000001'),
  ('c3220000-0000-4000-8000-000000000002'),
  ('c3220000-0000-4000-8000-000000000003'),
  ('c3220000-0000-4000-8000-000000000004'),
  ('c3220000-0000-4000-8000-000000000005'),
  ('c3220000-0000-4000-8000-000000000006');
insert into public.profiles(id, full_name, status) values
  ('c3220000-0000-4000-8000-000000000001', 'CRM Security Super', 'ACTIVE'),
  ('c3220000-0000-4000-8000-000000000002', 'CRM Security Admin A', 'ACTIVE'),
  ('c3220000-0000-4000-8000-000000000003', 'CRM Security Admin B', 'ACTIVE'),
  ('c3220000-0000-4000-8000-000000000004', 'CRM Security Teacher', 'ACTIVE'),
  ('c3220000-0000-4000-8000-000000000005', 'CRM Security Disabled', 'INACTIVE'),
  ('c3220000-0000-4000-8000-000000000006', 'CRM Security Global Branch', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c3220000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id)
select 'c3220000-0000-4000-8000-000000000005', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c3220000-0000-4000-8000-000000000002', id, 'c3120000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c3220000-0000-4000-8000-000000000003', id, 'c3120000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c3220000-0000-4000-8000-000000000004', id, 'c3120000-0000-4000-8000-000000000001' from public.roles where code = 'TEACHER';
insert into public.user_roles(user_id, role_id)
select 'c3220000-0000-4000-8000-000000000006', id from public.roles where code = 'BRANCH_ADMIN';

select ok(has_table_privilege('authenticated', 'public.crm_leads', 'SELECT') and not has_table_privilege('authenticated', 'public.crm_leads', 'INSERT') and not has_table_privilege('authenticated', 'public.crm_leads', 'UPDATE') and not has_table_privilege('authenticated', 'public.crm_leads', 'DELETE'), 'authenticated lead access is select only');
select ok(has_table_privilege('authenticated', 'public.crm_lead_events', 'SELECT') and not has_table_privilege('authenticated', 'public.crm_lead_events', 'UPDATE') and not has_table_privilege('authenticated', 'public.crm_lead_events', 'DELETE'), 'authenticated event access is select only');
select ok((select relrowsecurity from pg_class where oid = 'public.crm_leads'::regclass) and (select relrowsecurity from pg_class where oid = 'public.crm_lead_events'::regclass), 'RLS enabled');

select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_crm_lead('c3330000-0000-4000-8000-000000000001', 'c3120000-0000-4000-8000-000000000001', 'Branch A Lead', '0902222222', null, null, null, null, null, null, 'MANUAL', null)$$,
  'branch admin creates in own branch'
);
select throws_ok(
  $$select public.create_crm_lead('c3330000-0000-4000-8000-000000000002', 'c3120000-0000-4000-8000-000000000002', 'Forged branch', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'cross-branch create denied'
);

select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$select public.assign_crm_lead('c3330000-0000-4000-8000-000000000011', 'c3330000-0000-4000-8000-000000000001', 1, 'c3220000-0000-4000-8000-000000000002', 'Teacher assign')$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'assign unauthorized'
);

select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.add_crm_lead_note('c3330000-0000-4000-8000-000000000012', 'c3330000-0000-4000-8000-000000000001', 1, 'Cross branch note', null)$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'cross-branch mutation denied'
);
select throws_ok(
  $$select public.assign_crm_lead('c3330000-0000-4000-8000-000000000013', 'c3330000-0000-4000-8000-000000000001', 1, 'c3220000-0000-4000-8000-000000000003', 'Other branch')$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'cross-branch assign denied'
);

select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.assign_crm_lead('c3330000-0000-4000-8000-000000000014', 'c3330000-0000-4000-8000-000000000001', 1, 'c3220000-0000-4000-8000-000000000004', 'Giao cho giao vien')$$,
  'assign success'
);
select is((select owner_user_id from public.crm_leads where id = 'c3330000-0000-4000-8000-000000000001'), 'c3220000-0000-4000-8000-000000000004'::uuid, 'owner stored');

select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.create_crm_lead('c3330000-0000-4000-8000-000000000015', 'c3120000-0000-4000-8000-000000000001', 'Disabled', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'disabled user denied'
);

select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000006', true);
select throws_ok(
  $$select public.create_crm_lead('c3330000-0000-4000-8000-000000000016', 'c3120000-0000-4000-8000-000000000001', 'Null branch role', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'branch role without a branch is not global'
);

set local role anon;
select throws_ok(
  $$select public.create_crm_lead('c3330000-0000-4000-8000-000000000017', 'c3120000-0000-4000-8000-000000000001', 'Anon', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  '42501', 'permission denied for function create_crm_lead', 'anonymous denied'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.create_crm_lead('c3330000-0000-4000-8000-000000000018', 'c3120000-0000-4000-8000-000000000001', 'No session', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'P0001', 'CRM_LEAD_UNAUTHORIZED', 'missing session denied'
);
select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.crm_leads), 0::bigint, 'branch isolation hides the other branch');
select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.crm_leads), 0::bigint, 'owner without crm.view cannot read');
select set_config('request.jwt.claim.sub', 'c3220000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.crm_leads), 1::bigint, 'own branch admin can read');
select throws_ok(
  $$delete from public.crm_leads where id = 'c3330000-0000-4000-8000-000000000001'$$,
  '42501', 'permission denied for table crm_leads', 'direct delete denied'
);
reset role;

select * from finish();
rollback;
