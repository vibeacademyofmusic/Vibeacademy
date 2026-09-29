begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('c3400000-0000-4000-8000-000000000001', 'CRM-CH-A', 'CRM Channel A'),
  ('c3400000-0000-4000-8000-000000000002', 'CRM-CH-B', 'CRM Channel B');
insert into auth.users(id) values
  ('c3410000-0000-4000-8000-000000000001'),
  ('c3410000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
  ('c3410000-0000-4000-8000-000000000001', 'CRM Channel Admin A', 'ACTIVE'),
  ('c3410000-0000-4000-8000-000000000002', 'CRM Channel Admin B', 'ACTIVE');
insert into public.user_roles(user_id, role_id, branch_id)
select 'c3410000-0000-4000-8000-000000000001', id, 'c3400000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c3410000-0000-4000-8000-000000000002', id, 'c3400000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';

select set_config('request.jwt.claim.sub', 'c3410000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_crm_lead('c3420000-0000-4000-8000-000000000001', 'c3400000-0000-4000-8000-000000000001', 'Phu Nguyen', '0903400001', null, 'Phu Nguyen', 'An Nguyen', null, 'Piano', null, 'ZALO', null)$$,
  'one household lead'
);
select lives_ok(
  $$select public.transition_crm_lead('c3420000-0000-4000-8000-000000000002', 'c3420000-0000-4000-8000-000000000001', 1, 'CONTACTED', null, 'ZALO')$$,
  'same lead moves stage'
);
select is((select count(*) from public.crm_leads where phone_key = '0903400001'), 1::bigint, 'stage change does not create another customer');
select is(public.crm_lead_channel_state('c3420000-0000-4000-8000-000000000001'), 'NONE', 'phone and source ZALO do not imply a channel link');

select set_config('registration.write', 'on', true);
insert into public.registration_applications(id, application_code, crm_lead_id, branch_id, student_name, parent_name, created_by)
values ('c3430000-0000-4000-8000-000000000001', 'DK-CRM-CH-1', 'c3420000-0000-4000-8000-000000000001', 'c3400000-0000-4000-8000-000000000001', 'An Nguyen', 'Phu Nguyen', 'c3410000-0000-4000-8000-000000000001');
select set_config('registration.write', 'off', true);
select is((select crm_lead_id from public.registration_applications where id = 'c3430000-0000-4000-8000-000000000001'), 'c3420000-0000-4000-8000-000000000001'::uuid, 'registration keeps the lead id');

insert into public.customer_channel_links(provider, provider_user_id, external_link_key, registration_application_id, status)
values ('ZALO', '100000000000000001', 'crm-ch-pending', 'c3430000-0000-4000-8000-000000000001', 'PENDING');
select is(public.crm_lead_channel_state('c3420000-0000-4000-8000-000000000001'), 'LINKED', 'explicit pending identity is linked');

update public.customer_channel_links
set status = 'ACTIVE', linked_at = clock_timestamp(), consent_at = clock_timestamp()
where external_link_key = 'crm-ch-pending';
select is(public.crm_lead_channel_state('c3420000-0000-4000-8000-000000000001'), 'VERIFIED', 'consent makes the channel verified');

update public.customer_channel_links
set status = 'REVOKED', linked_at = clock_timestamp(), consent_at = null
where external_link_key = 'crm-ch-pending';
select is(public.crm_lead_channel_state('c3420000-0000-4000-8000-000000000001'), 'REVOKED', 'revoked channel stays revoked');

select set_config('request.jwt.claim.sub', 'c3410000-0000-4000-8000-000000000002', true);
select is(public.crm_lead_channel_state('c3420000-0000-4000-8000-000000000001'), null, 'other branch cannot read channel state');

set local role anon;
select throws_ok(
  $$select public.crm_lead_channel_state('c3420000-0000-4000-8000-000000000001')$$,
  '42501', 'permission denied for function crm_lead_channel_state', 'anonymous cannot read channel state'
);

select * from finish();
rollback;
