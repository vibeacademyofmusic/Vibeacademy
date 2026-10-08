begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into public.branches(id,code,name) values('ee100000-0000-0000-0000-000000000001','MC-A','Maker Checker A'),('ee100000-0000-0000-0000-000000000002','MC-B','Maker Checker B');
insert into auth.users(id) select ('ee200000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5) n;
insert into public.profiles(id,status) select id,'ACTIVE' from auth.users where id::text like 'ee200000-%';
insert into public.user_roles(user_id,role_id,branch_id)
select ('ee200000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,r.id,
case when n=1 then null else ('ee100000-0000-0000-0000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid end
from generate_series(1,5) n join public.roles r on r.code=case n when 1 then 'SUPER_ADMIN' when 4 then 'BRANCH_ADMIN' else 'FINANCE' end;
insert into public.teachers(id,teacher_code,full_name) values('ee300000-0000-0000-0000-000000000001','MC-TEACHER','Maker checker teacher');
insert into public.payroll_periods(id,branch_id,starts_on,ends_on,status,generated_by)
select ('ee400000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'ee100000-0000-0000-0000-000000000001',
('2026-'||lpad(n::text,2,'0')||'-01')::date,(('2026-'||lpad(n::text,2,'0')||'-01')::date+interval '1 month - 1 day')::date,'REVIEW',
case when n=3 then 'ee200000-0000-0000-0000-000000000001'::uuid else 'ee200000-0000-0000-0000-000000000002'::uuid end
from generate_series(1,3) n;
insert into public.teacher_payrolls(period_id,teacher_id,branch_id,teacher_name,pay_type,currency,base_salary,gross_amount)
select id,'ee300000-0000-0000-0000-000000000001',branch_id,'Maker checker teacher','MONTHLY','VND',1000000,1000000 from public.payroll_periods where id::text like 'ee400000-%';
insert into public.payroll_adjustments(payroll_id,kind,amount,reason,created_by)
select id,'BONUS',10000,'Checker authored this adjustment','ee200000-0000-0000-0000-000000000003' from public.teacher_payrolls where period_id='ee400000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked')$$,'P0001','Payroll maker cannot approve or finalize','FINANCE maker cannot self approve');
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked')$$,'P0001','Unauthorized','Branch admin cannot approve');
select throws_ok($$select public.transition_payroll_with_override('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked','MAKER_CHECKER_EMERGENCY','Emergency test')$$,'P0001','Unauthorized','Branch cannot emergency override');
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked')$$,'P0001','Unauthorized','Other branch finance denied');
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000002',1,'APPROVED','Checked')$$,'P0001','Payroll maker cannot approve or finalize','Adjustment author cannot approve');
select throws_ok($$select public.transition_payroll_with_override('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked','MAKER_CHECKER_EMERGENCY','Emergency test')$$,'P0001','Valid SUPER_ADMIN emergency override reason and type required','FINANCE cannot emergency override');
reset role;
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000001',true);
update public.profiles set status='INACTIVE' where id='ee200000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked')$$,'P0001','Unauthorized','Inactive checker denied');
reset role;
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000001',true);
update public.profiles set status='ACTIVE' where id='ee200000-0000-0000-0000-000000000003';
update public.user_roles set valid_until=now()-interval '1 day' where user_id='ee200000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked')$$,'P0001','Unauthorized','Expired checker denied');
reset role;
update public.user_roles set valid_until=null where user_id='ee200000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',999,'APPROVED','Checked')$$,'P0001','Payroll changed; reload','Authorized stale version rejected');
select lives_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',1,'APPROVED','Checked')$$,'Different FINANCE checker approves');
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',2,'FINALIZED','Checked')$$,'P0001','Payroll maker cannot approve or finalize','Generator cannot finalize');
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',2,'FINALIZED','Checked')$$,'P0001','Unauthorized','Branch cannot finalize');
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000003',true);
select lives_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000001',2,'FINALIZED','Checked')$$,'Checker finalizes');
select set_config('request.jwt.claim.sub','ee200000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.transition_payroll('ee400000-0000-0000-0000-000000000003',1,'APPROVED','Checked')$$,'P0001','Payroll maker cannot approve or finalize','SA ordinary self approval denied');
select throws_ok($$select public.transition_payroll_with_override('ee400000-0000-0000-0000-000000000003',1,'APPROVED','Checked','MAKER_CHECKER_EMERGENCY',' ')$$,'P0001','Valid SUPER_ADMIN emergency override reason and type required','Blank emergency reason denied');
select lives_ok($$select public.transition_payroll_with_override('ee400000-0000-0000-0000-000000000003',1,'APPROVED','Checked','MAKER_CHECKER_EMERGENCY','Emergency test')$$,'Explicit SA emergency approval succeeds');
select is((select count(*) from public.payroll_events where event_type='EMERGENCY_OVERRIDE' and override_reason='Emergency test' and actor_id=auth.uid() and created_at is not null and before_snapshot->'period'->>'status'='REVIEW' and after_snapshot->'period'->>'status'='APPROVED'),1::bigint,'Dedicated override audit contains actor time and before after');
select lives_ok($$select public.transition_payroll_with_override('ee400000-0000-0000-0000-000000000003',2,'FINALIZED','Checked','MAKER_CHECKER_EMERGENCY','Emergency test')$$,'Explicit SA emergency finalization succeeds');
select throws_ok($$select public.transition_payroll_with_override('ee400000-0000-0000-0000-000000000003',3,'DRAFT','Reopen','MAKER_CHECKER_EMERGENCY','Try reopen')$$,'P0001','Valid SUPER_ADMIN emergency override reason and type required','Override cannot reopen finalized payroll');
select throws_ok($$select public.payroll_approval_snapshot('ee400000-0000-0000-0000-000000000001')$$,'42501',null,'Private snapshot RPC denied');
reset role;
select throws_ok($$update public.teacher_payrolls set gross_amount=0 where period_id='ee400000-0000-0000-0000-000000000003'$$,'P0001','Approved payroll is immutable','Emergency does not unlock source totals');
select throws_ok($$delete from public.payroll_events where period_id='ee400000-0000-0000-0000-000000000003'$$,'P0001','Payroll audit is immutable','Emergency audit immutable');
select * from finish();
rollback;
