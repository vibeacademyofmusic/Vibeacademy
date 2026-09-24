begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into public.branches(id, code, name) values
('e9200000-0000-4000-8000-000000000001', 'MOMO-T', 'MoMo test');
insert into auth.users(id) values ('e9200000-0000-4000-8000-000000000002');
insert into public.profiles(id, full_name, status) values
('e9200000-0000-4000-8000-000000000002', 'MoMo Admin', 'ACTIVE');
insert into public.user_roles(user_id, role_id)
select 'e9200000-0000-4000-8000-000000000002', id
from public.roles where code = 'SUPER_ADMIN';
insert into public.tuition_plans(id, code, name, duration_months) values
('e9200000-0000-4000-8000-000000000010', 'MOMO-P', 'MoMo tuition', 3);
insert into public.tuition_plan_branch_prices(id, tuition_plan_id, branch_id, list_price, currency)
values('e9200000-0000-4000-8000-000000000011',
  'e9200000-0000-4000-8000-000000000010',
  'e9200000-0000-4000-8000-000000000001', 1000001, 'VND');
select set_config('request.jwt.claim.sub', 'e9200000-0000-4000-8000-000000000002', true);

select lives_ok($$select public.create_registration_application(
  'e9200000-0000-4000-8000-000000000003',
  'e9200000-0000-4000-8000-000000000001', null,
  'MoMo Student', '2015-01-01', 'MoMo Parent', '0901000000',
  'Piano', 'Piano', null, null)$$, 'create pending student application');
select lives_ok($$select public.transition_registration_application(
  'e9200000-0000-4000-8000-000000000004',
  'e9200000-0000-4000-8000-000000000003', 1, 'SUBMIT')$$, 'submit');
select lives_ok($$select public.transition_registration_application(
  'e9200000-0000-4000-8000-000000000005',
  'e9200000-0000-4000-8000-000000000003', 2, 'VERIFY')$$, 'verify');
select lives_ok($$select public.set_registration_deposit_quote(
  'e9200000-0000-4000-8000-000000000003', 3,
  'e9200000-0000-4000-8000-000000000010')$$, 'quote tuition');
select is((select deposit_due from public.registration_deposit_terms
  where application_id = 'e9200000-0000-4000-8000-000000000003'),
  500001::bigint, '50 percent deposit rounds upward to a whole VND');
select is((select count(*) from public.students where full_name = 'MoMo Student'),
  0::bigint, 'no student before payment');
select lives_ok($$select public.reserve_registration_momo_order(
  'e9200000-0000-4000-8000-000000000003',
  'e9200000-0000-4000-8000-000000000006', 3, 490000)$$, 'reserve partial order');
select throws_ok($$select public.record_verified_momo_ipn(
  'VIBEE9200000000040008000000000000006', 'TEST', '100', 490000, 0)$$,
  'P0001', 'MOMO_SERVER_ONLY', 'client cannot post verified payment');

select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.activate_registration_momo_order(
  'VIBEE9200000000040008000000000000006', 'TEST', 490000,
  'https://test-payment.momo.vn/pay/test')$$, 'activate test checkout');
select throws_ok($$select public.record_verified_momo_ipn(
  'VIBEE9200000000040008000000000000006', 'TEST', '100', 489999, 0)$$,
  'P0001', 'MOMO_ORDER_MISMATCH', 'wrong amount cannot activate registration');
select is((select public.record_verified_momo_ipn(
  'VIBEE9200000000040008000000000000006', 'TEST', '100', 490000, 0)),
  'PARTIAL_DEPOSIT', '49 percent does not complete registration');
select is((select count(*) from public.students where full_name = 'MoMo Student'),
  0::bigint, 'no student before deposit threshold');
select is((select public.record_verified_momo_ipn(
  'VIBEE9200000000040008000000000000006', 'TEST', '100', 490000, 0)),
  'ALREADY_PAID', 'same IPN is idempotent');
select lives_ok($$select public.reserve_registration_momo_order(
  'e9200000-0000-4000-8000-000000000003',
  'e9200000-0000-4000-8000-000000000007', 4, 10001)$$, 'reserve remaining deposit');
select lives_ok($$select public.activate_registration_momo_order(
  'VIBEE9200000000040008000000000000007', 'TEST', 10001,
  'https://test-payment.momo.vn/pay/test2')$$, 'activate second checkout');
select is((select public.record_verified_momo_ipn(
  'VIBEE9200000000040008000000000000007', 'TEST', '101', 10001, 0)),
  'COMPLETED', '50 percent completes once');
select is((select count(*) from public.students where full_name = 'MoMo Student'),
  1::bigint, 'one student');
select is((select count(*) from public.student_placement_cases where
  registration_application_id = 'e9200000-0000-4000-8000-000000000003'),
  1::bigint, 'one waiting placement');
select is((select count(*) from public.payments where reference in ('MOMO:100', 'MOMO:101')),
  2::bigint, 'one financial receipt for each distinct transaction');
select * from finish();
rollback;
