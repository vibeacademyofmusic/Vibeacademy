-- Extend the existing ledger, not a second employee payroll engine.
alter table public.teacher_payrolls alter column teacher_id drop not null;
alter table public.teacher_payrolls add column employee_id uuid references public.employees(id);
alter table public.teacher_payrolls add constraint payroll_recipient_required check(teacher_id is not null or employee_id is not null);
create unique index payroll_employee_period on public.teacher_payrolls(period_id,employee_id) where employee_id is not null;
alter table public.teacher_compensation_rules alter column teacher_id drop not null;
alter table public.teacher_compensation_rules add column employee_id uuid references public.employees(id);
alter table public.teacher_compensation_rules add column class_type text check(class_type in ('ONE_ON_ONE','GROUP'));
alter table public.teacher_compensation_rules drop constraint teacher_compensation_rules_pay_type_check;
alter table public.teacher_compensation_rules add constraint teacher_compensation_rules_pay_type_check check(pay_type in ('MONTHLY','HOURLY','PER_SESSION'));
alter table public.teacher_compensation_rules add constraint compensation_recipient_required check(num_nonnulls(teacher_id,employee_id)=1);
alter table public.teacher_compensation_rules add constraint compensation_employee_monthly check(employee_id is null or pay_type='MONTHLY');
alter table public.teacher_compensation_rules add constraint session_class_rate_required check(pay_type<>'PER_SESSION' or class_type is not null);
create index compensation_employee_dates on public.teacher_compensation_rules(employee_id,effective_from,effective_to);
alter table public.payroll_earning_lines alter column actual_teacher_id drop not null;
alter table public.payroll_earning_lines add column employee_id uuid references public.employees(id);
alter table public.payroll_earning_lines add column calculation_snapshot jsonb;
alter table public.payroll_earning_lines add constraint earning_recipient_required check(actual_teacher_id is not null or employee_id is not null);
-- Keep TEACHING as the compatible line family; snapshot/pay type distinguishes per-session from hourly.
create function hr_private.payroll_identity_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if new.employee_id is distinct from old.employee_id then raise exception 'Payroll identity is immutable';end if;
 return new;end$$;
create trigger payroll_employee_identity before update on public.teacher_payrolls for each row execute function hr_private.payroll_identity_guard();

create function public.add_employee_compensation_rule(p_employee uuid,p_branch uuid,p_rate numeric,p_currency text,p_from date,p_to date default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 perform 1 from public.employees where id=p_employee for update;
 if not found then raise exception 'Employee not found';end if;
 if not exists(select 1 from public.organization_units u cross join lateral hr_private.employee_at(p_employee,p_from) v where u.code=v.unit_code and u.branch_id=p_branch and v.pay_type='MONTHLY' and v.employment_status='ACTIVE') then raise exception 'Explicit active employee branch mapping required';end if;
 if exists(select 1 from public.teacher_compensation_rules r where r.employee_id=p_employee and r.status='ACTIVE' and daterange(r.effective_from,r.effective_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Compensation dates overlap';end if;
 if exists(select 1 from public.teacher_compensation_rules r join public.employees e on e.teacher_id=r.teacher_id where e.id=p_employee and r.status='ACTIVE' and daterange(r.effective_from,r.effective_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Resolve existing teacher compensation before employee compensation';end if;
 insert into public.teacher_compensation_rules(employee_id,branch_id,pay_type,rate,currency,effective_from,effective_to,created_by)
 values(p_employee,p_branch,'MONTHLY',p_rate,p_currency,p_from,p_to,auth.uid()) returning id into result;return result;
end$$;

create function public.add_session_compensation_rule(p_teacher uuid,p_branch uuid,p_class_type text,p_rate numeric,p_currency text,p_from date,p_to date default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$declare result uuid;begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_teacher::text||p_branch::text,0));
 if not exists(select 1 from public.teachers t join public.teacher_branches b on b.teacher_id=t.id where t.id=p_teacher and t.status='ACTIVE' and b.branch_id=p_branch) then raise exception 'Invalid teacher branch';end if;
 if exists(select 1 from public.teacher_compensation_rules r where r.teacher_id=p_teacher and r.branch_id=p_branch and r.status='ACTIVE' and (r.class_type is null or r.class_type=p_class_type or r.pay_type<>'PER_SESSION' or r.currency<>p_currency) and daterange(r.effective_from,r.effective_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Compensation dates overlap';end if;
 if exists(select 1 from public.employees e join public.teacher_compensation_rules r on r.employee_id=e.id where e.teacher_id=p_teacher and r.status='ACTIVE' and daterange(r.effective_from,r.effective_to,'[]') && daterange(p_from,p_to,'[]')) then raise exception 'Resolve existing employee compensation before teacher compensation';end if;
 insert into public.teacher_compensation_rules(teacher_id,branch_id,pay_type,class_type,rate,currency,effective_from,effective_to,created_by)
 values(p_teacher,p_branch,'PER_SESSION',p_class_type,p_rate,p_currency,p_from,p_to,auth.uid()) returning id into result;return result;
end$$;
revoke all on function public.add_employee_compensation_rule(uuid,uuid,numeric,text,date,date),public.add_session_compensation_rule(uuid,uuid,text,numeric,text,date,date) from public,anon,service_role;
grant execute on function public.add_employee_compensation_rule(uuid,uuid,numeric,text,date,date),public.add_session_compensation_rule(uuid,uuid,text,numeric,text,date,date) to authenticated;
revoke all on function hr_private.payroll_identity_guard() from public,anon,authenticated,service_role;

create or replace function public.generate_teacher_payroll(p_period uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.payroll_periods; r record; s record; rule public.teacher_compensation_rules;
 eid uuid; pid uuid; evidence jsonb; amount numeric; v public.employee_versions;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 select * into p from public.payroll_periods where id=p_period for update;
 if not found then raise exception 'Payroll period not found';end if;
 if p.status='GENERATED' then return;end if;
 if p.status<>'DRAFT' then raise exception 'Payroll generation requires DRAFT';end if;
 lock table public.teacher_compensation_rules in share mode;
 -- Serialize HR evidence changes with the employee attendance approval lock.
 perform 1 from public.employees order by id for update;
 if exists(select 1 from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id where t.period_id=p.id) then raise exception 'Payroll with adjustments cannot regenerate; use correction adjustment';end if;
 if exists(select 1 from public.teacher_compensation_rules coverage where coverage.branch_id=p.branch_id and coverage.status='ACTIVE' and coverage.effective_from<=p.ends_on and coalesce(coverage.effective_to,p.ends_on)>=p.starts_on group by coalesce(coverage.employee_id,coverage.teacher_id) having count(distinct coverage.pay_type)>1 or count(distinct coverage.currency)>1 or bool_or(coverage.pay_type='MONTHLY' and (coverage.effective_from>p.starts_on or coalesce(coverage.effective_to,p.ends_on)<p.ends_on))) then raise exception 'Monthly rule must cover full period; pay type and currency cannot change within period';end if;
 delete from public.payroll_earning_lines where payroll_id in(select id from public.teacher_payrolls where period_id=p.id);
 delete from public.teacher_payrolls where period_id=p.id;
 for r in select coalesce(c.employee_id,e.id) employee_id,c.teacher_id,min(c.pay_type) pay_type,min(c.currency) currency
  from public.teacher_compensation_rules c left join public.employees e on e.teacher_id=c.teacher_id
  where c.branch_id=p.branch_id and c.status='ACTIVE' and c.effective_from<=p.ends_on and coalesce(c.effective_to,p.ends_on)>=p.starts_on
  group by coalesce(c.employee_id,e.id),c.teacher_id loop
  eid:=r.employee_id;
  if r.pay_type='MONTHLY' and eid is null then raise exception 'Monthly payroll requires linked Employee Master and approved attendance';end if;
  if eid is not null then v:=hr_private.employee_at(eid,p.ends_on);end if;
  insert into public.teacher_payrolls(period_id,teacher_id,employee_id,branch_id,teacher_name,pay_type,currency)
   values(p.id,r.teacher_id,eid,p.branch_id,coalesce(case when eid is not null then v.full_name end,(select coalesce(full_name,teacher_code) from public.teachers where id=r.teacher_id)),r.pay_type,r.currency) returning id into pid;
  if r.pay_type='MONTHLY' then
   select * into strict rule from public.teacher_compensation_rules c where c.branch_id=p.branch_id and c.status='ACTIVE' and c.pay_type='MONTHLY' and (c.employee_id=eid or c.teacher_id=r.teacher_id) and c.effective_from<=p.starts_on and coalesce(c.effective_to,p.ends_on)>=p.ends_on;
   evidence:=hr_private.monthly_payroll_evidence(eid,p.starts_on,p.ends_on);
   if exists(select 1 from jsonb_array_elements(evidence->'sources') x left join public.organization_units u on u.code=x->'schedule'->>'unit_code' where u.branch_id is distinct from p.branch_id) then raise exception 'Monthly assignment crosses payroll branch; review required';end if;
   amount:=round(rule.rate*(evidence->>'payable_minutes')::numeric/(evidence->>'required_minutes')::numeric,2);
   insert into public.payroll_earning_lines(payroll_id,actual_teacher_id,employee_id,branch_id,earned_on,rule_id,earning_type,rate,amount,calculation_snapshot)
    values(pid,r.teacher_id,eid,p.branch_id,p.starts_on,rule.id,'MONTHLY_BASE',rule.rate,amount,evidence||jsonb_build_object('salary_rule',to_jsonb(rule)));
  end if;
 end loop;
 for s in select a.*,c.class_type from public.session_actual_teachers a join public.classes c on c.id=a.class_id
  where a.branch_id=p.branch_id and a.occurrence_date between p.starts_on and p.ends_on and a.status='COMPLETED' and a.ends_at<=now() order by a.occurrence_date,a.session_id loop
  select * into rule from public.teacher_compensation_rules c where c.teacher_id=s.teacher_id and c.branch_id=p.branch_id and c.status='ACTIVE'
   and s.occurrence_date>=c.effective_from and (c.effective_to is null or s.occurrence_date<=c.effective_to)
   and (c.class_type is null or c.class_type=s.class_type);
  if not found then
   select c.* into rule from public.teacher_compensation_rules c join public.employees e on e.id=c.employee_id where e.teacher_id=s.teacher_id and c.branch_id=p.branch_id and c.status='ACTIVE' and s.occurrence_date>=c.effective_from and (c.effective_to is null or s.occurrence_date<=c.effective_to);
  end if;
  if rule.id is null then raise exception 'Completed session has unresolved teacher or compensation';end if;
  select t.id,t.employee_id into pid,eid from public.teacher_payrolls t where t.period_id=p.id and (t.teacher_id=s.teacher_id or t.employee_id=rule.employee_id);
  if pid is null then raise exception 'Completed session has unresolved teacher or compensation';end if;
  amount:=case rule.pay_type when 'PER_SESSION' then rule.rate when 'HOURLY' then round(extract(epoch from(s.ends_at-s.starts_at))/3600*rule.rate,2) else 0 end;
  insert into public.payroll_earning_lines(payroll_id,session_id,actual_teacher_id,employee_id,class_id,branch_id,earned_on,rule_id,earning_type,duration_hours,rate,amount,calculation_snapshot)
   values(pid,s.session_id,s.teacher_id,eid,s.class_id,s.branch_id,s.occurrence_date,rule.id,'TEACHING',extract(epoch from(s.ends_at-s.starts_at))/3600,rule.rate,amount,
   jsonb_build_object('calculation_version','PAYROLL_V11','pay_type',rule.pay_type,'session',to_jsonb(s),'salary_rule',to_jsonb(rule)));
 end loop;
 update public.teacher_payrolls t set base_salary=x.base,teaching_hours=x.hours,hourly_earnings=x.teaching,gross_amount=x.base+x.teaching from
  (select t2.id,coalesce(sum(l.amount) filter(where l.earning_type='MONTHLY_BASE'),0) base,coalesce(sum(l.duration_hours),0) hours,coalesce(sum(l.amount) filter(where l.earning_type='TEACHING'),0) teaching from public.teacher_payrolls t2 left join public.payroll_earning_lines l on l.payroll_id=t2.id where t2.period_id=p.id group by t2.id) x where t.id=x.id;
 update public.payroll_periods set status='GENERATED',generated_by=auth.uid(),generated_at=now(),version=version+1 where id=p.id;
 insert into public.payroll_events(period_id,status,note,actor_id,event_type) values(p.id,'GENERATED','Payroll V1.1: approved scheduled minutes and actual completed teaching',auth.uid(),'GENERATED');
end$$;

-- Preserve all existing financial approval operations; extend only recipient matching.
create or replace function finance_private.validate_ledger_request(p_operation text,p_target uuid,p_details jsonb,p_permission text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 b uuid; snapshot jsonb; pay public.payments; refund public.refunds; payroll public.teacher_payrolls;
 source_period public.payroll_periods; destination public.payroll_periods;
 amount numeric; original numeric; previous_delta numeric; line_id uuid; adjustment_id uuid; allocation_id uuid;
 allowed_keys text[]; original_payment uuid; allocated numeric; consumed numeric;
begin
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid request details'; end if;
 if p_operation in ('REFUND','VOID_PAYMENT') then
   select * into pay from public.payments p where p.id=p_target and public.finance_action_allowed(p_permission,p.branch_id_snapshot);
   if not found then raise exception 'Unauthorized'; end if;
   b:=pay.branch_id_snapshot;snapshot:=to_jsonb(pay);original_payment:=pay.id;
   if pay.status<>'POSTED' then raise exception 'Only posted payments can be changed by approval'; end if;
 elsif p_operation in ('VOID_REFUND','ALLOCATE_REFUND') then
   select * into refund from public.refunds r where r.id=p_target and public.finance_action_allowed(p_permission,r.branch_id_snapshot);
   if not found then raise exception 'Unauthorized'; end if;
   b:=refund.branch_id_snapshot;snapshot:=to_jsonb(refund);original_payment:=refund.payment_id;
   if refund.status<>'POSTED' then raise exception 'Only posted refunds can be changed by approval'; end if;
 elsif p_operation='PAYROLL_CORRECTION' then
   select * into payroll from public.teacher_payrolls t where t.id=p_target and public.finance_action_allowed(p_permission,t.branch_id);
   if not found then raise exception 'Unauthorized'; end if;
   select * into source_period from public.payroll_periods where id=payroll.period_id;
   if source_period.status<>'FINALIZED' then raise exception 'Correction source must be FINALIZED'; end if;
   b:=payroll.branch_id;
 else raise exception 'Unsupported financial operation';
 end if;
 allowed_keys:=case p_operation when 'REFUND' then array['amount','refunded_at','notes']
 when 'ALLOCATE_REFUND' then array['amount','payment_allocation_id']
 when 'PAYROLL_CORRECTION' then array['corrected_amount','earning_id','adjustment_id','run_type'] else array[]::text[] end;
 if exists(select 1 from jsonb_object_keys(p_details) k where not(k=any(allowed_keys))) then raise exception 'Unexpected request field'; end if;
 if p_operation in ('REFUND','ALLOCATE_REFUND') then
   amount:=(p_details->>'amount')::numeric;
   if amount is null or amount<=0 or amount>=10000000000000 or amount<>round(amount,2) then raise exception 'Invalid financial amount'; end if;
 end if;
 if p_operation='REFUND' then
   if p_details->>'refunded_at' is null or (p_details->>'refunded_at') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Refund timestamp must include timezone'; end if;
   perform (p_details->>'refunded_at')::timestamptz;
   if length(coalesce(p_details->>'notes',''))>2000 then raise exception 'Notes too long'; end if;
   select coalesce(sum(f.amount),0) into consumed from public.refunds f where f.payment_id=p_target and status='POSTED';
   if consumed+amount>pay.amount then raise exception 'Refund exceeds the remaining refundable payment amount'; end if;
 elsif p_operation='VOID_PAYMENT' then
   if exists(select 1 from public.refunds where payment_id=p_target and status='POSTED') then raise exception 'Reverse posted refunds before voiding payment'; end if;
 elsif p_operation='ALLOCATE_REFUND' then
   if not exists(select 1 from public.payments where id=refund.payment_id and status='POSTED') then raise exception 'Original payment must remain POSTED'; end if;
   allocation_id:=(p_details->>'payment_allocation_id')::uuid;
   select a.amount into allocated from public.payment_allocations a where a.id=allocation_id and a.payment_id=refund.payment_id;
   if not found then raise exception 'Refund must be allocated against its original payment'; end if;
   if exists(select 1 from public.refund_allocations where refund_id=refund.id and payment_allocation_id=allocation_id) then raise exception 'This refund is already allocated to this payment allocation'; end if;
   select coalesce(sum(a.amount),0) into consumed from public.refund_allocations a where a.refund_id=refund.id;
   if consumed+amount>refund.amount then raise exception 'Refund allocation exceeds the refund amount'; end if;
   select coalesce(sum(a.amount),0) into consumed from public.refund_allocations a join public.refunds r on r.id=a.refund_id where a.payment_allocation_id=allocation_id and r.status='POSTED';
   if consumed+amount>allocated then raise exception 'Refund exceeds the original payment allocation amount'; end if;
 elsif p_operation='PAYROLL_CORRECTION' then
   amount:=(p_details->>'corrected_amount')::numeric;
   if amount is null or abs(amount)>=10000000000000 or amount<>round(amount,2) then raise exception 'Invalid corrected amount'; end if;
   line_id:=nullif(p_details->>'earning_id','')::uuid;adjustment_id:=nullif(p_details->>'adjustment_id','')::uuid;
   if line_id is not null and adjustment_id is not null then raise exception 'Choose one original line'; end if;
   if line_id is not null then
     select l.amount into original from public.payroll_earning_lines l where l.id=line_id and l.payroll_id=payroll.id;
   elsif adjustment_id is not null then
     select a.amount into original from public.payroll_adjustments a where a.id=adjustment_id and a.payroll_id=payroll.id;
   else
     if exists(select 1 from public.payroll_earning_lines where payroll_id=payroll.id) or exists(select 1 from public.payroll_adjustments where payroll_id=payroll.id) then raise exception 'Original earning or adjustment line required'; end if;
     original:=payroll.gross_amount;
   end if;
   if original is null then raise exception 'Original line does not belong to payroll'; end if;
   select coalesce(sum(c.delta),0) into previous_delta from public.payroll_corrections c where c.original_payroll_id=payroll.id
     and c.original_earning_id is not distinct from line_id and c.original_adjustment_id is not distinct from adjustment_id;
   if amount=original+previous_delta then raise exception 'Correction has no remaining delta'; end if;
   if p_details->>'run_type'='NEXT_OPEN_PERIOD' then
     select * into destination from public.payroll_periods p where p.branch_id=b and p.starts_on>source_period.ends_on
       and p.status in ('DRAFT','GENERATED','REVIEW') order by p.starts_on,p.id limit 1;
     if not found then raise exception 'Create next open payroll period first'; end if;
     if destination.status='DRAFT' then raise exception 'Generate next open period before posting correction'; end if;
     if exists(select 1 from public.teacher_payrolls t where t.period_id=destination.id and ((payroll.employee_id is not null and t.employee_id=payroll.employee_id) or (payroll.employee_id is null and t.teacher_id=payroll.teacher_id)) and t.currency<>payroll.currency) then raise exception 'Correction currency must match destination payroll'; end if;
   elsif p_details->>'run_type' is distinct from 'OFF_CYCLE_CORRECTION' then raise exception 'Invalid correction run type'; end if;
   snapshot:=jsonb_build_object('payroll',to_jsonb(payroll),'source_period',to_jsonb(source_period),
     'earning_id',line_id,'adjustment_id',adjustment_id,'original_amount',original,'previous_delta',previous_delta,
     'corrected_amount',amount,'delta',amount-original-previous_delta,'target_period',case when destination.id is not null then to_jsonb(destination) else 'null'::jsonb end);
 end if;
 return jsonb_build_object('branch_id',b,'source',snapshot,'payment_id',original_payment);
end $$;
create or replace function public.approve_financial_action(p_request_id uuid,p_note text,p_override_type text default null,p_override_reason text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.financial_approval_requests; validated jsonb; payment_id uuid; result uuid; emergency boolean;
 source public.teacher_payrolls; dest public.payroll_periods; dest_payroll uuid; adjustment uuid;
 snapshot jsonb; before_state jsonb; after_state jsonb; delta numeric; source_earning uuid;source_adjustment uuid;
begin
 select * into r from public.financial_approval_requests q where q.id=p_request_id
 and public.finance_action_allowed(finance_private.operation_permission(q.operation,'approve'),q.branch_id) for update;
 if not found then raise exception 'Unauthorized'; end if;
 if r.status='POSTED' then return r.result_id; end if;
 if r.status<>'PENDING_APPROVAL' then raise exception 'Request is not pending approval'; end if;
 if p_note is null or char_length(btrim(p_note)) not between 1 and 2000 then raise exception 'Approval note required'; end if;
 emergency:=p_override_type is not null or p_override_reason is not null;
 if emergency then
   if not public.is_global_super_admin() or p_override_type is distinct from 'MAKER_CHECKER_EMERGENCY'
     or p_override_reason is null or char_length(btrim(p_override_reason)) not between 1 and 2000 then
     raise exception 'Valid SUPER_ADMIN emergency override reason and type required'; end if;
 elsif r.maker_user_id=auth.uid() then raise exception 'Maker cannot approve own financial request';
 end if;
 if r.operation='PAYROLL_CORRECTION' then
   perform pg_advisory_xact_lock(hashtextextended('payroll-correction:'||r.target_id::text,0));
   select * into source from public.teacher_payrolls where id=r.target_id;
   perform 1 from public.payroll_periods where id=source.period_id for update;
   if r.details->>'run_type'='NEXT_OPEN_PERIOD' then
     select * into dest from public.payroll_periods where id=(r.source_snapshot->'target_period'->>'id')::uuid for update;
   end if;
 elsif r.operation in ('APPLY_CUSTOMER_CREDIT','REFUND_CUSTOMER_CREDIT') then
   select c.payment_id into payment_id from public.customer_credits c where c.id=r.target_id;
   perform 1 from public.payments where id=payment_id for update;
   perform 1 from public.customer_credits where id=r.target_id for update;
   if r.details->>'invoice_id' is not null then perform 1 from public.invoices where id=(r.details->>'invoice_id')::uuid for update; end if;
   if r.details->>'opening_receivable_id' is not null then perform 1 from public.opening_receivables where id=(r.details->>'opening_receivable_id')::uuid for update; end if;
 elsif r.operation='OPENING_RECEIVABLE_CORRECTION' then
   perform 1 from public.payments p where p.id in(select a.payment_id from public.payment_allocations a where a.opening_receivable_id=r.target_id) order by p.id for update;
   perform 1 from public.opening_receivables where id=r.target_id for update;
 elsif r.operation='CANCEL_INVOICE' then
   perform 1 from public.invoices where id=r.target_id for update;
 else
   if r.operation in ('REFUND','VOID_PAYMENT') then payment_id:=r.target_id;
   else select f.payment_id into payment_id from public.refunds f where f.id=r.target_id; end if;
   -- Serialize refund amount checks, allocations and payment/refund reversals per original payment.
   perform 1 from public.payments where id=payment_id for update;
   if r.operation in ('VOID_REFUND','ALLOCATE_REFUND') then perform 1 from public.refunds where id=r.target_id for update; end if;
 end if;
 validated:=finance_private.validate_request(r.operation,r.target_id,r.details,finance_private.operation_permission(r.operation,'approve'));
 if validated->'source' is distinct from r.source_snapshot then raise exception 'Source changed; cancel and create a new request'; end if;
 before_state:=to_jsonb(r);
 update public.financial_approval_requests set status='APPROVED',approver_user_id=auth.uid(),approved_at=now() where id=r.id;
 insert into public.financial_approval_events(request_id,event,performed_by,reason,override_type,before_snapshot,after_snapshot)
 values(r.id,case when emergency then 'EMERGENCY_OVERRIDE' else 'APPROVED' end,auth.uid(),
 case when emergency then btrim(p_override_reason) else btrim(p_note) end,case when emergency then p_override_type end,
 before_state,jsonb_build_object('status','APPROVED','source',r.source_snapshot,'details',r.details));
 if r.operation in ('APPLY_CUSTOMER_CREDIT','REFUND_CUSTOMER_CREDIT') then
   if r.operation='APPLY_CUSTOMER_CREDIT' then
    result:=gen_random_uuid();
    insert into public.customer_credit_uses(id,credit_id,kind,amount,payment_allocation_id) values(r.id,r.target_id,'APPLY',(r.details->>'amount')::numeric,result);
    insert into public.payment_allocations(id,payment_id,invoice_id,opening_receivable_id,amount,credit_use_id)
     values(result,payment_id,(r.details->>'invoice_id')::uuid,(r.details->>'opening_receivable_id')::uuid,(r.details->>'amount')::numeric,r.id);
   else
    result:=finance_private.create_refund(payment_id,(r.details->>'amount')::numeric,(r.details->>'refunded_at')::timestamptz,r.reason,'Customer credit refund');
    insert into public.customer_credit_uses(id,credit_id,kind,amount,refund_id) values(r.id,r.target_id,'REFUND',(r.details->>'amount')::numeric,result);
   end if;
   select to_jsonb(c) into after_state from public.customer_credit_balances c where id=r.target_id;
 elsif r.operation='OPENING_RECEIVABLE_CORRECTION' then
   snapshot:=validated->'source';
   insert into public.opening_receivable_corrections(id,opening_receivable_id,migration_batch_id,migration_row_id,source_reference,original_amount,old_amount,corrected_amount,delta,currency,reason,maker_user_id,checker_user_id,created_at,approved_at)
   values(r.id,r.target_id,(snapshot->>'migration_batch_id')::uuid,(snapshot->'opening'->>'migration_row_id')::uuid,snapshot->>'source_reference',(snapshot->>'original_amount')::numeric,(snapshot->>'old_amount')::numeric,(snapshot->>'corrected_amount')::numeric,(snapshot->>'delta')::numeric,snapshot->>'currency',r.reason,r.maker_user_id,auth.uid(),r.created_at,now());
   perform finance_private.release_opening_credit(r.id);
   result:=r.id; select to_jsonb(c) into after_state from public.opening_receivable_corrections c where id=result;
 elsif r.operation='REFUND' then
   result:=finance_private.create_refund(r.target_id,(r.details->>'amount')::numeric,(r.details->>'refunded_at')::timestamptz,r.reason,r.details->>'notes');
   select to_jsonb(f) into after_state from public.refunds f where f.id=result;
 elsif r.operation='VOID_PAYMENT' then
   perform finance_private.void_payment(r.target_id,r.reason);result:=r.target_id;
   select to_jsonb(p) into after_state from public.payments p where p.id=result;
 elsif r.operation='VOID_REFUND' then
   perform finance_private.void_refund(r.target_id,r.reason);result:=r.target_id;
   select to_jsonb(f) into after_state from public.refunds f where f.id=result;
 elsif r.operation='CANCEL_INVOICE' then
   perform finance_private.cancel_invoice(r.target_id,r.reason);result:=r.target_id;
   select to_jsonb(i) into after_state from public.invoices i where i.id=result;
 elsif r.operation='ALLOCATE_REFUND' then
   result:=finance_private.allocate_refund_to_payment_allocation(r.target_id,(r.details->>'payment_allocation_id')::uuid,(r.details->>'amount')::numeric);
   select to_jsonb(a) into after_state from public.refund_allocations a where a.id=result;
 else
   snapshot:=validated->'source'; delta:=(snapshot->>'delta')::numeric;
   source_earning:=(snapshot->>'earning_id')::uuid;source_adjustment:=(snapshot->>'adjustment_id')::uuid;
   if r.details->>'run_type'='NEXT_OPEN_PERIOD' then
     select id into dest_payroll from public.teacher_payrolls where period_id=dest.id and ((source.employee_id is not null and employee_id=source.employee_id) or (source.employee_id is null and teacher_id=source.teacher_id));
     if not found then
       insert into public.teacher_payrolls(period_id,teacher_id,employee_id,branch_id,teacher_name,pay_type,currency)
       values(dest.id,source.teacher_id,source.employee_id,source.branch_id,source.teacher_name,source.pay_type,source.currency) returning id into dest_payroll;
     end if;
     insert into public.payroll_adjustments(payroll_id,kind,amount,reason,created_by)
       values(dest_payroll,'CORRECTION',delta,r.reason,r.maker_user_id) returning id into adjustment;
     update public.teacher_payrolls set adjustment_amount=adjustment_amount+delta,gross_amount=gross_amount+delta where id=dest_payroll;
     update public.payroll_periods set version=version+1 where id=dest.id;
     insert into public.payroll_events(period_id,status,note,actor_id,event_type,before_snapshot,after_snapshot)
       values(dest.id,dest.status,'Correction from finalized payroll: '||r.target_id::text||' — '||r.reason,auth.uid(),'CORRECTION_POSTED',
         snapshot,jsonb_build_object('request_id',r.id,'adjustment_id',adjustment,'delta',delta));
   end if;
   insert into public.payroll_corrections(id,original_payroll_id,original_earning_id,original_adjustment_id,original_amount,corrected_amount,delta,
     currency,reason,target_period_id,posted_adjustment_id,run_type,maker_user_id,checker_user_id,created_at,approved_at)
   values(r.id,source.id,source_earning,source_adjustment,(snapshot->>'original_amount')::numeric,(snapshot->>'corrected_amount')::numeric,delta,
     source.currency,r.reason,dest.id,adjustment,r.details->>'run_type',r.maker_user_id,auth.uid(),r.created_at,now());
   result:=r.id;
   select to_jsonb(c) into after_state from public.payroll_corrections c where c.id=result;
 end if;
 update public.financial_approval_requests set status='POSTED',posted_at=now(),result_id=result where id=r.id;
 insert into public.financial_approval_events(request_id,event,performed_by,reason,before_snapshot,after_snapshot)
 values(r.id,'POSTED',auth.uid(),btrim(p_note),r.source_snapshot,after_state);
 return result;
end $$;
