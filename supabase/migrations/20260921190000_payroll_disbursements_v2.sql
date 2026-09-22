begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into public.permissions(code,name,module)
values('payroll.disburse','Record and cancel payroll disbursements','payroll')
on conflict(code) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='FINANCE' and p.code='payroll.disburse'
on conflict do nothing;

create table public.payroll_disbursements (
  id uuid primary key default gen_random_uuid(),
  payroll_id uuid not null references public.teacher_payrolls(id) on delete restrict,
  period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  amount numeric(16,2) not null check(amount>0 and amount<>'NaN'::numeric),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  paid_on date not null,
  payment_method text not null check(payment_method in('BANK_TRANSFER','CASH','OTHER')),
  reference text check(reference is null or char_length(reference) between 1 and 200),
  note text check(note is null or char_length(note) between 1 and 2000),
  status text not null default 'ACTIVE' check(status in('ACTIVE','CANCELLED')),
  request_key uuid not null,
  request_payload jsonb not null,
  request_result jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancelled_at timestamptz,
  cancel_reason text,
  cancel_request_key uuid,
  cancel_request_payload jsonb,
  cancel_request_result jsonb,
  constraint payroll_disbursement_vnd_whole check(currency<>'VND' or amount=trunc(amount)),
  constraint payroll_disbursement_currency_scale check(amount=round(amount,2)),
  constraint payroll_disbursement_cancel_shape check(
    (status='ACTIVE' and cancelled_by is null and cancelled_at is null and cancel_reason is null and cancel_request_key is null and cancel_request_payload is null and cancel_request_result is null)
    or
    (status='CANCELLED' and cancelled_by is not null and cancelled_at is not null and char_length(cancel_reason) between 1 and 2000 and cancel_request_key is not null and cancel_request_payload is not null and cancel_request_result is not null)
  ),
  unique(created_by,request_key)
);

create index payroll_disbursement_payroll_history
on public.payroll_disbursements(payroll_id,created_at,id);
create index payroll_disbursement_active_total
on public.payroll_disbursements(payroll_id)
where status='ACTIVE';
create unique index payroll_disbursement_cancel_request
on public.payroll_disbursements(cancelled_by,cancel_request_key)
where cancel_request_key is not null;

alter table public.payroll_disbursements enable row level security;
revoke all on public.payroll_disbursements from public,anon,authenticated;
grant select on public.payroll_disbursements to authenticated;

create policy payroll_disbursement_read
on public.payroll_disbursements for select to authenticated
using(
  public.is_global_super_admin()
  or public.has_role_permission('FINANCE','payroll.view',branch_id)
  or exists(
    select 1 from public.teacher_payrolls pay
    join public.payroll_periods period on period.id=pay.period_id
    where pay.id=payroll_id
      and period.status in('APPROVED','FINALIZED')
      and (
        coalesce(public.can_read_employee_payroll(pay.employee_id,pay.branch_id),false)
        or coalesce(public.can_read_own_payroll(pay.teacher_id,pay.branch_id),false)
      )
  )
);

create schema if not exists payroll_disbursement_private;
revoke all on schema payroll_disbursement_private from public,anon,authenticated;

create function payroll_disbursement_private.payable_amount(pay public.teacher_payrolls)
returns numeric language sql immutable
set search_path=public,pg_temp
as $$
  select case when coalesce(pay.calculation_version like 'PAYROLL_V2%',false)
    then pay.v2_net_amount else pay.gross_amount end
$$;

create function public.list_payroll_disbursements_v2(
  p_period uuid default null,
  p_branch uuid default null,
  p_payment_status text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer
set search_path=public,pg_temp
as $fn$
declare result jsonb;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'PAYROLL_DISBURSEMENT_UNAUTHORIZED'; end if;
  if p_payment_status is not null and p_payment_status not in('NOT_PAID','PARTIALLY_PAID','PAID') then raise exception 'PAYROLL_DISBURSEMENT_INVALID_STATUS'; end if;
  if p_limit not between 1 and 100 or p_offset not between 0 and 10000 then raise exception 'PAYROLL_DISBURSEMENT_INVALID_PAGE'; end if;
  if p_search is not null and char_length(btrim(p_search))>100 then raise exception 'PAYROLL_DISBURSEMENT_INVALID_SEARCH'; end if;

  with visible as (
    select pay.id,pay.period_id,pay.employee_id,pay.teacher_id,pay.branch_id,pay.teacher_name,
      coalesce(emp.employee_code,teacher.teacher_code,'—') employee_code,
      pay.currency,period.starts_on,period.ends_on,period.status period_status,branch.name branch_name,
      payroll_disbursement_private.payable_amount(pay) payable_amount,
      coalesce(disb.paid_amount,0::numeric) paid_amount
    from public.teacher_payrolls pay
    join public.payroll_periods period on period.id=pay.period_id
    join public.branches branch on branch.id=pay.branch_id
    left join public.employees emp on emp.id=pay.employee_id
    left join public.teachers teacher on teacher.id=pay.teacher_id
    left join lateral(
      select sum(d.amount) paid_amount from public.payroll_disbursements d
      where d.payroll_id=pay.id and d.status='ACTIVE'
    ) disb on true
    where period.status in('APPROVED','FINALIZED')
      and (p_period is null or pay.period_id=p_period)
      and (p_branch is null or pay.branch_id=p_branch)
      and (p_search is null or btrim(p_search)='' or pay.teacher_name ilike '%'||btrim(p_search)||'%'
        or coalesce(emp.employee_code,teacher.teacher_code,'') ilike '%'||btrim(p_search)||'%')
      and (
        public.is_global_super_admin()
        or public.has_role_permission('FINANCE','payroll.view',pay.branch_id)
        or coalesce(public.can_read_employee_payroll(pay.employee_id,pay.branch_id),false)
        or coalesce(public.can_read_own_payroll(pay.teacher_id,pay.branch_id),false)
      )
  ), classified as (
    select visible.*,(payable_amount-paid_amount) remaining_amount,
      case when paid_amount=0 then 'NOT_PAID'
        when paid_amount<payable_amount then 'PARTIALLY_PAID' else 'PAID' end payment_status
    from visible
  ), filtered as (
    select * from classified where p_payment_status is null or payment_status=p_payment_status
  ), page_rows as (
    select * from filtered order by starts_on desc,teacher_name,id limit p_limit+1 offset p_offset
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(q) order by q.starts_on desc,q.teacher_name,q.id)
      from (select * from page_rows order by starts_on desc,teacher_name,id limit p_limit) q),'[]'::jsonb),
    'has_more',(select count(*)>p_limit from page_rows),
    'limit',p_limit,'offset',p_offset
  ) into result;
  return result;
end;
$fn$;

create function public.get_payroll_disbursement_detail(p_payroll uuid)
returns jsonb
language plpgsql stable security definer
set search_path=public,pg_temp
as $fn$
declare
  slip jsonb; pay public.teacher_payrolls; period public.payroll_periods; payable numeric; paid numeric; remaining numeric;
  payment_state text; history jsonb; can_manage boolean; summary jsonb; legacy_earnings numeric; legacy_deductions numeric;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'PAYROLL_DISBURSEMENT_UNAUTHORIZED'; end if;
  slip:=public.payroll_payslip(p_payroll);
  if slip is null then return null; end if;
  select * into pay from public.teacher_payrolls where id=p_payroll;
  select * into period from public.payroll_periods where id=pay.period_id;
  payable:=payroll_disbursement_private.payable_amount(pay);
  select coalesce(sum(amount),0) into paid from public.payroll_disbursements where payroll_id=pay.id and status='ACTIVE';
  remaining:=payable-paid;
  payment_state:=case when paid=0 then 'NOT_PAID' when paid<payable then 'PARTIALLY_PAID' else 'PAID' end;
  can_manage:=public.is_global_super_admin() or public.has_role_permission('FINANCE','payroll.disburse',pay.branch_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'amount',d.amount,'currency',d.currency,'paid_on',d.paid_on,'payment_method',d.payment_method,
    'reference',d.reference,'note',d.note,'status',d.status,'created_by',d.created_by,
    'created_by_name',coalesce(creator.full_name,d.created_by::text),'created_at',d.created_at,
    'cancelled_by',d.cancelled_by,'cancelled_by_name',case when d.cancelled_by is null then null else coalesce(canceller.full_name,d.cancelled_by::text) end,
    'cancelled_at',d.cancelled_at,'cancel_reason',d.cancel_reason
  ) order by d.created_at,d.id),'[]'::jsonb) into history
  from public.payroll_disbursements d
  left join public.profiles creator on creator.id=d.created_by
  left join public.profiles canceller on canceller.id=d.cancelled_by
  where d.payroll_id=pay.id;

  if coalesce(pay.calculation_version like 'PAYROLL_V2%',false) then
    summary:=jsonb_build_object('earnings',pay.v2_earnings_amount,'reimbursements',pay.v2_reimbursement_amount,
      'deductions',pay.v2_deduction_amount,'adjustment',pay.adjustment_amount,'net',pay.v2_net_amount);
  else
    select sum(amount) into legacy_earnings from public.payroll_earning_lines where payroll_id=pay.id;
    select sum(abs(amount)) into legacy_deductions from public.payroll_adjustments where payroll_id=pay.id and amount<0;
    summary:=jsonb_build_object('earnings',legacy_earnings,'reimbursements',null,'deductions',legacy_deductions,
      'adjustment',pay.adjustment_amount,'net',pay.gross_amount);
  end if;

  return slip||jsonb_build_object(
    'branch',jsonb_build_object('id',pay.branch_id,'name',(select name from public.branches where id=pay.branch_id)),
    'payable_amount',payable,'paid_amount',paid,'remaining_amount',remaining,'payment_status',payment_state,
    'can_record',period.status='FINALIZED' and remaining>0 and can_manage,
    'can_cancel',can_manage,'payment_history',history,'financial_summary',summary
  );
end;
$fn$;

create function public.record_payroll_disbursement(
  p_payroll uuid,p_amount numeric,p_currency text,p_paid_on date,p_payment_method text,
  p_reference text,p_note text,p_key uuid
) returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $fn$
declare
  pay public.teacher_payrolls; period public.payroll_periods; locked record; employee uuid; payable numeric; paid numeric; remaining numeric;
  payload jsonb; prior public.payroll_disbursements; payment_id uuid:=gen_random_uuid(); result jsonb;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'PAYROLL_DISBURSEMENT_UNAUTHORIZED'; end if;
  if p_key is null then raise exception 'PAYROLL_DISBURSEMENT_REQUEST_KEY_REQUIRED'; end if;
  if p_reference is not null and (char_length(btrim(p_reference))<1 or char_length(btrim(p_reference))>200) then raise exception 'PAYROLL_DISBURSEMENT_INVALID_REFERENCE'; end if;
  if p_note is not null and (char_length(btrim(p_note))<1 or char_length(btrim(p_note))>2000) then raise exception 'PAYROLL_DISBURSEMENT_INVALID_NOTE'; end if;
  payload:=jsonb_build_object('operation','RECORD','payroll_id',p_payroll,'amount',p_amount,'currency',p_currency,
    'paid_on',p_paid_on,'payment_method',p_payment_method,'reference',nullif(btrim(p_reference),''),'note',nullif(btrim(p_note),''));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_key::text,0));
  select * into prior from public.payroll_disbursements where created_by=auth.uid() and request_key=p_key;
  if found then
    if prior.request_payload<>payload then raise exception 'PAYROLL_DISBURSEMENT_REQUEST_KEY_REUSED'; end if;
    return prior.request_result;
  end if;

  select payrow pay,periodrow period into locked
  from public.teacher_payrolls payrow join public.payroll_periods periodrow on periodrow.id=payrow.period_id
  where payrow.id=p_payroll for update of payrow,periodrow;
  if not found then raise exception 'PAYROLL_DISBURSEMENT_PAYROLL_NOT_FOUND'; end if;
  pay:=locked.pay; period:=locked.period;
  if period.status<>'FINALIZED' then raise exception 'PAYROLL_DISBURSEMENT_FINALIZED_REQUIRED'; end if;
  if not (public.is_global_super_admin() or public.has_role_permission('FINANCE','payroll.disburse',pay.branch_id)) then raise exception 'PAYROLL_DISBURSEMENT_UNAUTHORIZED'; end if;
  if p_amount is null or p_amount<='0'::numeric or p_amount='NaN'::numeric or p_amount<>round(p_amount,2) then raise exception 'PAYROLL_DISBURSEMENT_INVALID_AMOUNT'; end if;
  if p_currency is null or p_currency<>pay.currency then raise exception 'PAYROLL_DISBURSEMENT_CURRENCY_MISMATCH'; end if;
  if p_currency='VND' and p_amount<>trunc(p_amount) then raise exception 'PAYROLL_DISBURSEMENT_VND_WHOLE_REQUIRED'; end if;
  if p_payment_method is null or p_payment_method not in('BANK_TRANSFER','CASH','OTHER') then raise exception 'PAYROLL_DISBURSEMENT_INVALID_METHOD'; end if;
  if p_paid_on is null or not isfinite(p_paid_on) or p_paid_on>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'PAYROLL_DISBURSEMENT_INVALID_DATE'; end if;
  employee:=pay.employee_id;
  if employee is null then select id into employee from public.employees where teacher_id=pay.teacher_id order by hire_date,id limit 1; end if;
  if employee is null then raise exception 'PAYROLL_DISBURSEMENT_EMPLOYEE_REQUIRED'; end if;
  payable:=payroll_disbursement_private.payable_amount(pay);
  if payable<=0 then raise exception 'PAYROLL_DISBURSEMENT_POSITIVE_PAYABLE_REQUIRED'; end if;
  select coalesce(sum(amount),0) into paid from public.payroll_disbursements where payroll_id=pay.id and status='ACTIVE';
  remaining:=payable-paid;
  if p_amount>remaining then raise exception 'PAYROLL_DISBURSEMENT_EXCEEDS_REMAINING'; end if;
  paid:=paid+p_amount; remaining:=payable-paid;
  result:=jsonb_build_object('payroll_id',pay.id,'payment_id',payment_id,'amount',p_amount,'paid_amount',paid,
    'remaining_amount',remaining,'payment_status',case when remaining=0 then 'PAID' else 'PARTIALLY_PAID' end);
  insert into public.payroll_disbursements(id,payroll_id,period_id,employee_id,branch_id,amount,currency,paid_on,payment_method,
    reference,note,request_key,request_payload,request_result,created_by)
  values(payment_id,pay.id,pay.period_id,employee,pay.branch_id,p_amount,p_currency,p_paid_on,p_payment_method,
    nullif(btrim(p_reference),''),nullif(btrim(p_note),''),p_key,payload,result,auth.uid());
  return result;
end;
$fn$;

create function public.cancel_payroll_disbursement(
  p_payment uuid,p_reason text,p_key uuid
) returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $fn$
declare
  target public.payroll_disbursements; pay public.teacher_payrolls; period public.payroll_periods; locked record;
  payroll_uuid uuid; payable numeric; paid numeric; remaining numeric; payload jsonb; prior public.payroll_disbursements; result jsonb;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'PAYROLL_DISBURSEMENT_UNAUTHORIZED'; end if;
  if p_key is null then raise exception 'PAYROLL_DISBURSEMENT_REQUEST_KEY_REQUIRED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'PAYROLL_DISBURSEMENT_CANCEL_REASON_REQUIRED'; end if;
  payload:=jsonb_build_object('operation','CANCEL','payment_id',p_payment,'reason',btrim(p_reason));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_key::text,0));
  select * into prior from public.payroll_disbursements where cancelled_by=auth.uid() and cancel_request_key=p_key;
  if found then
    if prior.cancel_request_payload<>payload then raise exception 'PAYROLL_DISBURSEMENT_REQUEST_KEY_REUSED'; end if;
    return prior.cancel_request_result;
  end if;
  select payroll_id into payroll_uuid from public.payroll_disbursements where id=p_payment;
  if payroll_uuid is null then raise exception 'PAYROLL_DISBURSEMENT_PAYMENT_NOT_FOUND'; end if;
  select payrow pay,periodrow period into locked
  from public.teacher_payrolls payrow join public.payroll_periods periodrow on periodrow.id=payrow.period_id
  where payrow.id=payroll_uuid for update of payrow,periodrow;
  pay:=locked.pay; period:=locked.period;
  select * into target from public.payroll_disbursements where id=p_payment for update;
  if target.status<>'ACTIVE' then raise exception 'PAYROLL_DISBURSEMENT_ALREADY_CANCELLED'; end if;
  if not (public.is_global_super_admin() or public.has_role_permission('FINANCE','payroll.disburse',target.branch_id)) then raise exception 'PAYROLL_DISBURSEMENT_UNAUTHORIZED'; end if;
  payable:=payroll_disbursement_private.payable_amount(pay);
  select coalesce(sum(amount),0) into paid from public.payroll_disbursements where payroll_id=pay.id and status='ACTIVE' and id<>target.id;
  remaining:=payable-paid;
  result:=jsonb_build_object('payroll_id',pay.id,'payment_id',target.id,'cancelled_amount',target.amount,
    'paid_amount',paid,'remaining_amount',remaining,'payment_status',case when paid=0 then 'NOT_PAID' when paid<payable then 'PARTIALLY_PAID' else 'PAID' end);
  update public.payroll_disbursements set status='CANCELLED',cancelled_by=auth.uid(),cancelled_at=clock_timestamp(),
    cancel_reason=btrim(p_reason),cancel_request_key=p_key,cancel_request_payload=payload,cancel_request_result=result
  where id=target.id;
  return result;
end;
$fn$;

revoke all on function public.list_payroll_disbursements_v2(uuid,uuid,text,text,integer,integer),
  public.get_payroll_disbursement_detail(uuid),
  public.record_payroll_disbursement(uuid,numeric,text,date,text,text,text,uuid),
  public.cancel_payroll_disbursement(uuid,text,uuid)
from public,anon,service_role;
grant execute on function public.list_payroll_disbursements_v2(uuid,uuid,text,text,integer,integer),
  public.get_payroll_disbursement_detail(uuid),
  public.record_payroll_disbursement(uuid,numeric,text,date,text,text,text,uuid),
  public.cancel_payroll_disbursement(uuid,text,uuid)
to authenticated;

notify pgrst,'reload schema';
commit;
