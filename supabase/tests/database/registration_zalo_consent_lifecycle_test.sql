
begin;

insert into auth.users(id) values ('aa920000-0000-4000-8000-000000000002');
insert into profiles(id,full_name,status) values ('aa920000-0000-4000-8000-000000000002','Synthetic Recovery Admin','ACTIVE');
insert into user_roles(user_id,role_id) select 'aa920000-0000-4000-8000-000000000002',id from roles where code='SUPER_ADMIN';
insert into tuition_plans(id,code,name,duration_months) values ('aa920000-0000-4000-8000-000000000021','RECOVERY-TEST','Recovery Synthetic',3);
insert into tuition_plan_branch_prices(id,tuition_plan_id,list_price) values ('aa920000-0000-4000-8000-000000000022','aa920000-0000-4000-8000-000000000021',5500000);
update notification_templates set enabled=true,status='APPROVED' where template_key='ZALO_REGISTRATION_CONFIRMED';
select set_config('registration.write', 'on', true);
select set_config('request.jwt.claim.role', 'service_role', true);
insert into branches(id, code, name) values ('aa920000-0000-4000-8000-000000000011', 'PH-PAY', 'Phone pay branch');
insert into registration_applications(
  id, application_code, branch_id, student_name, student_date_of_birth, parent_name, parent_phone,
  status, created_by
) values (
  'aa920000-0000-4000-8000-000000000051', 'DK-PHONE-PAY', 'aa920000-0000-4000-8000-000000000011',
  'Phone Path Synthetic 880925', date '2014-08-08', 'Phu huynh phone path', '0900000000',
  'PAYMENT_PENDING', 'aa920000-0000-4000-8000-000000000002'
);
insert into registration_deposit_terms(
  application_id, branch_id, tuition_plan_id, price_id, tuition_amount, list_amount, discount_amount,
  payment_option, amount_due, quoted_by
)
select 'aa920000-0000-4000-8000-000000000051', 'aa920000-0000-4000-8000-000000000011', 'aa920000-0000-4000-8000-000000000021'::uuid, 'aa920000-0000-4000-8000-000000000022'::uuid,
  5500000, 5500000, 0, 'FULL', 5500000, 'aa920000-0000-4000-8000-000000000002'::uuid;
insert into registration_payos_orders(id, application_id, order_code, amount, description, state, payment_link_id, checkout_url)
values ('aa920000-0000-4000-8000-000000000071', 'aa920000-0000-4000-8000-000000000051', 880925001, 1000000, 'coc duoi nguong', 'PENDING', 'link-880925001', 'https://pay.example.test/880925001');
insert into public.curriculums(id, code, name, status) values
('e9500000-0000-4000-8000-000000000020', 'PAYOS-C', 'Guitar PayOS', 'ACTIVE');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status) values
('e9500000-0000-4000-8000-000000000021', 'e9500000-0000-4000-8000-000000000020', 'PAYOS-L', 'Grade 1', 1, 'ACTIVE');
insert into public.curriculum_subjects(id, level_id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status) values
('e9500000-0000-4000-8000-000000000022', 'e9500000-0000-4000-8000-000000000021', 'TECHNIQUE', 'PAYOS-S', 'Technique', 1, true, 'DIRECT_ASSESSMENT', 1, 'ACTIVE');
update registration_applications set curriculum_id='e9500000-0000-4000-8000-000000000020', level_id='e9500000-0000-4000-8000-000000000021',subject_id='e9500000-0000-4000-8000-000000000022' where id='aa920000-0000-4000-8000-000000000051';
select public.record_verified_payos_webhook(880925001, 'link-880925001', 'consent-test-partial', 1000000, 'VND') as below;
insert into registration_payos_orders(id, application_id, order_code, amount, description, state, payment_link_id, checkout_url)
values ('aa920000-0000-4000-8000-000000000072', 'aa920000-0000-4000-8000-000000000051', 880925002, 4500000, 'coc du nguong', 'PENDING', 'link-880925002', 'https://pay.example.test/880925002');
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'consent-test-final', 4500000, 'VND') as reached;
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'consent-test-final', 4500000, 'VND') as replay;


create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
select set_config('request.jwt.claim.sub','aa920000-0000-4000-8000-000000000002',true);
create temp table fixture as select id job from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051';
create temp table business_before as select (select jsonb_agg(to_jsonb(x) order by id) from registration_applications x) apps,(select jsonb_agg(to_jsonb(x) order by id) from registration_payos_orders x) payments,(select jsonb_agg(to_jsonb(x) order by id) from student_placement_cases x) placements;
select is(zalo_registration_recovery((select job from fixture),'CHECK',0)->>'reason','NO_CONSENT','no consent blocks despite paid completion');
select throws_ok($$select update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','0900000000',false,'IN_PERSON')$$,'P0001','PHONE_CONSENT_REQUIRED','unchecked cannot grant consent');
select throws_ok($$select update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','abc0900000000',true,'IN_PERSON')$$,'P0001','PHONE_INVALID','letters are not silently stripped');
select throws_ok($$select update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','0900000000',true,'')$$,'P0001','PHONE_CONSENT_SOURCE_REQUIRED','explicit source required');
select is(update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','+84 900 000 000',true,'WRITTEN'),'CHANNEL_READY','late consent immediately evaluates existing job');
select is((select normalized_phone from registration_zalo_phone_consents where revoked_at is null and application_id='aa920000-0000-4000-8000-000000000051'),'84900000000','international phone normalized');
select is((select payload->'delivery'->>'normalized_recipient' from notification_jobs where id=(select job from fixture)),'84900000000','recipient snapshot matches consent');
select is((registration_zalo_consent_details('aa920000-0000-4000-8000-000000000051')->'history'->0->>'method'),'WRITTEN','source survives fresh read');
select is((registration_zalo_consent_details('aa920000-0000-4000-8000-000000000051')->'history'->0->>'actor'),'Synthetic Recovery Admin','actor persisted');
select ok((registration_zalo_consent_details('aa920000-0000-4000-8000-000000000051')->'history'->0->>'at') is not null,'timestamp persisted');
select throws_ok($$select update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','0900000001',true,'PHONE')$$,'P0001','PHONE_CONSENT_STALE','stale form/double submit cannot override consent');
select is(update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',(select id from registration_zalo_phone_consents where application_id='aa920000-0000-4000-8000-000000000051' and revoked_at is null),'RECORD','0900.000.001',true,'PHONE'),'CHANNEL_READY','explicit new consent safely replaces unattempted recipient');
select is((select payload->'delivery'->>'normalized_recipient' from notification_jobs where id=(select job from fixture)),'84900000001','domestic replacement normalized and bound');
select is(update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',(select id from registration_zalo_phone_consents where application_id='aa920000-0000-4000-8000-000000000051' and revoked_at is null),'REVOKE','',true,''),'CONSENT_REVOKED','withdrawal supported');
select is(zalo_registration_recovery((select job from fixture),'CHECK',0)->>'reason','NO_CONSENT','withdrawal blocks fresh recovery');
select is((select error_code from notification_jobs where id=(select job from fixture)),'NO_CONSENT','stored skip reason is specific');
select is((select status from notification_jobs where id=(select job from fixture)),'SKIPPED_NO_CHANNEL','existing status enum preserved');
select is((select count(*)::int from registration_zalo_phone_consents where application_id='aa920000-0000-4000-8000-000000000051' and revoked_at is not null and revoked_by=auth.uid()),2,'replacement and withdrawal retain actor history');
select is(update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','0900000000',true,'IN_PERSON'),'CHANNEL_READY','fresh explicit consent can recover skipped job');
select is(zalo_registration_recovery((select job from fixture),'CHECK',0)->>'state','SEND','repeated check reads fresh eligibility');
select is((select attempts from notification_jobs where id=(select job from fixture)),0,'save/check never increments sends');
select is((select count(*)::int from zalo_notification_attempts where job_id=(select job from fixture)),0,'no outbound attempt created');
select is((select count(*)::int from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051'),1,'one durable job throughout lifecycle');
update notification_templates set enabled=false where template_key='ZALO_REGISTRATION_CONFIRMED';
select is((select decision from preview_zalo_dispatch_decision(880925002)),'GATE_DISABLED','disabled template blocks preflight for an already queued phone job');
select is((select count(*)::int from zalo_notification_attempts where job_id=(select job from fixture)),0,'disabled template does not reserve an outbound attempt');
update notification_templates set enabled=true where template_key='ZALO_REGISTRATION_CONFIRMED';
select is((select decision from preview_zalo_dispatch_decision(880925002)),'SEND','explicit re-enable restores preflight for eligible job');
savepoint permissions;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','0900000000',true,'IN_PERSON')$$,'P0001','Unauthorized','unauthenticated request denied');
rollback to permissions;
savepoint wrong_role;
delete from user_roles where user_id='aa920000-0000-4000-8000-000000000002';
select throws_ok($$select update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',null,'RECORD','0900000000',true,'IN_PERSON')$$,'P0001','Unauthorized','authenticated user without role denied');
select throws_ok($$select registration_zalo_consent_details('aa920000-0000-4000-8000-000000000051')$$,'P0001','Unauthorized','audit read permission enforced');
rollback to wrong_role;
select is((select jsonb_agg(to_jsonb(x) order by id) from registration_applications x),(select apps from business_before),'registration business data unchanged');
select is((select jsonb_agg(to_jsonb(x) order by id) from registration_payos_orders x),(select payments from business_before),'payments unchanged');
select is((select jsonb_agg(to_jsonb(x) order by id) from student_placement_cases x),(select placements from business_before),'academic placements unchanged');

-- Claim/withdrawal race: a reservation is not evidence that an HTTP request started.
select set_config('zalo.durable_write','on',true);
insert into zalo_notification_attempts(id,job_id,attempt_number,credential_version,state) values('aa920000-0000-4000-8000-000000000099',(select job from fixture),1,1,'REQUESTING');
update notification_jobs set status='PROCESSING',lease_token='aa920000-0000-4000-8000-000000000099',attempts=0 where id=(select job from fixture);
select update_registration_zalo_consent('aa920000-0000-4000-8000-000000000051',(select id from registration_zalo_phone_consents where application_id='aa920000-0000-4000-8000-000000000051' and revoked_at is null),'REVOKE','',true,'');
select is(start_zalo_recovery_outbound('aa920000-0000-4000-8000-000000000099'),'NO_CONSENT','withdrawal after claim stops actual outbound boundary');
select is((select attempts from notification_jobs where id=(select job from fixture)),0,'locally blocked reservation does not count as a send');
select is((select error_code from zalo_notification_attempts where id='aa920000-0000-4000-8000-000000000099'),'ZALO_CONSENT_WITHDRAWN','no fabricated provider response');
select is(start_zalo_recovery_outbound('aa920000-0000-4000-8000-000000000099'),'DENIED','same reservation cannot be replayed');
insert into zalo_notification_attempts(id,job_id,attempt_number,credential_version,state) values('aa920000-0000-4000-8000-000000000098',(select job from fixture),2,1,'REQUESTING');
update notification_jobs set status='PROCESSING',lease_token='aa920000-0000-4000-8000-000000000098',attempts=1 where id=(select job from fixture);
update notification_templates set enabled=false where template_key='ZALO_REGISTRATION_CONFIRMED';
select is(start_zalo_recovery_outbound('aa920000-0000-4000-8000-000000000098'),'GATE_DISABLED','disabling template after claim stops final outbound boundary');
select is((select attempts from notification_jobs where id=(select job from fixture)),1,'disabled send does not consume another attempt count');
select is((select error_code from zalo_notification_attempts where id='aa920000-0000-4000-8000-000000000098'),'ZALO_GATE_DISABLED','disabled send leaves local audit evidence');
select is(start_zalo_recovery_outbound('aa920000-0000-4000-8000-000000000098'),'DENIED','disabled reservation cannot be replayed');
-- Creation and consent share one transaction. Forged consent failures leave no draft.
select throws_ok($$select create_registration_with_zalo_consent('aa920000-0000-4000-8000-000000000090','aa920000-0000-4000-8000-000000000011',null,'Atomic Invalid Consent','2014-08-08','Synthetic Parent','0900000000','e9500000-0000-4000-8000-000000000020','e9500000-0000-4000-8000-000000000021','e9500000-0000-4000-8000-000000000022',null,'',true,'')$$,'P0001','PHONE_CONSENT_SOURCE_REQUIRED','invalid consent rolls back complete creation');
select is((select count(*)::int from registration_applications where student_name='Atomic Invalid Consent'),0,'no partial draft after failure');
create temp table created_with as select create_registration_with_zalo_consent('aa920000-0000-4000-8000-000000000091','aa920000-0000-4000-8000-000000000011',null,'Atomic With Consent','2014-08-08','Synthetic Parent','0900000000','e9500000-0000-4000-8000-000000000020','e9500000-0000-4000-8000-000000000021','e9500000-0000-4000-8000-000000000022',null,'',true,'IN_PERSON') id;
select is((select source from registration_zalo_phone_consents where application_id=(select id from created_with)),'REGISTRATION_FORM','new form persists explicit consent atomically');
create temp table created_without as select create_registration_with_zalo_consent('aa920000-0000-4000-8000-000000000092','aa920000-0000-4000-8000-000000000011',null,'Atomic Without Consent','2014-08-08','Synthetic Parent','0900000000','e9500000-0000-4000-8000-000000000020','e9500000-0000-4000-8000-000000000021','e9500000-0000-4000-8000-000000000022',null,'',false,'') id;
select is((select count(*)::int from registration_zalo_phone_consents where application_id=(select id from created_without)),0,'unchecked new form never invents consent');
select * from finish();
rollback;
