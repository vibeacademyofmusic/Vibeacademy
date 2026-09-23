begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
  ('de990000-0000-4000-8000-000000000001'),
  ('de990000-0000-4000-8000-000000000002');
insert into profiles(id, full_name, status) values
  ('de990000-0000-4000-8000-000000000001', 'Outbound Admin', 'ACTIVE'),
  ('de990000-0000-4000-8000-000000000002', 'Outbound Branch', 'ACTIVE');
insert into user_roles(user_id, role_id)
select 'de990000-0000-4000-8000-000000000001', id from roles where code = 'SUPER_ADMIN';
insert into branches(id, code, name) values
  ('de990000-0000-4000-8000-000000000011', 'OUT-A', 'Outbound branch A'),
  ('de990000-0000-4000-8000-000000000012', 'OUT-B', 'Outbound branch B');
insert into user_roles(user_id, role_id, branch_id)
select 'de990000-0000-4000-8000-000000000002', id, 'de990000-0000-4000-8000-000000000011'
from roles where code = 'BRANCH_ADMIN';
insert into curriculums(id, code, name) values
  ('de990000-0000-4000-8000-000000000021', 'OUT-CURR', 'Outbound curriculum');
insert into curriculum_levels(id, curriculum_id, code, name, sequence_no) values
  ('de990000-0000-4000-8000-000000000022', 'de990000-0000-4000-8000-000000000021', 'OUT-L1', 'Outbound level', 1);
insert into courses(id, curriculum_id, level_id, code, name) values
  ('de990000-0000-4000-8000-000000000023', 'de990000-0000-4000-8000-000000000021', 'de990000-0000-4000-8000-000000000022', 'OUT-COURSE', 'Outbound course');
insert into classes(id, branch_id, course_id, code, name, class_type, capacity, status) values
  ('de990000-0000-4000-8000-000000000024', 'de990000-0000-4000-8000-000000000011', 'de990000-0000-4000-8000-000000000023', 'OUT-CLASS', 'Outbound class', 'GROUP', 10, 'ACTIVE'),
  ('de990000-0000-4000-8000-000000000025', 'de990000-0000-4000-8000-000000000012', 'de990000-0000-4000-8000-000000000023', 'OUT-CLASS-B', 'Other class', 'GROUP', 10, 'ACTIVE');

select set_config('registration.write', 'on', true);
insert into registration_applications(
  id, application_code, branch_id, student_name, student_date_of_birth, parent_name, status, created_by
) values
  ('de990000-0000-4000-8000-000000000051', 'DK-OUT-A', 'de990000-0000-4000-8000-000000000011', 'Học viên thử', date '2015-01-01', 'Phụ huynh thử', 'VERIFIED', 'de990000-0000-4000-8000-000000000001'),
  ('de990000-0000-4000-8000-000000000052', 'DK-OUT-B', 'de990000-0000-4000-8000-000000000012', 'Học viên khác', date '2015-02-02', 'Phụ huynh khác', 'VERIFIED', 'de990000-0000-4000-8000-000000000001');
insert into customer_channel_links(
  provider, provider_user_id, external_link_key, registration_application_id, status, linked_at, consent_at
) values (
  'ZALO', '246845883529197922', 'outlinkkey00000000000000000001',
  'de990000-0000-4000-8000-000000000051', 'ACTIVE', now(), now()
);
select set_config('registration.write', '', true);

insert into students(id, student_code, default_branch_id, full_name) values
  ('de990000-0000-4000-8000-000000000031', 'OUT-STUDENT-A', 'de990000-0000-4000-8000-000000000011', 'Payment Student'),
  ('de990000-0000-4000-8000-000000000032', 'OUT-STUDENT-B', 'de990000-0000-4000-8000-000000000011', 'Partial Student');
insert into enrollments(id, student_id, class_id, enrolled_at, started_at, status) values
  ('de990000-0000-4000-8000-000000000041', 'de990000-0000-4000-8000-000000000031', 'de990000-0000-4000-8000-000000000024', '2026-09-01', '2026-09-01', 'ACTIVE'),
  ('de990000-0000-4000-8000-000000000042', 'de990000-0000-4000-8000-000000000032', 'de990000-0000-4000-8000-000000000024', '2026-09-01', '2026-09-01', 'ACTIVE');
insert into enrollment_tuition(id, enrollment_id, tuition_plan_id, starts_on, amount) values
  ('de990000-0000-4000-8000-000000000081', 'de990000-0000-4000-8000-000000000041', 'a1000000-0000-0000-0000-000000000003', '2026-09-01', 3000000),
  ('de990000-0000-4000-8000-000000000082', 'de990000-0000-4000-8000-000000000042', 'a1000000-0000-0000-0000-000000000003', '2026-09-01', 3000000);
insert into customer_channel_links(
  provider, provider_user_id, external_link_key, student_id, status, linked_at, consent_at
) values (
  'ZALO', '246845883529197923', 'outlinkkey00000000000000000002',
  'de990000-0000-4000-8000-000000000031', 'ACTIVE', now(), now()
);

select ok(
  strpos(lower(pg_get_functiondef('public.enqueue_domain_notification(text,uuid)'::regprocedure)), 'phone') = 0
  and strpos(lower(pg_get_functiondef('notification_private.domain_notice_source(text,uuid)'::regprocedure)), 'phone') = 0
  and strpos(lower(pg_get_functiondef('notification_private.active_zalo_links(uuid,uuid,uuid)'::regprocedure)), 'phone') = 0,
  'Zalo recipient resolution does not match a phone number'
);
select ok(strpos(pg_get_functiondef('notification_private.emit_domain_event()'::regprocedure), 'exception') > 0, 'Notification failure cannot abort the business transaction');
select ok(not has_table_privilege('anon', 'public.notification_jobs', 'INSERT'), 'Anonymous cannot insert a notification job');
select ok(not has_table_privilege('authenticated', 'public.notification_jobs', 'INSERT'), 'Browser role cannot insert a notification job');
select ok(not has_function_privilege('authenticated', 'public.enqueue_domain_notification(text,uuid)', 'EXECUTE'), 'Browser role cannot enqueue a domain notification');
select ok(not has_function_privilege('authenticated', 'public.settle_outbound_notification(uuid,text)', 'EXECUTE'), 'Browser role cannot settle a Zalo send');
select ok(has_function_privilege('service_role', 'public.settle_outbound_notification(uuid,text)', 'EXECUTE'), 'Worker role can record an outbound result');
select is((select provider_template_id is null and enabled = false from notification_templates where template_key = 'ZALO_PAYMENT_CONFIRMED'), true, 'Zalo template id stays empty and disabled');

select set_config('request.jwt.claim.sub', 'de990000-0000-4000-8000-000000000001', true);

select lives_ok($$select public.complete_registration_application('de990000-0000-4000-8000-000000000061', 'de990000-0000-4000-8000-000000000051', 1, null, null)$$, 'registration completion commits');
select lives_ok($$select public.complete_registration_application('de990000-0000-4000-8000-000000000061', 'de990000-0000-4000-8000-000000000051', 1, null, null)$$, 'registration completion replay');
select is((select count(*) from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), 1::bigint, 'registration completed creates one job');
select is((select status from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), 'QUEUED', 'active Zalo link queues the registration notice');
select is((select channel_link_id is not null from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), true, 'queued job keeps the channel link');
select ok(not exists(select 1 from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051' and payload::text like '%246845883529197922%'), 'payload does not copy the Zalo user id');

select lives_ok($$select public.complete_registration_application('de990000-0000-4000-8000-000000000062', 'de990000-0000-4000-8000-000000000052', 1, null, null)$$, 'registration without a channel still completes');
select is((select status from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000052'), 'SKIPPED_NO_CHANNEL', 'missing Zalo link is skipped');
select is((select status from registration_applications where id = 'de990000-0000-4000-8000-000000000052'), 'COMPLETED', 'skipped notice does not roll back registration');

select lives_ok(format(
  'select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 1, %L::uuid, %L::date)',
  'de990000-0000-4000-8000-000000000071',
  'de990000-0000-4000-8000-000000000051',
  'de990000-0000-4000-8000-000000000024',
  public.registration_vietnam_today() + 30
), 'future class assignment commits');
select lives_ok(format(
  'select public.assign_student_placement(%L::uuid, (select id from public.student_placement_cases where registration_application_id = %L::uuid), 1, %L::uuid, %L::date)',
  'de990000-0000-4000-8000-000000000071',
  'de990000-0000-4000-8000-000000000051',
  'de990000-0000-4000-8000-000000000024',
  public.registration_vietnam_today() + 30
), 'class assignment replay');
select is((select count(*) from notification_jobs where entity_type = 'CLASS_ASSIGNED' and entity_id = 'de990000-0000-4000-8000-000000000071'), 1::bigint, 'class assignment creates one job');
select throws_ok(
  $$select public.assign_student_placement('de990000-0000-4000-8000-000000000072', (select id from public.student_placement_cases where registration_application_id = 'de990000-0000-4000-8000-000000000052'), 1, 'de990000-0000-4000-8000-000000000024', public.registration_vietnam_today())$$,
  'P0001', 'PLACEMENT_CLASS_DENIED', 'failed placement does not assign'
);
select is((select count(*) from notification_jobs where entity_type = 'CLASS_ASSIGNED' and entity_id = 'de990000-0000-4000-8000-000000000072'), 0::bigint, 'failed placement creates no job');

select public.create_tuition_invoice('de990000-0000-4000-8000-000000000081', null);
select public.issue_invoice((select id from invoices where enrollment_tuition_id = 'de990000-0000-4000-8000-000000000081'), date '2026-09-15', date '2026-09-30');
select set_config('test.amount', (select total_amount::text from public.invoices where enrollment_tuition_id = 'de990000-0000-4000-8000-000000000081'), true);
select set_config('test.payment', public.create_payment(
  'de990000-0000-4000-8000-000000000031',
  'de990000-0000-4000-8000-000000000011',
  current_setting('test.amount')::numeric, 'VND', 'CASH', timestamptz '2026-09-23 09:00:00+07', 'OUT-PAY', 'Synthetic receipt'
)::text, true);
select public.allocate_payment_to_invoice(
  current_setting('test.payment')::uuid,
  (select id from invoices where enrollment_tuition_id = 'de990000-0000-4000-8000-000000000081'),
  current_setting('test.amount')::numeric
);

select public.create_tuition_invoice('de990000-0000-4000-8000-000000000082', null);
select public.issue_invoice((select id from invoices where enrollment_tuition_id = 'de990000-0000-4000-8000-000000000082'), date '2026-09-15', date '2026-09-30');
select set_config('test.partial', public.create_payment(
  'de990000-0000-4000-8000-000000000032',
  'de990000-0000-4000-8000-000000000011',
  1000000, 'VND', 'CASH', timestamptz '2026-09-23 10:00:00+07', 'OUT-PARTIAL', 'Synthetic partial'
)::text, true);
select public.allocate_payment_to_invoice(
  current_setting('test.partial')::uuid,
  (select id from invoices where enrollment_tuition_id = 'de990000-0000-4000-8000-000000000082'),
  1000000
);

reset role;

select is((select count(*) from notification_jobs where entity_type = 'PAYMENT_CONFIRMED' and entity_id = current_setting('test.payment')::uuid), 1::bigint, 'confirmed payment creates one queued job');
select is(public.enqueue_domain_notification('PAYMENT_CONFIRMED', current_setting('test.payment')::uuid), 0, 'repeated payment event does not duplicate');
select is((select status from notification_jobs where entity_type = 'PAYMENT_CONFIRMED' and entity_id = current_setting('test.payment')::uuid), 'QUEUED', 'payment notice waits for a real sender');
select is((select count(*) from notification_jobs where entity_type = 'PAYMENT_CONFIRMED' and entity_id = current_setting('test.partial')::uuid), 0::bigint, 'partial payment is not a confirmation');
select is(public.settle_outbound_notification((select id from notification_jobs where entity_type = 'PAYMENT_CONFIRMED' and entity_id = current_setting('test.payment')::uuid), 'ZALO_OUTBOUND_NOT_CONFIGURED'), 'FAILED', 'disabled adapter records failure');
select is((select status from payments where id = current_setting('test.payment')::uuid), 'POSTED', 'payment stays confirmed when messaging fails');
select is((select count(*) from notification_jobs where entity_id = current_setting('test.payment')::uuid and status = 'SENT'), 0::bigint, 'disabled adapter never marks SENT');
select throws_ok(
  format('select public.settle_outbound_notification(%L::uuid, null)', (select id from notification_jobs where entity_type = 'PAYMENT_CONFIRMED' and entity_id = current_setting('test.payment')::uuid)),
  'P0001', 'Live Zalo send is disabled', 'empty provider result cannot mark sent'
);

select is(public.settle_outbound_notification((select id from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), 'PROVIDER_TIMEOUT'), 'RETRYING', 'temporary failure retries');
select is(public.settle_outbound_notification((select id from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), 'PROVIDER_TIMEOUT'), 'RETRYING', 'second retry stays bounded');
select is(public.settle_outbound_notification((select id from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), 'PROVIDER_TIMEOUT'), 'RETRYING', 'third retry stays bounded');
select is(public.settle_outbound_notification((select id from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), 'PROVIDER_TIMEOUT'), 'RETRYING', 'fourth retry stays bounded');
select is(public.settle_outbound_notification((select id from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), 'PROVIDER_TIMEOUT'), 'FAILED', 'fifth attempt stops');
select is((select next_attempt_at is null and status = 'FAILED' from notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'de990000-0000-4000-8000-000000000051'), true, 'stopped job has no further attempt');

insert into learning_reports(
  id, student_id, enrollment_id, branch_id, report_type, period_start, period_end, status, draft_data, generated_by
) values (
  'de990000-0000-4000-8000-000000000091',
  'de990000-0000-4000-8000-000000000031',
  'de990000-0000-4000-8000-000000000041',
  'de990000-0000-4000-8000-000000000011',
  'MONTHLY', date '2026-09-01', date '2026-09-30', 'DRAFT', '{}'::jsonb,
  'de990000-0000-4000-8000-000000000001'
);
select is(public.enqueue_domain_notification('LEARNING_REPORT_PUBLISHED', 'de990000-0000-4000-8000-000000000091'), 0, 'unpublished report creates no job');
update learning_reports set
  status = 'APPROVED', snapshot_data = '{"summary":"frozen"}'::jsonb,
  approved_at = now(), approved_by = 'de990000-0000-4000-8000-000000000001'
where id = 'de990000-0000-4000-8000-000000000091';
select is(public.enqueue_domain_notification('LEARNING_REPORT_PUBLISHED', 'de990000-0000-4000-8000-000000000091'), 0, 'approved but unpublished report creates no job');
update learning_reports set status = 'PUBLISHED', sent_at = now() where id = 'de990000-0000-4000-8000-000000000091';
select is((select count(*) from notification_jobs where entity_type = 'LEARNING_REPORT_PUBLISHED' and entity_id = 'de990000-0000-4000-8000-000000000091'), 1::bigint, 'published report creates one job');
select is(public.enqueue_domain_notification('LEARNING_REPORT_PUBLISHED', 'de990000-0000-4000-8000-000000000091'), 0, 'published report is not duplicated');
select ok(not exists(select 1 from notification_jobs where entity_id = 'de990000-0000-4000-8000-000000000091' and (payload ? 'snapshot_data' or payload::text like '%frozen%')), 'report body stays out of the message');
select is((select count(*) from claim_notification((select id from notification_jobs where entity_type = 'LEARNING_REPORT_PUBLISHED' and entity_id = 'de990000-0000-4000-8000-000000000091'))), 0::bigint, 'queued Zalo job is not claimed by the live worker');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'de990000-0000-4000-8000-000000000002', true);
select is((select count(*) from notification_jobs where branch_id = 'de990000-0000-4000-8000-000000000012'), 0::bigint, 'cross-branch notification queue is hidden');
select ok((select count(*) from notification_jobs where branch_id = 'de990000-0000-4000-8000-000000000011') > 0, 'own-branch notification queue is visible');
select throws_ok($$select public.manage_notification((select id from notification_jobs where branch_id = 'de990000-0000-4000-8000-000000000011' limit 1), 'RETRY')$$, 'P0001', 'Unauthorized', 'branch staff cannot retry from another role');

select * from finish();
rollback;
