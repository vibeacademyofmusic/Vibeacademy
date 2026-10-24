
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
insert into registration_zalo_phone_consents(application_id, normalized_phone, notice_version, source)
values ('aa920000-0000-4000-8000-000000000051', '84987654321', 'zbs-phone-v1', 'REGISTRATION_FORM');
insert into registration_payos_orders(id, application_id, order_code, amount, description, state, payment_link_id, checkout_url)
values ('aa920000-0000-4000-8000-000000000071', 'aa920000-0000-4000-8000-000000000051', 880925001, 1000000, 'coc duoi nguong', 'PENDING', 'link-880925001', 'https://pay.example.test/880925001');
select public.record_verified_payos_webhook(880925001, 'link-880925001', 'ref-partial', 1000000, 'VND') as below;
insert into registration_payos_orders(id, application_id, order_code, amount, description, state, payment_link_id, checkout_url)
values ('aa920000-0000-4000-8000-000000000072', 'aa920000-0000-4000-8000-000000000051', 880925002, 4500000, 'coc du nguong', 'PENDING', 'link-880925002', 'https://pay.example.test/880925002');
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'ref-final', 4500000, 'VND') as reached;
select public.record_verified_payos_webhook(880925002, 'link-880925002', 'ref-final', 4500000, 'VND') as replay;

create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(42);
select is((select count(*)::int from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051'),1,'duplicate payment creates one job');
select is((select count(*)::int from payments where reference in ('PAYOS:ref-partial','PAYOS:ref-final')
  and student_id_snapshot = (select linked_student_id from registration_applications
    where id='aa920000-0000-4000-8000-000000000051')),2,'exactly two synthetic payment receipts');
select is((select count(*)::int from student_placement_cases where registration_application_id='aa920000-0000-4000-8000-000000000051'),1,'one placement');
select is((select count(*)::int from students where full_name='Phone Path Synthetic 880925'),1,'one student');
select is((select payload->'parameters'->>'payment_status' from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051'),'Đã thanh toán đủ','FULL uses actual full-payment copy');
create temp table fixture as select id job from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051';
select zalo_credential_command('BOOTSTRAP','123456789','987654321',p_access=>'synthetic1',p_refresh=>'refresh1');
select is(zalo_credential_command('CLAIM','123456789','987654321',1,'aa920000-0000-4000-8000-000000000001')->>'state','CLAIMED','first worker owns refresh');
select is(zalo_credential_command('CLAIM','123456789','987654321',1,'aa920000-0000-4000-8000-000000000002')->>'state','BUSY_OR_BLOCKED','second worker cannot reuse refresh');
select is(zalo_credential_command('BLOCK','123456789','987654321',1,p_error=>'ZALO_TOKEN_INVALID')->>'state','STALE','late invalid-access response cannot interrupt active refresh');
select is(zalo_credential_command('REPLACE','123456789','987654321',1,p_access=>'synthetic1',p_refresh=>'refresh1')->>'state','REAUTH_REQUIRED','ambiguous refresh token cannot be reimported');
select is(zalo_credential_command('COMMIT','123456789','987654321',1,'aa920000-0000-4000-8000-000000000001','synthetic2','refresh2',clock_timestamp()+interval '25 hours')->>'state','COMMITTED','pair saved atomically');
select is((zalo_credential_command('READ','123456789','987654321')->>'version')::int,2,'version advanced');
select is(zalo_credential_command('BOOTSTRAP','123456789','987654321',p_access=>'old-env',p_refresh=>'old-refresh')->>'access_token','synthetic2','restart cannot overwrite rotation');
select is(zalo_credential_command('COMMIT','123456789','987654321',1,'aa920000-0000-4000-8000-000000000001','late','late',clock_timestamp()+interval '1 hour')->>'state','STALE','late writer fenced');
select is(claim_zalo_registration_attempt(880925002,2,'123456789','987654321')->>'state','ZALO_CREDENTIAL_CHANGED','unverified OA cannot send');
select zalo_credential_command('VERIFY','123456789','987654321',2);
savepoint eligibility;
update registration_zalo_phone_consents set revoked_at=clock_timestamp() where application_id='aa920000-0000-4000-8000-000000000051';
select is(claim_zalo_registration_attempt(880925002,2,'123456789','987654321')->>'state','NO_CONSENT','revoked consent blocks retry');
rollback to eligibility;
savepoint eligibility;
update registration_zalo_phone_consents set normalized_phone='84911111111' where application_id='aa920000-0000-4000-8000-000000000051';
select is(claim_zalo_registration_attempt(880925002,2,'123456789','987654321')->>'state','WRONG_RECIPIENT','changed recipient blocks retry');
rollback to eligibility;
savepoint eligibility;
update notification_jobs set payload=jsonb_set(payload,'{parameters,payment_status}','"Đã nhận cọc 50%"'::jsonb) where id=(select job from fixture);
select is(claim_zalo_registration_attempt(880925002,2,'123456789','987654321')->>'state','PAYLOAD_REJECTED','old pilot deposit text rejected for FULL');
rollback to eligibility;
savepoint eligibility;
update notification_templates set enabled=false,status='DISABLED' where template_key='ZALO_REGISTRATION_CONFIRMED';
select is(claim_zalo_registration_attempt(880925002,2,'123456789','987654321')->>'state','GATE_DISABLED','disabled template rejected');
rollback to eligibility;
select is(claim_zalo_registration_recovery((select job from fixture),1,880925002,2,'123456789','987654321')->>'state','STALE_ACTION','wrong expected count cannot claim');
select is(claim_zalo_registration_recovery((select job from fixture),0,880925002,2,'123456789','987654321')->>'state','CLAIMED','eligible claim creates durable attempt');
select is((select count(*)::int from zalo_notification_attempts where job_id=(select job from fixture)),1,'one durable attempt before network');
select is((select attempts from notification_jobs where id=(select job from fixture)),0,'reservation does not consume retry allowance');
select is(start_zalo_recovery_outbound((select id from zalo_notification_attempts where job_id=(select job from fixture))),'STARTED','outbound boundary increments attempt');
select isnt(claim_zalo_registration_attempt(880925002,2,'123456789','987654321')->>'state','CLAIMED','concurrent manual/worker cannot double-claim');
select is(finish_zalo_registration_attempt((select id from zalo_notification_attempts where job_id=(select job from fixture)),'REJECTED',200,-100,null,'ZALO_PROVIDER_-100'),'INVALID','unknown provider code cannot prove rejection');
select is(finish_zalo_registration_attempt((select id from zalo_notification_attempts where job_id=(select job from fixture)), 'REJECTED',200,-124,null,'ZALO_TOKEN_INVALID'),'REJECTED','explicit rejection persisted');
select set_config('request.jwt.claim.sub','aa920000-0000-4000-8000-000000000002',true);
select is(prepare_zalo_registration_retry((select job from fixture))->>'state','QUEUED','one rejected job eligible for manual recovery');
select is(claim_zalo_registration_recovery((select job from fixture),0,880925002,2,'123456789','987654321')->>'state','STALE_ACTION','stale double click after rejection cannot resend');
select is(claim_zalo_registration_attempt(880925002,2,'123456789','987654321')->>'state','CLAIMED','recovery claims existing job');
savepoint uncertain;
select is(finish_zalo_registration_attempt((select id from zalo_notification_attempts where job_id=(select job from fixture) and attempt_number=2),'UNKNOWN',null,null,null,'ZALO_ACCEPTANCE_UNKNOWN'),'UNKNOWN','timeout persisted as unknown');
select is(prepare_zalo_registration_retry((select job from fixture))->>'state','ZALO_RETRY_DENIED','unknown without message ID cannot resend');
rollback to uncertain;
select is(finish_zalo_registration_attempt((select id from zalo_notification_attempts where job_id=(select job from fixture) and attempt_number=2),'ACCEPTED',200,0,'synthetic-msg',null),'ACCEPTED','acceptance recorded separately');
select is(prepare_zalo_registration_retry((select job from fixture))->>'state','ZALO_RETRY_DENIED','accepted cannot resend');
select ok(confirm_zalo_owner_receipt((select job from fixture)),'owner confirmation recorded separately');
select ok((select delivered_at is null from notification_jobs where id=(select job from fixture)),'owner confirmation does not fabricate delivery webhook');
select is(record_zalo_phone_delivery('synthetic-msg',replace((select job from fixture)::text,'-',''),'84987654321','987654321','1790442000000'),'DELIVERED','correlated delivery confirmed');
select is(record_zalo_phone_delivery('synthetic-msg',replace((select job from fixture)::text,'-',''),'84987654321','987654321','1790442000000'),'IDEMPOTENT','duplicate delivery idempotent');
select is(prepare_zalo_registration_retry((select job from fixture))->>'state','ZALO_RETRY_DENIED','delivered cannot resend');
select is((select count(*)::int from notification_jobs where entity_id='aa920000-0000-4000-8000-000000000051'),1,'recovery retains original job');
select ok(not has_function_privilege('authenticated','public.zalo_credential_command(text,text,text,bigint,uuid,text,text,timestamptz,text)','execute'),'authenticated cannot read token RPC');
select ok(not has_table_privilege('service_role','notification_private.zalo_credentials','select'),'tokens only through service command');
select ok(not has_function_privilege('anon','public.prepare_zalo_registration_retry(uuid)','execute'),'anonymous cannot retry');
select * from finish();
rollback;
