begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- =========================================================
-- FIXTURES
-- =========================================================

insert into auth.users(id) values
  ('a1100000-0000-4000-8000-000000000001'),
  ('a1100000-0000-4000-8000-000000000002'),
  ('a1100000-0000-4000-8000-000000000003'),
  ('a1100000-0000-4000-8000-000000000004'),
  ('a1100000-0000-4000-8000-000000000005');

insert into public.profiles(id, full_name, status) values
  ('a1100000-0000-4000-8000-000000000001', 'Z1 Admin', 'ACTIVE'),
  ('a1100000-0000-4000-8000-000000000002', 'Z1 Parent A', 'ACTIVE'),
  ('a1100000-0000-4000-8000-000000000003', 'Z1 Parent B', 'ACTIVE'),
  ('a1100000-0000-4000-8000-000000000004', 'Z1 Parent No Finance', 'ACTIVE'),
  ('a1100000-0000-4000-8000-000000000005', 'Z1 Parent Other Student', 'ACTIVE');

insert into public.user_roles(user_id, role_id)
select 'a1100000-0000-4000-8000-000000000001', id from public.roles where code = 'SUPER_ADMIN';
insert into public.user_roles(user_id, role_id)
select uid, id from (values
  ('a1100000-0000-4000-8000-000000000002'::uuid),
  ('a1100000-0000-4000-8000-000000000003'::uuid),
  ('a1100000-0000-4000-8000-000000000004'::uuid),
  ('a1100000-0000-4000-8000-000000000005'::uuid)
) as u(uid)
cross join public.roles where code = 'PARENT';

insert into public.branches(id, code, name) values
  ('a1200000-0000-4000-8000-000000000001', 'Z1-PAY', 'Z1 Payment Branch');

insert into public.students(id, student_code, full_name, default_branch_id, phone) values
  ('a1300000-0000-4000-8000-000000000001', 'Z1-STU-A', 'Z1 Student A', 'a1200000-0000-4000-8000-000000000001', '0901111001'),
  ('a1300000-0000-4000-8000-000000000002', 'Z1-STU-B', 'Z1 Student B', 'a1200000-0000-4000-8000-000000000001', '0901111002');

insert into public.parents(id, user_id, parent_code, status) values
  ('a1400000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000002', 'Z1-PAR-A', 'ACTIVE'),
  ('a1400000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000003', 'Z1-PAR-B', 'ACTIVE'),
  ('a1400000-0000-4000-8000-000000000003', 'a1100000-0000-4000-8000-000000000004', 'Z1-PAR-NF', 'ACTIVE'),
  ('a1400000-0000-4000-8000-000000000004', 'a1100000-0000-4000-8000-000000000005', 'Z1-PAR-X', 'ACTIVE');

insert into public.student_parents(student_id, parent_id, can_view_finance, is_active) values
  ('a1300000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', true, true),
  ('a1300000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000002', true, true),
  ('a1300000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000003', false, true),
  ('a1300000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000004', true, true);

select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$select public.link_customer_channel('ZALO', '111111111111111111', 'z1-link-a', null, 'a1400000-0000-4000-8000-000000000001', null, timestamptz '2026-09-23 10:00:00+07')$$,
  'link parent A Zalo'
);
select lives_ok(
  $$select public.link_customer_channel('ZALO', '222222222222222222', 'z1-link-b', null, 'a1400000-0000-4000-8000-000000000002', null, timestamptz '2026-09-23 10:00:00+07')$$,
  'link parent B Zalo'
);
select lives_ok(
  $$select public.link_customer_channel('ZALO', '333333333333333333', 'z1-link-nf', null, 'a1400000-0000-4000-8000-000000000003', null, timestamptz '2026-09-23 10:00:00+07')$$,
  'link no-finance parent Zalo'
);
select lives_ok(
  $$select public.link_customer_channel('ZALO', '444444444444444444', 'z1-link-x', null, 'a1400000-0000-4000-8000-000000000004', null, timestamptz '2026-09-23 10:00:00+07')$$,
  'link other-student parent Zalo'
);

-- =========================================================
-- Z1-DB01 / Z1-DB02 / Z1-DB03 template registry
-- =========================================================

select ok(
  exists(
    select 1 from public.notification_templates
    where template_key = 'ZALO_PAYMENT_RECEIVED'
      and provider = 'ZALO'
      and event_type = 'TUITION_PAYMENT_RECEIVED'
  ),
  'Z1-DB01 template row exists for ZALO'
);

reset role;
select throws_ok(
  $$insert into public.notification_templates(
    template_key, provider, provider_template_id, status, version, description, parameter_schema, payload_schema, enabled
  ) values (
    'ZALO_BAD_PROVIDER', 'SMS', null, 'DRAFT', 1, 'bad', '[]'::jsonb, '{}'::jsonb, false
  )$$,
  '23514',
  null,
  'Z1-DB02 invalid provider rejected'
);

select is(
  notification_private.zalo_payment_ready('ZALO_PAYMENT_RECEIVED'),
  false,
  'Z1-DB03 disabled / pending template is not send-ready'
);

select throws_ok(
  $$update public.notification_templates
    set enabled = true, status = 'PENDING', provider_template_id = 'fake-id'
    where template_key = 'ZALO_PAYMENT_RECEIVED'$$,
  '23514',
  null,
  'Z1-DB03 enabled without APPROVED is rejected'
);

select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);
set local role authenticated;

-- =========================================================
-- Z1-DB04 POSTED accepted + fan-out
-- =========================================================

select lives_ok(
  $$select public.create_payment(
    'a1300000-0000-4000-8000-000000000001',
    'a1200000-0000-4000-8000-000000000001',
    1500000,
    'VND',
    'CASH',
    timestamptz '2026-09-23 11:00:00+07',
    'Z1-POSTED-1',
    'Z1 posted payment'
  )$$,
  'Z1-DB04 create POSTED payment'
);

select is(
  (
    select count(*)::integer
    from public.notification_jobs
    where entity_type = 'TUITION_PAYMENT_RECEIVED'
      and entity_id = (select id from public.payments where reference = 'Z1-POSTED-1')
      and channel = 'ZALO'
      and status = 'PENDING'
  ),
  2,
  'Z1-DB04 / Z1-DB07 two eligible parents produce two distinct recipient jobs'
);

select is(
  (
    select count(distinct channel_link_id)::integer
    from public.notification_jobs
    where entity_id = (select id from public.payments where reference = 'Z1-POSTED-1')
      and status = 'PENDING'
  ),
  2,
  'Z1-DB07 jobs use distinct channel links'
);

select is(
  (
    select count(*)::integer
    from public.notification_jobs j
    join public.customer_channel_links c on c.id = j.channel_link_id
    where j.entity_id = (select id from public.payments where reference = 'Z1-POSTED-1')
      and c.parent_id = 'a1400000-0000-4000-8000-000000000003'
  ),
  0,
  'Z1-DB09 recipient without finance eligibility rejected'
);

select is(
  (
    select count(*)::integer
    from public.notification_jobs j
    join public.customer_channel_links c on c.id = j.channel_link_id
    where j.entity_id = (select id from public.payments where reference = 'Z1-POSTED-1')
      and c.parent_id = 'a1400000-0000-4000-8000-000000000004'
  ),
  0,
  'Z1-DB10 cross-student parent link rejected'
);

-- =========================================================
-- Z1-DB06 idempotency
-- =========================================================

select is(
  public.enqueue_tuition_payment_received((select id from public.payments where reference = 'Z1-POSTED-1')),
  0,
  'Z1-DB06 replay creates no additional jobs'
);

select is(
  (
    select count(*)::integer
    from public.notification_jobs
    where entity_id = (select id from public.payments where reference = 'Z1-POSTED-1')
  ),
  2,
  'Z1-DB06 still exactly two jobs after replay'
);

-- =========================================================
-- Z1-DB05 VOIDED rejected
-- =========================================================

select lives_ok(
  $$select public.create_payment(
    'a1300000-0000-4000-8000-000000000001',
    'a1200000-0000-4000-8000-000000000001',
    500000,
    'VND',
    'CASH',
    timestamptz '2026-09-23 12:00:00+07',
    'Z1-VOID-SRC',
    'to void'
  )$$,
  'create payment later voided'
);

reset role;
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);

-- Force VOIDED snapshot without going through approval workflow for source-contract check.
update public.payments
set status = 'VOIDED',
    voided_at = now(),
    voided_by = 'a1100000-0000-4000-8000-000000000001',
    void_reason = 'Z1 void fixture'
where reference = 'Z1-VOID-SRC';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);

select is(
  public.enqueue_tuition_payment_received((select id from public.payments where reference = 'Z1-VOID-SRC')),
  0,
  'Z1-DB05 VOIDED payment rejected by enqueue'
);

-- =========================================================
-- Z1-DB08 no eligible Zalo link does not rollback payment
-- =========================================================

select lives_ok(
  $$select public.create_payment(
    'a1300000-0000-4000-8000-000000000002',
    'a1200000-0000-4000-8000-000000000001',
    750000,
    'VND',
    'CASH',
    timestamptz '2026-09-23 13:00:00+07',
    'Z1-NO-LINK',
    'student B parent has no finance+zalo combo for student A path; revoke link'
  )$$,
  'create payment for student with only one parent'
);

-- Revoke the only Zalo link for student B's parent, then enqueue again via clear jobs path.
reset role;
update public.customer_channel_links
set status = 'REVOKED', linked_at = null, consent_at = null
where parent_id = 'a1400000-0000-4000-8000-000000000004';
delete from public.notification_events
where job_id in (
  select id from public.notification_jobs
  where entity_id = (select id from public.payments where reference = 'Z1-NO-LINK')
);
delete from public.notification_jobs
where entity_id = (select id from public.payments where reference = 'Z1-NO-LINK');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);

select is(
  public.enqueue_tuition_payment_received((select id from public.payments where reference = 'Z1-NO-LINK')),
  1,
  'Z1-DB08 no-link records deterministic skipped job'
);

select is(
  (
    select status
    from public.payments
    where reference = 'Z1-NO-LINK'
  ),
  'POSTED',
  'Z1-DB08 payment remains POSTED'
);

select is(
  (
    select status || ':' || error_code
    from public.notification_jobs
    where entity_id = (select id from public.payments where reference = 'Z1-NO-LINK')
  ),
  'SKIPPED_NO_CHANNEL:ZALO_RECIPIENT_NOT_LINKED',
  'Z1-DB08 typed ZALO_RECIPIENT_NOT_LINKED without rollback'
);

-- =========================================================
-- Z1-DB11 / Z1-DB12 access control
-- =========================================================

reset role;
set local role anon;
select throws_ok(
  $$select * from public.notification_templates$$,
  '42501',
  null,
  'Z1-DB11 anon template management denied'
);

reset role;
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000002', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.notification_templates),
  0,
  'Z1-DB12 unauthorized role denied template read'
);

select throws_ok(
  $$select public.enqueue_tuition_payment_received((select id from public.payments where reference = 'Z1-POSTED-1'))$$,
  'P0001',
  'Unauthorized',
  'Z1-DB12 unauthorized role denied enqueue'
);

-- Fail-closed: Zalo complete cannot mark SENT while template not ready
reset role;
select set_config('request.jwt.claim.sub', 'a1100000-0000-4000-8000-000000000001', true);

create temp table z1_claim as
select * from public.claim_notification((
  select id from public.notification_jobs
  where entity_id = (select id from public.payments where reference = 'Z1-POSTED-1')
  order by created_at
  limit 1
));

select throws_ok(
  $$select public.complete_notification(id, lease_token, 'fake-receipt') from z1_claim$$,
  'P0001',
  'Live Zalo send is disabled',
  'provider disabled never reports SENT'
);

select lives_ok(
  $$select public.complete_notification(id, lease_token, null, 'ZALO_OUTBOUND_NOT_CONFIGURED') from z1_claim$$,
  'ZALO_OUTBOUND_NOT_CONFIGURED is accepted'
);

select is(
  (select status from public.notification_jobs where id = (select id from z1_claim)),
  'FAILED',
  'Zalo outbound remains FAILED not SENT'
);

select * from finish();
rollback;
