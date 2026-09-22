begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_function('public','get_financial_management_report','Canonical report RPC exists');
select ok((select prosecdef from pg_proc where oid='public.get_financial_management_report(date,uuid,text)'::regprocedure),'Report RPC is SECURITY DEFINER');
select is((select proconfig from pg_proc where oid='public.get_financial_management_report(date,uuid,text)'::regprocedure),array['search_path=public, pg_temp']::text[],'Report RPC pins search_path');
select ok(not has_function_privilege('anon','public.get_financial_management_report(date,uuid,text)','EXECUTE'),'Anonymous cannot execute report RPC');
select ok(not has_schema_privilege('authenticated','vibe_financial_report_private','USAGE'),'Private report schema is not exposed');

insert into public.branches(id,code,name) values
 ('0f100000-0000-4000-8000-000000000001','FM-A','Finance Report A'),
 ('0f100000-0000-4000-8000-000000000002','FM-B','Finance Report B');
insert into auth.users(id) values
 ('0f200000-0000-4000-8000-000000000001'),
 ('0f200000-0000-4000-8000-000000000002'),
 ('0f200000-0000-4000-8000-000000000003'),
 ('0f200000-0000-4000-8000-000000000004');
insert into public.profiles(id,status,full_name) values
 ('0f200000-0000-4000-8000-000000000001','ACTIVE','FM Super Admin'),
 ('0f200000-0000-4000-8000-000000000002','ACTIVE','FM Finance A'),
 ('0f200000-0000-4000-8000-000000000003','ACTIVE','FM Teacher'),
 ('0f200000-0000-4000-8000-000000000004','ACTIVE','FM Staff');
insert into public.user_roles(user_id,role_id)
select '0f200000-0000-4000-8000-000000000001',id from public.roles where code='SUPER_ADMIN';
insert into public.user_roles(user_id,role_id,branch_id)
select '0f200000-0000-4000-8000-000000000002',id,'0f100000-0000-4000-8000-000000000001' from public.roles where code='FINANCE';
insert into public.user_roles(user_id,role_id)
select '0f200000-0000-4000-8000-000000000003',id from public.roles where code='TEACHER';
insert into public.user_roles(user_id,role_id)
select '0f200000-0000-4000-8000-000000000004',id from public.roles where code='STAFF';

insert into public.curriculums(id,code,name) values ('0f110000-0000-4000-8000-000000000001','FM-CUR','FM Curriculum');
insert into public.curriculum_levels(id,curriculum_id,code,name,sequence_no) values
 ('0f120000-0000-4000-8000-000000000001','0f110000-0000-4000-8000-000000000001','FM-L1','FM Level',1);
insert into public.courses(id,curriculum_id,level_id,code,name) values
 ('0f130000-0000-4000-8000-000000000001','0f110000-0000-4000-8000-000000000001','0f120000-0000-4000-8000-000000000001','FM-COURSE','FM Course');
insert into public.classes(id,branch_id,course_id,code,name,class_type,capacity,status) values
 ('0f140000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','0f130000-0000-4000-8000-000000000001','FM-CLASS-A','FM Class A','GROUP',8,'ACTIVE'),
 ('0f140000-0000-4000-8000-000000000002','0f100000-0000-4000-8000-000000000002','0f130000-0000-4000-8000-000000000001','FM-CLASS-B','FM Class B','GROUP',8,'ACTIVE');
insert into public.students(id,student_code,default_branch_id,full_name) values
 ('0f150000-0000-4000-8000-000000000001','FM-STU-1','0f100000-0000-4000-8000-000000000001','FM Student 1'),
 ('0f150000-0000-4000-8000-000000000002','FM-STU-2','0f100000-0000-4000-8000-000000000001','FM Student 2'),
 ('0f150000-0000-4000-8000-000000000003','FM-STU-3','0f100000-0000-4000-8000-000000000002','FM Student 3'),
 ('0f150000-0000-4000-8000-000000000004','FM-STU-4','0f100000-0000-4000-8000-000000000001','FM Student 4');
insert into public.enrollments(id,student_id,class_id,enrolled_at,started_at,status) values
 ('0f160000-0000-4000-8000-000000000001','0f150000-0000-4000-8000-000000000001','0f140000-0000-4000-8000-000000000001','2026-08-01','2026-09-01','ACTIVE'),
 ('0f160000-0000-4000-8000-000000000002','0f150000-0000-4000-8000-000000000002','0f140000-0000-4000-8000-000000000001','2025-12-01','2026-01-01','ACTIVE'),
 ('0f160000-0000-4000-8000-000000000003','0f150000-0000-4000-8000-000000000003','0f140000-0000-4000-8000-000000000002','2026-08-01','2026-09-01','ACTIVE'),
 ('0f160000-0000-4000-8000-000000000004','0f150000-0000-4000-8000-000000000004','0f140000-0000-4000-8000-000000000001','2026-08-01','2026-09-01','ACTIVE');

insert into public.tuition_plans(id,code,name,duration_months,status) values
 ('0f170000-0000-4000-8000-000000000001','FM-3M','FM three month',3,'ACTIVE'),
 ('0f170000-0000-4000-8000-000000000002','FM-3M-USD','FM three month USD',3,'ACTIVE'),
 ('0f170000-0000-4000-8000-000000000003','FM-1M','FM one month',1,'ACTIVE');
insert into public.tuition_plan_branch_prices(tuition_plan_id,branch_id,list_price,currency,status) values
 ('0f170000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001',9000000,'VND','ACTIVE'),
 ('0f170000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000002',3000000,'VND','ACTIVE'),
 ('0f170000-0000-4000-8000-000000000002','0f100000-0000-4000-8000-000000000002',100,'USD','ACTIVE'),
 ('0f170000-0000-4000-8000-000000000003','0f100000-0000-4000-8000-000000000001',8000000,'VND','ACTIVE');

insert into public.enrollment_tuition(id,enrollment_id,tuition_plan_id,starts_on) values
 ('0f180000-0000-4000-8000-000000000001','0f160000-0000-4000-8000-000000000001','0f170000-0000-4000-8000-000000000001','2026-09-01'),
 ('0f180000-0000-4000-8000-000000000002','0f160000-0000-4000-8000-000000000002','0f170000-0000-4000-8000-000000000001','2026-01-01'),
 ('0f180000-0000-4000-8000-000000000003','0f160000-0000-4000-8000-000000000003','0f170000-0000-4000-8000-000000000001','2026-09-01'),
 ('0f180000-0000-4000-8000-000000000004','0f160000-0000-4000-8000-000000000004','0f170000-0000-4000-8000-000000000001','2026-09-01');
insert into public.enrollment_pauses(enrollment_id,starts_on,ends_on,reason,created_by) values
 ('0f160000-0000-4000-8000-000000000002','2026-02-01','2026-02-28','Pause February','0f200000-0000-4000-8000-000000000001');
update public.enrollment_tuition set status='CANCELLED' where id='0f180000-0000-4000-8000-000000000004';

insert into public.employees(id,employee_code,home_unit,hire_date,profile_id,created_by) values
 ('0f300000-0000-4000-8000-000000000001','FM-E1','HQ','2026-01-01','0f200000-0000-4000-8000-000000000004','0f200000-0000-4000-8000-000000000001');
insert into public.employee_versions(employee_id,version,effective_on,full_name,unit_code,employee_group,employment_status,pay_type,reason,created_by) values
 ('0f300000-0000-4000-8000-000000000001',1,'2026-01-01','FM Employee','HQ','STAFF','ACTIVE','MONTHLY','Fixture','0f200000-0000-4000-8000-000000000001');
insert into public.staff_compensation_components(id,employee_id,branch_id,component_code,calculation_method,amount,currency,effective_from,reason,created_by) values
 ('0f310000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','BASE_SALARY','FIXED_AMOUNT',10000000,'VND','2026-09-01','Fixture','0f200000-0000-4000-8000-000000000001'),
 ('0f310000-0000-4000-8000-000000000002','0f300000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','SOCIAL_LABOR_INSURANCE','FIXED_AMOUNT',1000000,'VND','2026-09-01','Fixture','0f200000-0000-4000-8000-000000000001');

insert into public.payroll_periods(id,branch_id,starts_on,ends_on,status) values
 ('0f320000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','2026-09-01','2026-09-30','DRAFT'),
 ('0f320000-0000-4000-8000-000000000002','0f100000-0000-4000-8000-000000000001','2026-08-01','2026-08-31','DRAFT');
insert into public.teacher_payrolls(id,period_id,employee_id,branch_id,teacher_name,pay_type,currency,calculation_version) values
 ('0f330000-0000-4000-8000-000000000001','0f320000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','FM Employee','MONTHLY','VND','PAYROLL_V2_1'),
 ('0f330000-0000-4000-8000-000000000002','0f320000-0000-4000-8000-000000000002','0f300000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','FM Employee','MONTHLY','VND','PAYROLL_V2_1');
update public.payroll_periods set status='FINALIZED', version=version+1, finalized_by='0f200000-0000-4000-8000-000000000001', finalized_at=clock_timestamp()
where id='0f320000-0000-4000-8000-000000000002';
insert into public.payroll_component_lines_v2(id,payroll_id,employee_id,component_config_id,component_code,category,calculation_method,source_type,earned_on,quantity,unit_rate,amount,currency,source_snapshot) values
 ('0f340000-0000-4000-8000-000000000001','0f330000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001','0f310000-0000-4000-8000-000000000001','BASE_SALARY','EARNING','FIXED_AMOUNT','CONFIG','2026-09-01',1,10000000,10000000,'VND','{}'),
 ('0f340000-0000-4000-8000-000000000002','0f330000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001','0f310000-0000-4000-8000-000000000002','SOCIAL_LABOR_INSURANCE','DEDUCTION','FIXED_AMOUNT','CONFIG','2026-09-01',1,1000000,1000000,'VND','{}');
insert into public.employee_expense_claims(id,employee_id,branch_id,requested_month,currency,title,status,created_by,submitted_at,submitted_snapshot,reviewed_by,reviewed_at,review_reason,approved_amount)
values (
  '0f350000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','2026-09-01','VND','Travel fixture','APPROVED','0f200000-0000-4000-8000-000000000004',
  clock_timestamp(),'{"total_amount":2000000}'::jsonb,'0f200000-0000-4000-8000-000000000001',clock_timestamp(),'Approved fixture',2000000
);
insert into public.payroll_period_actions_v2(period_id,employee_id,component_code,category,source_type,source_expense_claim_id,amount,currency,reason,request_key,request_payload,source_snapshot,created_by)
values (
  '0f320000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001','TRAVEL_EXPENSE','REIMBURSEMENT','EXPENSE_CLAIM','0f350000-0000-4000-8000-000000000001',
  2000000,'VND','Posted travel','0f360000-0000-4000-8000-000000000001','{}','{"approved_amount":2000000}','0f200000-0000-4000-8000-000000000001'
);
select lives_ok($$select public.refresh_staff_payroll_v2_totals('0f320000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001')$$,'Refresh September payroll totals');

insert into public.operating_expense_templates(id,branch_id,category,name,vendor,amount_mode,expected_amount,currency,effective_from,created_by) values
 ('0f400000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','RENT','Rent A','Landlord','FIXED',20000000,'VND','2026-09-01','0f200000-0000-4000-8000-000000000001'),
 ('0f400000-0000-4000-8000-000000000002','0f100000-0000-4000-8000-000000000001','ELECTRICITY','Power A',null,'VARIABLE',null,'VND','2026-09-01','0f200000-0000-4000-8000-000000000001'),
 ('0f400000-0000-4000-8000-000000000003','0f100000-0000-4000-8000-000000000002','RENT','Rent B','Landlord','FIXED',5000000,'VND','2026-09-01','0f200000-0000-4000-8000-000000000001');
insert into public.operating_expense_records(id,template_id,branch_id,expense_month,category,name,expected_amount,actual_amount,currency,status,created_by,recorded_by,recorded_at) values
 ('0f410000-0000-4000-8000-000000000001','0f400000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001','2026-09-01','RENT','Rent A',20000000,20000000,'VND','RECORDED','0f200000-0000-4000-8000-000000000001','0f200000-0000-4000-8000-000000000001',clock_timestamp()),
 ('0f410000-0000-4000-8000-000000000003','0f400000-0000-4000-8000-000000000003','0f100000-0000-4000-8000-000000000002','2026-09-01','RENT','Rent B',5000000,5000000,'VND','RECORDED','0f200000-0000-4000-8000-000000000001','0f200000-0000-4000-8000-000000000001',clock_timestamp());
insert into public.operating_expense_records(id,template_id,branch_id,expense_month,category,name,expected_amount,actual_amount,currency,status,created_by) values
 ('0f410000-0000-4000-8000-000000000002','0f400000-0000-4000-8000-000000000002','0f100000-0000-4000-8000-000000000001','2026-09-01','ELECTRICITY','Power A',null,null,'VND','DRAFT','0f200000-0000-4000-8000-000000000001');

insert into public.students(id,student_code,default_branch_id,full_name) values
 ('0f150000-0000-4000-8000-000000000005','FM-STU-5','0f100000-0000-4000-8000-000000000001','FM Student 5');
insert into public.enrollments(id,student_id,class_id,enrolled_at,started_at,status) values
 ('0f160000-0000-4000-8000-000000000005','0f150000-0000-4000-8000-000000000005','0f140000-0000-4000-8000-000000000001','2026-06-01','2026-07-01','ACTIVE');
insert into public.enrollment_tuition(id,enrollment_id,tuition_plan_id,starts_on) values
 ('0f180000-0000-4000-8000-000000000006','0f160000-0000-4000-8000-000000000005','0f170000-0000-4000-8000-000000000003','2026-07-01');
update public.enrollment_tuition set status='CANCELLED' where id='0f180000-0000-4000-8000-000000000006';

insert into public.schedules(id,class_id,day_of_week,start_time,end_time,effective_from,timezone,status) values
 ('0f190000-0000-4000-8000-000000000001','0f140000-0000-4000-8000-000000000001',1,'09:00','10:00','2026-06-01','Asia/Ho_Chi_Minh','ACTIVE');
insert into public.session_occurrences(id,schedule_id,occurrence_date,starts_at,ends_at,status) values
 ('0f191000-0000-4000-8000-000000000001','0f190000-0000-4000-8000-000000000001','2026-06-01','2026-06-01 09:00:00+07','2026-06-01 10:00:00+07','COMPLETED');

insert into public.payroll_periods(id,branch_id,starts_on,ends_on,status) values
 ('0f320000-0000-4000-8000-000000000003','0f100000-0000-4000-8000-000000000001','2026-06-01','2026-06-30','DRAFT');
insert into public.teacher_payrolls(
  id,period_id,employee_id,branch_id,teacher_name,pay_type,currency,
  base_salary,hourly_earnings,adjustment_amount,gross_amount
) values (
  '0f330000-0000-4000-8000-000000000003','0f320000-0000-4000-8000-000000000003',
  '0f300000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001',
  'FM Employee','MONTHLY','VND',8000000,2000000,500000,10500000
);
insert into public.payroll_earning_lines(
  id,payroll_id,employee_id,branch_id,earned_on,earning_type,rate,amount
) values (
  '0f341000-0000-4000-8000-000000000001','0f330000-0000-4000-8000-000000000003',
  '0f300000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001',
  '2026-06-01','MONTHLY_BASE',8000000,8000000
);
insert into public.payroll_earning_lines(
  id,payroll_id,session_id,employee_id,class_id,branch_id,earned_on,earning_type,duration_hours,rate,amount
) values (
  '0f341000-0000-4000-8000-000000000002','0f330000-0000-4000-8000-000000000003',
  '0f191000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001',
  '0f140000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001',
  '2026-06-01','TEACHING',1,2000000,2000000
);
insert into public.payroll_adjustments(id,payroll_id,kind,amount,reason,created_by) values
 ('0f342000-0000-4000-8000-000000000001','0f330000-0000-4000-8000-000000000003','BONUS',1000000,'Legacy bonus fixture','0f200000-0000-4000-8000-000000000001'),
 ('0f342000-0000-4000-8000-000000000002','0f330000-0000-4000-8000-000000000003','DEDUCTION',-500000,'Legacy deduction fixture','0f200000-0000-4000-8000-000000000001');
update public.payroll_periods set status='FINALIZED', version=version+1, finalized_by='0f200000-0000-4000-8000-000000000001', finalized_at=clock_timestamp()
where id='0f320000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub','0f200000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.get_financial_management_report('2026-09-01',null,'VND')$$,'P0001','FINANCIAL_REPORT_UNAUTHORIZED','Teacher cannot read consolidated report');
select set_config('request.jwt.claim.sub','0f200000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.get_financial_management_report('2026-09-01',null,'VND')$$,'P0001','FINANCIAL_REPORT_UNAUTHORIZED','FINANCE cannot request consolidated by sending null branch');
select throws_ok($$select public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000002','VND')$$,'P0001','FINANCIAL_REPORT_UNAUTHORIZED','FINANCE cannot read another branch');
select set_config('request.jwt.claim.sub','0f200000-0000-4000-8000-000000000001',true);

select is((select amount from public.enrollment_tuition where id='0f180000-0000-4000-8000-000000000001'),9000000.00,'Term net amount is list price after discount');
select is((select effective_ends_on from public.enrollment_tuition where id='0f180000-0000-4000-8000-000000000002'),'2026-04-28'::date,'Pause extends effective end through April');

reset role;
select is((
  select sum(amount)
  from vibe_financial_report_private.tuition_month_amounts(array['0f100000-0000-4000-8000-000000000001'::uuid],'VND')
  where tuition_id='0f180000-0000-4000-8000-000000000001' and not unresolved
),9000000::numeric,'F01 completed term recognition reconciles to term amount');

select is((
  select coalesce(sum(amount),0)
  from vibe_financial_report_private.tuition_month_amounts(array['0f100000-0000-4000-8000-000000000001'::uuid],'VND')
  where tuition_id='0f180000-0000-4000-8000-000000000002' and month_start='2026-02-01' and not unresolved
),0::numeric,'F02 paused February recognizes zero');

select is((
  select sum(amount)
  from vibe_financial_report_private.tuition_month_amounts(array['0f100000-0000-4000-8000-000000000001'::uuid],'VND')
  where tuition_id='0f180000-0000-4000-8000-000000000002' and not unresolved
),9000000::numeric,'F02 pause redistributes across remaining active days and still reconciles');

set local role authenticated;
select set_config('request.jwt.claim.sub','0f200000-0000-4000-8000-000000000001',true);

select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,status}'),'PARTIAL','F03 cancelled overlapping term makes revenue PARTIAL');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,reason}') like 'CANCELLATION_POLICY_UNRESOLVED%','F03 unresolved cancellation reason is explicit');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions'->'warnings')::text like '%CANCELLED%','F03 warning present');

select public.create_tuition_invoice('0f180000-0000-4000-8000-000000000001',null);
select public.issue_invoice((select id from public.invoices where enrollment_tuition_id='0f180000-0000-4000-8000-000000000001'),'2026-09-01','2026-09-15');
select is((select total_amount from public.invoices where enrollment_tuition_id='0f180000-0000-4000-8000-000000000001'),9000000.00,'Issued invoice is 9m');
select isnt((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,value}')::numeric,9000000::numeric,'F04 invoice issued amount is not used as monthly revenue');

create temp table fm_revenue_before as
select (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,value}')::numeric as amount;

select public.create_payment('0f150000-0000-4000-8000-000000000001','0f100000-0000-4000-8000-000000000001',7000000,'VND','CASH',timestamptz '2026-09-10 09:00:00+07','FM-PAY-70','Partial');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,tuition_cash_in,value}')::numeric,7000000::numeric,'F05 cash in is posted payment');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,value}')::numeric,(select amount from fm_revenue_before),'F05 payment does not mutate revenue');

reset role;
select public.refresh_staff_payroll_v2_totals('0f320000-0000-4000-8000-000000000001','0f300000-0000-4000-8000-000000000001');
update public.payroll_periods set status='FINALIZED', version=version+1, finalized_by='0f200000-0000-4000-8000-000000000001', finalized_at=clock_timestamp()
where id='0f320000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','0f200000-0000-4000-8000-000000000001',true);

select is((select v2_net_amount from public.teacher_payrolls where id='0f330000-0000-4000-8000-000000000001'),11000000.00,'Net pay is 11m');
select is((select gross_amount from public.teacher_payrolls where id='0f330000-0000-4000-8000-000000000001'),11000000.00,'V2 gross alias equals net');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,personnel_expense,value}')::numeric,10000000::numeric,'F06/F08/F23 personnel is earnings 10m not net/gross 11m');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,travel_reimbursement_expense,value}')::numeric,2000000::numeric,'F06/F09 travel is 2m once');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{obligations,payroll_recognized_payable,value}')::numeric,11000000::numeric,'F06 payable is net 11m');

select is((public.record_payroll_disbursement('0f330000-0000-4000-8000-000000000001',6000000,'VND','2026-09-20','CASH',null,'partial','0f500000-0000-4000-8000-000000000001')->>'payment_status'),'PARTIALLY_PAID','F07 first disbursement');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,payroll_cash_out,value}')::numeric,6000000::numeric,'F07 cash out 6m');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{obligations,payroll_disbursable_remaining,value}')::numeric,5000000::numeric,'F07 remaining 5m');
select is((public.record_payroll_disbursement('0f330000-0000-4000-8000-000000000001',5000000,'VND','2026-09-21','CASH',null,'rest','0f500000-0000-4000-8000-000000000002')->>'payment_status'),'PAID','F07 second disbursement');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,payroll_cash_out,value}')::numeric,11000000::numeric,'F07 cumulative cash out 11m');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{obligations,payroll_disbursable_remaining,value}')::numeric,0::numeric,'F07 remaining 0');

select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,operating_expense,value}')::numeric,20000000::numeric,'F10 recorded opex is P&L actual');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,opex_cash_out,value}'),null,'F10 opex cash out is null');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{obligations,opex_payable,value}'),null,'F10 opex payable is null');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,recorded_amount}')::numeric,20000000::numeric,'F11 draft electricity is not actual');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,planned_amount}')::numeric,20000000::numeric,'F13 variable without plan is omitted from planned total');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,planned_status}'),'PARTIAL','B: incomplete VARIABLE plan is PARTIAL');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,planned_known_amount}')::numeric,20000000::numeric,'B: known plan is not coerced to 0');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,variance_amount}'),null,'B: incomplete plan variance is null');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,unplanned_template_count}')::int,1,'B: one unplanned VARIABLE record');
select ok(exists (
  select 1 from jsonb_array_elements(public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'operating_expense'->'by_category') c
  where c->>'category'='ELECTRICITY' and c->>'planned' is null
),'F13 electricity planned is JSON null not 0');

select public.update_operating_expense_template('0f400000-0000-4000-8000-000000000001',1,'RENT',null,'Rent A','Landlord','FIXED',25000000,'VND','2026-09-01',null,'0f510000-0000-4000-8000-000000000001');
select is((select expected_amount from public.operating_expense_records where id='0f410000-0000-4000-8000-000000000001'),20000000.00,'F12 historical opex plan snapshot is unchanged');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,planned_amount}')::numeric,20000000::numeric,'F12 report still uses recorded snapshot plan');

select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,management_result,value}'),null,'F16 management result is null');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,management_margin,value}'),null,'F16 management margin is null');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,loan_drawdown,value}'),null,'F15 loan drawdown is null');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{obligations,loan_balance,value}'),null,'F15 loan balance is null');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions'->'warnings')::text like '%kết quả quản trị sau chi phí tài chính%','F16 management warning wording is locked');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions'->'facts')::text like '%Kết quả hoạt động xác định được từ các nguồn đủ điều kiện%','PARTIAL operating result uses known-source wording');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions')::text not like '%Doanh thu tháng là%'
  and (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions')::text not like '%Doanh thu ghi nhận trong tháng là%','PARTIAL revenue does not claim complete monthly revenue');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions'->'facts')::text like '%Doanh thu xác định được từ các hồ sơ đủ điều kiện%','PARTIAL revenue uses resolvable-term wording');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions')::text not like '%lợi nhuận%'
  and (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions')::text not like '%kết quả cuối cùng%','No profit or final-result wording');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions'->'warnings')::text like '%không đồng nghĩa đã thanh toán%','OPEX cash warning does not say da chi');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,unresolved_source_count}')::int,1,'F: unresolved cancelled term count is 1');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,operating_result,status}'),'PARTIAL','PARTIAL revenue keeps operating result PARTIAL');
select is((public.get_financial_management_report('2026-09-01',null,'VND')#>>'{pnl,revenue,status}'),'PARTIAL','Consolidation does not erase branch PARTIAL revenue');
select ok((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions')::text not like '%Kết quả quản trị dương%'
  and (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions')::text not like '%Kết quả quản trị âm%','No management profit/loss wording');

select is((public.get_financial_management_report('2026-09-01',null,'VND')#>>'{pnl,operating_expense,value}')::numeric,25000000::numeric,'F17 consolidated opex sums branches');
select is((
  (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,operating_expense,value}')::numeric
  + (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000002','VND')#>>'{pnl,operating_expense,value}')::numeric
),(public.get_financial_management_report('2026-09-01',null,'VND')#>>'{pnl,operating_expense,value}')::numeric,'F24/F17 branch opex totals equal consolidated');

insert into public.enrollment_tuition(id,enrollment_id,tuition_plan_id,starts_on)
select '0f180000-0000-4000-8000-000000000005','0f160000-0000-4000-8000-000000000003','0f170000-0000-4000-8000-000000000002','2026-09-01'
where false;
-- Currency isolation uses branch B USD plan on a dedicated enrollment already started Sep 1 on branch B.
-- First term already exists in VND for student 3; create a second currency via a new student/class already in fixtures? Student 3 first term is VND 3m.
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000002','USD')#>>'{pnl,operating_expense,value}')::numeric,0::numeric,'F18 USD report does not include VND opex');

select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{receivables,current_tuition_receivable,as_of_type}'),'LIVE','F20 current AR is LIVE');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{receivables,month_end_receivable,value}'),null,'F20 month-end AR is null');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{previous_period,changes,personnel_expense,pct}'),null,'F19 previous zero yields null percent');

select is((public.cancel_payroll_disbursement((select id from public.payroll_disbursements where request_key='0f500000-0000-4000-8000-000000000001'),'Reverse first payment','0f520000-0000-4000-8000-000000000001')->>'paid_amount')::numeric,5000000::numeric,'F21 cancel leaves active remainder');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,payroll_cash_out,value}')::numeric,5000000::numeric,'F21 cancelled disbursement excluded from cash out');

select is((select jsonb_array_length(public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'trend_12_months')),12,'Trend contains 12 month points');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'trend_12_months'->0->>'month'),'2025-10-01','Trend starts 11 months before selected month');
select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'trend_12_months'->11->>'month'),'2026-09-01','Trend ends at selected month');

select is((
  select sum((value->>'actual')::numeric)
  from jsonb_array_elements(public.get_financial_management_report('2026-09-01',null,'VND')->'operating_expense'->'by_branch')
),(public.get_financial_management_report('2026-09-01',null,'VND')#>>'{pnl,operating_expense,value}')::numeric,'Invariant: opex by_branch sums to P&L');

select is((public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,net_integrated,value}')::numeric,
  (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,total_in_integrated,value}')::numeric
  - (public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{cash_flow,total_out_integrated,value}')::numeric,
  'Invariant: integrated in minus out equals net');

select is((public.get_financial_management_report('2026-08-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,personnel_expense,value}')::numeric,0::numeric,'F22 retroactive earning is not recognized in source August');
select is((public.get_financial_management_report('2026-08-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,travel_reimbursement_expense,value}')::numeric,0::numeric,'D: no travel claims is 0 not null');
select is((public.get_financial_management_report('2026-08-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,travel_reimbursement_expense,status}'),'AVAILABLE','D: no travel claims is AVAILABLE');

select is((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,operating_expense,value}')::numeric,0::numeric,'A: no opex records actual is 0');
select is((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,operating_expense,status}'),'AVAILABLE','A: no opex records status AVAILABLE');
select is((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,planned_status}'),'AVAILABLE','A: empty opex plan AVAILABLE');
select is((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,planned_known_amount}')::numeric,0::numeric,'A: empty opex plan known amount is 0');
select is((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,personnel_expense,value}')::numeric,11000000::numeric,'Legacy personnel is MONTHLY_BASE + TEACHING + BONUS not gross 10.5m');
select isnt((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,personnel_expense,value}')::numeric,10500000::numeric,'Legacy personnel is not gross_amount');
select is((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,personnel_expense,status}'),'AVAILABLE','Classified legacy bonus and deduction keep personnel AVAILABLE');
select is((public.get_financial_management_report('2026-06-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,travel_reimbursement_expense,value}')::numeric,0::numeric,'D/June: no travel allowance is 0 AVAILABLE');

select is((public.get_financial_management_report('2026-07-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,value}'),null,'E: cancelled-only unresolved revenue value is null');
select is((public.get_financial_management_report('2026-07-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,revenue,status}'),'PARTIAL','E: cancelled-only revenue is PARTIAL');
select ok((public.get_financial_management_report('2026-07-01','0f100000-0000-4000-8000-000000000001','VND')->'conclusions')::text not like '%Doanh thu ghi nhận trong tháng là%','E: no complete-revenue conclusion');
select is((public.get_financial_management_report('2026-07-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,loan_interest_expense,value}'),null,'C: loan value is null');
select is((public.get_financial_management_report('2026-07-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{pnl,loan_interest_expense,status}'),'NOT_IMPLEMENTED','C: loan status is NOT_IMPLEMENTED');

select is((
  select sum((value->>'actual')::numeric)
  from jsonb_array_elements(public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'operating_expense'->'by_category')
),(public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')#>>'{operating_expense,recorded_amount}')::numeric,'Invariant: by_category actual sums to recorded_amount');

select ok((
  select bool_and(
    value ? 'status'
    and value ? 'value'
    and (value->>'status') in ('AVAILABLE','PARTIAL','NOT_IMPLEMENTED','NEEDS_PRODUCT_POLICY')
  )
  from jsonb_array_elements(public.get_financial_management_report('2026-09-01','0f100000-0000-4000-8000-000000000001','VND')->'trend_12_months') t(point),
       jsonb_each(point - 'month') e(key, value)
),'Trend month points carry metric status for charts');

select * from finish();
rollback;
