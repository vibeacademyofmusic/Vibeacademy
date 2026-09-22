begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public','employee_expense_claim_items_v2','V2 item table exists');
select col_type_is('public','employee_expense_claim_items_v2','category_name','text','Category is free text');
select ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='employee_expense_claim_items_v2' and column_name in ('evidence_reference','file_id','attachment','receipt','invoice')),'V2 item has no evidence or upload field');
select has_column('public','employee_expense_claim_lines','evidence_reference','Legacy evidence column remains for history');
select ok(not has_table_privilege('authenticated','public.employee_expense_claim_items_v2','INSERT,UPDATE,DELETE,TRUNCATE'),'Authenticated cannot write V2 items directly');
select ok(has_table_privilege('authenticated','public.employee_expense_claim_items_v2','SELECT'),'Authenticated retains RLS-governed V2 item reads');
select ok((select relrowsecurity from pg_class where oid='public.employee_expense_claim_items_v2'::regclass),'V2 item RLS enabled');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')),'Anonymous cannot execute public SECURITY DEFINER');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=public, pg_temp'] or p.proconfig @> array['search_path=pg_catalog, pg_temp'],false)),'Public SECURITY DEFINER search path contract holds');

insert into public.branches(id,code,name) values
 ('eb100000-0000-4000-8000-000000000002','EXP-V2-A','Expense V2 A'),
 ('eb100000-0000-4000-8000-000000000003','EXP-V2-B','Expense V2 B');
update public.organization_units set branch_id='eb100000-0000-4000-8000-000000000002' where code='ST';
insert into auth.users(id) values
 ('eb200000-0000-4000-8000-000000000001'),
 ('eb200000-0000-4000-8000-000000000002'),
 ('eb200000-0000-4000-8000-000000000003');
insert into public.profiles(id,status) select id,'ACTIVE' from auth.users where id::text like 'eb200000-%';
insert into public.user_roles(user_id,role_id)
select 'eb200000-0000-4000-8000-000000000001',id from public.roles where code='STAFF';
insert into public.user_roles(user_id,role_id,branch_id)
select 'eb200000-0000-4000-8000-000000000001',id,'eb100000-0000-4000-8000-000000000002' from public.roles where code='FINANCE';
insert into public.user_roles(user_id,role_id)
select 'eb200000-0000-4000-8000-000000000002',id from public.roles where code='SUPER_ADMIN';
insert into public.user_roles(user_id,role_id)
select 'eb200000-0000-4000-8000-000000000003',id from public.roles where code='STAFF';
insert into public.employees(id,employee_code,home_unit,hire_date,profile_id,created_by) values
 ('eb300000-0000-4000-8000-000000000001','EXP-V2-OWNER','ST','2026-01-01','eb200000-0000-4000-8000-000000000001','eb200000-0000-4000-8000-000000000002'),
 ('eb300000-0000-4000-8000-000000000002','EXP-V2-OTHER','ST','2026-01-01','eb200000-0000-4000-8000-000000000003','eb200000-0000-4000-8000-000000000002');
insert into public.employee_versions(employee_id,version,effective_on,full_name,unit_code,employee_group,employment_status,pay_type,reason,created_by) values
 ('eb300000-0000-4000-8000-000000000001',1,'2026-01-01','Expense Owner','ST','STAFF','ACTIVE','MONTHLY','Test','eb200000-0000-4000-8000-000000000002'),
 ('eb300000-0000-4000-8000-000000000002',1,'2026-01-01','Other Employee','ST','STAFF','ACTIVE','MONTHLY','Test','eb200000-0000-4000-8000-000000000002');
insert into public.employee_trips(id,employee_id,origin_unit,destination_unit,destination_branch_id,starts_on,ends_on,reason,maker) values
 ('eb400000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001','ST','HQ','eb100000-0000-4000-8000-000000000003','2026-09-02','2026-09-04','Hội nghị tháng 9','eb200000-0000-4000-8000-000000000001'),
 ('eb400000-0000-4000-8000-000000000002','eb300000-0000-4000-8000-000000000001','ST','HQ','eb100000-0000-4000-8000-000000000003','2026-09-10','2026-09-11','Chuyến chưa duyệt','eb200000-0000-4000-8000-000000000001'),
 ('eb400000-0000-4000-8000-000000000003','eb300000-0000-4000-8000-000000000002','ST','HQ','eb100000-0000-4000-8000-000000000003','2026-09-12','2026-09-13','Chuyến người khác','eb200000-0000-4000-8000-000000000003'),
 ('eb400000-0000-4000-8000-000000000004','eb300000-0000-4000-8000-000000000001','ST','HQ','eb100000-0000-4000-8000-000000000003','2026-09-15','2026-09-16','Bảng kê rỗng','eb200000-0000-4000-8000-000000000001'),
 ('eb400000-0000-4000-8000-000000000005','eb300000-0000-4000-8000-000000000001','ST','HQ','eb100000-0000-4000-8000-000000000003','2026-09-20','2026-09-21','Legacy trip','eb200000-0000-4000-8000-000000000001');
insert into public.employee_trip_reviews(trip_id,decision,reason,checker)
select id,'APPROVED','Independent approval','eb200000-0000-4000-8000-000000000002' from public.employee_trips where id in
 ('eb400000-0000-4000-8000-000000000001','eb400000-0000-4000-8000-000000000003','eb400000-0000-4000-8000-000000000004','eb400000-0000-4000-8000-000000000005');

set local role authenticated;
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.create_employee_expense_claim_v2('eb400000-0000-4000-8000-000000000001','2026-09-01','VND','eb500000-0000-4000-8000-000000000000')$$,'P0001','EXPENSE_ACTIVE_EMPLOYEE_LINK_AND_OWN_PERMISSION_REQUIRED','Create requires an active authenticated employee relation');
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.create_employee_expense_claim_v2('eb400000-0000-4000-8000-000000000001','2026-09-01','VND','eb500000-0000-4000-8000-000000000001')$$,'P0001','EXPENSE_APPROVED_OWN_TRIP_REQUIRED','Trip must belong to authenticated employee');
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.create_employee_expense_claim_v2('eb400000-0000-4000-8000-000000000002','2026-09-01','VND','eb500000-0000-4000-8000-000000000002')$$,'P0001','EXPENSE_APPROVED_OWN_TRIP_REQUIRED','Trip must be approved');
select lives_ok($$select public.create_employee_expense_claim_v2('eb400000-0000-4000-8000-000000000001','2026-09-01','VND','eb500000-0000-4000-8000-000000000003')$$,'Active employee creates V2 claim');
select lives_ok($$select public.create_employee_expense_claim_v2('eb400000-0000-4000-8000-000000000001','2026-09-01','VND','eb500000-0000-4000-8000-000000000003')$$,'Create replay is safe');
select is((select count(*) from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),1::bigint,'Replay creates one claim');
select is((select branch_id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'eb100000-0000-4000-8000-000000000002'::uuid,'Branch is derived from employment');
select is((select employee_id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'eb300000-0000-4000-8000-000000000001'::uuid,'Employee is derived from identity');
select throws_ok($$insert into public.employee_expense_claim_items_v2(claim_id,expense_date,category_name,note,amount) select id,'2026-09-03','Denied','Denied',1 from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'$$,'42501','permission denied for table employee_expense_claim_items_v2','Direct authenticated item insert denied');
select lives_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),1,'eb600000-0000-4000-8000-000000000001','2026-08-01','  Phí hội nghị  ','Ngoài ngày chuyến vẫn hợp lệ',100000,'eb500000-0000-4000-8000-000000000004')$$,'Free custom category and independent date accepted');
select is((select category_name from public.employee_expense_claim_items_v2 where id='eb600000-0000-4000-8000-000000000001'),'Phí hội nghị','Category only trims whitespace');
select lives_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),1,'eb600000-0000-4000-8000-000000000001','2026-08-01','  Phí hội nghị  ','Ngoài ngày chuyến vẫn hợp lệ',100000,'eb500000-0000-4000-8000-000000000004')$$,'Same item request replay is safe');
select throws_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),2,'eb600000-0000-4000-8000-000000000001','2026-08-01','Khác','Payload changed',100000,'eb500000-0000-4000-8000-000000000004')$$,'P0001','EXPENSE_REQUEST_KEY_REUSED','Same request key with changed payload rejected');
select throws_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),1,'eb600000-0000-4000-8000-000000000001','2026-08-01','Phí hội nghị','Stale',100000,'eb500000-0000-4000-8000-000000000005')$$,'P0001','EXPENSE_CHANGED_RELOAD','Stale version rejected');
select throws_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),2,'eb600000-0000-4000-8000-000000000002','2026-09-03',' ','Empty',1000,'eb500000-0000-4000-8000-000000000006')$$,'P0001','EXPENSE_V2_CATEGORY_INVALID','Empty category rejected');
select throws_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),2,'eb600000-0000-4000-8000-000000000002','2026-09-03',repeat('x',101),'Long',1000,'eb500000-0000-4000-8000-000000000007')$$,'P0001','EXPENSE_V2_CATEGORY_INVALID','Category over 100 characters rejected');
select throws_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),2,'eb600000-0000-4000-8000-000000000002','2026-09-03','Taxi','Zero',0,'eb500000-0000-4000-8000-000000000008')$$,'P0001','EXPENSE_INVALID_MONEY','Non-positive amount rejected');
select throws_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),2,'eb600000-0000-4000-8000-000000000002','2026-09-03','Taxi','Decimal VND',1.5,'eb500000-0000-4000-8000-000000000009')$$,'P0001','EXPENSE_VND_REQUIRES_WHOLE_DONG','VND decimal rejected');
select lives_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),2,'eb600000-0000-4000-8000-000000000001','2026-09-03','Phí hội nghị','Edited',120000,'eb500000-0000-4000-8000-000000000010')$$,'Draft item edit allowed');
select lives_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),3,'eb600000-0000-4000-8000-000000000002','2026-09-03','Thuê thiết bị','Temporary',30000,'eb500000-0000-4000-8000-000000000011')$$,'Second draft item added');
select lives_ok($$select public.remove_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),4,'eb600000-0000-4000-8000-000000000002','eb500000-0000-4000-8000-000000000012')$$,'Draft item removal allowed');

select lives_ok($$select public.create_employee_expense_claim_v2('eb400000-0000-4000-8000-000000000004','2026-09-01','VND','eb500000-0000-4000-8000-000000000013')$$,'Second V2 claim created');
select throws_ok($$select public.submit_employee_expense_claim_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000004'),1,'eb500000-0000-4000-8000-000000000014')$$,'P0001','EXPENSE_NONEMPTY_POSITIVE_CLAIM_REQUIRED','Submit requires at least one item');
select lives_ok($$select public.submit_employee_expense_claim_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),5,'eb500000-0000-4000-8000-000000000015')$$,'Valid V2 claim submits');
select is((select submitted_snapshot->>'total_amount' from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'120000.00','Submit snapshot stores exact database total');
select is((select submitted_snapshot->'items'->0->>'category_name' from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'Phí hội nghị','Submit snapshot stores exact V2 item');
select throws_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),6,'eb600000-0000-4000-8000-000000000001','2026-09-03','Phí hội nghị','Locked',130000,'eb500000-0000-4000-8000-000000000016')$$,'P0001','EXPENSE_V2_ITEMS_LOCKED','Submitted item edit locked');
select throws_ok($$select public.remove_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),6,'eb600000-0000-4000-8000-000000000001','eb500000-0000-4000-8000-000000000017')$$,'P0001','EXPENSE_V2_ITEMS_LOCKED','Submitted item removal locked');
select throws_ok($$select public.review_employee_expense_claim_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),6,'APPROVED','Self','eb500000-0000-4000-8000-000000000018')$$,'P0001','EXPENSE_INDEPENDENT_REVIEWER_REQUIRED','Creator and employee cannot approve own claim');
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.review_employee_expense_claim_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),6,'RETURNED','Bổ sung nội dung','eb500000-0000-4000-8000-000000000019')$$,'Independent reviewer returns claim');
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.save_employee_expense_claim_item_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),7,'eb600000-0000-4000-8000-000000000001','2026-09-03','Phí hội nghị','Bổ sung',125000,'eb500000-0000-4000-8000-000000000020')$$,'Returned claim permits owner edit');
select lives_ok($$select public.submit_employee_expense_claim_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),8,'eb500000-0000-4000-8000-000000000021')$$,'Returned claim can resubmit');
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.review_employee_expense_claim_v2((select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),9,'APPROVED','Đã kiểm tra','eb500000-0000-4000-8000-000000000022')$$,'Authorized independent reviewer approves');
select is((select approved_amount::text from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'125000.00','Approved amount equals database item sum');
reset role;
select throws_ok($$update public.employee_expense_claim_items_v2 set amount=1 where id='eb600000-0000-4000-8000-000000000001'$$,'P0001','EXPENSE_V2_ITEMS_LOCKED','Approved content immutable even to direct database update');

insert into public.payroll_periods(id,branch_id,starts_on,ends_on,status,generated_by) values
 ('eb700000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000002','2026-09-01','2026-09-30','REVIEW','eb200000-0000-4000-8000-000000000002'),
 ('eb700000-0000-4000-8000-000000000002','eb100000-0000-4000-8000-000000000003','2026-09-01','2026-09-30','REVIEW','eb200000-0000-4000-8000-000000000002'),
 ('eb700000-0000-4000-8000-000000000003','eb100000-0000-4000-8000-000000000002','2026-10-01','2026-10-31','REVIEW','eb200000-0000-4000-8000-000000000002');
insert into public.teacher_payrolls(period_id,employee_id,branch_id,teacher_name,pay_type,currency,calculation_version) values
 ('eb700000-0000-4000-8000-000000000001','eb300000-0000-4000-8000-000000000001','eb100000-0000-4000-8000-000000000002','Expense Owner','MONTHLY','USD','PAYROLL_V2_TEST');
set local role authenticated;
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.post_expense_claim_to_payroll_v2('eb700000-0000-4000-8000-000000000001',1,(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000004'),'Draft claim','eb800000-0000-4000-8000-000000000000')$$,'P0001','PAYROLL_V2_EXPENSE_CLAIM_NOT_APPROVED','Payroll posting requires approved claim');
select throws_ok($$select public.post_expense_claim_to_payroll_v2('eb700000-0000-4000-8000-000000000002',1,(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'Wrong branch','eb800000-0000-4000-8000-000000000001')$$,'P0001','PAYROLL_V2_EXPENSE_CLAIM_PERIOD_MISMATCH','Wrong payroll branch rejected');
select throws_ok($$select public.post_expense_claim_to_payroll_v2('eb700000-0000-4000-8000-000000000003',1,(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'Wrong month','eb800000-0000-4000-8000-000000000002')$$,'P0001','PAYROLL_V2_EXPENSE_CLAIM_PERIOD_MISMATCH','Wrong payroll month rejected');
select throws_ok($$select public.post_expense_claim_to_payroll_v2('eb700000-0000-4000-8000-000000000001',1,(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'Wrong currency','eb800000-0000-4000-8000-000000000003')$$,'P0001','PAYROLL_V2_ACTION_CURRENCY_MISMATCH','Wrong payroll currency rejected');
reset role;
update public.teacher_payrolls set currency='VND' where period_id='eb700000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.post_expense_claim_to_payroll_v2('eb700000-0000-4000-8000-000000000001',1,(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'Đưa vào kỳ','eb800000-0000-4000-8000-000000000004')$$,'Approved V2 claim posts to Payroll');
select is((select component_code||'/'||category||'/'||source_type from public.payroll_period_actions_v2 where source_expense_claim_id=(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001')),'TRAVEL_EXPENSE/REIMBURSEMENT/EXPENSE_CLAIM','Posting creates required component semantics');
select is(public.post_expense_claim_to_payroll_v2('eb700000-0000-4000-8000-000000000001',1,(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'Đưa vào kỳ','eb800000-0000-4000-8000-000000000004')->>'payment_status','NOT_PAID_BY_THIS_ACTION','Posting replay does not claim payment');
select is((select count(*) from public.payroll_period_actions_v2 where source_expense_claim_id=(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001') and status='ACTIVE'),1::bigint,'Idempotent posting creates one active action');
select throws_ok($$select public.post_expense_claim_to_payroll_v2('eb700000-0000-4000-8000-000000000001',2,(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),'Second post','eb800000-0000-4000-8000-000000000005')$$,'P0001','PAYROLL_V2_EXPENSE_CLAIM_ALREADY_POSTED','Duplicate active posting rejected');
select ok((select source_snapshot->'expense_claim'->>'payment_status'='NO_AUTHORITATIVE_PAYMENT_EVIDENCE' from public.payroll_period_actions_v2 where source_expense_claim_id=(select id from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001')),'Payroll snapshot preserves no-payment-evidence semantic');

select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.create_employee_expense_claim('2026-09-01','Legacy preserved','VND','eb900000-0000-4000-8000-000000000001')$$,'Legacy create RPC remains intact');
select is((select claim_model from public.employee_expense_claims where title='Legacy preserved'),'LEGACY_TRIP_SUMMARY','Legacy claim discriminator defaults correctly');
select is((select count(*) from public.employee_expense_claims where claim_model='LEGACY_TRIP_SUMMARY' and trip_id is null and title='Legacy preserved'),1::bigint,'Legacy row is not rewritten into V2');
select ok((select count(*) from public.employee_expense_claim_events where request_key in ('eb500000-0000-4000-8000-000000000003','eb500000-0000-4000-8000-000000000004'))=2,'Event history and idempotency keys remain one event per request');
select set_config('request.jwt.claim.sub','eb200000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.employee_expense_claims where trip_id='eb400000-0000-4000-8000-000000000001'),0::bigint,'RLS hides unrelated employee claim');
select * from finish();
rollback;
