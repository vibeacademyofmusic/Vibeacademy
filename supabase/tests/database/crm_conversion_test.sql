begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
  ('c4100000-0000-4000-8000-000000000001', 'CRM-CONVERT', 'CRM Convert'),
  ('c4100000-0000-4000-8000-000000000099', 'CRM-CONVERT-B', 'CRM Convert B');
insert into auth.users(id) values ('c4200000-0000-4000-8000-000000000001'), ('c4200000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
  ('c4200000-0000-4000-8000-000000000001', 'CRM Convert Admin', 'ACTIVE'),
  ('c4200000-0000-4000-8000-000000000002', 'CRM Convert Other', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'c4200000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c4200000-0000-4000-8000-000000000002', id, 'c4100000-0000-4000-8000-000000000099' from public.roles where code = 'BRANCH_ADMIN';
insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id) values
  ('c4300000-0000-4000-8000-000000000001', 'CRM-STU-1', 'Be An', '2016-04-02', 'c4100000-0000-4000-8000-000000000001'),
  ('c4300000-0000-4000-8000-000000000002', 'CRM-STU-2', 'Be Khac', '2016-04-02', 'c4100000-0000-4000-8000-000000000001');
insert into public.parents(id, parent_code) values ('c4400000-0000-4000-8000-000000000001', 'CRM-PAR-1');

select set_config('request.jwt.claim.sub', 'c4200000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.create_crm_lead('c4500000-0000-4000-8000-000000000001', 'c4100000-0000-4000-8000-000000000001', 'Phu huynh An', '0903333333', null, null, 'Be An', '2016-04-02', 'Piano', null, 'MANUAL', null)$$, 'conversion lead');
select is((select count(*) from public.crm_lead_match_candidates('c4500000-0000-4000-8000-000000000001')), 1::bigint, 'strong match uses name and date of birth');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000001', 'c4500000-0000-4000-8000-000000000001', 1, 'CONTACTED', null, null)$$, 'step contacted');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000002', 'c4500000-0000-4000-8000-000000000001', 2, 'QUALIFIED', null, null)$$, 'step qualified');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000003', 'c4500000-0000-4000-8000-000000000001', 3, 'TRIAL_BOOKED', null, null)$$, 'step trial booked');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000004', 'c4500000-0000-4000-8000-000000000001', 4, 'TRIAL_COMPLETED', null, null)$$, 'step trial completed');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000005', 'c4500000-0000-4000-8000-000000000001', 5, 'PROPOSAL_SENT', null, null)$$, 'step proposal');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000006', 'c4500000-0000-4000-8000-000000000001', 6, 'NEGOTIATING', null, null)$$, 'step negotiating');
select throws_ok($$select public.review_crm_lead_conversion('c4520000-0000-4000-8000-000000000001', 'c4500000-0000-4000-8000-000000000001', 7, 'PENDING', null, null, 'Cho xem')$$, 'P0001', 'CRM_LEAD_TRANSITION_DENIED', 'review before won denied');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000007', 'c4500000-0000-4000-8000-000000000001', 7, 'WON', null, null)$$, 'won');
select throws_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000008', 'c4500000-0000-4000-8000-000000000001', 8, 'LOST', 'Doi y', null)$$, 'P0001', 'CRM_LEAD_TRANSITION_DENIED', 'won terminal');
select throws_ok($$select public.review_crm_lead_conversion('c4520000-0000-4000-8000-000000000002', 'c4500000-0000-4000-8000-000000000001', 8, 'LINKED', 'c4300000-0000-4000-8000-000000000002', null, null)$$, 'P0001', 'CRM_LEAD_MATCH_REJECTED', 'ambiguous identity rejected');
select lives_ok($$select public.review_crm_lead_conversion('c4520000-0000-4000-8000-000000000003', 'c4500000-0000-4000-8000-000000000001', 8, 'LINKED', 'c4300000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000001', null)$$, 'link existing student and parent');
select lives_ok($$select public.review_crm_lead_conversion('c4520000-0000-4000-8000-000000000003', 'c4500000-0000-4000-8000-000000000001', 8, 'LINKED', 'c4300000-0000-4000-8000-000000000001', 'c4400000-0000-4000-8000-000000000001', null)$$, 'conversion replay');
select is((select converted_student_id from public.crm_leads where id = 'c4500000-0000-4000-8000-000000000001'), 'c4300000-0000-4000-8000-000000000001'::uuid, 'converted student stored');
select is((select count(*) from public.students where student_code like 'CRM-STU-%'), 2::bigint, 'conversion creates no student');
select is((select count(*) from public.parents where parent_code = 'CRM-PAR-1'), 1::bigint, 'conversion creates no parent');
select is((select count(*) from public.student_parents where student_id = 'c4300000-0000-4000-8000-000000000001'), 1::bigint, 'existing parent link written once');
select is((select count(*) from public.crm_lead_events where lead_id = 'c4500000-0000-4000-8000-000000000001' and event_type = 'CONVERTED'), 1::bigint, 'one conversion event');
select throws_ok($$select public.review_crm_lead_conversion('c4520000-0000-4000-8000-000000000004', 'c4500000-0000-4000-8000-000000000001', 9, 'LINKED', 'c4300000-0000-4000-8000-000000000002', null, 'Khac')$$, 'P0001', 'CRM_LEAD_ALREADY_CONVERTED', 'duplicate conversion denied');

select lives_ok($$select public.create_crm_lead('c4500000-0000-4000-8000-000000000002', 'c4100000-0000-4000-8000-000000000001', 'Chua ro', '0904444444', null, null, null, null, null, null, 'MANUAL', null)$$, 'phone-only lead');
select is((select count(*) from public.crm_lead_match_candidates('c4500000-0000-4000-8000-000000000002')), 0::bigint, 'phone alone is not an identity match');
select lives_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000011', 'c4500000-0000-4000-8000-000000000002', 1, 'LOST', 'Khong hoc', null)$$, 'lost terminal setup');
select throws_ok($$select public.transition_crm_lead('c4510000-0000-4000-8000-000000000012', 'c4500000-0000-4000-8000-000000000002', 2, 'CONTACTED', null, null)$$, 'P0001', 'CRM_LEAD_TRANSITION_DENIED', 'lost terminal');
select throws_ok($$select public.review_crm_lead_conversion('c4520000-0000-4000-8000-000000000011', 'c4500000-0000-4000-8000-000000000002', 1, 'PENDING', null, null, 'Xem')$$, 'P0001', 'CRM_LEAD_STALE', 'stale conversion review');

select set_config('request.jwt.claim.sub', 'c4200000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.review_crm_lead_conversion('c4520000-0000-4000-8000-000000000012', 'c4500000-0000-4000-8000-000000000001', 9, 'PENDING', null, null, 'Cheo')$$, 'P0001', 'CRM_LEAD_UNAUTHORIZED', 'cross branch conversion denied');

select throws_ok($$insert into public.crm_lead_conversion_reviews(id, lead_id, decision, note, actor_id) values ('c4520000-0000-4000-8000-000000000099', 'c4500000-0000-4000-8000-000000000001', 'PENDING', 'Truc tiep', 'c4200000-0000-4000-8000-000000000001')$$, 'P0001', 'CRM_LEAD_DIRECT_WRITE_DENIED', 'direct review insert denied');

select * from finish();
rollback;
