begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id) values('ee000000-0000-0000-0000-000000000001'),('ee000000-0000-0000-0000-000000000002'),('ee000000-0000-0000-0000-000000000003');
insert into public.profiles(id,status) select id,'ACTIVE' from auth.users where id::text like 'ee000000-%';
insert into public.user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join public.roles r where u.id in ('ee000000-0000-0000-0000-000000000001','ee000000-0000-0000-0000-000000000002') and r.code='SUPER_ADMIN';
insert into public.branches(id,code,name) values('ee100000-0000-0000-0000-000000000001','LEGACY-A','Legacy A');
insert into public.curriculums(id,code,name) values('ee200000-0000-0000-0000-000000000001','LEGACY-PIANO','Legacy Piano');
insert into public.curriculum_levels(id,curriculum_id,code,name,sequence_no) values('ee300000-0000-0000-0000-000000000004','ee200000-0000-0000-0000-000000000001','LEGACY-G4','Grade 4',4);
insert into public.curriculum_subjects(level_id,family_code,code,name,completion_rule) values('ee300000-0000-0000-0000-000000000004','LEGACY','LEGACY-SUB','Subject','DIRECT_ASSESSMENT');
insert into public.courses(id,curriculum_id,level_id,code,name) values('ee400000-0000-0000-0000-000000000001','ee200000-0000-0000-0000-000000000001','ee300000-0000-0000-0000-000000000004','LEGACY-COURSE','Legacy course');
insert into public.classes(id,branch_id,course_id,code,name,class_type,capacity,status) values('ee500000-0000-0000-0000-000000000001','ee100000-0000-0000-0000-000000000001','ee400000-0000-0000-0000-000000000001','LEGACY-CLASS','Legacy class','GROUP',30,'ACTIVE');
insert into public.tuition_plans(id,code,name,duration_months) values('ee600000-0000-0000-0000-000000000001','LEGACY-PLAN','Legacy plan',1);
insert into public.tuition_plan_branch_prices(tuition_plan_id,branch_id,list_price,currency) values('ee600000-0000-0000-0000-000000000001','ee100000-0000-0000-0000-000000000001',5500000,'VND');
create temp table fixture(name text primary key,id uuid,payload jsonb);
grant all on fixture to authenticated;
insert into fixture(name,payload) values('source',jsonb_build_object(
 'legacy_reference','source-1','student_code','LEGACY-STUDENT-1','full_name','Legacy synthetic learner',
 'class_code','','curriculum_code','LEGACY-PIANO','level_code','LEGACY-G4',
 'started_at',(now() at time zone 'Asia/Ho_Chi_Minh')::date::text,
 'tuition_starts_on',(now() at time zone 'Asia/Ho_Chi_Minh')::date::text,
 'tuition_plan_code','LEGACY-PLAN','student_status','ACTIVE','tuition_status','ACTIVE',
 'currency','VND','discount_type','NONE','discount_value','0','final_amount','5500000','opening_paid_amount','3000000','opening_outstanding','2500000'));
set local role authenticated;
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000001',true);
insert into fixture(name,id) select 'batch',public.stage_legacy_batch('LEGACY-TEST','synthetic.csv',repeat('a',64),(now() at time zone 'Asia/Ho_Chi_Minh')::date,'ee100000-0000-0000-0000-000000000001',jsonb_build_array(payload)) from fixture where name='source';
insert into fixture(name,id) select 'row',id from public.migration_batch_rows where batch_id=(select id from fixture where name='batch');
select is(public.validate_legacy_batch((select id from fixture where name='batch')),1,'Batch dry run validates without importing');
select is((select expected_new_units from public.migration_row_preview where row_id=(select id from fixture where name='row')),0,'Unresolved row predicts no new business unit');
select is((select duplicate_status from public.migration_row_preview where row_id=(select id from fixture where name='row')),'NO_MATCH','New identity is NO_MATCH, not an invented match');
select is(public.review_legacy_row((select id from fixture where name='row'),1,'VALIDATE','Dry run'), 'NEEDS_REVIEW','Missing class remains NEEDS_REVIEW');
select ok((select validation_result ? 'CLASS_MAPPING_REQUIRED' from public.migration_batch_rows where id=(select id from fixture where name='row')),'Stable missing-class error recorded');
select is((select count(*) from public.students where student_code='LEGACY-STUDENT-1'),0::bigint,'Missing class creates no student');
select is((select count(*) from public.enrollments where class_id='ee500000-0000-0000-0000-000000000001'),0::bigint,'Missing class creates no enrollment');
select is((select count(*) from public.opening_receivables where branch_id='ee100000-0000-0000-0000-000000000001'),0::bigint,'Missing class creates no opening finance');
select is((select count(*) from public.invoices where branch_id_snapshot='ee100000-0000-0000-0000-000000000001'),0::bigint,'Missing class creates no invoice');
select is((select count(*) from public.payments where branch_id_snapshot='ee100000-0000-0000-0000-000000000001'),0::bigint,'Missing class creates no payment');
select throws_ok($$select public.import_legacy_row((select id from fixture where name='row'),1)$$,'P0001','Row requires mapping and independent approval','Direct import cannot bypass review');
select is((select normalized_payload from public.migration_batch_rows where id=(select id from fixture where name='row')),(select payload from fixture where name='source'),'Identity and finance payload retained intact');
select is(public.stage_legacy_batch('LEGACY-TEST','synthetic.csv',repeat('a',64),(now() at time zone 'Asia/Ho_Chi_Minh')::date,'ee100000-0000-0000-0000-000000000001',jsonb_build_array((select payload from fixture where name='source'))),(select id from fixture where name='batch'),'Same upload is idempotent');
select is(public.review_legacy_row((select id from fixture where name='row'),1,'MAP','Verified exact class',(select payload||'{"class_code":"LEGACY-CLASS"}'::jsonb from fixture where name='source')),'NEEDS_REVIEW','Mapping change requires renewed validation');
select is((select raw_payload from public.migration_batch_rows where id=(select id from fixture where name='row')),(select payload from fixture where name='source'),'Mapping never changes raw source');
select throws_ok($$select public.review_legacy_row((select id from fixture where name='row'),1,'VALIDATE','Stale')$$,'P0001','Stale or imported row','Stale review denied');
select is(public.review_legacy_row((select id from fixture where name='row'),2,'IDENTITY','Identity checked'),'VALIDATED','Valid identity review');
select is(public.review_legacy_row((select id from fixture where name='row'),2,'ACADEMIC','Grade 4 checked'),'VALIDATED','Valid academic review');
select throws_ok($$select public.review_legacy_row((select id from fixture where name='row'),2,'FINANCE','Self')$$,'P0001','Financial reviewer must be independent of uploader','Uploader cannot approve own financial baseline');
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000002',true);
select is(public.review_legacy_row((select id from fixture where name='row'),2,'FINANCE','Finance reconciled'),'READY','Independent finance reviewer makes row READY');
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000001',true);
select is((select expected_new_units from public.migration_row_preview where row_id=(select id from fixture where name='row')),1,'Approved mapped row predicts one student/enrollment unit');
select is((select expected_new_amount from public.migration_dry_run_summary where batch_id=(select id from fixture where name='batch')),5500000::numeric,'Dry-run amount is exact before posting');
select lives_ok($$select public.import_legacy_row((select id from fixture where name='row'),2)$$,'Valid mapping imports atomically');
select is((select duplicate_status from public.migration_row_preview where row_id=(select id from fixture where name='row')),'EXACT_MATCH','Committed source crosswalk is exact match');
select is((select expected_students from public.migration_dry_run_summary where batch_id=(select id from fixture where name='batch')),0::bigint,'Imported source is not projected as a second new student');
select is((select count(*) from public.students where student_code='LEGACY-STUDENT-1'),1::bigint,'Exactly one official student');
select is((select count(*) from public.enrollments where class_id='ee500000-0000-0000-0000-000000000001'),1::bigint,'Exactly one valid class enrollment');
select is((select opening_paid_amount+outstanding_balance from public.opening_receivable_balances where branch_id='ee100000-0000-0000-0000-000000000001'),5500000::numeric,'Exact opening reconciliation');
select is((select outstanding_balance from public.opening_receivable_balances where branch_id='ee100000-0000-0000-0000-000000000001'),2500000::numeric,'Exact opening debt');
select is((select count(*) from public.finance_cash_ledger where branch_id='ee100000-0000-0000-0000-000000000001'),0::bigint,'Opening settlement never creates cash');
select is((select coalesce(sum(projected_renewal_amount),0) from public.branch_monthly_revenue_forecast where branch_id='ee100000-0000-0000-0000-000000000001'),0::numeric,'Opening tuition never inflates forecast');
select is((select outstanding_amount from public.branch_finance_summary where branch_id='ee100000-0000-0000-0000-000000000001'),2500000::numeric,'Finance dashboard includes exact opening debt');
select is((select billed_amount+cash_received+applied_payment_amount from public.branch_finance_summary where branch_id='ee100000-0000-0000-0000-000000000001'),0::numeric,'Opening debt adds no billed revenue or cash');
select is((select issued_invoice_count from public.branch_finance_summary where branch_id='ee100000-0000-0000-0000-000000000001'),0::bigint,'Opening debt does not invent invoice counts');
select is((select total_outstanding from public.student_receivable_summary where student_id=(select target_student_id from public.migration_batch_rows where id=(select id from fixture where name='row'))),2500000::numeric,'Student summary includes opening debt');
select is((select count(*) from public.opening_receivable_directory where branch_id='ee100000-0000-0000-0000-000000000001'),1::bigint,'Opening debt is listed separately from invoices');
select throws_ok($$select public.import_legacy_row((select id from fixture where name='row'),null)$$,'P0001','Stale row version','Null version cannot bypass concurrency guard');
select lives_ok($$select public.import_legacy_row((select id from fixture where name='row'),2)$$,'Same row import retry succeeds');
select is((select count(*) from public.enrollments where class_id='ee500000-0000-0000-0000-000000000001'),1::bigint,'Retry cannot duplicate enrollment');
select is((select count(*) from public.opening_receivables where branch_id='ee100000-0000-0000-0000-000000000001'),1::bigint,'Retry cannot duplicate opening posting');
select is((select count(*) from public.student_level_progress lp join public.student_curriculum_enrollments ae on ae.id=lp.enrollment_id join public.students s on s.id=ae.student_id where s.student_code='LEGACY-STUDENT-1' and lp.status='COMPLETED'),0::bigint,'No fabricated earlier Grade passes');

-- Force an error at the final financial step: the entire student unit rolls back.
reset role;
create function pg_temp.reject_opening() returns trigger language plpgsql as $$ begin raise exception 'Injected final posting failure'; end $$;
create trigger legacy_test_final_failure before insert on public.opening_settlements for each row execute function pg_temp.reject_opening();
set local role authenticated;
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000001',true);
insert into fixture(name,id) select 'batch2',public.stage_legacy_batch('LEGACY-TEST','second.csv',repeat('b',64),(now() at time zone 'Asia/Ho_Chi_Minh')::date,'ee100000-0000-0000-0000-000000000001',jsonb_build_array(payload||'{"legacy_reference":"source-2","student_code":"LEGACY-STUDENT-2","full_name":"Second synthetic learner","class_code":"LEGACY-CLASS"}'::jsonb)) from fixture where name='source';
insert into fixture(name,id) select 'row2',id from public.migration_batch_rows where batch_id=(select id from fixture where name='batch2');
select public.review_legacy_row((select id from fixture where name='row2'),1,'IDENTITY','Checked');
select public.review_legacy_row((select id from fixture where name='row2'),1,'ACADEMIC','Checked');
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000002',true);
select public.review_legacy_row((select id from fixture where name='row2'),1,'FINANCE','Checked');
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.import_legacy_row((select id from fixture where name='row2'),1)$$,'P0001','Injected final posting failure','Final-step financial error fails whole student transaction');
select is((select count(*) from public.students where student_code='LEGACY-STUDENT-2'),0::bigint,'Student insert rolled back');
select is((select count(*) from public.enrollments where class_id='ee500000-0000-0000-0000-000000000001'),1::bigint,'Enrollment insert rolled back; first student preserved');
select is((select count(*) from public.opening_receivables where branch_id='ee100000-0000-0000-0000-000000000001'),1::bigint,'Opening receivable rolled back');
select is((select status from public.migration_batch_rows where id=(select id from fixture where name='row2')),'READY','Failed row remains resumable');
reset role;
drop trigger legacy_test_final_failure on public.opening_settlements;
set local role authenticated;
select lives_ok($$select public.import_legacy_row((select id from fixture where name='row2'),1)$$,'Resume after transient error imports successfully');
select is((select sum(opening_paid_amount+outstanding_balance) from public.opening_receivable_balances where branch_id='ee100000-0000-0000-0000-000000000001'),11000000::numeric,'Both student units reconcile exactly');


create function pg_temp.approved_legacy(payload jsonb,hash_char text) returns uuid language plpgsql as $$
declare bid uuid; rid uuid;
begin
 perform set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000001',true);
 bid:=public.stage_legacy_batch('LEGACY-TEST','additional.csv',repeat(hash_char,64),(now() at time zone 'Asia/Ho_Chi_Minh')::date,'ee100000-0000-0000-0000-000000000001',jsonb_build_array(payload));
 select id into rid from public.migration_batch_rows where batch_id=bid;
 perform public.review_legacy_row(rid,1,'IDENTITY','Checked');
 perform public.review_legacy_row(rid,1,'ACADEMIC','Checked');
 perform set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000002',true);
 perform public.review_legacy_row(rid,1,'FINANCE','Checked independently');
 perform set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000001',true);
 return rid;
end $$;
insert into fixture(name,id) select 'repeat-row',pg_temp.approved_legacy(normalized_payload,'c') from public.migration_batch_rows where id=(select id from fixture where name='row');
select lives_ok($$select public.import_legacy_row((select id from fixture where name='repeat-row'),1)$$,'Same source in another file reuses official entities');
select is((select count(*) from public.enrollments where class_id='ee500000-0000-0000-0000-000000000001'),2::bigint,'Cross-batch replay cannot duplicate enrollment');
select is((select amount_difference+paid_difference+outstanding_difference from public.migration_reconciliation where row_id=(select id from fixture where name='repeat-row')),0::numeric,'Reused row reconciles to original posting');
insert into fixture(name,id) select 'historical',pg_temp.approved_legacy(payload||jsonb_build_object('legacy_reference','history','student_code','LEGACY-HISTORY','full_name','Historical start learner','class_code','LEGACY-CLASS','started_at',((now() at time zone 'Asia/Ho_Chi_Minh')::date-365)::text),'d') from fixture where name='source';
select lives_ok($$select public.import_legacy_row((select id from fixture where name='historical'),1)$$,'Current term may start after original activation anchor');
select is((select e.started_at from public.enrollments e join public.students s on s.id=e.student_id where s.student_code='LEGACY-HISTORY'),(now() at time zone 'Asia/Ho_Chi_Minh')::date-365,'Original started_at preserved');
insert into fixture(name,id) select 'paused',pg_temp.approved_legacy(payload||jsonb_build_object('legacy_reference','paused','student_code','LEGACY-PAUSED','full_name','Paused legacy learner','class_code','LEGACY-CLASS','student_status','PAUSED','tuition_status','PAUSED','started_at',((now() at time zone 'Asia/Ho_Chi_Minh')::date-365)::text,'tuition_starts_on',((now() at time zone 'Asia/Ho_Chi_Minh')::date-10)::text,'pause_starts_on',((now() at time zone 'Asia/Ho_Chi_Minh')::date-2)::text,'pause_ends_on',((now() at time zone 'Asia/Ho_Chi_Minh')::date+2)::text,'effective_ends_on',(public.calculate_tuition_base_end((now() at time zone 'Asia/Ho_Chi_Minh')::date-10,1)+12)::text),'e') from fixture where name='source';
select lives_ok($$select public.import_legacy_row((select id from fixture where name='paused'),1)$$,'Paused opening baseline imports current pause only');
select is((select t.legacy_extension_days from public.enrollment_tuition t join public.migration_batch_rows r on r.target_tuition_id=t.id where r.id=(select id from fixture where name='paused')),7,'Historical extension excludes current pause contribution');
select is((select count(*) from public.enrollment_pauses ep join public.migration_batch_rows r on r.target_enrollment_id=ep.enrollment_id where r.id=(select id from fixture where name='paused')),1::bigint,'No fabricated historical pause events');
select is((select t.effective_ends_on from public.enrollment_tuition t join public.migration_batch_rows r on r.target_tuition_id=t.id where r.id=(select id from fixture where name='paused')),public.calculate_tuition_base_end((now() at time zone 'Asia/Ho_Chi_Minh')::date-10,1)+12,'Accepted effective end reconciles exactly');
insert into fixture(name,id) select 'expired',pg_temp.approved_legacy(payload||jsonb_build_object('legacy_reference','expired','student_code','LEGACY-EXPIRED','full_name','Expired legacy learner','class_code','LEGACY-CLASS','tuition_status','EXPIRED','started_at',((now() at time zone 'Asia/Ho_Chi_Minh')::date-365)::text,'tuition_starts_on',((now() at time zone 'Asia/Ho_Chi_Minh')::date-90)::text),'f') from fixture where name='source';
select lives_ok($$select public.import_legacy_row((select id from fixture where name='expired'),1)$$,'Expired tuition retains opening debt without renewal');
select is((select t.status from public.enrollment_tuition t join public.migration_batch_rows r on r.target_tuition_id=t.id where r.id=(select id from fixture where name='expired')),'COMPLETED','Expired source maps to existing completed term state');


select is(public.rollback_legacy_row((select id from fixture where name='row'),false,'Discard synthetic pilot'),'REQUESTED','Rollback requires separate approval');
select throws_ok($$select public.rollback_legacy_row((select id from fixture where name='row'),true,'Self')$$,'P0001','Rollback maker cannot approve own request','Rollback self approval denied');
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000002',true);
select is(public.rollback_legacy_row((select id from fixture where name='row'),true,'Checked no activity'),'COMPLETED','Independent reviewer reverses untouched pilot');
select is((select status from public.migration_batch_rows where id=(select id from fixture where name='row')),'ROLLED_BACK','Original import marked rolled back');
select is((select status from public.migration_batch_rows where id=(select id from fixture where name='repeat-row')),'ROLLED_BACK','Replay alias follows original reversal');
select is((select net_opening_amount+net_opening_paid+outstanding_balance from public.opening_receivable_balances where migration_row_id=(select id from fixture where name='row')),0::numeric,'Reversal zeros net opening balances without deleting original');
select is((select count(*) from public.opening_receivables where migration_row_id=(select id from fixture where name='row')),1::bigint,'Original opening history preserved');
select is((select status from public.students where student_code='LEGACY-STUDENT-1'),'ARCHIVED','Rolled-back pilot has no active student entitlement');
select is(public.rollback_legacy_row((select id from fixture where name='row'),true,'Retry'),'COMPLETED','Rollback retry is idempotent');
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000001',true);
select public.create_payment((select target_student_id from public.migration_batch_rows where id=(select id from fixture where name='historical')),'ee100000-0000-0000-0000-000000000001',100,'VND','CASH',now(),'POST-IMPORT','Real post-cutover activity fixture');
select public.rollback_legacy_row((select id from fixture where name='historical'),false,'Attempt after activity');
select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000002',true);
select is(public.rollback_legacy_row((select id from fixture where name='historical'),true,'Inspect activity'),'BLOCKED','Post-cutover financial activity blocks rollback');
select is((select count(*) from public.opening_reversals where rollback_row_id=(select id from fixture where name='historical')),0::bigint,'Blocked rollback posts no financial reversal');
select is((select status from public.students where student_code='LEGACY-HISTORY'),'ACTIVE','Blocked rollback preserves student');
select lives_ok($$select public.sign_off_legacy_batch((select batch_id from public.migration_batch_rows where id=(select id from fixture where name='expired')),'All amounts reconciled')$$,'Exact batch can be signed off');
select throws_ok($$select public.rollback_legacy_row((select id from fixture where name='expired'),false,'After acceptance')$$,'P0001','Source batch requires correction, not rollback','Signed-off baseline requires correction');

select set_config('request.jwt.claim.sub','ee000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.migration_batches where source_system='LEGACY-TEST'),0::bigint,'Unprivileged identity cannot read source');
select throws_ok($$select public.import_legacy_row((select id from fixture where name='row'),2)$$,'P0001','Unauthorized','Unprivileged import denied');
select ok(not has_table_privilege('authenticated','public.migration_batch_rows','UPDATE'),'No direct row write bypass');
select ok(not has_table_privilege('service_role','public.opening_receivables','INSERT'),'No service direct posting bypass');
select * from finish();
rollback;
