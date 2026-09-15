-- Existing Payment/Refund Engine allocations may target exactly one invoice OR opening receivable.
-- No historical payment is inserted into payments and no new cash engine is introduced.
alter table public.payment_allocations add column opening_receivable_id uuid references public.opening_receivables(id);
alter table public.payment_allocations alter column invoice_id drop not null;
alter table public.payment_allocations add constraint payment_allocation_one_target check(num_nonnulls(invoice_id,opening_receivable_id)=1);
create unique index payment_opening_unique on public.payment_allocations(payment_id,opening_receivable_id) where opening_receivable_id is not null;
create index payment_opening_target on public.payment_allocations(opening_receivable_id) where opening_receivable_id is not null;
create policy finance_opening_allocation_read on public.payment_allocations for select to authenticated using(
 exists(select 1 from public.payments p join public.opening_receivables o on o.id=opening_receivable_id where p.id=payment_id
 and public.finance_action_allowed('finance.view',p.branch_id_snapshot) and public.finance_action_allowed('finance.view',o.branch_id)));

insert into public.permissions(code,name,module) values
 ('finance.opening_correction.request','Request opening balance correction','finance'),
 ('finance.opening_correction.approve','Approve opening balance correction','finance') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p
 where r.code='FINANCE' and p.code in ('finance.opening_correction.request','finance.opening_correction.approve') on conflict do nothing;
alter table public.financial_approval_requests drop constraint financial_approval_requests_operation_check;
alter table public.financial_approval_requests add constraint financial_approval_requests_operation_check check(operation in
 ('REFUND','VOID_PAYMENT','VOID_REFUND','ALLOCATE_REFUND','PAYROLL_CORRECTION','CANCEL_INVOICE','OPENING_RECEIVABLE_CORRECTION'));
create table public.opening_receivable_corrections (
 id uuid primary key references public.financial_approval_requests(id),
 opening_receivable_id uuid not null references public.opening_receivables(id),
 migration_batch_id uuid not null references public.migration_batches(id),
 migration_row_id uuid not null references public.migration_batch_rows(id),
 source_reference text not null,
 original_amount numeric(14,2) not null,old_amount numeric(14,2) not null,corrected_amount numeric(14,2) not null check(corrected_amount>=0),
 delta numeric(14,2) not null check(delta<>0 and delta=corrected_amount-old_amount),
 currency text not null,reason text not null,
 maker_user_id uuid not null references auth.users(id),checker_user_id uuid not null references auth.users(id),
 created_at timestamptz not null,approved_at timestamptz not null,posted_at timestamptz not null default now()
);
create index opening_correction_target on public.opening_receivable_corrections(opening_receivable_id);
alter table public.opening_receivable_corrections enable row level security;
create policy opening_corrections_read on public.opening_receivable_corrections for select to authenticated using(exists(select 1 from public.financial_approval_requests r where r.id=opening_receivable_corrections.id));
revoke all on public.opening_receivable_corrections from public,anon,authenticated,service_role;
grant select on public.opening_receivable_corrections to authenticated;
create trigger opening_correction_history before update or delete on public.opening_receivable_corrections for each row execute function finance_private.guard_approval_history();
create trigger opening_original_history before update or delete on public.opening_receivables for each row execute function finance_private.guard_approval_history();
create trigger opening_settlement_history before update or delete on public.opening_settlements for each row execute function finance_private.guard_approval_history();
create trigger opening_reversal_history before update or delete on public.opening_reversals for each row execute function finance_private.guard_approval_history();

-- Preserve the existing view column order; append reporting dimensions.
create or replace view public.opening_receivable_balances with(security_invoker=true) as
select r.*,coalesce(s.amount,0)::numeric(14,2) as opening_paid_amount,
 (r.amount-coalesce(v.reversed_amount,0)+coalesce(c.delta,0)-coalesce(s.amount,0)+coalesce(v.reversed_settlement,0)-coalesce(a.net_paid,0))::numeric(14,2) as outstanding_balance,
 (v.receivable_id is not null) as reversed,
 (r.amount-coalesce(v.reversed_amount,0))::numeric(14,2) as net_opening_amount,
 (coalesce(s.amount,0)-coalesce(v.reversed_settlement,0))::numeric(14,2) as net_opening_paid,
 coalesce(c.delta,0)::numeric(14,2) as correction_amount,
 coalesce(a.gross_paid,0)::numeric(14,2) as post_cutover_allocated,
 coalesce(a.refunded,0)::numeric(14,2) as post_cutover_refunded,
 coalesce(a.net_paid,0)::numeric(14,2) as post_cutover_net_paid,
 0::numeric(14,2) as new_revenue_from_collection
from public.opening_receivables r
left join public.opening_settlements s on s.receivable_id=r.id
left join public.opening_reversals v on v.receivable_id=r.id
left join lateral (select sum(delta) as delta from public.opening_receivable_corrections where opening_receivable_id=r.id)c on true
left join lateral (
 select sum(pa.amount) as gross_paid,sum(coalesce(ra.amount,0)) as refunded,sum(pa.amount-coalesce(ra.amount,0)) as net_paid
 from public.payment_allocations pa join public.payments p on p.id=pa.payment_id and p.status='POSTED'
 left join lateral(select sum(a.amount) as amount from public.refund_allocations a join public.refunds f on f.id=a.refund_id and f.status='POSTED' where a.payment_allocation_id=pa.id) ra on true
 where pa.opening_receivable_id=r.id
)a on true;
-- Explicit fields keep existing directory contracts while adding the new dimensions at the end.
create or replace view public.opening_receivable_directory with(security_invoker=true) as
select b.id,b.migration_row_id,b.tuition_id,b.enrollment_id,b.student_id,b.branch_id,b.opening_as_of_date,b.currency,b.amount,b.origin,b.transaction_type,b.created_at,
 b.opening_paid_amount,b.outstanding_balance,b.reversed,b.net_opening_amount,b.net_opening_paid,s.full_name,s.student_code,
 b.correction_amount,b.post_cutover_allocated,b.post_cutover_refunded,b.post_cutover_net_paid,b.new_revenue_from_collection
from public.opening_receivable_balances b join public.students s on s.id=b.student_id;

create function public.allocate_payment_to_opening(p_payment_id uuid,p_opening_receivable_id uuid,p_amount numeric) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.payments; o public.opening_receivables; a public.payment_allocations; available numeric; balance numeric; result uuid;
begin
 if not public.is_global_super_admin() then raise exception 'Unauthorized'; end if;
 if p_amount is null or p_amount<=0 or p_amount>=1000000000000 or p_amount<>round(p_amount,2) then raise exception 'Invalid allocation amount'; end if;
 select * into p from public.payments where id=p_payment_id for update;
 select * into o from public.opening_receivables where id=p_opening_receivable_id for update;
 if p.id is null or o.id is null then raise exception 'Payment or opening receivable not found'; end if;
 if p.status<>'POSTED' then raise exception 'Only posted payments can be allocated'; end if;
 if p.student_id_snapshot<>o.student_id or p.branch_id_snapshot<>o.branch_id or p.currency<>o.currency then raise exception 'Payment and opening scope must match'; end if;
 if o.currency='VND' and p_amount<>trunc(p_amount) then raise exception 'VND amount must be integral'; end if;
 if (p.paid_at at time zone 'Asia/Ho_Chi_Minh')::date<o.opening_as_of_date or p.paid_at>now() then raise exception 'Opening collection must have an actual post-cutover receipt date'; end if;
 if exists(select 1 from public.opening_reversals where receivable_id=o.id) then raise exception 'Opening receivable was reversed'; end if;
 select * into a from public.payment_allocations where payment_id=p.id and opening_receivable_id=o.id;
 if found then
  if a.amount<>p_amount then raise exception 'Existing allocation amount differs'; end if;
  return a.id;
 end if;
 select p.amount-coalesce(sum(amount),0) into available from public.payment_allocations where payment_id=p.id;
 if p_amount>available then raise exception 'Allocation exceeds the remaining payment amount'; end if;
 -- Do not repurpose already-refunded cash as a new opening collection.
 if exists(select 1 from public.refunds where payment_id=p.id and status='POSTED') then raise exception 'Allocate before refunding payment'; end if;
 select outstanding_balance into balance from public.opening_receivable_balances where id=o.id;
 if p_amount>balance then raise exception 'Allocation exceeds the remaining opening balance'; end if;
 insert into public.payment_allocations(payment_id,opening_receivable_id,amount) values(p.id,o.id,p_amount) returning id into result;
 return result;
end $$;
revoke all on function public.allocate_payment_to_opening(uuid,uuid,numeric) from public,anon,authenticated,service_role;
grant execute on function public.allocate_payment_to_opening(uuid,uuid,numeric) to authenticated;

create or replace function finance_private.operation_permission(p_operation text,p_action text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_operation when 'REFUND' then 'finance.refund.' when 'VOID_PAYMENT' then 'finance.payment_void.'
 when 'VOID_REFUND' then 'finance.refund_void.' when 'ALLOCATE_REFUND' then 'finance.refund_allocation.'
 when 'PAYROLL_CORRECTION' then 'payroll.correction.' when 'CANCEL_INVOICE' then 'finance.invoice_cancel.'
 when 'OPENING_RECEIVABLE_CORRECTION' then 'finance.opening_correction.' end || p_action
$$;
alter function finance_private.validate_request(text,uuid,jsonb,text) rename to validate_pre_opening_request;
create function finance_private.validate_request(p_operation text,p_target uuid,p_details jsonb,p_permission text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.opening_receivables; b public.opening_receivable_balances; row public.migration_batch_rows; target numeric;
begin
 if p_operation<>'OPENING_RECEIVABLE_CORRECTION' then return finance_private.validate_pre_opening_request(p_operation,p_target,p_details,p_permission); end if;
 select * into o from public.opening_receivables where id=p_target and public.finance_action_allowed(p_permission,branch_id);
 if not found then raise exception 'Unauthorized'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' or (p_details-array['corrected_amount'])<>'{}' then raise exception 'Unexpected request field'; end if;
 target:=(p_details->>'corrected_amount')::numeric;
 if target is null or target<0 or target>=1000000000000 or target<>round(target,2) or (o.currency='VND' and target<>trunc(target)) then raise exception 'Invalid corrected amount'; end if;
 select * into b from public.opening_receivable_balances where id=o.id;
 if b.reversed then raise exception 'Opening receivable was reversed'; end if;
 if target=o.amount+b.correction_amount then raise exception 'Correction has no remaining delta'; end if;
 if b.outstanding_balance+target-o.amount-b.correction_amount<0 then raise exception 'Correction would create an unapproved customer credit'; end if;
 select * into row from public.migration_batch_rows where id=o.migration_row_id;
 return jsonb_build_object('branch_id',o.branch_id,'source',jsonb_build_object('opening',to_jsonb(o),'currency',o.currency,
 'migration_batch_id',row.batch_id,'source_reference',row.source_reference,'original_amount',o.amount,
 'old_amount',o.amount+b.correction_amount,'corrected_amount',target,'delta',target-o.amount-b.correction_amount,
 'outstanding_balance',b.outstanding_balance));
end $$;

-- A refunded allocation may be reinstated only while the corrected balance can support it.
create function finance_private.guard_opening_refund_void() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
 if new.status='VOIDED' and old.status='POSTED' then
  for target in select distinct a.opening_receivable_id from public.refund_allocations r join public.payment_allocations a on a.id=r.payment_allocation_id where r.refund_id=new.id and a.opening_receivable_id is not null order by a.opening_receivable_id loop
   perform 1 from public.opening_receivables where id=target for update;
   if (select outstanding_balance from public.opening_receivable_balances where id=target)<0 then raise exception 'Refund reversal would create an unapproved customer credit'; end if;
  end loop;
 end if;
 return new;
end $$;
create trigger opening_refund_void_guard after update on public.refunds for each row execute function finance_private.guard_opening_refund_void();
create function finance_private.guard_opening_rollback() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.opening_receivable_corrections where opening_receivable_id=new.receivable_id)
 or exists(select 1 from public.payment_allocations where opening_receivable_id=new.receivable_id) then raise exception 'Opening activity requires correction, not migration rollback'; end if;
 return new;
end $$;
create trigger opening_rollback_activity before insert on public.opening_reversals for each row execute function finance_private.guard_opening_rollback();

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
 elsif r.operation='OPENING_RECEIVABLE_CORRECTION' then
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
 if r.operation='OPENING_RECEIVABLE_CORRECTION' then
   snapshot:=validated->'source';
   insert into public.opening_receivable_corrections(id,opening_receivable_id,migration_batch_id,migration_row_id,source_reference,original_amount,old_amount,corrected_amount,delta,currency,reason,maker_user_id,checker_user_id,created_at,approved_at)
   values(r.id,r.target_id,(snapshot->>'migration_batch_id')::uuid,(snapshot->'opening'->>'migration_row_id')::uuid,snapshot->>'source_reference',(snapshot->>'original_amount')::numeric,(snapshot->>'old_amount')::numeric,(snapshot->>'corrected_amount')::numeric,(snapshot->>'delta')::numeric,snapshot->>'currency',r.reason,r.maker_user_id,auth.uid(),r.created_at,now());
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
