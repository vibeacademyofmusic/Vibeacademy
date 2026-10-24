-- Traceable release of opening allocations, with explicit approved reuse/refund.
-- Payment, refund and opening originals remain immutable.
create table public.customer_credits (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.students(id),branch_id uuid not null references public.branches(id),currency text not null,
 payment_id uuid references public.payments(id),source_allocation_id uuid references public.payment_allocations(id),
 opening_receivable_id uuid not null references public.opening_receivables(id),
 correction_id uuid not null references public.opening_receivable_corrections(id),
 cause_request_id uuid not null references public.financial_approval_requests(id),
 settlement_id uuid references public.opening_settlements(id),
 amount numeric(14,2) not null check(amount>0),created_at timestamptz not null default now(),created_by uuid not null default auth.uid(),
 check ((payment_id is not null and source_allocation_id is not null and settlement_id is null)
     or (payment_id is null and source_allocation_id is null and settlement_id is not null)),
 unique(cause_request_id,source_allocation_id),unique(cause_request_id,settlement_id)
);
create index customer_credit_source_allocation on public.customer_credits(source_allocation_id) where source_allocation_id is not null;
create index customer_credit_payment on public.customer_credits(payment_id);
create index customer_credit_opening on public.customer_credits(opening_receivable_id);
create table public.customer_credit_uses (
 id uuid primary key references public.financial_approval_requests(id),credit_id uuid not null references public.customer_credits(id),
 kind text not null check(kind in ('APPLY','REFUND')),amount numeric(14,2) not null check(amount>0),
 payment_allocation_id uuid references public.payment_allocations(id) deferrable initially deferred,
 refund_id uuid references public.refunds(id),created_at timestamptz not null default now(),created_by uuid not null default auth.uid(),
 check((kind='APPLY' and payment_allocation_id is not null and refund_id is null) or(kind='REFUND' and refund_id is not null and payment_allocation_id is null))
);
create index customer_credit_use_source on public.customer_credit_uses(credit_id);
alter table public.payment_allocations add column credit_use_id uuid unique references public.customer_credit_uses(id) deferrable initially deferred;
alter table public.payment_allocations drop constraint payment_allocations_payment_invoice_unique;
create unique index payment_invoice_original_unique on public.payment_allocations(payment_id,invoice_id) where credit_use_id is null;
drop index public.payment_opening_unique;
create unique index payment_opening_unique on public.payment_allocations(payment_id,opening_receivable_id) where credit_use_id is null and opening_receivable_id is not null;
alter table public.customer_credits enable row level security;
alter table public.customer_credit_uses enable row level security;
create policy customer_credit_read on public.customer_credits for select to authenticated using(public.finance_action_allowed('finance.view',branch_id));
create policy customer_credit_use_read on public.customer_credit_uses for select to authenticated using(exists(select 1 from public.customer_credits c where c.id=credit_id));
revoke all on public.customer_credits,public.customer_credit_uses from public,anon,authenticated,service_role;
grant select on public.customer_credits,public.customer_credit_uses to authenticated;
create trigger customer_credit_immutable before update or delete on public.customer_credits for each row execute function finance_private.guard_approval_history();
create trigger customer_credit_use_immutable before update or delete on public.customer_credit_uses for each row execute function finance_private.guard_approval_history();
create view public.customer_credit_balances with(security_invoker=true) as
 select c.*,coalesce(u.applied,0)::numeric(14,2) as applied_amount,coalesce(u.refunded,0)::numeric(14,2) as refunded_amount,
 (case when p.status='VOIDED' then 0 else c.amount-coalesce(u.applied,0)-coalesce(u.refunded,0) end)::numeric(14,2) as remaining_credit,
 (c.payment_id is null) as legacy_settlement_credit,
 p.status as payment_status,(case when p.status='VOIDED' then c.amount else 0 end)::numeric(14,2) as voided_amount
 from public.customer_credits c left join public.payments p on p.id=c.payment_id
 left join lateral(select sum(case when u.kind='APPLY' and p.status='POSTED' then u.amount else 0 end) as applied,
 sum(case when u.kind='REFUND' and r.status='POSTED' then u.amount else 0 end) as refunded
 from public.customer_credit_uses u left join public.refunds r on r.id=u.refund_id where u.credit_id=c.id)u on true;
grant select on public.customer_credit_balances to authenticated;
-- The original allocation amount stays unchanged; releases are independent credit ledger rows.
create view public.payment_allocation_effective with(security_invoker=true) as
 select a.*,coalesce(c.released,0)::numeric(14,2) as released_to_credit,
 (a.amount-coalesce(c.released,0))::numeric(14,2) as effective_amount
 from public.payment_allocations a left join lateral(select sum(amount) as released from public.customer_credits where source_allocation_id=a.id)c on true;
grant select on public.payment_allocation_effective to authenticated;
create or replace view public.opening_receivable_balances with(security_invoker=true) as
select r.*,coalesce(s.amount,0)::numeric(14,2) as opening_paid_amount,
 (r.amount-coalesce(v.reversed_amount,0)+coalesce(c.delta,0)+coalesce(sc.released,0)-coalesce(s.amount,0)+coalesce(v.reversed_settlement,0)-coalesce(a.net_paid,0))::numeric(14,2) as outstanding_balance,
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
left join lateral(select sum(amount) as released from public.customer_credits where settlement_id=s.id)sc on true
left join lateral (select sum(delta) as delta from public.opening_receivable_corrections where opening_receivable_id=r.id)c on true
left join lateral (
 select sum(pa.effective_amount) as gross_paid,sum(coalesce(ra.amount,0)) as refunded,sum(pa.effective_amount-coalesce(ra.amount,0)) as net_paid
 from public.payment_allocation_effective pa join public.payments p on p.id=pa.payment_id and p.status='POSTED'
 left join lateral(select sum(a.amount) as amount from public.refund_allocations a join public.refunds f on f.id=a.refund_id and f.status='POSTED' where a.payment_allocation_id=pa.id) ra on true
 where pa.opening_receivable_id=r.id
)a on true;

insert into public.permissions(code,name,module) values
 ('finance.credit.request','Request customer credit use','finance'),('finance.credit.approve','Approve customer credit use','finance') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.code='FINANCE' and p.code in('finance.credit.request','finance.credit.approve') on conflict do nothing;
alter table public.financial_approval_requests drop constraint financial_approval_requests_operation_check;
alter table public.financial_approval_requests add constraint financial_approval_requests_operation_check check(operation in
 ('REFUND','VOID_PAYMENT','VOID_REFUND','ALLOCATE_REFUND','PAYROLL_CORRECTION','CANCEL_INVOICE','OPENING_RECEIVABLE_CORRECTION','APPLY_CUSTOMER_CREDIT','REFUND_CUSTOMER_CREDIT'));
create or replace function finance_private.operation_permission(p_operation text,p_action text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_operation when 'REFUND' then 'finance.refund.' when 'VOID_PAYMENT' then 'finance.payment_void.'
 when 'VOID_REFUND' then 'finance.refund_void.' when 'ALLOCATE_REFUND' then 'finance.refund_allocation.'
 when 'PAYROLL_CORRECTION' then 'payroll.correction.' when 'CANCEL_INVOICE' then 'finance.invoice_cancel.'
 when 'APPLY_CUSTOMER_CREDIT' then 'finance.credit.' when 'REFUND_CUSTOMER_CREDIT' then 'finance.credit.'
 when 'OPENING_RECEIVABLE_CORRECTION' then 'finance.opening_correction.' end || p_action
$$;
alter function finance_private.validate_request(text,uuid,jsonb,text) rename to validate_before_customer_credit;
create function finance_private.validate_request(p_operation text,p_target uuid,p_details jsonb,p_permission text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.customer_credit_balances; o public.opening_receivables; b public.opening_receivable_balances;
 row public.migration_batch_rows; target numeric; obligation jsonb; target_id uuid; balance numeric;
begin
 if p_operation not in ('APPLY_CUSTOMER_CREDIT','REFUND_CUSTOMER_CREDIT','OPENING_RECEIVABLE_CORRECTION') then
  return finance_private.validate_before_customer_credit(p_operation,p_target,p_details,p_permission);
 end if;
 if p_operation='OPENING_RECEIVABLE_CORRECTION' then
  select * into o from public.opening_receivables where id=p_target and public.finance_action_allowed(p_permission,branch_id);
  if not found then raise exception 'Unauthorized'; end if;
  if p_details is null or jsonb_typeof(p_details)<>'object' or (p_details-array['corrected_amount'])<>'{}' then raise exception 'Unexpected request field'; end if;
  target:=(p_details->>'corrected_amount')::numeric;
  if target is null or target<0 or target>=1000000000000 or target<>round(target,2) or (o.currency='VND' and target<>trunc(target)) then raise exception 'Invalid corrected amount'; end if;
  select * into b from public.opening_receivable_balances where id=o.id;
  if b.reversed then raise exception 'Opening receivable was reversed'; end if;
  if target=o.amount+b.correction_amount then raise exception 'Correction has no remaining delta'; end if;
  select * into row from public.migration_batch_rows where id=o.migration_row_id;
  return jsonb_build_object('branch_id',o.branch_id,'source',jsonb_build_object('opening',to_jsonb(o),'currency',o.currency,
   'migration_batch_id',row.batch_id,'source_reference',row.source_reference,'original_amount',o.amount,
   'old_amount',o.amount+b.correction_amount,'corrected_amount',target,'delta',target-o.amount-b.correction_amount,'outstanding_balance',b.outstanding_balance));
 end if;
 select * into c from public.customer_credit_balances where id=p_target and public.finance_action_allowed(p_permission,branch_id);
 if not found then raise exception 'Unauthorized'; end if;
 if c.payment_id is null then raise exception 'Legacy settlement credit requires source payment review'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' then raise exception 'Invalid request details'; end if;
 target:=(p_details->>'amount')::numeric;
 if target is null or target<=0 or target>=1000000000000 or target<>round(target,2) or(c.currency='VND' and target<>trunc(target)) then raise exception 'Invalid credit amount'; end if;
 if target>c.remaining_credit then raise exception 'Credit amount exceeds remaining credit'; end if;
 if p_operation='APPLY_CUSTOMER_CREDIT' then
  if (p_details-array['amount','invoice_id','opening_receivable_id'])<>'{}' then raise exception 'Unexpected request field'; end if;
  if num_nonnulls(p_details->>'invoice_id',p_details->>'opening_receivable_id')<>1 then raise exception 'Exactly one obligation required'; end if;
  if p_details->>'invoice_id' is not null then
   target_id:=(p_details->>'invoice_id')::uuid;
   select to_jsonb(i),i.outstanding_balance into obligation,balance from public.invoice_receivables i
   where i.invoice_id=target_id and i.invoice_status='ISSUED' and i.student_id_snapshot=c.student_id and i.branch_id_snapshot=c.branch_id and i.currency=c.currency;
  else
   target_id:=(p_details->>'opening_receivable_id')::uuid;
   select to_jsonb(ob),ob.outstanding_balance into obligation,balance from public.opening_receivable_balances ob
   where ob.id=target_id and not ob.reversed and ob.student_id=c.student_id and ob.branch_id=c.branch_id and ob.currency=c.currency;
  end if;
  if obligation is null then raise exception 'Credit obligation scope or status mismatch'; end if;
  if target>balance then raise exception 'Credit exceeds obligation balance'; end if;
 else
  if (p_details-array['amount','refunded_at'])<>'{}' then raise exception 'Unexpected request field'; end if;
  if (p_details->>'refunded_at')::timestamptz is null or (p_details->>'refunded_at')::timestamptz>now() then raise exception 'Actual refund time required'; end if;
  if (p_details->>'refunded_at')::timestamptz<(select paid_at from public.payments where id=c.payment_id) then raise exception 'Refund cannot precede receipt'; end if;
 end if;
 return jsonb_build_object('branch_id',c.branch_id,'source',jsonb_build_object('credit',to_jsonb(c),'currency',c.currency,'amount',target,'obligation',obligation));
end $$;
-- Called within approval transaction; source payments are locked before opening rows.
create function finance_private.release_opening_credit(p_correction uuid,p_cause uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare corr public.opening_receivable_corrections; o public.opening_receivables; excess numeric; a record; released numeric; sid uuid;
begin
 select * into corr from public.opening_receivable_corrections where id=p_correction;
 select * into o from public.opening_receivables where id=corr.opening_receivable_id;
 select greatest(0,-outstanding_balance) into excess from public.opening_receivable_balances where id=o.id;
 if excess=0 then return; end if;
 for a in select pa.*,p.paid_at,coalesce(r.amount,0) as refunded from public.payment_allocation_effective pa
 join public.payments p on p.id=pa.payment_id and p.status='POSTED'
 left join lateral(select sum(ra.amount) as amount from public.refund_allocations ra join public.refunds f on f.id=ra.refund_id and f.status='POSTED' where ra.payment_allocation_id=pa.id)r on true
 where pa.opening_receivable_id=o.id and pa.effective_amount>coalesce(r.amount,0) order by p.paid_at desc,pa.id loop
  exit when excess=0;
  -- A normal refund must be attributed before releasing its original allocation as credit.
  if exists(select 1 from public.refunds f where f.payment_id=a.payment_id and f.status='POSTED'
   and f.amount>(select coalesce(sum(ra.amount),0) from public.refund_allocations ra where ra.refund_id=f.id)
                +(select coalesce(sum(u.amount),0) from public.customer_credit_uses u where u.refund_id=f.id)) then raise exception 'Attribute pending refunds before releasing credit'; end if;
  released:=least(excess,a.effective_amount-a.refunded);
  insert into public.customer_credits(student_id,branch_id,currency,payment_id,source_allocation_id,opening_receivable_id,correction_id,cause_request_id,amount)
   values(o.student_id,o.branch_id,o.currency,a.payment_id,a.id,o.id,corr.id,coalesce(p_cause,corr.id),released);
  excess:=excess-released;
 end loop;
 if excess>0 then
  select id into sid from public.opening_settlements where receivable_id=o.id;
  if sid is null then raise exception 'Credit reconciliation failed'; end if;
  -- Historical settlement has no invented cash/payment; retain credit pending source review.
  insert into public.customer_credits(student_id,branch_id,currency,settlement_id,opening_receivable_id,correction_id,cause_request_id,amount)
   values(o.student_id,o.branch_id,o.currency,sid,o.id,corr.id,coalesce(p_cause,corr.id),excess);
 end if;
 if (select outstanding_balance from public.opening_receivable_balances where id=o.id)<>0 then raise exception 'Credit reconciliation failed'; end if;
end $$;
-- Ordinary refunds cannot consume reserved customer credit without the approved credit-refund operation.
create function finance_private.guard_credit_refund() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare reserved numeric; refunded numeric;
begin
 select coalesce(sum(remaining_credit),0) into reserved from public.customer_credit_balances where payment_id=new.payment_id;
 select coalesce(sum(amount),0) into refunded from public.refunds where payment_id=new.payment_id and status='POSTED';
 if new.amount>(select amount from public.payments where id=new.payment_id)-refunded-reserved then
  if not exists(select 1 from public.financial_approval_requests r where r.operation='REFUND_CUSTOMER_CREDIT' and r.status='APPROVED'
   and r.approver_user_id=auth.uid() and (r.source_snapshot->'credit'->>'payment_id')::uuid=new.payment_id and (r.details->>'amount')::numeric=new.amount
   and not exists(select 1 from public.customer_credit_uses u where u.id=r.id)) then raise exception 'Use approved customer credit refund'; end if;
 end if;
 return new;
end $$;
create trigger customer_credit_refund_guard before insert on public.refunds for each row execute function finance_private.guard_credit_refund();
create function finance_private.guard_credit_refund_allocation() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare used numeric; available numeric;
begin
 if exists(select 1 from public.customer_credit_uses where refund_id=new.refund_id) then raise exception 'Credit refund cannot be allocated again'; end if;
 select effective_amount into available from public.payment_allocation_effective where id=new.payment_allocation_id;
 select coalesce(sum(a.amount),0) into used from public.refund_allocations a join public.refunds r on r.id=a.refund_id and r.status='POSTED' where a.payment_allocation_id=new.payment_allocation_id;
 if used+new.amount>available then raise exception 'Refund exceeds effective allocation'; end if;
 return new;
end $$;
create trigger customer_credit_refund_allocation_guard before insert on public.refund_allocations for each row execute function finance_private.guard_credit_refund_allocation();
-- A normal refund reversal can produce excess too. Reuse last approved opening correction as provenance.
create or replace function finance_private.guard_opening_refund_void() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid; correction uuid; cause uuid;
begin
 if new.status='VOIDED' and old.status='POSTED' then
  for target in select distinct a.opening_receivable_id from public.refund_allocations r join public.payment_allocations a on a.id=r.payment_allocation_id where r.refund_id=new.id and a.opening_receivable_id is not null order by a.opening_receivable_id loop
   perform 1 from public.opening_receivables where id=target for update;
   if (select outstanding_balance from public.opening_receivable_balances where id=target)<0 then
    select id into correction from public.opening_receivable_corrections where opening_receivable_id=target order by posted_at desc,id desc limit 1;
    select id into cause from public.financial_approval_requests where operation='VOID_REFUND' and target_id=new.id and status='APPROVED';
    if cause is null then raise exception 'Approved refund reversal required'; end if;
    perform finance_private.release_opening_credit(correction,cause);
   end if;
  end loop;
 end if;
 return new;
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
