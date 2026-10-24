
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
select public.record_verified_payos_webhook(880925001, 'link-880925001', 'ref-partial', 1000000, 'VND') as below;
insert into registration_payos_orders(id, application_id, order_code, amount, description, state, payment_link_id, checkout_url)
values ('aa920000-0000-4000-8000-000000000072', 'aa920000-0000-4000-8000-000000000051', 880925002, 4500000, 'coc du nguong', 'PENDING', 'link-880925002', 'https://pay.example.test/880925002');
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'ref-final', 4500000, 'VND') as reached;
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'ref-final', 4500000, 'VND') as replay;

create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(21);
select set_config('request.jwt.claim.sub','aa920000-0000-4000-8000-000000000002',true);
create temp table fixture as select id job from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051';
select is((select status from notification_jobs where id=(select job from fixture)),'SKIPPED_NO_CHANNEL','completion without consent is not a provider failure');
select is(reevaluate_registration_zalo_channel('aa920000-0000-4000-8000-000000000051'),'NO_CONSENT','payment does not imply consent');
select throws_ok($$select record_registration_zalo_phone_consent('aa920000-0000-4000-8000-000000000051','0900000000',false)$$,'P0001','PHONE_CONSENT_REQUIRED','genuine confirmation required');
select record_registration_zalo_phone_consent('aa920000-0000-4000-8000-000000000051','0900000000',true);
select ok((select consent_present from registration_zalo_phone_status('aa920000-0000-4000-8000-000000000051')),'authorized UI RPC persists post-completion consent');
select is((select status from notification_jobs where id=(select job from fixture)),'SKIPPED_NO_CHANNEL','saving consent does not queue or send');
update notification_templates set enabled=false where template_key='ZALO_REGISTRATION_CONFIRMED';
select is(reevaluate_registration_zalo_channel('aa920000-0000-4000-8000-000000000051'),'GATE_DISABLED','approval does not override disabled gate');
select is((select payload->'delivery'->>'channel' from notification_jobs where id=(select job from fixture)),'PHONE','blocked snapshot is updated from actual consent without sending');
select is(zalo_registration_recovery((select job from fixture))->>'reason','GATE_DISABLED','scoped shared view reports gate independently from consent');
savepoint permission_check;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select zalo_registration_recovery((select job from fixture),'PREPARE',0)$$,'P0001','Unauthorized','unauthenticated recovery cannot prepare');
rollback to permission_check;
select is((select attempts from notification_jobs where id=(select job from fixture)),0,'checks do not consume retries');
update notification_templates set enabled=true where template_key='ZALO_REGISTRATION_CONFIRMED';
select is(reevaluate_registration_zalo_channel('aa920000-0000-4000-8000-000000000051'),'CHANNEL_READY','late consent recovers original job without UID');
select is(reevaluate_registration_zalo_channel('aa920000-0000-4000-8000-000000000051'),'CHANNEL_READY','repeated evaluation is idempotent');
select is((select count(*)::int from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051'),1,'one original job');
select is((select payload->'parameters'->>'payment_status' from notification_jobs where id=(select job from fixture)),'Đã thanh toán đủ','full payment copy preserved');
select is((select decision from preview_zalo_dispatch_decision(880925002)),'SEND','PHONE eligibility does not require UID');
update notification_templates set enabled=false where template_key='ZALO_REGISTRATION_CONFIRMED';
select is((select decision from preview_zalo_dispatch_decision(880925002)),'GATE_DISABLED','worker and manual dispatch respect disabled gate');
update notification_templates set enabled=true where template_key='ZALO_REGISTRATION_CONFIRMED';
select record_registration_zalo_phone_consent('aa920000-0000-4000-8000-000000000051','0900000001',true);
select is(reevaluate_registration_zalo_channel('aa920000-0000-4000-8000-000000000051'),'WRONG_RECIPIENT','changed recipient cannot overwrite snapshot');
select is((select blocked_reason from registration_zalo_phone_status('aa920000-0000-4000-8000-000000000051')),'WRONG_RECIPIENT','UI exposes consent-recipient mismatch');
select is((select count(*)::int from zalo_notification_attempts where job_id=(select job from fixture)),0,'evaluation never calls provider');
select set_config('zalo.durable_write','on',true);
update notification_jobs set status='SENT',sent_at=clock_timestamp(),provider_message_id='synthetic-channel',provider_receipt='ZALO_PHONE_ACCEPTED'  where id=(select job from fixture);
select is(reevaluate_registration_zalo_channel('aa920000-0000-4000-8000-000000000051'),'ALREADY_ACCEPTED','accepted protected');
update notification_jobs set status='DELIVERED',delivered_at=clock_timestamp() where id=(select job from fixture);
select is(reevaluate_registration_zalo_channel('aa920000-0000-4000-8000-000000000051'),'ALREADY_ACCEPTED','delivered protected');
select * from finish();
rollback;
