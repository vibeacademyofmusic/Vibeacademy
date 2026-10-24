-- Current Zalo outbound boundary. The former UID-based notification fixture
-- expected a PENDING template and queued every completed registration. The
-- approved 640377 PHONE flow now requires paid order + explicit phone consent;
-- detailed consent/retry tests live in registration_zalo_consent_lifecycle_test.
-- This compatibility test performs no provider request and rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'registration_zalo_phone_consents',
  'explicit registration PHONE consent has a durable table');
select has_table('public', 'zalo_notification_attempts',
  'outbound attempts have a durable audit table');
select is((select status from public.notification_templates
  where template_key = 'ZALO_REGISTRATION_CONFIRMED' and provider = 'ZALO'),
  'APPROVED', 'current registration template is approved in the catalogue');
select is((select provider_template_id from public.notification_templates
  where template_key = 'ZALO_REGISTRATION_CONFIRMED' and provider = 'ZALO'),
  '640377', 'registration PHONE flow uses only its approved template id');
select is((select enabled from public.notification_templates
  where template_key = 'ZALO_REGISTRATION_CONFIRMED' and provider = 'ZALO'),
  false, 'registration outbound starts disabled');

select ok(not has_table_privilege('anon', 'public.notification_jobs', 'INSERT'),
  'anonymous callers cannot fabricate a notification job');
select ok(not has_table_privilege('authenticated', 'public.notification_jobs', 'INSERT'),
  'browser callers cannot fabricate a notification job');
select ok(not has_table_privilege('authenticated', 'public.notification_jobs', 'UPDATE'),
  'browser callers cannot mark delivery');
select ok(not has_function_privilege('authenticated',
  'public.enqueue_domain_notification(text,uuid)', 'EXECUTE'),
  'browser callers cannot enqueue a domain notice directly');
select ok(not has_function_privilege('authenticated',
  'public.settle_outbound_notification(uuid,text)', 'EXECUTE'),
  'browser callers cannot settle legacy Zalo work');
select ok(not has_function_privilege('authenticated',
  'public.claim_zalo_registration_attempt(bigint,bigint,text,text)', 'EXECUTE'),
  'browser callers cannot claim a PHONE send');
select ok(not has_function_privilege('authenticated',
  'public.authorize_zalo_registration_outbound(uuid,boolean)', 'EXECUTE'),
  'browser callers cannot pass the final outbound gate');
select ok(has_function_privilege('service_role',
  'public.claim_zalo_registration_attempt(bigint,bigint,text,text)', 'EXECUTE'),
  'service role may claim a validated PHONE job');
select ok(has_function_privilege('service_role',
  'public.authorize_zalo_registration_outbound(uuid,boolean)', 'EXECUTE'),
  'service role may check the final outbound gate');

select is((select decision from public.preview_zalo_dispatch_decision(-1)),
  'NOT_THIS_APPLICATION', 'unknown order cannot become a sendable job');
select is(public.claim_zalo_registration_attempt(-1, 1, 'synthetic', 'synthetic')->>'state',
  'NOT_THIS_APPLICATION', 'unknown order cannot claim an outbound attempt');
select ok(strpos(pg_get_functiondef(
  'public.preview_zalo_dispatch_decision(bigint)'::regprocedure),
  'registration_zalo_phone_consents') > 0,
  'preflight reads explicit consent rather than a generic Zalo UID link');
select ok(strpos(pg_get_functiondef(
  'public.preview_zalo_dispatch_decision(bigint)'::regprocedure),
  'normalized_recipient') > 0,
  'preflight binds the job to the normalized consent recipient');

select * from finish();
rollback;
