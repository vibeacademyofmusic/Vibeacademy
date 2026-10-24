begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id) values('76a70000-0000-4000-8000-000000000001'),('76a70000-0000-4000-8000-000000000002');
insert into public.profiles(id,status) values('76a70000-0000-4000-8000-000000000001','ACTIVE'),('76a70000-0000-4000-8000-000000000002','ACTIVE');
insert into public.user_roles(user_id,role_id) select u.id,r.id from auth.users u cross join public.roles r where u.id::text like '76a70000-%' and r.code='SUPER_ADMIN';
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000001',true);
create temp table f as select public.create_employee('HQ','2026-01-01','Synthetic minute payroll','Permanent','MONTHLY',null,null,null,'Test') id;
create function pg_temp.evidence(day date,shift text,state text,arrival timestamptz default null,departure timestamptz default null) returns void language plpgsql as $$declare rid uuid;begin
 perform set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000001',true);
 rid:=public.request_employee_attendance((select id from f),day,shift,0,state,arrival,departure,'Synthetic payroll evidence',gen_random_uuid());
 perform set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000002',true);
 perform public.review_employee_attendance(rid,'APPROVED','Checked');end$$;
select throws_ok($$select hr_private.monthly_payroll_evidence((select id from f),'2026-09-07','2026-09-07')$$,'P0001','Approved attendance required for every required shift','Missing evidence never defaults to worked');
select pg_temp.evidence('2026-09-07','PM','WORKED');
select pg_temp.evidence('2026-09-08','PM','LATE','2026-09-08 14:15+07','2026-09-08 21:00+07');
select pg_temp.evidence('2026-09-09','PM','EARLY_LEAVE','2026-09-09 14:00+07','2026-09-09 20:30+07');
select pg_temp.evidence('2026-09-10','PM','UNPAID_LEAVE');
select pg_temp.evidence('2026-09-11','PM','UNAUTHORIZED_ABSENCE');
select pg_temp.evidence('2026-09-12','AM','WORKED');
select pg_temp.evidence('2026-09-12','PM','UNAUTHORIZED_ABSENCE');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-07','2026-09-07')->>'payable_minutes')::int,420,'Worked afternoon is 420 payable minutes');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-08','2026-09-08')->>'payable_minutes')::int,420,'Late does not reduce base');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-09','2026-09-09')->>'payable_minutes')::int,420,'Early leave does not reduce base');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-10','2026-09-10')->>'payable_minutes')::int,0,'Unpaid leave has no payable minutes');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-11','2026-09-11')->>'payable_minutes')::int,0,'Absence has no payable minutes');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-12','2026-09-12')->>'required_minutes')::int,600,'Saturday includes both independent shifts');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-12','2026-09-12')->>'payable_minutes')::int,180,'Worked morning and absent afternoon preserve proportional minutes');
select is(round(1000000*(hr_private.monthly_payroll_evidence((select id from f),'2026-09-12','2026-09-12')->>'payable_minutes')::numeric/600,2),300000.00::numeric,'Three of ten scheduled hours gives 30 percent, not half a day');
select public.configure_employee_leave('HQ',null,(select id from f),'2026-09-01','2026-09-30',120,'Explicit quota');
select pg_temp.evidence('2026-09-14','PM','PAID_LEAVE');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-14','2026-09-14')->>'payable_minutes')::int,120,'Only valid paid leave minutes are payable');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-14','2026-09-14')->>'unpaid_minutes')::int,300,'Unpaid remainder is reconciled once');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-08','2026-09-08')->'sources'->0->'attendance'->>'late_minutes')::int,15,'Late evidence preserved in snapshot');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-09-09','2026-09-09')->'sources'->0->'attendance'->>'early_minutes')::int,30,'Early evidence preserved in snapshot');
select is(hr_private.monthly_payroll_evidence((select id from f),'2026-09-07','2026-09-12'),hr_private.monthly_payroll_evidence((select id from f),'2026-09-07','2026-09-12'),'Identical source inputs produce identical ordered snapshots');
select throws_ok($$select hr_private.monthly_payroll_evidence((select id from f),'2025-01-01','2025-01-02')$$,'P0001','No required minutes; manual payroll review required','Zero denominator is review, never division or fabricated pay');
select ok(not has_function_privilege('authenticated','hr_private.monthly_payroll_evidence(uuid,date,date)','EXECUTE'),'Private evidence calculator is not a public payroll bypass');

insert into public.branches(id,code,name) values('76a70000-0000-4000-8000-000000000003','PAYROLL-MINUTE-SYNTHETIC','Synthetic payroll branch');
select public.configure_employee_unit('HQ','76a70000-0000-4000-8000-000000000003','Synthetic mapping');
select public.add_employee_compensation_rule((select id from f),'76a70000-0000-4000-8000-000000000003',10000000,'VND','2026-08-01','2026-08-31');

insert into public.branches(id,code,name) values('76a70000-0000-4000-8000-000000000004','PAYROLL-TRIP-SYNTHETIC','Synthetic destination');
select public.configure_employee_unit('ST','76a70000-0000-4000-8000-000000000004','Synthetic destination');
create temp table trip_fixture as select public.request_employee_trip((select id from f),'ST','76a70000-0000-4000-8000-000000000004','2026-08-09','2026-08-09','Synthetic Sunday trip') id;
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000001',true);
select public.review_employee_trip((select id from trip_fixture),'APPROVED','Checked trip');
do $$declare s record;begin
 for s in select * from public.employee_schedule((select id from f),'2026-08-01','2026-08-31') loop
  if s.work_date='2026-08-02' then perform pg_temp.evidence(s.work_date,s.shift_code,'LATE','2026-08-02 14:15+07','2026-08-02 21:00+07'); else
  perform pg_temp.evidence(s.work_date,s.shift_code,case when s.work_date='2026-08-01' and s.shift_code='PM' then 'UNAUTHORIZED_ABSENCE' else 'WORKED' end);end if;
 end loop;end$$;
create temp table period_fixture as select public.create_payroll_period('76a70000-0000-4000-8000-000000000003','2026-08-01') id;
select lives_ok($$select public.generate_teacher_payroll((select id from period_fixture))$$,'Generate employee monthly payroll in canonical ledger');
select is((select gross_amount from public.teacher_payrolls where period_id=(select id from period_fixture)),round(10000000*(hr_private.monthly_payroll_evidence((select id from f),'2026-08-01','2026-08-31')->>'payable_minutes')::numeric/(hr_private.monthly_payroll_evidence((select id from f),'2026-08-01','2026-08-31')->>'required_minutes')::numeric,2),'Monthly base equals salary times approved minute ratio');
select is((select calculation_snapshot->>'calculation_version' from public.payroll_earning_lines where payroll_id in(select id from public.teacher_payrolls where period_id=(select id from period_fixture))),'SCHEDULED_MINUTES_V1','Generated line retains calculation version');
select lives_ok($$select public.generate_teacher_payroll((select id from period_fixture))$$,'Repeated generate is idempotent');
select is((select count(*) from public.teacher_payrolls where period_id=(select id from period_fixture)),1::bigint,'No duplicated employee payroll');

select throws_ok($$select public.add_payroll_evidence_adjustment((select id from public.teacher_payrolls where period_id=(select id from period_fixture)),'DEDUCTION',-100,'Cannot double deduct',(select id from public.employee_attendance_current where employee_id=(select id from f) and work_date='2026-08-01' and shift_code='PM'),null,gen_random_uuid())$$,'P0001','Deduction requires payable late or early evidence from this payroll','Absence already reduced base cannot be deducted again');
select lives_ok($$select public.add_payroll_evidence_adjustment((select id from public.teacher_payrolls where period_id=(select id from period_fixture)),'DEDUCTION',-100,'Explicit reviewed late deduction',(select id from public.employee_attendance_current where employee_id=(select id from f) and work_date='2026-08-02'),null,'76a70000-0000-4000-8000-000000000099')$$,'Explicit late deduction linked to evidence');
select lives_ok($$select public.add_payroll_evidence_adjustment((select id from public.teacher_payrolls where period_id=(select id from period_fixture)),'DEDUCTION',-100,'Explicit reviewed late deduction',(select id from public.employee_attendance_current where employee_id=(select id from f) and work_date='2026-08-02'),null,'76a70000-0000-4000-8000-000000000099')$$,'Adjustment retry does not repeat deduction');
select throws_ok($$select public.add_payroll_evidence_adjustment((select id from public.teacher_payrolls where period_id=(select id from period_fixture)),'DEDUCTION',-100,'Duplicate',(select id from public.employee_attendance_current where employee_id=(select id from f) and work_date='2026-08-02'),null,gen_random_uuid())$$,'23505',null,'Same late shift cannot be deducted twice');
select is((select adjustment_amount from public.teacher_payrolls where period_id=(select id from period_fixture)),-100::numeric,'Only one explicit deduction counted');

select is((hr_private.monthly_payroll_evidence((select id from f),'2026-08-09','2026-08-09')->>'required_minutes')::int,240,'Approved HQ Sunday trip requires only 240 minutes');
select is((hr_private.monthly_payroll_evidence((select id from f),'2026-08-09','2026-08-09')->>'payable_minutes')::int,240,'Trip evening creates no missing minutes');
select lives_ok($$select public.add_payroll_trip_costs((select id from public.teacher_payrolls where period_id=(select id from period_fixture)),(select id from trip_fixture),100,200,300,'Explicit trip costs','76a70000-0000-4000-8000-000000000098')$$,'Trip allowance transport lodging posted atomically');
select lives_ok($$select public.add_payroll_trip_costs((select id from public.teacher_payrolls where period_id=(select id from period_fixture)),(select id from trip_fixture),100,200,300,'Explicit trip costs','76a70000-0000-4000-8000-000000000098')$$,'Trip cost retry idempotent');
select is((select sum(allowance+transport+lodging) from public.payroll_trip_cost_breakdowns where adjustment_id in(select a.id from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id where t.period_id=(select id from period_fixture))),600::numeric,'Itemized trip costs reconcile exactly');
select throws_ok($$select public.add_payroll_trip_costs((select id from public.teacher_payrolls where period_id=(select id from period_fixture)),(select id from trip_fixture),200,100,300,'Explicit trip costs','76a70000-0000-4000-8000-000000000098')$$,'P0001','Idempotency key already used','Equal total cannot overwrite cost breakdown');
select public.transition_payroll((select id from period_fixture),(select version from public.payroll_periods where id=(select id from period_fixture)),'REVIEW','Review');
select throws_ok($$select public.transition_payroll((select id from period_fixture),(select version from public.payroll_periods where id=(select id from period_fixture)),'APPROVED','Self')$$,'P0001','Payroll maker cannot approve or finalize','Employee payroll maker cannot self-approve');
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000001',true);
select public.transition_payroll((select id from period_fixture),(select version from public.payroll_periods where id=(select id from period_fixture)),'APPROVED','Independent check');
insert into auth.users(id) values('76a70000-0000-4000-8000-000000000010');
insert into public.profiles(id,status) values('76a70000-0000-4000-8000-000000000010','ACTIVE');
insert into public.user_roles(user_id,role_id) select '76a70000-0000-4000-8000-000000000010',id from public.roles where code='STAFF';
select public.link_employee_identity((select id from f),'76a70000-0000-4000-8000-000000000010',null,'Self-read fixture');
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000010',true);
select ok(public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))) is not null,'Employee reads own APPROVED payslip');
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000001',true);
select public.transition_payroll((select id from period_fixture),(select version from public.payroll_periods where id=(select id from period_fixture)),'FINALIZED','Checked final');
select throws_ok($$update public.payroll_earning_lines set amount=1 where payroll_id in(select id from public.teacher_payrolls where period_id=(select id from period_fixture))$$,'P0001','Approved payroll is immutable','Finalized employee source lines immutable');


select ok(public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))) is not null,'Finalized payslip readable by admin');
create temp table stable_payslip as select public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))) doc;
select lives_ok($$select public.configure_employee_compensation((select id from f),'76a70000-0000-4000-8000-000000000003','MONTHLY',12000000,'VND','2026-10-01','2026-10-31',null,'Approved future rate')$$,'Employee UI creates monthly rule through canonical engine');
select is((select reason from public.teacher_compensation_rules where employee_id=(select id from f) and effective_from='2026-10-01'),'Approved future rate','Compensation reason retained');
select throws_ok($$select public.configure_employee_compensation((select id from f),'76a70000-0000-4000-8000-000000000003','MONTHLY',13000000,'VND','2026-10-15','2026-11-01',null,'Overlap')$$,'P0001','Compensation dates overlap','Operational wrapper preserves overlap rejection');
select is(public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))),(select doc from stable_payslip),'Future salary does not change finalized payslip');
select is(((select doc from stable_payslip)->'lines'->0->>'rate')::numeric,10000000::numeric,'Payslip rate uses historical earning line');
select is((select doc from stable_payslip)->>'employee_code',(select employee_code from public.employees where id=(select id from f)),'Payslip includes immutable employee code');
select ok(not ((select doc from stable_payslip)->'lines'->0 ? 'sources'),'Payslip excludes private attendance audit sources');
select ok(not has_function_privilege('anon','public.payroll_payslip(uuid)','EXECUTE'),'Anonymous payslip denied');
select ok(not has_function_privilege('anon','public.configure_employee_compensation(uuid,uuid,text,numeric,text,date,date,text,text)','EXECUTE'),'Anonymous compensation denied');

create temp table next_period as select public.create_payroll_period('76a70000-0000-4000-8000-000000000003','2026-09-01') id;
-- Isolated correction destination fixture; no invented attendance.
update public.payroll_periods set status='GENERATED',generated_by='76a70000-0000-4000-8000-000000000002' where id=(select id from next_period);
create temp table correction_request as select public.request_financial_action('PAYROLL_CORRECTION',t.id,jsonb_build_object('earning_id',l.id,'corrected_amount',l.amount-100,'run_type','NEXT_OPEN_PERIOD'),'Synthetic correction',gen_random_uuid()) id from public.teacher_payrolls t join public.payroll_earning_lines l on l.payroll_id=t.id where t.period_id=(select id from period_fixture);
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.approve_financial_action((select id from correction_request),'Checked')$$,'Employee next-period correction uses canonical maker-checker');
select is((select count(*) from public.teacher_payrolls where period_id=(select id from next_period) and employee_id=(select id from f)),1::bigint,'Correction destination retains employee identity without fake teacher');
select is((select adjustment_amount from public.teacher_payrolls where period_id=(select id from next_period)),-100::numeric,'Employee correction delta exact');
select lives_ok($$select public.approve_financial_action((select id from correction_request),'Retry')$$,'Correction retry idempotent');
select is((select count(*) from public.payroll_adjustments where payroll_id in(select id from public.teacher_payrolls where period_id=(select id from next_period))),1::bigint,'No duplicate employee correction');




create temp table off_cycle_request as select public.request_financial_action('PAYROLL_CORRECTION',t.id,jsonb_build_object('earning_id',l.id,'corrected_amount',l.amount-150,'run_type','OFF_CYCLE_CORRECTION'),'Synthetic urgent correction',gen_random_uuid()) id from public.teacher_payrolls t join public.payroll_earning_lines l on l.payroll_id=t.id where t.period_id=(select id from period_fixture);
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.approve_financial_action((select id from off_cycle_request),'Independent urgent check')$$,'Employee off-cycle correction retains independent approval');
select is((select correction_amount from public.payroll_off_cycle_correction_runs where id=(select id from off_cycle_request)),-50::numeric,'Off-cycle accounts for prior correction delta exactly');
create temp table rest_employees(unit text,id uuid);
insert into rest_employees select unit,public.create_employee(unit,'2026-01-01','Synthetic rest '||unit,'Permanent','MONTHLY',null,null,null,'Test rest') from unnest(array['ST','LX']) unit;

do $$declare e record;s record;rid uuid;begin
 for e in select * from rest_employees loop
  for s in select * from public.employee_schedule(e.id,'2026-09-12','2026-09-12') loop
   perform set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000001',true);
   rid:=public.request_employee_attendance(e.id,s.work_date,s.shift_code,0,'WORKED',null,null,'Synthetic rest test',gen_random_uuid());
   perform set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000002',true);
   perform public.review_employee_attendance(rid,'APPROVED','Checked');
  end loop;
 end loop;
end$$;
select is((hr_private.monthly_payroll_evidence(id,'2026-09-12','2026-09-13')->>'required_minutes')::int,600,unit||' Sunday adds zero required minutes') from rest_employees;
select is((hr_private.monthly_payroll_evidence(id,'2026-09-12','2026-09-13')->>'payable_minutes')::int,600,unit||' Sunday does not reduce payable ratio') from rest_employees;
select throws_ok($$update public.payroll_trip_cost_breakdowns set allowance=0 where adjustment_id in(select a.id from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id where t.period_id=(select id from period_fixture))$$,'P0001','Employee history is immutable','Trip cost details remain immutable');
select throws_ok($$insert into public.payroll_trip_cost_breakdowns select adjustment_id,allowance,transport,lodging from public.payroll_trip_cost_breakdowns where adjustment_id in(select a.id from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id where t.period_id=(select id from period_fixture))$$,'P0001','Approved payroll is immutable','Even privileged insert cannot augment finalized trip cost history');
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000010',true);
select ok(public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))) is not null,'Employee reads own finalized payslip');
select is((select count(*) from public.own_payrolls()),1::bigint,'Employee sees own finalized payroll, not open correction destination');
set local role authenticated;
select is((select count(*) from public.payroll_trip_cost_breakdowns),1::bigint,'Employee reads own approved trip breakdown only');
reset role;
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000002',true);
select public.set_employee_version((select id from f),1,'2026-09-01','Synthetic minute payroll','HQ','Permanent','TERMINATED','MONTHLY',null,'Ended fixture');
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000010',true);
select is(public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))),null::jsonb,'Inactive employment denied payslip');
select is((select count(*) from public.own_payrolls()),0::bigint,'Inactive employment cannot read payroll');
set local role authenticated;
select is((select count(*) from public.payroll_trip_cost_breakdowns),0::bigint,'Inactive employee cannot read trip costs');
reset role;
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000002',true);
update public.profiles set status='INACTIVE' where id='76a70000-0000-4000-8000-000000000010';
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000010',true);
select throws_ok($$select public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture)))$$,'P0001','Unauthorized','Inactive account denied payslip');
select throws_ok($$select public.own_payrolls()$$,'P0001','Unauthorized','Inactive account cannot invoke self-read');


select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000002',true);
insert into auth.users(id) values('76a70000-0000-4000-8000-000000000011');
insert into public.profiles(id,status) values('76a70000-0000-4000-8000-000000000011','ACTIVE');
insert into public.user_roles(user_id,role_id,branch_id) select '76a70000-0000-4000-8000-000000000011',id,'76a70000-0000-4000-8000-000000000004' from public.roles where code='FINANCE';
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000011',true);
select is(public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))),null::jsonb,'Cross-branch Finance denied payslip');
set local role authenticated;
select is((select count(*) from public.payroll_trip_cost_breakdowns),0::bigint,'Other branch Finance cannot read trip cost breakdown');
reset role;
insert into auth.users(id) values('76a70000-0000-4000-8000-000000000012');
insert into public.profiles(id,status) values('76a70000-0000-4000-8000-000000000012','ACTIVE');
insert into public.user_roles(user_id,role_id) select '76a70000-0000-4000-8000-000000000012',id from public.roles where code='STAFF';
select set_config('request.jwt.claim.sub','76a70000-0000-4000-8000-000000000012',true);
select is(public.payroll_payslip((select id from public.teacher_payrolls where period_id=(select id from period_fixture))),null::jsonb,'Unrelated staff denied payslip');
select * from finish();
rollback;
