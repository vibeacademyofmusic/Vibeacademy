-- Issued-invoice cancellation changes receivables and requires maker-checker too.
alter table public.financial_approval_requests drop constraint financial_approval_requests_operation_check;
alter table public.financial_approval_requests add constraint financial_approval_requests_operation_check
check(operation in ('REFUND','VOID_PAYMENT','VOID_REFUND','ALLOCATE_REFUND','PAYROLL_CORRECTION','CANCEL_INVOICE'));
insert into public.permissions(code,name,module) values('finance.invoice_cancel.request','Request issued invoice cancellation','finance'),('finance.invoice_cancel.approve','Approve issued invoice cancellation','finance') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code='FINANCE' and p.code in ('finance.invoice_cancel.request','finance.invoice_cancel.approve') on conflict do nothing;
create or replace function
finance_private.cancel_invoice(
  p_invoice_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public,pg_temp
as $$
declare
  v_status text;
begin



  if p_invoice_id is null then
    raise exception
      'Invoice id is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Invoice cancellation reason is required';
  end if;


  select invoice.status
  into v_status
  from public.invoices as invoice
  where invoice.id =
    p_invoice_id
  for update;


  if not found then
    raise exception
      'Invoice not found';
  end if;


  if v_status not in (
    'DRAFT',
    'ISSUED'
  ) then
    raise exception
      'Only draft or issued invoices can be cancelled';
  end if;


  update public.invoices
  set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancel_reason =
      btrim(p_reason)
  where id =
    p_invoice_id;
end;
$$;
create or replace function public.cancel_invoice(p_invoice_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare state text;
begin
 if not public.is_global_super_admin() then raise exception 'SUPER_ADMIN role required'; end if;
 select status into state from public.invoices where id=p_invoice_id for update;
 if state is distinct from 'DRAFT' then raise exception 'Financial approval required'; end if;
 perform finance_private.cancel_invoice(p_invoice_id,p_reason);
end $$;
create or replace function finance_private.operation_permission(p_operation text,p_action text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_operation when 'REFUND' then 'finance.refund.' when 'VOID_PAYMENT' then 'finance.payment_void.'
 when 'VOID_REFUND' then 'finance.refund_void.' when 'ALLOCATE_REFUND' then 'finance.refund_allocation.'
 when 'PAYROLL_CORRECTION' then 'payroll.correction.' when 'CANCEL_INVOICE' then 'finance.invoice_cancel.' end || p_action
$$;
alter function finance_private.validate_request(text,uuid,jsonb,text) rename to validate_ledger_request;
create function finance_private.validate_request(p_operation text,p_target uuid,p_details jsonb,p_permission text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.invoices; validated jsonb;
begin
 if p_operation<>'CANCEL_INVOICE' then
   validated:=finance_private.validate_ledger_request(p_operation,p_target,p_details,p_permission);
   if p_operation='PAYROLL_CORRECTION' and exists(select 1 from public.payroll_corrections where posted_adjustment_id=nullif(p_details->>'adjustment_id','')::uuid) then
     raise exception 'Correct the original source line, not a posted correction line';
   end if;
   return validated;
 end if;
 select * into i from public.invoices where id=p_target and public.finance_action_allowed(p_permission,branch_id_snapshot);
 if not found then raise exception 'Unauthorized'; end if;
 if p_details is distinct from '{}'::jsonb then raise exception 'Unexpected request field'; end if;
 if i.status<>'ISSUED' then raise exception 'Cancellation approval requires ISSUED invoice'; end if;
 return jsonb_build_object('branch_id',i.branch_id_snapshot,'source',to_jsonb(i));
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
 if r.operation='REFUND' then
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
     select id into dest_payroll from public.teacher_payrolls where period_id=dest.id and teacher_id=source.teacher_id;
     if not found then
       insert into public.teacher_payrolls(period_id,teacher_id,branch_id,teacher_name,pay_type,currency)
       values(dest.id,source.teacher_id,source.branch_id,source.teacher_name,source.pay_type,source.currency) returning id into dest_payroll;
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


revoke all on all functions in schema finance_private from public,anon,authenticated,service_role;

-- Emergency authority must come from a global SUPER_ADMIN assignment.
create or replace function public.transition_payroll_with_override(p_period uuid,p_version integer,p_status text,p_note text,p_override_type text,p_override_reason text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.payroll_periods; before_state jsonb; after_state jsonb; emergency boolean; action_permission text;
begin

 action_permission:=case p_status when 'APPROVED' then 'payroll.approve' when 'FINALIZED' then 'payroll.finalize' else 'payroll.prepare' end;
 -- Authorize scope before locking or revealing the record version.
 select * into p from public.payroll_periods target where target.id=p_period
   and public.has_permission(action_permission,target.branch_id)
   and (public.is_global_super_admin() or public.has_role_permission('FINANCE',action_permission,target.branch_id))
 for update;
 if not found then raise exception 'Unauthorized'; end if;
 if p.version is distinct from p_version then raise exception 'Payroll changed; reload'; end if;
 emergency:=p_override_type is not null or p_override_reason is not null;
 if emergency then
   if p_status not in ('APPROVED','FINALIZED') or not public.has_permission(action_permission,p.branch_id)
     or not public.is_global_super_admin() or p_override_type is distinct from 'MAKER_CHECKER_EMERGENCY'
     or p_override_reason is null or char_length(btrim(p_override_reason)) not between 1 and 2000 then
     raise exception 'Valid SUPER_ADMIN emergency override reason and type required';
   end if;
 elsif p_status in ('APPROVED','FINALIZED') and (
   p.generated_by is null or p.generated_by=auth.uid() or exists(
     select 1 from public.payroll_adjustments a join public.teacher_payrolls t on t.id=a.payroll_id
     where t.period_id=p.id and a.created_by=auth.uid())) then
   raise exception 'Payroll maker cannot approve or finalize';
 end if;
 before_state:=public.payroll_approval_snapshot(p.id);

 if p_note is null or char_length(btrim(p_note)) not between 1 and 2000 then raise exception 'Audit note required'; end if;
 if p_status is null or not ((p.status='GENERATED' and p_status in ('DRAFT','REVIEW')) or (p.status='REVIEW' and p_status in ('DRAFT','APPROVED')) or (p.status='APPROVED' and p_status='FINALIZED')) then raise exception 'Invalid payroll transition'; end if;
 if p_status='DRAFT' and exists(select 1 from payroll_adjustments a join teacher_payrolls t on t.id=a.payroll_id where t.period_id=p.id) then raise exception 'Payroll with adjustments cannot return to draft'; end if;
 if p_status='APPROVED' and not exists(select 1 from teacher_payrolls where period_id=p.id) then raise exception 'Empty payroll cannot be approved'; end if;
 if p_status='APPROVED' then
 update payroll_adjustments a set approved_by=auth.uid(),approved_at=now() from teacher_payrolls t where t.id=a.payroll_id and t.period_id=p.id;
 end if;
 update payroll_periods set status=p_status,version=version+1,
 approved_by=case when p_status='APPROVED' then auth.uid() else approved_by end,approved_at=case when p_status='APPROVED' then now() else approved_at end,
 finalized_by=case when p_status='FINALIZED' then auth.uid() else finalized_by end,finalized_at=case when p_status='FINALIZED' then now() else finalized_at end where id=p.id;
 after_state:=public.payroll_approval_snapshot(p.id);
 insert into public.payroll_events(period_id,status,note,actor_id,event_type,override_type,override_reason,before_snapshot,after_snapshot)
 values(p.id,p_status,btrim(p_note),auth.uid(),case when emergency then 'EMERGENCY_OVERRIDE' else 'STATUS_TRANSITION' end,
 case when emergency then p_override_type end,case when emergency then btrim(p_override_reason) end,before_state,after_state);
end $$;
