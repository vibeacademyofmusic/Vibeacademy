begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('de980000-0000-4000-8000-000000000001'),
  ('de980000-0000-4000-8000-000000000002');
insert into profiles(id, full_name, status) values
  ('de980000-0000-4000-8000-000000000001', 'Zalo Link Admin', 'ACTIVE'),
  ('de980000-0000-4000-8000-000000000002', 'Zalo Link Branch', 'ACTIVE');
insert into user_roles(user_id, role_id)
select 'de980000-0000-4000-8000-000000000001', id from roles where code = 'SUPER_ADMIN';
insert into branches(id, code, name) values
  ('de980000-0000-4000-8000-000000000011', 'ZALO-A', 'Zalo branch A'),
  ('de980000-0000-4000-8000-000000000012', 'ZALO-B', 'Zalo branch B');
insert into user_roles(user_id, role_id, branch_id)
select 'de980000-0000-4000-8000-000000000002', id, 'de980000-0000-4000-8000-000000000011'
from roles where code = 'BRANCH_ADMIN';
select set_config('registration.write', 'on', true);
insert into registration_applications(id, application_code, branch_id, parent_name, parent_phone, created_by) values
  ('de980000-0000-4000-8000-000000000031', 'DK-ZALO-LINK-A', 'de980000-0000-4000-8000-000000000011', 'Fixture parent', '0901000001', 'de980000-0000-4000-8000-000000000001'),
  ('de980000-0000-4000-8000-000000000032', 'DK-ZALO-LINK-B', 'de980000-0000-4000-8000-000000000012', 'Other parent', '0901000002', 'de980000-0000-4000-8000-000000000001'),
  ('de980000-0000-4000-8000-000000000033', 'DK-ZALO-LINK-C', 'de980000-0000-4000-8000-000000000011', 'Conflict parent', '0901000003', 'de980000-0000-4000-8000-000000000001');
select set_config('registration.write', '', true);

select set_config('test.students', (select count(*)::text from students), true);
select set_config('test.parents', (select count(*)::text from parents), true);
select set_config('test.enrollments', (select count(*)::text from enrollments), true);
select set_config('test.payments', (select count(*)::text from payments), true);
select set_config('test.jobs', (select count(*)::text from notification_jobs), true);

select ok(
  strpos(pg_get_functiondef('public.apply_zalo_interaction_event(jsonb)'::regprocedure), 'phone') = 0
  and strpos(pg_get_functiondef('public.request_registration_zalo_link(uuid)'::regprocedure), 'phone') = 0,
  'Zalo linking does not match a phone number'
);
select ok(not has_function_privilege('anon', 'public.request_registration_zalo_link(uuid)', 'EXECUTE'), 'Anonymous cannot request a Zalo link');
select ok(not has_function_privilege('authenticated', 'public.apply_zalo_interaction_event(jsonb)', 'EXECUTE'), 'Browser role cannot activate a Zalo link');
select ok(has_function_privilege('service_role', 'public.apply_zalo_interaction_event(jsonb)', 'EXECUTE'), 'Webhook role can apply an interaction event');
select ok(not has_table_privilege('authenticated', 'public.customer_channel_links', 'INSERT'), 'Browser role still cannot insert channel links');

select set_config('request.jwt.claim.sub', 'de980000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select request_registration_zalo_link('de980000-0000-4000-8000-000000000032')$$,
  'P0001', 'Unauthorized', 'Cross-branch Zalo link is denied'
);

select set_config('request.jwt.claim.sub', 'de980000-0000-4000-8000-000000000001', true);
select is(
  (select link_status from registration_zalo_connection('de980000-0000-4000-8000-000000000031')),
  'NONE',
  'Unlinked registration starts unconnected'
);
select is(
  (select external_link_key from request_registration_zalo_link('de980000-0000-4000-8000-000000000031')),
  (select external_link_key from request_registration_zalo_link('de980000-0000-4000-8000-000000000031')),
  'External link key stays stable across reloads'
);
select is(
  (select count(*) from registration_application_events where application_id = 'de980000-0000-4000-8000-000000000031' and event_type = 'ZALO_LINK_REQUESTED'),
  1::bigint,
  'Requesting the same link does not duplicate history'
);
select is(
  (select provider_user_id is null from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'),
  true,
  'Pending link does not guess a Zalo user id'
);
select set_config('test.key', (select external_link_key from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'), true);

select is(
  apply_zalo_interaction_event(jsonb_build_object(
    'event_name', 'widget_interaction_accepted',
    'timestamp', '1543908534747',
    'data', jsonb_build_object('user_id', '246845883529197922', 'user_external_id', current_setting('test.key'))
  )),
  'activated',
  'Verified interaction webhook activates the pending link'
);
select is(
  (select status from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'),
  'ACTIVE',
  'Registration channel link is active'
);
select is(
  (select provider_user_id from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'),
  '246845883529197922',
  'Active link stores the Zalo user id from the webhook'
);
select is(
  (select count(*) from registration_application_events where application_id = 'de980000-0000-4000-8000-000000000031' and event_type = 'ZALO_LINK_CONFIRMED'),
  1::bigint,
  'Consent confirmation is recorded once'
);
select set_config('test.consent', (select consent_at::text from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'), true);
select is(
  apply_zalo_interaction_event(jsonb_build_object(
    'event_name', 'widget_interaction_accepted',
    'timestamp', '1543908534747',
    'data', jsonb_build_object('user_id', '246845883529197922', 'user_external_id', current_setting('test.key'))
  )),
  'idempotent',
  'Repeated interaction webhook is idempotent'
);
select is(
  (select count(*) from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'),
  1::bigint,
  'Repeated webhook does not create a second link'
);
select is(
  (select consent_at::text from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'),
  current_setting('test.consent'),
  'Repeated webhook does not duplicate consent'
);
select is(
  (select masked_user_id from registration_zalo_connection('de980000-0000-4000-8000-000000000031')),
  '••••7922',
  'Super admin sees only a masked Zalo id'
);

select request_registration_zalo_link('de980000-0000-4000-8000-000000000033');
select set_config('test.conflict_key', (select external_link_key from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000033'), true);
select is(
  apply_zalo_interaction_event(jsonb_build_object(
    'event_name', 'widget_interaction_accepted',
    'timestamp', '1543908534747',
    'data', jsonb_build_object('user_id', '246845883529197922', 'user_external_id', current_setting('test.conflict_key'))
  )),
  'review',
  'A Zalo user already linked elsewhere is not overwritten'
);
select is(
  (select provider_user_id from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000031'),
  '246845883529197922',
  'The original registration keeps its Zalo user'
);
select is(
  (select status from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000033'),
  'REVIEW',
  'The conflicting registration stays in review'
);
select is(
  (select provider_user_id is null from customer_channel_links where registration_application_id = 'de980000-0000-4000-8000-000000000033'),
  true,
  'Review does not store the conflicting Zalo user on the second registration'
);

select is((select count(*)::text from students), current_setting('test.students'), 'Linking creates no student');
select is((select count(*)::text from parents), current_setting('test.parents'), 'Linking creates no parent');
select is((select count(*)::text from enrollments), current_setting('test.enrollments'), 'Linking creates no enrollment');
select is((select count(*)::text from payments), current_setting('test.payments'), 'Linking creates no payment');
select is((select count(*)::text from notification_jobs), current_setting('test.jobs'), 'Linking sends no notification');

select * from finish();
rollback;
