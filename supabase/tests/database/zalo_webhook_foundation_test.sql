begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('de990000-0000-4000-8000-000000000001'),
  ('de990000-0000-4000-8000-000000000002');
insert into profiles(id, full_name, status) values
  ('de990000-0000-4000-8000-000000000001', 'Zalo Webhook Admin', 'ACTIVE'),
  ('de990000-0000-4000-8000-000000000002', 'Zalo Webhook Staff', 'ACTIVE');
insert into user_roles(user_id, role_id)
select 'de990000-0000-4000-8000-000000000001', id from roles where code = 'SUPER_ADMIN';
insert into branches(id, code, name) values
  ('de990000-0000-4000-8000-000000000011', 'ZALO-WH', 'Zalo webhook branch');
insert into parents(id, parent_code, status) values
  ('de990000-0000-4000-8000-000000000021', 'ZALO-PAR', 'ACTIVE');
insert into students(id, student_code, full_name, phone) values
  ('de990000-0000-4000-8000-000000000022', 'ZALO-STU', 'Zalo fixture student', '0901234567');
select set_config('registration.write', 'on', true);
insert into registration_applications(
  id, application_code, branch_id, parent_name, parent_phone, created_by
) values (
  'de990000-0000-4000-8000-000000000031',
  'DK-ZALO-FOUNDATION',
  'de990000-0000-4000-8000-000000000011',
  'Fixture parent',
  '0901234567',
  'de990000-0000-4000-8000-000000000001'
);
select set_config('registration.write', '', true);

select set_config('test.students', (select count(*)::text from students), true);
select set_config('test.parents', (select count(*)::text from parents), true);
select set_config('test.enrollments', (select count(*)::text from enrollments), true);
select set_config('test.payments', (select count(*)::text from payments), true);
select set_config('test.jobs', (select count(*)::text from notification_jobs), true);

select ok(
  strpos(pg_get_functiondef('public.record_integration_webhook_event(text,text,text,jsonb,text,boolean)'::regprocedure), 'insert into public.students') = 0
  and strpos(pg_get_functiondef('public.record_integration_webhook_event(text,text,text,jsonb,text,boolean)'::regprocedure), 'insert into public.enrollments') = 0
  and strpos(pg_get_functiondef('public.record_integration_webhook_event(text,text,text,jsonb,text,boolean)'::regprocedure), 'insert into public.payments') = 0
  and strpos(pg_get_functiondef('public.record_integration_webhook_event(text,text,text,jsonb,text,boolean)'::regprocedure), 'customer_channel_links') = 0,
  'Webhook recorder does not create people, enrollment, payment, or channel links'
);
select ok(
  strpos(pg_get_functiondef('public.link_customer_channel(text,text,text,uuid,uuid,uuid,timestamptz)'::regprocedure), 'phone') = 0,
  'Channel link does not use a phone number as identity'
);

select ok(not has_table_privilege('anon', 'public.integration_webhook_events', 'INSERT'), 'Anonymous cannot insert webhook events');
select ok(not has_table_privilege('authenticated', 'public.integration_webhook_events', 'INSERT'), 'Browser role cannot insert webhook events');
select ok(not has_table_privilege('authenticated', 'public.integration_webhook_events', 'UPDATE'), 'Browser role cannot update webhook events');
select ok(not has_table_privilege('authenticated', 'public.integration_webhook_events', 'DELETE'), 'Browser role cannot delete webhook events');
select ok(not has_table_privilege('service_role', 'public.integration_webhook_events', 'INSERT'), 'Service credential cannot insert webhook events directly');
select ok(not has_table_privilege('service_role', 'public.integration_webhook_events', 'UPDATE'), 'Service credential cannot update webhook events directly');
select ok(not has_column_privilege('authenticated', 'public.integration_webhook_events', 'payload', 'SELECT'), 'Raw webhook payload is hidden from the browser role');
select ok(not has_function_privilege('anon', 'public.record_integration_webhook_event(text,text,text,jsonb,text,boolean)', 'EXECUTE'), 'Anonymous cannot record a webhook');
select ok(not has_function_privilege('authenticated', 'public.record_integration_webhook_event(text,text,text,jsonb,text,boolean)', 'EXECUTE'), 'Browser role cannot record a webhook');
select ok(has_function_privilege('service_role', 'public.record_integration_webhook_event(text,text,text,jsonb,text,boolean)', 'EXECUTE'), 'Server role can record a verified webhook');
select ok(not has_function_privilege('service_role', 'public.link_customer_channel(text,text,text,uuid,uuid,uuid,timestamptz)', 'EXECUTE'), 'Webhook credential cannot create a channel link');
select ok(not has_table_privilege('anon', 'public.customer_channel_links', 'INSERT'), 'Anonymous cannot insert channel links');
select ok(not has_table_privilege('authenticated', 'public.customer_channel_links', 'INSERT'), 'Browser role cannot insert channel links directly');

set local role service_role;
select is(
  (select is_duplicate from record_integration_webhook_event(
    'ZALO', '96d3cdf3af150460909', 'user_send_text',
    '{"app_id":"1355275380325944240","event_name":"user_send_text","timestamp":"154390853474"}'::jsonb,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true
  )),
  false,
  'First verified delivery is stored'
);
select is(
  (select is_duplicate from record_integration_webhook_event(
    'ZALO', '96d3cdf3af150460909', 'user_send_text',
    '{"app_id":"1355275380325944240","event_name":"user_send_text","timestamp":"154390853474"}'::jsonb,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true
  )),
  true,
  'Repeated delivery is a duplicate'
);
select is(
  (select event_status from record_integration_webhook_event(
    'ZALO', null, 'not_a_zalo_event',
    '{"event_name":"not_a_zalo_event"}'::jsonb,
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', false
  )),
  'UNSUPPORTED',
  'Unsupported event is stored without business handling'
);
select throws_ok(
  $$select record_integration_webhook_event('ZALO', null, 'user_send_text', '{"access_token":"nope"}'::jsonb, 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', true)$$,
  'P0001', 'Secret material refused', 'Secret material is not stored'
);
reset role;
select is((select count(*) from integration_webhook_events), 2::bigint, 'Duplicate delivery does not create a second event');
select is((select max(attempt_count) from integration_webhook_events), 1, 'Duplicate delivery does not process again');
select is((select status from integration_webhook_events where event_type = 'user_send_text'), 'ACCEPTED', 'Supported event is accepted');
select is((select processed_at from integration_webhook_events where event_type = 'user_send_text'), null, 'Accepted event is not business-processed in the request');
select is((select count(*)::text from students), current_setting('test.students'), 'Recording an event does not create a student');
select is((select count(*)::text from parents), current_setting('test.parents'), 'Recording an event does not create a parent');
select is((select count(*)::text from enrollments), current_setting('test.enrollments'), 'Recording an event does not create an enrollment');
select is((select count(*)::text from payments), current_setting('test.payments'), 'Recording an event does not post a payment');
select is((select count(*)::text from notification_jobs), current_setting('test.jobs'), 'Recording an event does not send a notification');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'de990000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select link_customer_channel('ZALO', '246845883529197922', '552177279717587730', null, 'de990000-0000-4000-8000-000000000021', null, null)$$,
  'P0001', 'Unauthorized', 'Staff without super admin cannot link a channel'
);
select throws_ok(
  $$insert into integration_webhook_events(provider, event_type, payload, payload_digest, verification_result) values ('ZALO', 'user_send_text', '{}', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'VALID')$$,
  '42501', null, 'Direct webhook insert is denied'
);
select set_config('request.jwt.claim.sub', 'de990000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select payload from integration_webhook_events$$,
  '42501', null, 'Super admin cannot read the raw payload column'
);
select is((select count(*) from integration_webhook_events), 2::bigint, 'Super admin can see event metadata');
select is(
  (select link_customer_channel('ZALO', '246845883529197922', '552177279717587730', null, 'de990000-0000-4000-8000-000000000021', null, null)),
  (select link_customer_channel('ZALO', '246845883529197922', '552177279717587730', null, 'de990000-0000-4000-8000-000000000021', null, null)),
  'Repeating a channel link does not create a second row'
);
select is((select count(*) from parents), current_setting('test.parents')::bigint, 'Channel link does not create a parent');
select is((select count(*) from students), current_setting('test.students')::bigint, 'Channel link does not create a student');
select is(
  (select provider_user_id from customer_channel_links where parent_id = 'de990000-0000-4000-8000-000000000021'),
  '246845883529197922',
  'Stored identity is the Zalo user id'
);
select is(
  (select provider_user_id = '0901234567' from customer_channel_links where parent_id = 'de990000-0000-4000-8000-000000000021'),
  false,
  'Parent phone is not stored as the Zalo identity'
);
select lives_ok(
  $$select link_customer_channel('ZALO', '246845883529197922', '552177279717587730', 'de990000-0000-4000-8000-000000000031', null, null, timestamptz '2026-09-22 10:00:00+07')$$,
  'Same Zalo user can be linked explicitly to a registration'
);
select lives_ok(
  $$select link_customer_channel('ZALO', '388613280878808645', '552177279717587731', null, null, 'de990000-0000-4000-8000-000000000022', null)$$,
  'A different Zalo user can be linked to a student'
);
select throws_ok(
  $$select link_customer_channel('ZALO', '999999999999999999', '552177279717587732', null, 'de990000-0000-4000-8000-000000000021', null, null)$$,
  'P0001', 'Channel already linked', 'A parent cannot gain a second active Zalo identity'
);
select throws_ok(
  $$select link_customer_channel('ZALO', '246845883529197922', '552177279717587730', 'de990000-0000-4000-8000-000000000031', 'de990000-0000-4000-8000-000000000021', null, null)$$,
  'P0001', 'Exactly one channel subject', 'A link cannot point at two subjects'
);
select is((select count(*) from customer_channel_links), 3::bigint, 'Three explicit links and no duplicates');
select is((select last_verified_at from customer_channel_links where parent_id = 'de990000-0000-4000-8000-000000000021'), null, 'Link creation does not pretend verification');

select * from finish();
rollback;
