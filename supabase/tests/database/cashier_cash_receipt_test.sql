begin;
create extension if not exists pgtap;
select no_plan();

insert into public.branches(id, code, name) values
  ('c0a51000-0000-4000-8000-000000000001', 'CASHIER-A', 'Cashier Branch A'),
  ('c0a51000-0000-4000-8000-000000000002', 'CASHIER-B', 'Cashier Branch B');
insert into public.students(id, student_code, default_branch_id, full_name) values
  ('c0a52000-0000-4000-8000-000000000001', 'CASHIER-STU', 'c0a51000-0000-4000-8000-000000000001', 'Synthetic Cashier Student');

insert into auth.users(id) values
  ('c0a53000-0000-4000-8000-000000000001'),
  ('c0a53000-0000-4000-8000-000000000002'),
  ('c0a53000-0000-4000-8000-000000000003'),
  ('c0a53000-0000-4000-8000-000000000004')
on conflict (id) do nothing;
insert into public.profiles(id, status) values
  ('c0a53000-0000-4000-8000-000000000001', 'ACTIVE'),
  ('c0a53000-0000-4000-8000-000000000002', 'ACTIVE'),
  ('c0a53000-0000-4000-8000-000000000003', 'ACTIVE'),
  ('c0a53000-0000-4000-8000-000000000004', 'ACTIVE');

insert into public.user_roles(user_id, role_id, branch_id)
select 'c0a53000-0000-4000-8000-000000000001', id, 'c0a51000-0000-4000-8000-000000000001' from public.roles where code = 'CASHIER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0a53000-0000-4000-8000-000000000002', id, 'c0a51000-0000-4000-8000-000000000001' from public.roles where code = 'BRANCH_ADMIN';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0a53000-0000-4000-8000-000000000003', id, 'c0a51000-0000-4000-8000-000000000002' from public.roles where code = 'CASHIER';
insert into public.user_roles(user_id, role_id, branch_id)
select 'c0a53000-0000-4000-8000-000000000004', id, 'c0a51000-0000-4000-8000-000000000001' from public.roles where code = 'FINANCE';

create function pg_temp.as_user(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;

set local role authenticated;
select pg_temp.as_user('c0a53000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000001','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','CASH',now(),'DESK',null,false)$$,
  'P0001', 'Cash receipt requires physical receipt acknowledgement', 'cash without acknowledgement is denied');

select lives_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000001','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','CASH',now(),'DESK',null,true)$$,
  'assigned cashier records acknowledged cash');
select is(
  (select count(*) from public.payments where reference = 'DESK' and student_id_snapshot = 'c0a52000-0000-4000-8000-000000000001'),
  1::bigint, 'one receipt is posted');
select lives_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000001','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','CASH',now(),'DESK',null,true)$$,
  'same cashier and same key returns the existing receipt');
select is(
  (select count(*) from public.payments where reference = 'DESK'),
  1::bigint, 'repeated submission does not create a second receipt');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000001','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',200000,'VND','CASH',now(),'DESK',null,true)$$,
  'P0001', 'Payment request key reused with different input', 'changed amount cannot reuse the receipt key');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000002','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','BANK_TRANSFER',now(),'SHOT',null,false)$$,
  'P0001', 'Payment recording permission required', 'cashier cannot verify a bank transfer');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000003','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','PAYOS',now(),'URL',null,false)$$,
  'P0001', 'Manual transfer verification is not allowed', 'cashier cannot mark payOS verified');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000099','c0a51000-0000-4000-8000-000000000001',100000,'VND','CASH',now(),'FORGED',null,true)$$,
  'P0001', 'Student not found', 'forged student is rejected');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000005','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000002',100000,'VND','CASH',now(),'OTHER',null,true)$$,
  'P0001', 'Cash receipt permission required', 'cashier cannot collect in another branch');

select pg_temp.as_user('c0a53000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000006','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','CASH',now(),'RECEPTION',null,true)$$,
  'P0001', 'Cash receipt permission required', 'branch admin without cashier permission cannot confirm cash');

select pg_temp.as_user('c0a53000-0000-4000-8000-000000000003');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000007','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','CASH',now(),'CROSS',null,true)$$,
  'P0001', 'Cash receipt permission required', 'cashier of another branch is denied');

reset role;
update public.user_roles set is_active = false where user_id = 'c0a53000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('c0a53000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.create_payment_once('c0a54000-0000-4000-8000-000000000008','c0a52000-0000-4000-8000-000000000001','c0a51000-0000-4000-8000-000000000001',100000,'VND','CASH',now(),'REVOKED',null,true)$$,
  'P0001', 'Cash receipt permission required', 'revoked cashier permission is denied');

select pg_temp.as_user('c0a53000-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.void_payment('c0a54000-0000-4000-8000-000000000001','synthetic reversal')$$,
  'P0001', 'Financial approval required', 'finance cash permission does not void a posted receipt directly');

select finish();
rollback;
