begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('de992000-0000-4000-8000-000000000001'),
  ('de992000-0000-4000-8000-000000000002'),
  ('de992000-0000-4000-8000-000000000003'),
  ('de992000-0000-4000-8000-000000000021');
insert into profiles(id, full_name, status) values
  ('de992000-0000-4000-8000-000000000001', 'Zalo Admin Reader', 'ACTIVE'),
  ('de992000-0000-4000-8000-000000000002', 'Zalo Branch Reader', 'ACTIVE'),
  ('de992000-0000-4000-8000-000000000003', 'Zalo Other Branch', 'ACTIVE'),
  ('de992000-0000-4000-8000-000000000021', 'Phụ huynh Zalo', 'ACTIVE');
insert into user_roles(user_id, role_id)
select 'de992000-0000-4000-8000-000000000001', id from roles where code = 'SUPER_ADMIN';
insert into branches(id, code, name) values
  ('de992000-0000-4000-8000-000000000011', 'ZALO-UI-A', 'Chi nhánh Zalo A'),
  ('de992000-0000-4000-8000-000000000012', 'ZALO-UI-B', 'Chi nhánh Zalo B');
insert into user_roles(user_id, role_id, branch_id)
select 'de992000-0000-4000-8000-000000000002', id, 'de992000-0000-4000-8000-000000000011' from roles where code = 'BRANCH_ADMIN';
insert into user_roles(user_id, role_id, branch_id)
select 'de992000-0000-4000-8000-000000000003', id, 'de992000-0000-4000-8000-000000000012' from roles where code = 'BRANCH_ADMIN';
insert into parents(id, user_id, parent_code, status) values
  ('de992000-0000-4000-8000-000000000021', 'de992000-0000-4000-8000-000000000021', 'ZALO-UI-PAR', 'ACTIVE');
insert into students(id, student_code, full_name, default_branch_id) values
  ('de992000-0000-4000-8000-000000000022', 'ZALO-UI-STU', 'Học viên Zalo', 'de992000-0000-4000-8000-000000000011');
select set_config('registration.write', 'on', true);
insert into registration_applications(id, application_code, branch_id, student_name, created_by) values
  ('de992000-0000-4000-8000-000000000031', 'DK-ZALO-UI', 'de992000-0000-4000-8000-000000000011', 'Học viên đăng ký', 'de992000-0000-4000-8000-000000000001'),
  ('de992000-0000-4000-8000-000000000032', 'DK-ZALO-NONE', 'de992000-0000-4000-8000-000000000011', 'Chưa liên kết', 'de992000-0000-4000-8000-000000000001');
select set_config('registration.write', '', true);

insert into integration_webhook_events(
  provider, external_event_id, event_type, received_at, processed_at, status, payload, payload_digest, verification_result, processing_error
) values
  ('ZALO', 'evt-today-pending', 'user_send_text', clock_timestamp(), null, 'ACCEPTED', '{}', '1111111111111111111111111111111111111111111111111111111111111111', 'VALID', null),
  ('ZALO', 'evt-today-done', 'user_send_image', clock_timestamp(), clock_timestamp(), 'ACCEPTED', '{}', '2222222222222222222222222222222222222222222222222222222222222222', 'VALID', null),
  ('ZALO', 'evt-today-failed', 'user_send_file', clock_timestamp(), null, 'ACCEPTED', '{}', '3333333333333333333333333333333333333333333333333333333333333333', 'VALID', 'timeout'),
  ('ZALO', null, 'unknown_event', clock_timestamp() - interval '2 days', null, 'UNSUPPORTED', '{}', '4444444444444444444444444444444444444444444444444444444444444444', 'VALID', null);

insert into customer_channel_links(
  provider, provider_user_id, external_link_key, registration_application_id, status, linked_at, consent_at, last_verified_at
) values (
  'ZALO', '4520912928458797001', 'reg-link-zalo-ui-001', 'de992000-0000-4000-8000-000000000031',
  'ACTIVE', clock_timestamp(), clock_timestamp(), clock_timestamp()
);
insert into customer_channel_links(
  provider, provider_user_id, external_link_key, parent_id, status
) values (
  'ZALO', '4520912928458797002', 'parent-link-zalo-ui-01', 'de992000-0000-4000-8000-000000000021', 'PENDING'
);
insert into customer_channel_links(
  provider, provider_user_id, external_link_key, student_id, status, linked_at
) values (
  'ZALO', '4520912928458797003', 'student-link-zalo-ui-1', 'de992000-0000-4000-8000-000000000022',
  'REVOKED', clock_timestamp()
);

select ok(not has_function_privilege('anon', 'public.zalo_integration_overview()', 'EXECUTE'), 'Anonymous cannot read the Zalo overview');
select ok(not has_function_privilege('anon', 'public.zalo_recent_events(integer)', 'EXECUTE'), 'Anonymous cannot read Zalo events');
select ok(not has_function_privilege('anon', 'public.zalo_linked_customers()', 'EXECUTE'), 'Anonymous cannot read Zalo customers');
select ok(not has_function_privilege('anon', 'public.registration_zalo_connection(uuid)', 'EXECUTE'), 'Anonymous cannot read a registration Zalo status');
select ok(not has_function_privilege('service_role', 'public.zalo_linked_customers()', 'EXECUTE'), 'Webhook credential cannot list linked customers');
select ok(not has_table_privilege('authenticated', 'public.integration_webhook_events', 'UPDATE'), 'Browser role still cannot update webhook events');
select ok(not has_table_privilege('authenticated', 'public.integration_webhook_events', 'DELETE'), 'Browser role still cannot delete webhook events');
select ok(not has_column_privilege('authenticated', 'public.integration_webhook_events', 'payload', 'SELECT'), 'Raw payload stays hidden');
select ok(strpos(pg_get_function_result('public.zalo_recent_events(integer)'::regprocedure), 'payload') = 0, 'Event history does not return the payload');
select ok(strpos(pg_get_function_result('public.registration_zalo_connection(uuid)'::regprocedure), 'provider_user_id') = 0, 'Registration status does not return the Zalo user id');
select ok(strpos(pg_get_function_result('public.zalo_linked_customers()'::regprocedure), 'provider_user_id') = 0, 'Customer list does not return the Zalo user id');
select ok(strpos(pg_get_functiondef('public.zalo_linked_customers()'::regprocedure), 'phone') = 0, 'Customer labels are not resolved from a phone number');

select set_config('request.jwt.claim.sub', 'de992000-0000-4000-8000-000000000002', true);
select throws_ok($$select * from zalo_integration_overview()$$, 'P0001', 'Unauthorized', 'Branch admin cannot open the integration overview');
select throws_ok($$select * from zalo_recent_events(20)$$, 'P0001', 'Unauthorized', 'Branch admin cannot list webhook events');
select throws_ok($$select * from zalo_linked_customers()$$, 'P0001', 'Unauthorized', 'Branch admin cannot list every Zalo customer');
select is(
  (select link_status from registration_zalo_connection(p_application => 'de992000-0000-4000-8000-000000000031')),
  'ACTIVE',
  'Branch registration reader sees an active Zalo connection'
);
select is(
  (select masked_user_id from registration_zalo_connection(p_application => 'de992000-0000-4000-8000-000000000031')),
  null::text,
  'Branch reader never receives even the masked provider identity'
);
select is(
  (select link_status from registration_zalo_connection(p_application => 'de992000-0000-4000-8000-000000000032')),
  'NONE',
  'Registration without a channel is not connected'
);
select is(
  (select count(*) from registration_zalo_connection('de992000-0000-4000-8000-000000000099')),
  0::bigint,
  'Unknown registration returns no status'
);

select set_config('request.jwt.claim.sub', 'de992000-0000-4000-8000-000000000003', true);
select is(
  (select count(*) from registration_zalo_connection('de992000-0000-4000-8000-000000000031')),
  0::bigint,
  'Another branch cannot read this registration Zalo status'
);

select set_config('request.jwt.claim.sub', 'de992000-0000-4000-8000-000000000001', true);
select is((select total_events from zalo_integration_overview()), 4::bigint, 'Overview counts every stored event');
select is((select events_today from zalo_integration_overview()), 3::bigint, 'Overview counts events received today');
select is((select accepted_events from zalo_integration_overview()), 3::bigint, 'Overview counts accepted events');
select is((select pending_events from zalo_integration_overview()), 2::bigint, 'Overview counts events still waiting');
select is((select failed_events from zalo_integration_overview()), 1::bigint, 'Overview counts events with a processing error');
select is((select count(*) from zalo_recent_events(20)), 4::bigint, 'Recent events return metadata only');
select is((select processing_state from zalo_recent_events(20) where external_event_id = 'evt-today-failed'), 'FAILED', 'A processing error is a failed state');
select is((select processing_error from zalo_recent_events(20) where external_event_id = 'evt-today-failed'), 'timeout', 'The operational error text is available to super admin');
select is((select count(*) from zalo_linked_customers()), 3::bigint, 'Linked customers include registration, parent, and student');
select is(
  (select display_label from zalo_linked_customers() where entity_type = 'REGISTRATION'),
  'Học viên đăng ký',
  'Registration label uses the student name'
);
select is(
  (select branch_name from zalo_linked_customers() where entity_type = 'REGISTRATION'),
  'Chi nhánh Zalo A',
  'Registration label keeps its branch'
);
select is(
  (select display_label from zalo_linked_customers() where entity_type = 'PARENT'),
  'Phụ huynh Zalo',
  'Parent label uses the profile name'
);
select is(
  (select link_status from zalo_linked_customers() where entity_type = 'STUDENT'),
  'REVOKED',
  'A revoked student link stays visible as revoked'
);
select throws_ok($$select zalo_recent_events(0)$$, 'P0001', 'Limit out of range', 'Event history refuses an empty page');

select * from finish();
rollback;
