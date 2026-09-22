begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name)
values ('c3110000-0000-4000-8000-000000000001', 'CRM-PIPELINE', 'CRM Pipeline');
insert into auth.users(id) values ('c3210000-0000-4000-8000-000000000001');
insert into public.profiles(id, full_name, status)
values ('c3210000-0000-4000-8000-000000000001', 'CRM Pipeline Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c3210000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
select set_config('request.jwt.claim.sub', 'c3210000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.create_crm_lead('c3310000-0000-4000-8000-000000000001', 'c3110000-0000-4000-8000-000000000001', 'Happy Path', '0901111111', null, null, null, null, null, null, 'MANUAL', null)$$,
  'pipeline lead created'
);
select lives_ok($$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000001', 'c3310000-0000-4000-8000-000000000001', 1, 'CONTACTED', null, 'PHONE')$$, 'to contacted');
select lives_ok($$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000002', 'c3310000-0000-4000-8000-000000000001', 2, 'QUALIFIED', null, null)$$, 'to qualified');
select lives_ok($$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000003', 'c3310000-0000-4000-8000-000000000001', 3, 'TRIAL_BOOKED', null, null)$$, 'to trial booked');
select lives_ok($$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000004', 'c3310000-0000-4000-8000-000000000001', 4, 'TRIAL_COMPLETED', null, null)$$, 'to trial completed');
select lives_ok($$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000005', 'c3310000-0000-4000-8000-000000000001', 5, 'PROPOSAL_SENT', null, null)$$, 'to proposal sent');
select lives_ok($$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000006', 'c3310000-0000-4000-8000-000000000001', 6, 'NEGOTIATING', null, null)$$, 'to negotiating');
select lives_ok($$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000007', 'c3310000-0000-4000-8000-000000000001', 7, 'WON', null, null)$$, 'to won');
select is((select status from public.crm_leads where id = 'c3310000-0000-4000-8000-000000000001'), 'WON', 'transition success');
select is((select version from public.crm_leads where id = 'c3310000-0000-4000-8000-000000000001'), 8, 'each transition increments version');
select is((select event_type from public.crm_lead_events where id = 'c3320000-0000-4000-8000-000000000006'), 'NEGOTIATION_UPDATED', 'negotiating uses negotiation event');
select is((select converted_at from public.crm_leads where id = 'c3310000-0000-4000-8000-000000000001'), null, 'won does not convert the lead');
select throws_ok(
  $$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000008', 'c3310000-0000-4000-8000-000000000001', 8, 'LOST', 'Doi y', null)$$,
  'P0001', 'CRM_LEAD_TRANSITION_DENIED', 'won is terminal'
);

select lives_ok(
  $$select public.create_crm_lead('c3310000-0000-4000-8000-000000000002', 'c3110000-0000-4000-8000-000000000001', 'Jump', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'invalid-transition lead'
);
select throws_ok(
  $$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000011', 'c3310000-0000-4000-8000-000000000002', 1, 'WON', null, null)$$,
  'P0001', 'CRM_LEAD_TRANSITION_DENIED', 'invalid transition'
);
select is((select status from public.crm_leads where id = 'c3310000-0000-4000-8000-000000000002'), 'NEW', 'invalid transition does not change status');

select lives_ok(
  $$select public.create_crm_lead('c3310000-0000-4000-8000-000000000003', 'c3110000-0000-4000-8000-000000000001', 'Stale', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'stale lead'
);
select lives_ok(
  $$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000021', 'c3310000-0000-4000-8000-000000000003', 1, 'CONTACTED', null, null)$$,
  'stale lead first step'
);
select throws_ok(
  $$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000022', 'c3310000-0000-4000-8000-000000000003', 1, 'QUALIFIED', null, null)$$,
  'P0001', 'CRM_LEAD_STALE', 'stale version'
);

select lives_ok(
  $$select public.create_crm_lead('c3310000-0000-4000-8000-000000000004', 'c3110000-0000-4000-8000-000000000001', 'Lost', null, null, null, null, null, null, null, 'MANUAL', null)$$,
  'lost lead'
);
select throws_ok(
  $$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000031', 'c3310000-0000-4000-8000-000000000004', 1, 'LOST', ' ', null)$$,
  'P0001', 'CRM_LEAD_INVALID', 'lost requires a reason'
);
select lives_ok(
  $$select public.transition_crm_lead('c3320000-0000-4000-8000-000000000032', 'c3310000-0000-4000-8000-000000000004', 1, 'LOST', 'Khong phu hop lich', 'PHONE')$$,
  'lost from new'
);
select is((select lost_reason from public.crm_leads where id = 'c3310000-0000-4000-8000-000000000004'), 'Khong phu hop lich', 'lost reason stored');
select is((select event_type from public.crm_lead_events where id = 'c3320000-0000-4000-8000-000000000032'), 'LOST', 'lost event');

select * from finish();
rollback;
