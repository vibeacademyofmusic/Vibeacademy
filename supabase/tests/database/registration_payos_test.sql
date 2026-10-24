begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users(id) values ('e9500000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
('e9500000-0000-4000-8000-000000000002', 'PayOS Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'e9500000-0000-4000-8000-000000000002', id from public.roles where code = 'SUPER_ADMIN';
insert into public.curriculums(id, code, name, status) values
('e9500000-0000-4000-8000-000000000020', 'PAYOS-C', 'Guitar PayOS', 'ACTIVE');
insert into public.curriculum_levels(id, curriculum_id, code, name, sequence_no, status) values
('e9500000-0000-4000-8000-000000000021', 'e9500000-0000-4000-8000-000000000020', 'PAYOS-L', 'Grade 1', 1, 'ACTIVE');
insert into public.curriculum_subjects(id, level_id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status) values
('e9500000-0000-4000-8000-000000000022', 'e9500000-0000-4000-8000-000000000021', 'TECHNIQUE', 'PAYOS-S', 'Technique', 1, true, 'DIRECT_ASSESSMENT', 1, 'ACTIVE');

select set_config('request.jwt.claim.sub', 'e9500000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.create_registration_application_with_academics(
  'e9500000-0000-4000-8000-000000000101',
  (select id from public.branches where code = 'V01'), null,
  'PayOS Student One', '2015-03-03', 'PayOS Parent', '09095550001',
  'e9500000-0000-4000-8000-000000000020',
  'e9500000-0000-4000-8000-000000000021',
  'e9500000-0000-4000-8000-000000000022',
  '2026-10-02', 'CN 09:00');
select public.transition_registration_application('e9500000-0000-4000-8000-000000000102', 'e9500000-0000-4000-8000-000000000101', 1, 'SUBMIT');
select public.transition_registration_application('e9500000-0000-4000-8000-000000000103', 'e9500000-0000-4000-8000-000000000101', 2, 'VERIFY');
select throws_ok($$select public.complete_registration_application('e9500000-0000-4000-8000-000000000109','e9500000-0000-4000-8000-000000000101',3,null,null)$$,
 'P0001','REGISTRATION_PAYMENT_REQUIRED','new academic counter registration cannot complete without verified payment');
select is((select count(*)::int from public.registration_zalo_phone_consents where application_id='e9500000-0000-4000-8000-000000000101'),0,'phone number never creates automatic consent');
select public.set_registration_deposit_quote(
  'e9500000-0000-4000-8000-000000000101', 3,
  (select id from public.tuition_plans where code = 'VIBE_3_MONTHS'),
  'NONE', 0, null, 'DEPOSIT_50');

select is((select amount_due from public.registration_deposit_terms where application_id = 'e9500000-0000-4000-8000-000000000101'),
  2750000::bigint, 'Can Tho three-month deposit threshold is 2750000');

select public.reserve_registration_payos_order('e9500000-0000-4000-8000-000000000101', 'e9500000-0000-4000-8000-000000000201', 3);
select is((select amount from public.registration_payos_orders where id = 'e9500000-0000-4000-8000-000000000201'),
  2750000::bigint, 'payOS order requests the unpaid threshold, not a browser amount');
select public.reserve_registration_payos_order('e9500000-0000-4000-8000-000000000101', 'e9500000-0000-4000-8000-000000000202', 3);
select is((select count(*) from public.registration_payos_orders where application_id = 'e9500000-0000-4000-8000-000000000101'),
  1::bigint, 'repeated reserve does not open a second order');

select throws_ok($$select public.set_registration_deposit_quote(
  'e9500000-0000-4000-8000-000000000101', 3,
  (select id from public.tuition_plans where code = 'VIBE_12_MONTHS'),
  'NONE', 0, null, 'FULL')$$, 'P0001', 'REGISTRATION_QUOTE_DENIED', 'a payOS order locks the quote');

select throws_ok($$select public.record_verified_payos_webhook(1, 'link', 'REF', 2750000, 'VND')$$,
  'P0001', 'PAYOS_SERVER_ONLY', 'staff cannot record a payOS webhook');

select set_config('request.jwt.claim.role', 'service_role', true);
select public.activate_registration_payos_order(
  (select order_code from public.registration_payos_orders where id = 'e9500000-0000-4000-8000-000000000201'),
  2750000, 'link-payos-1', 'https://pay.payos.vn/web/link-payos-1', 'qr');

select throws_ok($$select public.record_verified_payos_webhook(
  (select order_code from public.registration_payos_orders where id = 'e9500000-0000-4000-8000-000000000201'),
  'link-payos-1', 'FIXTURE-UNDER', 2750001, 'VND')$$, 'P0001', 'PAYOS_AMOUNT_MISMATCH', 'amount above the order is rejected');

select is((select public.record_verified_payos_webhook(
  (select order_code from public.registration_payos_orders where id = 'e9500000-0000-4000-8000-000000000201'),
  'link-payos-1', 'FIXTURE-UNDER', 2650000, 'VND')), 'PARTIAL_DEPOSIT', 'below-threshold fixture receipt does not complete registration');
select is((select status from public.registration_applications where id = 'e9500000-0000-4000-8000-000000000101'),
  'PAYMENT_PENDING', 'partial fixture leaves registration incomplete');
select is((select count(*) from public.students where full_name = 'PayOS Student One'), 0::bigint, 'partial fixture creates no student');

select set_config('request.jwt.claim.role', 'authenticated', true);
select public.reserve_registration_payos_order('e9500000-0000-4000-8000-000000000101', 'e9500000-0000-4000-8000-000000000203',
  (select version from public.registration_applications where id = 'e9500000-0000-4000-8000-000000000101'));
select set_config('request.jwt.claim.role', 'service_role', true);
select public.activate_registration_payos_order(
  (select order_code from public.registration_payos_orders where id = 'e9500000-0000-4000-8000-000000000203'),
  100000, 'link-payos-2', 'https://pay.payos.vn/web/link-payos-2', 'qr');
select is((select public.record_verified_payos_webhook(
  (select order_code from public.registration_payos_orders where id = 'e9500000-0000-4000-8000-000000000203'),
  'link-payos-2', 'FIXTURE-REST', 100000, 'VND')), 'COMPLETED', 'reaching the threshold completes registration once');
select is((select public.record_verified_payos_webhook(
  (select order_code from public.registration_payos_orders where id = 'e9500000-0000-4000-8000-000000000203'),
  'link-payos-2', 'FIXTURE-REST', 100000, 'VND')), 'ALREADY_PAID', 'replay does not create another student');

select is((select count(*) from public.students where full_name = 'PayOS Student One'), 1::bigint, 'one student');
select is((select count(*) from public.student_placement_cases where registration_application_id = 'e9500000-0000-4000-8000-000000000101' and status = 'UNASSIGNED'),
  1::bigint, 'one unassigned placement');
select is((select count(*) from public.payments where reference like 'PAYOS:FIXTURE-%'), 2::bigint, 'two fixture receipts, not provider payments');
select is((select count(*) from public.notification_jobs where entity_type = 'REGISTRATION_COMPLETED' and entity_id = 'e9500000-0000-4000-8000-000000000101'),
  1::bigint, 'one registration notification job');

select throws_ok($$select public.record_verified_payos_webhook(999999001, 'missing', 'NOPE', 1000, 'VND')$$,
  'P0001', 'PAYOS_ORDER_UNKNOWN', 'unknown order is not a receipt');

select * from finish();
rollback;
