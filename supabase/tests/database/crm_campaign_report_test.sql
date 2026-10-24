begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('c5100000-0000-4000-8000-000000000001', 'CRM-CAMP-A', 'CRM Campaign A'),
  ('c5100000-0000-4000-8000-000000000002', 'CRM-CAMP-B', 'CRM Campaign B');
insert into auth.users(id) values ('c5200000-0000-4000-8000-000000000001'), ('c5200000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
  ('c5200000-0000-4000-8000-000000000001', 'Campaign Super', 'ACTIVE'),
  ('c5200000-0000-4000-8000-000000000002', 'Campaign Admin B', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c5200000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c5200000-0000-4000-8000-000000000002', id, 'c5100000-0000-4000-8000-000000000002' from public.roles where code = 'BRANCH_ADMIN';
select set_config('request.jwt.claim.sub', 'c5200000-0000-4000-8000-000000000001', true);

select lives_ok($$select public.create_crm_campaign('c5300000-0000-4000-8000-000000000001', 'Piano September', 'FACEBOOK', null, 'c5100000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, null, null, null, null, null)$$, 'campaign without budget');
select lives_ok($$select public.create_crm_campaign('c5300000-0000-4000-8000-000000000001', 'Piano September', 'FACEBOOK', null, 'c5100000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, null, null, null, null, null)$$, 'campaign replay');
select lives_ok($$select public.set_crm_campaign_status('c5300000-0000-4000-8000-000000000002', 'c5300000-0000-4000-8000-000000000001', 1, 'ACTIVE')$$, 'activate campaign');
select is((select budget_amount from public.crm_campaigns where id = 'c5300000-0000-4000-8000-000000000001'), null, 'missing budget stays null');

select lives_ok($$select public.create_crm_lead('c5400000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000001', 'August Won', null, null, null, null, null, 'Campaign Fixture', null, 'MANUAL', null)$$, 'august lead');
select lives_ok($$select public.create_crm_lead('c5400000-0000-4000-8000-000000000002', 'c5100000-0000-4000-8000-000000000001', 'September Open', null, null, null, null, null, 'Campaign Fixture', null, 'MANUAL', null)$$, 'september open lead');
select lives_ok($$select public.create_crm_lead('c5400000-0000-4000-8000-000000000003', 'c5100000-0000-4000-8000-000000000001', 'September Lost', null, null, null, null, null, 'Campaign Fixture', null, 'MANUAL', null)$$, 'september lost lead');
select lives_ok($$select public.create_crm_lead('c5400000-0000-4000-8000-000000000004', 'c5100000-0000-4000-8000-000000000002', 'Other Branch', null, null, null, null, null, 'Campaign Fixture', null, 'MANUAL', null)$$, 'other branch lead');
select lives_ok($$select public.set_crm_lead_campaign('c5400000-0000-4000-8000-000000000011', 'c5400000-0000-4000-8000-000000000002', 1, 'c5300000-0000-4000-8000-000000000001', null, null, null, null)$$, 'attribute september lead');

select set_config('crm.lead_write', 'on', true);
update public.crm_leads set created_at = '2026-08-15 09:00:00+07' where id = 'c5400000-0000-4000-8000-000000000001';
update public.crm_leads set created_at = '2026-09-10 09:00:00+07' where id = 'c5400000-0000-4000-8000-000000000002';
update public.crm_leads set created_at = '2026-09-12 09:00:00+07' where id = 'c5400000-0000-4000-8000-000000000003';
update public.crm_leads set created_at = '2026-09-11 09:00:00+07' where id = 'c5400000-0000-4000-8000-000000000004';
insert into public.crm_lead_events(id, lead_id, event_type, from_status, to_status, actor_id, created_at) values
  ('c5410000-0000-4000-8000-000000000001', 'c5400000-0000-4000-8000-000000000001', 'CONTACTED', 'NEW', 'CONTACTED', 'c5200000-0000-4000-8000-000000000001', '2026-08-16 09:00:00+07'),
  ('c5410000-0000-4000-8000-000000000002', 'c5400000-0000-4000-8000-000000000001', 'WON', 'NEGOTIATING', 'WON', 'c5200000-0000-4000-8000-000000000001', '2026-09-02 09:00:00+07'),
  ('c5410000-0000-4000-8000-000000000003', 'c5400000-0000-4000-8000-000000000003', 'LOST', 'NEW', 'LOST', 'c5200000-0000-4000-8000-000000000001', '2026-09-12 10:00:00+07');
select set_config('crm.lead_write', 'off', true);

select set_config('request.jwt.claim.sub', 'c5200000-0000-4000-8000-000000000001', true);
select is((select value from public.crm_cohort_funnel('2026-08-01', '2026-08-31', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'new'), 1::numeric, 'august cohort contains the august lead');
select is((select value from public.crm_cohort_funnel('2026-08-01', '2026-08-31', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'won'), 1::numeric, 'august cohort counts a later win');
select is((select value from public.crm_activity_funnel('2026-08-01', '2026-08-31', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'won'), 0::numeric, 'august activity excludes the september win');
select is((select value from public.crm_activity_funnel('2026-09-01', '2026-09-30', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'won'), 1::numeric, 'september activity counts the win');
select is((select value from public.crm_cohort_funnel('2026-09-01', '2026-09-30', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'new'), 2::numeric, 'september cohort excludes the august lead');
select is((select value from public.crm_cohort_funnel('2026-09-01', '2026-09-30', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'won'), 0::numeric, 'september cohort does not count the august lead win');
select is((select value from public.crm_cohort_funnel('2026-09-01', '2026-09-30', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'lost'), 1::numeric, 'september cohort counts the lost lead');
select is((select value from public.crm_cohort_funnel('2026-09-01', '2026-09-30', 'c5100000-0000-4000-8000-000000000001', 'c5300000-0000-4000-8000-000000000001', null, null, null) where metric = 'new'), 1::numeric, 'campaign filter keeps the attributed lead');
select is((select value from public.crm_cohort_funnel('2026-09-01', '2026-09-30', null, null, null, null, 'Campaign Fixture') where metric = 'new'), 3::numeric, 'null campaign filter still includes every visible branch');

select set_config('request.jwt.claim.sub', 'c5200000-0000-4000-8000-000000000002', true);
select is((select value from public.crm_cohort_funnel('2026-08-01', '2026-09-30', 'c5100000-0000-4000-8000-000000000001', null, null, null, null) where metric = 'new'), 0::numeric, 'other branch cohort is hidden');
set local role authenticated;
select throws_ok($$update public.crm_campaigns set name = 'Changed' where id = 'c5300000-0000-4000-8000-000000000001'$$, '42501', 'permission denied for table crm_campaigns', 'authenticated campaign update denied');
reset role;

select * from finish();
rollback;
