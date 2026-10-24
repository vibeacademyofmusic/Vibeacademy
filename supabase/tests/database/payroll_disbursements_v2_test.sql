begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id) values
('dc000000-0000-4000-8000-000000000001'),
('dc000000-0000-4000-8000-000000000002'),
('dc000000-0000-4000-8000-000000000003'),
('dc000000-0000-4000-8000-000000000004'),
('dc000000-0000-4000-8000-000000000005');
insert into public.profiles(id,full_name,status) values
('dc000000-0000-4000-8000-000000000001','Disbursement Employee One','ACTIVE'),
('dc000000-0000-4000-8000-000000000002','Disbursement Employee Two','ACTIVE'),
('dc000000-0000-4000-8000-000000000003','Disbursement Finance A','ACTIVE'),
('dc000000-0000-4000-8000-000000000004','Disbursement Finance B','ACTIVE'),
('dc000000-0000-4000-8000-000000000005','Disbursement Admin','ACTIVE');
insert into public.branches(id,code,name,status) values
('dc100000-0000-4000-8000-000000000001','DISB-A','Disbursement Branch A','ACTIVE'),
('dc100000-0000-4000-8000-000000000002','DISB-B','Disbursement Branch B','ACTIVE');
insert into public.user_roles(user_id,role_id,branch_id)
select 'dc000000-0000-4000-8000-000000000003',id,'dc100000-0000-4000-8000-000000000001' from public.roles where code='FINANCE';
insert into public.user_roles(user_id,role_id,branch_id)
select 'dc000000-0000-4000-8000-000000000004',id,'dc100000-0000-4000-8000-000000000002' from public.roles where code='FINANCE';
insert into public.user_roles(user_id,role_id)
select 'dc000000-0000-4000-8000-000000000005',id from public.roles where code='SUPER_ADMIN';
insert into public.user_roles(user_id,role_id)
select u.id,r.id from (values('dc000000-0000-4000-8000-000000000001'::uuid),('dc000000-0000-4000-8000-000000000002'::uuid)) u(id)
cross join public.roles r where r.code='STAFF';

insert into public.employees(id,employee_code,home_unit,hire_date,profile_id,created_by) values
('dc200000-0000-4000-8000-000000000001','DISB-E1','HQ','1999-01-01','dc000000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000005'),
('dc200000-0000-4000-8000-000000000002','DISB-E2','HQ','1999-01-01','dc000000-0000-4000-8000-000000000002','dc000000-0000-4000-8000-000000000005');
insert into public.employee_versions(employee_id,version,effective_on,full_name,unit_code,employee_group,employment_status,pay_type,reason,created_by) values
('dc200000-0000-4000-8000-000000000001',1,'1999-01-01','Disbursement Employee One','HQ','STAFF','ACTIVE','MONTHLY','Test fixture','dc000000-0000-4000-8000-000000000005'),
('dc200000-0000-4000-8000-000000000002',1,'1999-01-01','Disbursement Employee Two','HQ','STAFF','ACTIVE','MONTHLY','Test fixture','dc000000-0000-4000-8000-000000000005');

insert into public.payroll_periods(id,branch_id,starts_on,ends_on,status) values
('dc300000-0000-4000-8000-000000000001','dc100000-0000-4000-8000-000000000001','2000-01-01','2000-01-31','DRAFT'),
('dc300000-0000-4000-8000-000000000002','dc100000-0000-4000-8000-000000000001','2000-02-01','2000-02-29','DRAFT'),
('dc300000-0000-4000-8000-000000000003','dc100000-0000-4000-8000-000000000002','2000-03-01','2000-03-31','DRAFT'),
('dc300000-0000-4000-8000-000000000004','dc100000-0000-4000-8000-000000000001','2000-04-01','2000-04-30','DRAFT');
insert into public.teacher_payrolls(id,period_id,employee_id,branch_id,teacher_name,pay_type,currency,v2_earnings_amount,v2_reimbursement_amount,v2_deduction_amount,calculation_version) values
('dc400000-0000-4000-8000-000000000001','dc300000-0000-4000-8000-000000000001','dc200000-0000-4000-8000-000000000001','dc100000-0000-4000-8000-000000000001','Disbursement Employee One','MONTHLY','VND',900,200,100,'PAYROLL_V2_1'),
('dc400000-0000-4000-8000-000000000002','dc300000-0000-4000-8000-000000000002','dc200000-0000-4000-8000-000000000001','dc100000-0000-4000-8000-000000000001','Approved Employee One','MONTHLY','VND',1000,0,0,'PAYROLL_V2_1'),
('dc400000-0000-4000-8000-000000000003','dc300000-0000-4000-8000-000000000003','dc200000-0000-4000-8000-000000000002','dc100000-0000-4000-8000-000000000002','Disbursement Employee Two','MONTHLY','VND',500,0,0,'PAYROLL_V2_1');
insert into public.teacher_payrolls(id,period_id,employee_id,branch_id,teacher_name,pay_type,currency,gross_amount,calculation_version)
values('dc400000-0000-4000-8000-000000000004','dc300000-0000-4000-8000-000000000004','dc200000-0000-4000-8000-000000000001','dc100000-0000-4000-8000-000000000001','Legacy Employee One','MONTHLY','VND',500,null);
insert into public.payroll_period_actions_v2(period_id,employee_id,component_code,category,source_type,amount,currency,reason,request_key,request_payload,created_by) values
('dc300000-0000-4000-8000-000000000001','dc200000-0000-4000-8000-000000000001','BONUS','EARNING','MANUAL_BONUS',1000,'VND','Fixture payable','dc700000-0000-4000-8000-000000000001','{}','dc000000-0000-4000-8000-000000000005'),
('dc300000-0000-4000-8000-000000000002','dc200000-0000-4000-8000-000000000001','BONUS','EARNING','MANUAL_BONUS',1000,'VND','Fixture payable','dc700000-0000-4000-8000-000000000002','{}','dc000000-0000-4000-8000-000000000005'),
('dc300000-0000-4000-8000-000000000003','dc200000-0000-4000-8000-000000000002','BONUS','EARNING','MANUAL_BONUS',500,'VND','Fixture payable','dc700000-0000-4000-8000-000000000003','{}','dc000000-0000-4000-8000-000000000005');
select public.refresh_staff_payroll_v2_totals('dc300000-0000-4000-8000-000000000001','dc200000-0000-4000-8000-000000000001');
select public.refresh_staff_payroll_v2_totals('dc300000-0000-4000-8000-000000000002','dc200000-0000-4000-8000-000000000001');
select public.refresh_staff_payroll_v2_totals('dc300000-0000-4000-8000-000000000003','dc200000-0000-4000-8000-000000000002');
update public.payroll_periods set status=case when id='dc300000-0000-4000-8000-000000000002' then 'APPROVED' else 'FINALIZED' end
where id in('dc300000-0000-4000-8000-000000000001','dc300000-0000-4000-8000-000000000002','dc300000-0000-4000-8000-000000000003','dc300000-0000-4000-8000-000000000004');

select has_table('public','payroll_disbursements','Dedicated payroll disbursement ledger exists');
select ok((select relrowsecurity from pg_class where oid='public.payroll_disbursements'::regclass),'Payroll disbursement RLS enabled');
select ok(not has_table_privilege('authenticated','public.payroll_disbursements','INSERT'),'Authenticated direct INSERT is not granted');
select ok(not has_table_privilege('authenticated','public.payroll_disbursements','UPDATE'),'Authenticated direct UPDATE is not granted');
select ok(not has_table_privilege('authenticated','public.payroll_disbursements','DELETE'),'Authenticated direct DELETE is not granted');
select ok(exists(select 1 from pg_trigger where tgrelid='public.payroll_disbursements'::regclass and tgname='payroll_disbursement_history_guard' and not tgisinternal),'Immutable history guard is installed');
select ok(not has_function_privilege('anon','public.record_payroll_disbursement(uuid,numeric,text,date,text,text,text,uuid)','EXECUTE'),'Anon cannot record payroll disbursement');
select ok(not has_function_privilege('anon','public.cancel_payroll_disbursement(uuid,text,uuid)','EXECUTE'),'Anon cannot cancel payroll disbursement');

set local role authenticated;
select set_config('request.jwt.claim.sub','dc000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',100,'VND','2000-01-31','CASH',null,null,'dc500000-0000-4000-8000-000000000001')$$,'P0001','PAYROLL_DISBURSEMENT_UNAUTHORIZED','Ordinary employee cannot record payment');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','dc000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',100,'VND','2000-01-31','CASH',null,null,'dc500000-0000-4000-8000-000000000002')$$,'P0001','PAYROLL_DISBURSEMENT_UNAUTHORIZED','Wrong-branch Finance cannot record payment');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','dc000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000002',100,'VND','2000-02-29','CASH',null,null,'dc500000-0000-4000-8000-000000000003')$$,'P0001','PAYROLL_DISBURSEMENT_FINALIZED_REQUIRED','APPROVED payroll rejects payment');
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',0,'VND','2000-01-31','CASH',null,null,'dc500000-0000-4000-8000-000000000004')$$,'P0001','PAYROLL_DISBURSEMENT_INVALID_AMOUNT','Zero payment rejected');
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',100.50,'VND','2000-01-31','CASH',null,null,'dc500000-0000-4000-8000-000000000005')$$,'P0001','PAYROLL_DISBURSEMENT_VND_WHOLE_REQUIRED','VND decimal rejected');
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',100,'USD','2000-01-31','CASH',null,null,'dc500000-0000-4000-8000-000000000006')$$,'P0001','PAYROLL_DISBURSEMENT_CURRENCY_MISMATCH','Currency mismatch rejected');
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',100,'VND',(now() at time zone 'Asia/Ho_Chi_Minh')::date+1,'CASH',null,null,'dc500000-0000-4000-8000-000000000007')$$,'P0001','PAYROLL_DISBURSEMENT_INVALID_DATE','Future paid date rejected');
select is((public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',400,'VND','2000-01-31','BANK_TRANSFER','TX-400','Partial payment','dc500000-0000-4000-8000-000000000008')->>'payment_status'),'PARTIALLY_PAID','Authorized Finance records partial payment');
select is((public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000001')->>'paid_amount')::numeric,400::numeric,'Paid amount is database-derived');
select is((public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000001')->>'remaining_amount')::numeric,600::numeric,'Remaining amount is database-derived');
select is((public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',600,'VND','2000-01-31','CASH','PC-600',null,'dc500000-0000-4000-8000-000000000009')->>'payment_status'),'PAID','Second payment reaches exact full payment');
select is((public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000001')->>'paid_amount')::numeric,1000::numeric,'Exact full payment total is authoritative');
select is((public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000001')->>'remaining_amount')::numeric,0::numeric,'Exact full payment leaves zero remaining');
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',1,'VND','2000-01-31','CASH',null,null,'dc500000-0000-4000-8000-000000000010')$$,'P0001','PAYROLL_DISBURSEMENT_EXCEEDS_REMAINING','Overpayment rejected');
select is((public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',600,'VND','2000-01-31','CASH','PC-600',null,'dc500000-0000-4000-8000-000000000009')->>'payment_id'),(select id::text from public.payroll_disbursements where request_key='dc500000-0000-4000-8000-000000000009'),'Same idempotency key and payload replays result');
select throws_ok($$select public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000001',599,'VND','2000-01-31','CASH','PC-600',null,'dc500000-0000-4000-8000-000000000009')$$,'P0001','PAYROLL_DISBURSEMENT_REQUEST_KEY_REUSED','Same key with different payload rejected');
select ok(pg_get_functiondef('public.record_payroll_disbursement(uuid,numeric,text,date,text,text,text,uuid)'::regprocedure) ilike '%for update of payrow,periodrow%','Record RPC locks payroll and period before balance validation');
select throws_ok($$select public.cancel_payroll_disbursement((select id from public.payroll_disbursements where request_key='dc500000-0000-4000-8000-000000000008'),'','dc600000-0000-4000-8000-000000000001')$$,'P0001','PAYROLL_DISBURSEMENT_CANCEL_REASON_REQUIRED','Cancellation requires reason');
select is((public.cancel_payroll_disbursement((select id from public.payroll_disbursements where request_key='dc500000-0000-4000-8000-000000000008'),'Wrong bank reference','dc600000-0000-4000-8000-000000000002')->>'payment_status'),'PARTIALLY_PAID','Cancellation recalculates payment state');
select is((select status from public.payroll_disbursements where request_key='dc500000-0000-4000-8000-000000000008'),'CANCELLED','Cancellation preserves row and changes status');
select is((select cancel_reason from public.payroll_disbursements where request_key='dc500000-0000-4000-8000-000000000008'),'Wrong bank reference','Cancellation reason retained');
select is((public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000001')->>'paid_amount')::numeric,600::numeric,'Cancelled amount leaves active paid total only');
select is((public.cancel_payroll_disbursement((select id from public.payroll_disbursements where request_key='dc500000-0000-4000-8000-000000000008'),'Wrong bank reference','dc600000-0000-4000-8000-000000000002')->>'paid_amount')::numeric,600::numeric,'Cancellation idempotency replays same result');
reset role; select set_config('request.jwt.claim.sub','',true);

select throws_ok($$delete from public.payroll_disbursements where request_key='dc500000-0000-4000-8000-000000000008'$$,'P0001','PAYROLL_DISBURSEMENT_HISTORY_IMMUTABLE','Even the table owner cannot hard-delete disbursement history');

set local role authenticated;
select set_config('request.jwt.claim.sub','dc000000-0000-4000-8000-000000000005',true);
select is((public.record_payroll_disbursement('dc400000-0000-4000-8000-000000000003',100,'VND','2000-03-31','OTHER','ADMIN-100','Admin payment','dc500000-0000-4000-8000-000000000011')->>'amount')::numeric,100::numeric,'Global SUPER_ADMIN can record payment');
select ok(public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000004') is not null,'Legacy payroll remains readable');
select is((select v2_net_amount from public.teacher_payrolls where id='dc400000-0000-4000-8000-000000000001'),1000::numeric,'Payroll V2 total remains unchanged');
reset role; select set_config('request.jwt.claim.sub','',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','dc000000-0000-4000-8000-000000000001',true);
select ok(public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000001') is not null,'Employee can read own payment information');
select is(public.get_payroll_disbursement_detail('dc400000-0000-4000-8000-000000000003'),null::jsonb,'Employee cannot read another employee payment history');
select is((select count(*) from public.payroll_disbursements where payroll_id='dc400000-0000-4000-8000-000000000003'),0::bigint,'Employee RLS hides another employee disbursement');
reset role; select set_config('request.jwt.claim.sub','',true);

select is((select proconfig from pg_proc where oid='public.record_payroll_disbursement(uuid,numeric,text,date,text,text,text,uuid)'::regprocedure),array['search_path=public, pg_temp']::text[],'Record RPC pins search_path');
select is((select proconfig from pg_proc where oid='public.cancel_payroll_disbursement(uuid,text,uuid)'::regprocedure),array['search_path=public, pg_temp']::text[],'Cancel RPC pins search_path');
select ok(not has_schema_privilege('authenticated','payroll_disbursement_private','USAGE'),'Internal helper schema is not exposed');

select * from finish();
rollback;
