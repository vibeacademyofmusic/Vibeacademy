begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','operating_expense_templates','Template table exists');
select has_table('public','operating_expense_records','Monthly record table exists');
select has_table('public','operating_expense_events','Event history table exists');
select ok((select relrowsecurity from pg_class where oid='public.operating_expense_templates'::regclass),'Template RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.operating_expense_records'::regclass),'Record RLS enabled');
select ok(not has_table_privilege('authenticated','public.operating_expense_templates','INSERT,UPDATE,DELETE,TRUNCATE'),'Authenticated cannot write templates directly');
select ok(not has_table_privilege('authenticated','public.operating_expense_records','INSERT,UPDATE,DELETE,TRUNCATE'),'Authenticated cannot write records directly');
select ok(not has_table_privilege('anon','public.operating_expense_records','SELECT'),'Anonymous has no record select');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname like '%operating_expense%' and has_function_privilege('anon',p.oid,'EXECUTE')),'Anonymous cannot execute operating-expense SECURITY DEFINER');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and p.proname like '%operating_expense%' and not coalesce(p.proconfig @> array['search_path=public, pg_temp'],false)),'Operating-expense SECURITY DEFINER search path contract holds');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')),'Anonymous cannot execute public SECURITY DEFINER');
select ok(exists(select 1 from public.permissions where code='operating_expense.view'),'view permission exists');
select ok(exists(select 1 from public.permissions where code='operating_expense.manage'),'manage permission exists');
select ok(exists(select 1 from public.role_permissions rp join public.roles r on r.id=rp.role_id join public.permissions p on p.id=rp.permission_id where r.code='FINANCE' and p.code='operating_expense.manage'),'FINANCE receives manage permission');

insert into public.branches(id,code,name) values
 ('0e100000-0000-4000-8000-000000000001','OE-A','Operating A'),
 ('0e100000-0000-4000-8000-000000000002','OE-B','Operating B');
insert into auth.users(id) values
 ('0e200000-0000-4000-8000-000000000001'),
 ('0e200000-0000-4000-8000-000000000002'),
 ('0e200000-0000-4000-8000-000000000003'),
 ('0e200000-0000-4000-8000-000000000004');
insert into public.profiles(id,status) select id,'ACTIVE' from auth.users where id::text like '0e200000-%';
insert into public.user_roles(user_id,role_id,branch_id)
select '0e200000-0000-4000-8000-000000000001',id,'0e100000-0000-4000-8000-000000000001' from public.roles where code='FINANCE';
insert into public.user_roles(user_id,role_id,branch_id)
select '0e200000-0000-4000-8000-000000000002',id,'0e100000-0000-4000-8000-000000000002' from public.roles where code='FINANCE';
insert into public.user_roles(user_id,role_id)
select '0e200000-0000-4000-8000-000000000003',id from public.roles where code='SUPER_ADMIN';
insert into public.user_roles(user_id,role_id)
select '0e200000-0000-4000-8000-000000000004',id from public.roles where code='TEACHER';

set local role authenticated;
select set_config('request.jwt.claim.sub','0e200000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','RENT',null,'Thuê','Chủ nhà','FIXED',10000000,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000001')$$,'P0001','OPERATING_EXPENSE_UNAUTHORIZED','Teacher cannot manage operating expenses');
select throws_ok($$select public.list_operating_expense_context()$$,'P0001','OPERATING_EXPENSE_UNAUTHORIZED','Teacher cannot list operating expenses');

select set_config('request.jwt.claim.sub','0e200000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000002','RENT',null,'Thuê B','X','FIXED',1,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000002')$$,'P0001','OPERATING_EXPENSE_UNAUTHORIZED','FINANCE cannot create in another branch');
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','RENT',null,'Thuê','X','FIXED',null,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000003')$$,'P0001','OPERATING_EXPENSE_FIXED_AMOUNT_REQUIRED','FIXED requires expected amount');
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','RENT',null,'Thuê','X','FIXED',0,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000004')$$,'P0001','OPERATING_EXPENSE_FIXED_AMOUNT_REQUIRED','FIXED amount must be positive');
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','RENT',null,'Thuê','X','FIXED',100.5,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000005')$$,'P0001','OPERATING_EXPENSE_VND_REQUIRES_WHOLE_DONG','FIXED VND rejects fractional dong');
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','OTHER',null,'Khác','X','VARIABLE',null,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000006')$$,'P0001','OPERATING_EXPENSE_CUSTOM_CATEGORY_REQUIRED','OTHER requires custom category');
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','RENT','Không dùng','Thuê','X','FIXED',1,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000007')$$,'P0001','OPERATING_EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED','Non-OTHER rejects custom category');
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','NOT_A_CATEGORY',null,'X','Y','FIXED',1,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000008')$$,'P0001','OPERATING_EXPENSE_INVALID_CATEGORY','Unknown category rejected');
select lives_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','RENT',null,'Thuê mặt bằng A','Công ty nhà','FIXED',20000000,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000010')$$,'FINANCE creates FIXED rent template in own branch');
select lives_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','RENT',null,'Thuê mặt bằng A','Công ty nhà','FIXED',20000000,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000010')$$,'Template create replay is idempotent');
select is((select count(*) from public.operating_expense_templates where branch_id='0e100000-0000-4000-8000-000000000001' and name='Thuê mặt bằng A'),1::bigint,'Replay creates one template');
select lives_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','ELECTRICITY',null,'Tiền điện','EVN','VARIABLE',null,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000011')$$,'VARIABLE template allows omitted expected amount');
select lives_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','OTHER','Phần mềm kế toán riêng','Phần mềm Kế','Vendor Soft','FIXED',1500000,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000012')$$,'OTHER custom category accepted');
select throws_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000001','WATER',null,'Nước','Nước','VARIABLE',12.5,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000013')$$,'P0001','OPERATING_EXPENSE_VND_REQUIRES_WHOLE_DONG','VARIABLE VND expected amount must be whole dong');

select lives_ok($$select public.prepare_operating_expense_month('2026-09-15','0e100000-0000-4000-8000-000000000001','0e500000-0000-4000-8000-000000000020')$$,'Prepare creates September drafts');
select lives_ok($$select public.prepare_operating_expense_month('2026-09-15','0e100000-0000-4000-8000-000000000001','0e500000-0000-4000-8000-000000000020')$$,'Prepare replay is idempotent');
select is((select count(*) from public.operating_expense_records where branch_id='0e100000-0000-4000-8000-000000000001' and expense_month='2026-09-01' and status='DRAFT'),3::bigint,'One draft per active template');
select is((select count(*) filter (where actual_amount is not null) from public.operating_expense_records where branch_id='0e100000-0000-4000-8000-000000000001' and expense_month='2026-09-01'),0::bigint,'Prepare does not invent actual amounts');
select is((select r.expected_amount::text from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),'20000000.00','FIXED expected amount is snapshotted into the draft');
select is((select r.expected_amount from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='ELECTRICITY' and r.expense_month='2026-09-01'),null,'VARIABLE draft has no invented expected amount');
select is((select public.prepare_operating_expense_month('2026-09-01','0e100000-0000-4000-8000-000000000001','0e500000-0000-4000-8000-000000000021')->>'created_count'),'0','Second prepare key creates no duplicates');
select throws_ok($$insert into public.operating_expense_records(template_id,branch_id,expense_month,category,name,currency,created_by) select id,branch_id,'2026-09-01',category,name,currency,'0e200000-0000-4000-8000-000000000001' from public.operating_expense_templates where category='RENT' and branch_id='0e100000-0000-4000-8000-000000000001'$$,'42501','permission denied for table operating_expense_records','Direct authenticated insert denied');

select lives_ok($$select public.save_operating_expense_draft((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),1,'2026-09-05','2026-09-10','Công ty nhà','HD-01','Nháp thuê','0e500000-0000-4000-8000-000000000030')$$,'DRAFT fields can be edited');
select is((select r.vendor from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),'Công ty nhà','Draft vendor edit persisted');
select throws_ok($$select public.record_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),2,'2026-09-05',null,20000.5,'Công ty nhà',null,null,'0e500000-0000-4000-8000-000000000031')$$,'P0001','OPERATING_EXPENSE_VND_REQUIRES_WHOLE_DONG','Recording rejects fractional VND');
select throws_ok($$select public.record_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),2,'2026-09-05',null,0,'Công ty nhà',null,null,'0e500000-0000-4000-8000-000000000032')$$,'P0001','OPERATING_EXPENSE_INVALID_AMOUNT','Recording rejects non-positive amount');
select lives_ok($$select public.record_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),2,'2026-09-05','2026-09-10',21000000,'Công ty nhà','HD-01','Thuê tháng 9','0e500000-0000-4000-8000-000000000033')$$,'DRAFT can be recorded');
select lives_ok($$select public.record_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),2,'2026-09-05','2026-09-10',21000000,'Công ty nhà','HD-01','Thuê tháng 9','0e500000-0000-4000-8000-000000000033')$$,'Record replay is idempotent');
select is((select r.status from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),'RECORDED','Recorded status stored');
select is(((public.get_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'))->>'variance_amount')::numeric),1000000::numeric,'Variance is database-derived');
select is((select public.get_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'))->>'payment_status'),'NO_OUTGOING_PAYMENT_LEDGER','Recorded is not paid');
select throws_ok($$select public.save_operating_expense_draft((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),3,'2026-09-06',null,'X',null,null,'0e500000-0000-4000-8000-000000000034')$$,'P0001','OPERATING_EXPENSE_DRAFT_REQUIRED','RECORDED is not draft-editable');
select throws_ok($$select public.record_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='ELECTRICITY' and r.expense_month='2026-09-01'),99,'2026-09-08',null,350000,'EVN',null,null,'0e500000-0000-4000-8000-000000000035')$$,'P0001','OPERATING_EXPENSE_CHANGED_RELOAD','Stale version rejected');

select lives_ok($$select public.update_operating_expense_template((select id from public.operating_expense_templates where category='RENT' and branch_id='0e100000-0000-4000-8000-000000000001'),1,'RENT',null,'Thuê mặt bằng A','Công ty nhà','FIXED',25000000,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000040')$$,'Template expected amount can change');
select is((select r.expected_amount::text from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01' and r.status='RECORDED'),'20000000.00','Template change does not mutate recorded snapshot');

select lives_ok($$select public.record_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='ELECTRICITY' and r.expense_month='2026-09-01'),1,'2026-09-08',null,350000,'EVN','Điện 9','Biến động','0e500000-0000-4000-8000-000000000041')$$,'VARIABLE actual amount is recorded explicitly');
select lives_ok($$select public.cancel_operating_expense((select r.id from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='OTHER' and r.expense_month='2026-09-01'),1,'Nhầm kỳ','0e500000-0000-4000-8000-000000000042')$$,'Cancel preserves history');
select is((select r.cancel_reason from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='OTHER' and r.expense_month='2026-09-01'),'Nhầm kỳ','Cancel stores actor reason');
select throws_ok($$delete from public.operating_expense_records where expense_month='2026-09-01'$$,'42501','permission denied for table operating_expense_records','Authenticated cannot hard-delete records');

select set_config('request.jwt.claim.sub','0e200000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.create_operating_expense_template('0e100000-0000-4000-8000-000000000002','INTERNET',null,'Wifi B','ISP','FIXED',500000,'VND','2026-09-01',null,'0e500000-0000-4000-8000-000000000050')$$,'FINANCE B creates in own branch');
select lives_ok($$select public.prepare_operating_expense_month('2026-09-01','0e100000-0000-4000-8000-000000000002','0e500000-0000-4000-8000-000000000051')$$,'FINANCE B prepares own branch');
select is((select count(*) from public.operating_expense_templates where branch_id='0e100000-0000-4000-8000-000000000001'),0::bigint,'FINANCE B cannot see branch A templates');
select throws_ok($$select public.prepare_operating_expense_month('2026-09-01','0e100000-0000-4000-8000-000000000001','0e500000-0000-4000-8000-000000000052')$$,'P0001','OPERATING_EXPENSE_UNAUTHORIZED','FINANCE B cannot prepare branch A');
select set_config('request.jwt.claim.sub','0e200000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.operating_expense_records where branch_id='0e100000-0000-4000-8000-000000000002'),0::bigint,'FINANCE A cannot see branch B rows');
select is((select count(*) from public.operating_expense_templates where branch_id='0e100000-0000-4000-8000-000000000002'),0::bigint,'FINANCE A cannot see branch B templates');

select set_config('request.jwt.claim.sub','0e200000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.operating_expense_templates where branch_id in ('0e100000-0000-4000-8000-000000000001','0e100000-0000-4000-8000-000000000002')),4::bigint,'SUPER_ADMIN sees both branches');
select lives_ok($$select public.prepare_operating_expense_month('2026-10-01','0e100000-0000-4000-8000-000000000001','0e500000-0000-4000-8000-000000000060')$$,'SUPER_ADMIN prepares future month from updated template');
select is((select r.expected_amount::text from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-10-01'),'25000000.00','Future draft uses current template amount');
select is((select r.expected_amount::text from public.operating_expense_records r join public.operating_expense_templates t on t.id=r.template_id where t.category='RENT' and r.expense_month='2026-09-01'),'20000000.00','Historical September snapshot remains 20,000,000');

reset role;
select throws_ok($$update public.operating_expense_records set actual_amount=1, version=version+1 where status='RECORDED'$$,'P0001','OPERATING_EXPENSE_RECORDED_IMMUTABLE','Direct recorded mutation is blocked');
select throws_ok($$delete from public.operating_expense_templates$$,'P0001','OPERATING_EXPENSE_USE_RETIREMENT','Template hard delete is blocked');

set local role anon;
select throws_ok('select id from public.operating_expense_records','42501','permission denied for table operating_expense_records','Anonymous record query denied');
select throws_ok($$select public.list_operating_expenses()$$,'42501','permission denied for function list_operating_expenses','Anonymous RPC denied');
reset role;

select * from finish();
rollback;
