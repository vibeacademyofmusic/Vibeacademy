-- V3: approvals surround existing ledger operations; finalized sources stay immutable.
create schema if not exists finance_private;
revoke all on schema finance_private from public,anon,authenticated,service_role;

-- Original engine validation/calculation retained; only the public caller changes.
create or replace function
finance_private.create_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_refunded_at timestamptz,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public,pg_temp
as $$
declare
  v_payment public.payments%rowtype;

  v_existing_refunds numeric(14,2);

  v_refund_id uuid :=
    gen_random_uuid();

  v_refund_number text;
begin



  if p_payment_id is null then
    raise exception
      'Payment id is required';
  end if;


  if p_amount is null
    or p_amount <= 0
  then
    raise exception
      'Refund amount must be greater than zero';
  end if;


  if p_refunded_at is null then
    raise exception
      'Refund date is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Refund reason is required';
  end if;


  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;


  if not found then
    raise exception
      'Payment not found';
  end if;


  if v_payment.status <>
    'POSTED'
  then
    raise exception
      'Only posted payments can be refunded';
  end if;


  select coalesce(
    sum(refund.amount),
    0
  )
  into v_existing_refunds
  from public.refunds
    as refund
  where refund.payment_id =
    p_payment_id
    and refund.status =
      'POSTED';


  if v_existing_refunds
      + p_amount
      > v_payment.amount
  then
    raise exception
      'Refund exceeds the remaining refundable payment amount';
  end if;


  v_refund_number :=
    'REF-'
    || to_char(
      timezone(
        'Asia/Ho_Chi_Minh',
        now()
      ),
      'YYYY'
    )
    || '-'
    || lpad(
      nextval(
        'public.refund_number_seq'
      )::text,
      6,
      '0'
    );


  insert into public.refunds (
    id,
    refund_number,
    payment_id,
    student_id_snapshot,
    branch_id_snapshot,
    branch_code_snapshot,
    branch_name_snapshot,
    amount,
    currency,
    refunded_at,
    reason,
    notes,
    status
  )
  values (
    v_refund_id,
    v_refund_number,
    v_payment.id,
    v_payment.student_id_snapshot,
    v_payment.branch_id_snapshot,
    v_payment.branch_code_snapshot,
    v_payment.branch_name_snapshot,
    p_amount,
    v_payment.currency,
    p_refunded_at,
    btrim(p_reason),
    nullif(
      btrim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    ),
    'POSTED'
  );


  return v_refund_id;
end;
$$;
revoke all on function finance_private.create_refund(uuid,numeric,timestamptz,text,text) from public,anon,authenticated,service_role;
create or replace function
public.create_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_refunded_at timestamptz,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$ begin raise exception 'Financial approval required'; end $$;
alter function public.create_refund(uuid,numeric,timestamptz,text,text) set search_path=public,pg_temp;

-- Original engine validation/calculation retained; only the public caller changes.
create or replace function
finance_private.void_refund(
  p_refund_id uuid,
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



  if p_refund_id is null then
    raise exception
      'Refund id is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Refund void reason is required';
  end if;


  select refund.status
  into v_status
  from public.refunds
    as refund
  where refund.id =
    p_refund_id
  for update;


  if not found then
    raise exception
      'Refund not found';
  end if;


  if v_status <> 'POSTED' then
    raise exception
      'Only posted refunds can be voided';
  end if;


  update public.refunds
  set
    status = 'VOIDED',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason =
      btrim(p_reason)
  where id =
    p_refund_id;
end;
$$;
revoke all on function finance_private.void_refund(uuid,text) from public,anon,authenticated,service_role;
create or replace function
public.void_refund(
  p_refund_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$ begin raise exception 'Financial approval required'; end $$;
alter function public.void_refund(uuid,text) set search_path=public,pg_temp;

-- Original engine validation/calculation retained; only the public caller changes.
create or replace function
finance_private.allocate_refund_to_payment_allocation(
  p_refund_id uuid,
  p_payment_allocation_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public,pg_temp
as $$
declare
  v_refund public.refunds%rowtype;

  v_payment_allocation public.payment_allocations%rowtype;

  v_refund_allocated numeric(14,2);

  v_payment_allocation_refunded numeric(14,2);

  v_refund_allocation_id uuid :=
    gen_random_uuid();
begin



  if p_refund_id is null
    or p_payment_allocation_id is null
  then
    raise exception
      'Refund id and payment allocation id are required';
  end if;


  if p_amount is null
    or p_amount <= 0
  then
    raise exception
      'Refund allocation amount must be greater than zero';
  end if;


  select *
  into v_refund
  from public.refunds
  where id = p_refund_id
  for update;


  if not found then
    raise exception
      'Refund not found';
  end if;


  if v_refund.status <>
    'POSTED'
  then
    raise exception
      'Only posted refunds can be allocated';
  end if;


  select *
  into v_payment_allocation
  from public.payment_allocations
  where id =
    p_payment_allocation_id;


  if not found then
    raise exception
      'Payment allocation not found';
  end if;


  if v_payment_allocation.payment_id <>
    v_refund.payment_id
  then
    raise exception
      'Refund must be allocated against its original payment';
  end if;


  if exists (
    select 1
    from public.refund_allocations
    where refund_id =
      p_refund_id
      and payment_allocation_id =
        p_payment_allocation_id
  )
  then
    raise exception
      'This refund is already allocated to this payment allocation';
  end if;


  select coalesce(
    sum(allocation.amount),
    0
  )
  into v_refund_allocated
  from public.refund_allocations
    as allocation
  where allocation.refund_id =
    p_refund_id;


  if v_refund_allocated
      + p_amount
      > v_refund.amount
  then
    raise exception
      'Refund allocation exceeds the refund amount';
  end if;


  select coalesce(
    sum(refund_allocation.amount),
    0
  )
  into v_payment_allocation_refunded
  from public.refund_allocations
    as refund_allocation

  join public.refunds
    as refund
    on refund.id =
      refund_allocation.refund_id

  where refund_allocation.payment_allocation_id =
    p_payment_allocation_id

    and refund.status =
      'POSTED';


  if v_payment_allocation_refunded
      + p_amount
      > v_payment_allocation.amount
  then
    raise exception
      'Refund exceeds the original payment allocation amount';
  end if;


  insert into public.refund_allocations (
    id,
    refund_id,
    payment_allocation_id,
    amount
  )
  values (
    v_refund_allocation_id,
    p_refund_id,
    p_payment_allocation_id,
    p_amount
  );


  return v_refund_allocation_id;
end;
$$;
revoke all on function finance_private.allocate_refund_to_payment_allocation(uuid,uuid,numeric) from public,anon,authenticated,service_role;
create or replace function
public.allocate_refund_to_payment_allocation(
  p_refund_id uuid,
  p_payment_allocation_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$ begin raise exception 'Financial approval required'; end $$;
alter function public.allocate_refund_to_payment_allocation(uuid,uuid,numeric) set search_path=public,pg_temp;

-- Original engine validation/calculation retained; only the public caller changes.
create or replace function
finance_private.void_payment(
  p_payment_id uuid,
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



  if p_payment_id is null then
    raise exception
      'Payment id is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Payment void reason is required';
  end if;


  select payment.status
  into v_status
  from public.payments
    as payment
  where payment.id =
    p_payment_id
  for update;


  if not found then
    raise exception
      'Payment not found';
  end if;


  if v_status <> 'POSTED' then
    raise exception
      'Only posted payments can be voided';
  end if;


  update public.payments
  set
    status = 'VOIDED',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason =
      btrim(p_reason)
  where id =
    p_payment_id;
end;
$$;
revoke all on function finance_private.void_payment(uuid,text) from public,anon,authenticated,service_role;
create or replace function
public.void_payment(
  p_payment_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$ begin raise exception 'Financial approval required'; end $$;
alter function public.void_payment(uuid,text) set search_path=public,pg_temp;

insert into public.permissions(code,name,module)
select code,code,'finance' from (values
 ('finance.refund.request'),('finance.refund.approve'),
 ('finance.payment_void.request'),('finance.payment_void.approve'),
 ('finance.refund_void.request'),('finance.refund_void.approve'),
 ('finance.refund_allocation.request'),('finance.refund_allocation.approve'),
 ('payroll.correction.request'),('payroll.correction.approve')) v(code)
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='FINANCE' and p.code in ('finance.refund.request','finance.refund.approve',
 'finance.payment_void.request','finance.payment_void.approve','finance.refund_void.request','finance.refund_void.approve',
 'finance.refund_allocation.request','finance.refund_allocation.approve','payroll.correction.request','payroll.correction.approve')
on conflict do nothing;

create function public.is_global_super_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and r.code='SUPER_ADMIN' and ur.branch_id is null and ur.is_active
 and (ur.valid_from is null or ur.valid_from<=now()) and (ur.valid_until is null or ur.valid_until>now()))
$$;
revoke all on function public.is_global_super_admin() from public,anon,authenticated;
grant execute on function public.is_global_super_admin() to authenticated;

create function public.finance_action_allowed(p_permission text,p_branch uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select p_branch is not null and public.has_permission(p_permission,p_branch)
 and (public.is_global_super_admin() or public.has_role_permission('FINANCE',p_permission,p_branch))
$$;
revoke all on function public.finance_action_allowed(text,uuid) from public,anon,authenticated;
grant execute on function public.finance_action_allowed(text,uuid) to authenticated;

create table public.financial_approval_requests (
 id uuid primary key default gen_random_uuid(),
 operation text not null check(operation in ('REFUND','VOID_PAYMENT','VOID_REFUND','ALLOCATE_REFUND','PAYROLL_CORRECTION')),
 target_id uuid not null, branch_id uuid not null references public.branches(id),
 details jsonb not null check(jsonb_typeof(details)='object'),
 reason text not null check(char_length(btrim(reason)) between 1 and 2000),
 source_snapshot jsonb not null,
 maker_user_id uuid not null references auth.users(id),
 approver_user_id uuid references auth.users(id),
 status text not null default 'PENDING_APPROVAL' check(status in ('PENDING_APPROVAL','APPROVED','POSTED','CANCELLED')),
 idempotency_key uuid not null,
 created_at timestamptz not null default now(), approved_at timestamptz,posted_at timestamptz,
 result_id uuid,
 unique(maker_user_id,idempotency_key),
 check(status not in ('APPROVED','POSTED') or (approver_user_id is not null and approved_at is not null)),
 check(status<>'POSTED' or (posted_at is not null and result_id is not null))
);
create index financial_requests_scope_status on public.financial_approval_requests(branch_id,status,created_at desc,id);
create index financial_requests_target on public.financial_approval_requests(target_id,operation,status);
create table public.financial_approval_events (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.financial_approval_requests(id),
 event text not null check(event in ('REQUESTED','APPROVED','POSTED','CANCELLED','EMERGENCY_OVERRIDE')),
 performed_by uuid not null references auth.users(id), performed_at timestamptz not null default now(),
 reason text not null,override_type text,before_snapshot jsonb not null,after_snapshot jsonb not null,
 check((event='EMERGENCY_OVERRIDE' and override_type is not null and override_type='MAKER_CHECKER_EMERGENCY' and length(btrim(reason))>0)
 or (event<>'EMERGENCY_OVERRIDE' and override_type is null))
);
create index financial_events_request on public.financial_approval_events(request_id,performed_at,id);

create table public.payroll_corrections (
 id uuid primary key references public.financial_approval_requests(id),
 original_payroll_id uuid not null references public.teacher_payrolls(id),
 original_earning_id uuid references public.payroll_earning_lines(id),
 original_adjustment_id uuid references public.payroll_adjustments(id),
 original_amount numeric(16,2) not null,corrected_amount numeric(16,2) not null,delta numeric(16,2) not null check(delta<>0),
 currency text not null,reason text not null,
 target_period_id uuid references public.payroll_periods(id),
 posted_adjustment_id uuid unique references public.payroll_adjustments(id),
 run_type text not null check(run_type in ('NEXT_OPEN_PERIOD','OFF_CYCLE_CORRECTION')),
 maker_user_id uuid not null references auth.users(id),checker_user_id uuid not null references auth.users(id),
 created_at timestamptz not null,approved_at timestamptz not null,posted_at timestamptz not null default now(),
 check(num_nonnulls(original_earning_id,original_adjustment_id)<=1),
 check((run_type='NEXT_OPEN_PERIOD' and target_period_id is not null and posted_adjustment_id is not null)
 or (run_type='OFF_CYCLE_CORRECTION' and target_period_id is null and posted_adjustment_id is null))
);
create index payroll_corrections_original on public.payroll_corrections(original_payroll_id,original_earning_id,original_adjustment_id);
-- Each OFF_CYCLE_CORRECTION row is a finalized correction-only run; no cash payout.
create view public.payroll_off_cycle_correction_runs with(security_invoker=true) as
select id,original_payroll_id,currency,delta as correction_amount,reason,maker_user_id,checker_user_id,created_at,approved_at,posted_at,'FINALIZED'::text as status
from public.payroll_corrections where run_type='OFF_CYCLE_CORRECTION';

alter table public.financial_approval_requests enable row level security;
alter table public.financial_approval_events enable row level security;
alter table public.payroll_corrections enable row level security;
revoke all on public.financial_approval_requests,public.financial_approval_events,public.payroll_corrections from public,anon,authenticated;
grant select on public.financial_approval_requests,public.financial_approval_events,public.payroll_corrections,public.payroll_off_cycle_correction_runs to authenticated;
create policy financial_requests_read on public.financial_approval_requests for select to authenticated
using(public.finance_action_allowed(case when operation='PAYROLL_CORRECTION' then 'payroll.view' else 'finance.view' end,branch_id));
create policy financial_events_read on public.financial_approval_events for select to authenticated
using(exists(select 1 from public.financial_approval_requests r where r.id=request_id));
create policy payroll_corrections_read on public.payroll_corrections for select to authenticated
using(exists(select 1 from public.financial_approval_requests r where r.id=payroll_corrections.id));

create function finance_private.operation_permission(p_operation text,p_action text) returns text
language sql immutable set search_path=public,pg_temp as $$
 select case p_operation when 'REFUND' then 'finance.refund.' when 'VOID_PAYMENT' then 'finance.payment_void.'
 when 'VOID_REFUND' then 'finance.refund_void.' when 'ALLOCATE_REFUND' then 'finance.refund_allocation.'
 when 'PAYROLL_CORRECTION' then 'payroll.correction.' end || p_action
$$;
create function finance_private.guard_approval_history() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_table_name<>'financial_approval_requests' or tg_op='DELETE' then raise exception 'Financial approval history is immutable'; end if;
 if (to_jsonb(new)-array['status','approver_user_id','approved_at','posted_at','result_id']) is distinct from
 (to_jsonb(old)-array['status','approver_user_id','approved_at','posted_at','result_id'])
 or not ((old.status='PENDING_APPROVAL' and new.status in ('APPROVED','CANCELLED')) or (old.status='APPROVED' and new.status='POSTED'))
 then raise exception 'Financial approval history is immutable'; end if;
 return new;
end $$;
create trigger financial_request_history before update or delete on public.financial_approval_requests for each row execute function finance_private.guard_approval_history();
create trigger financial_event_history before update or delete on public.financial_approval_events for each row execute function finance_private.guard_approval_history();
create trigger payroll_correction_history before update or delete on public.payroll_corrections for each row execute function finance_private.guard_approval_history();

-- No direct editing/deletion of posted source financial history. Existing amount guards also remain.
create function finance_private.guard_financial_delete() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'Financial history cannot be deleted; use an approved reversal'; end $$;
create trigger payment_delete_history before delete on public.payments for each row execute function finance_private.guard_financial_delete();
create trigger refund_delete_history before delete on public.refunds for each row execute function finance_private.guard_financial_delete();

-- Validate both when requesting and under source locks when approving. No business writes.
create function finance_private.validate_request(p_operation text,p_target uuid,p_details jsonb,p_permission text)
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
     if exists(select 1 from public.teacher_payrolls t where t.period_id=destination.id and t.teacher_id=payroll.teacher_id and t.currency<>payroll.currency) then raise exception 'Correction currency must match destination payroll'; end if;
   elsif p_details->>'run_type' is distinct from 'OFF_CYCLE_CORRECTION' then raise exception 'Invalid correction run type'; end if;
   snapshot:=jsonb_build_object('payroll',to_jsonb(payroll),'source_period',to_jsonb(source_period),
     'earning_id',line_id,'adjustment_id',adjustment_id,'original_amount',original,'previous_delta',previous_delta,
     'corrected_amount',amount,'delta',amount-original-previous_delta,'target_period',case when destination.id is not null then to_jsonb(destination) else 'null'::jsonb end);
 end if;
 return jsonb_build_object('branch_id',b,'source',snapshot,'payment_id',original_payment);
end $$;

create function public.request_financial_action(p_operation text,p_target_id uuid,p_details jsonb,p_reason text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare validated jsonb;r public.financial_approval_requests; result uuid;
begin
 if not public.account_is_active() then raise exception 'Unauthorized'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 or p_idempotency_key is null then raise exception 'Reason and idempotency key required'; end if;
 -- Return a prior identical request before revalidating its now-posted source.
 select * into r from public.financial_approval_requests where maker_user_id=auth.uid() and idempotency_key=p_idempotency_key;
 if found then
   if not public.finance_action_allowed(finance_private.operation_permission(r.operation,'request'),r.branch_id) then raise exception 'Unauthorized'; end if;
   if r.operation is distinct from p_operation or r.target_id is distinct from p_target_id or r.details is distinct from p_details or r.reason is distinct from btrim(p_reason) then raise exception 'Idempotency key already used for different request'; end if;
   return r.id;
 end if;
 -- Serialize same maker/key; source is rechecked by the approver under source locks.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_idempotency_key::text,0));
 select id into result from public.financial_approval_requests where maker_user_id=auth.uid() and idempotency_key=p_idempotency_key;
 if found then return public.request_financial_action(p_operation,p_target_id,p_details,p_reason,p_idempotency_key); end if;
 validated:=finance_private.validate_request(p_operation,p_target_id,p_details,finance_private.operation_permission(p_operation,'request'));
 insert into public.financial_approval_requests(operation,target_id,branch_id,details,reason,source_snapshot,maker_user_id,idempotency_key)
 values(p_operation,p_target_id,(validated->>'branch_id')::uuid,p_details,btrim(p_reason),validated->'source',auth.uid(),p_idempotency_key)
 returning id into result;
 insert into public.financial_approval_events(request_id,event,performed_by,reason,before_snapshot,after_snapshot)
 values(result,'REQUESTED',auth.uid(),btrim(p_reason),'{}',jsonb_build_object('source',validated->'source','details',p_details));
 return result;
end $$;

create function public.approve_financial_action(p_request_id uuid,p_note text,p_override_type text default null,p_override_reason text default null)
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

create function public.cancel_financial_action(p_request_id uuid,p_reason text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.financial_approval_requests;
begin
 select * into r from public.financial_approval_requests q where q.id=p_request_id and
 ((q.maker_user_id=auth.uid() and public.finance_action_allowed(finance_private.operation_permission(q.operation,'request'),q.branch_id))
 or public.finance_action_allowed(finance_private.operation_permission(q.operation,'approve'),q.branch_id)) for update;
 if not found then raise exception 'Unauthorized'; end if;
 if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'Cancellation reason required'; end if;
 if r.status='CANCELLED' then return; end if;
 if r.status<>'PENDING_APPROVAL' then raise exception 'Only pending requests can be cancelled'; end if;
 update public.financial_approval_requests set status='CANCELLED' where id=r.id;
 insert into public.financial_approval_events(request_id,event,performed_by,reason,before_snapshot,after_snapshot)
 values(r.id,'CANCELLED',auth.uid(),btrim(p_reason),to_jsonb(r),jsonb_build_object('status','CANCELLED'));
end $$;
revoke all on all functions in schema finance_private from public,anon,authenticated,service_role;
revoke all on function public.request_financial_action(text,uuid,jsonb,text,uuid),public.approve_financial_action(uuid,text,text,text),public.cancel_financial_action(uuid,text) from public,anon,authenticated;
grant execute on function public.request_financial_action(text,uuid,jsonb,text,uuid),public.approve_financial_action(uuid,text,text,text),public.cancel_financial_action(uuid,text) to authenticated;
