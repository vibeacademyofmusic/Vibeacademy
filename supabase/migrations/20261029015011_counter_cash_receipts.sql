begin;

-- Cash is an authenticated, branch-scoped posting path, never a provider webhook.
-- A registration may be billed before a teaching shift is assigned.
alter table public.invoices add column registration_application_id uuid unique references public.registration_applications(id);
alter table public.invoices alter column enrollment_id_snapshot drop not null;
alter table public.invoices add constraint invoice_has_enrollment_or_registration
  check (enrollment_id_snapshot is not null or registration_application_id is not null);

create table public.counter_cash_receipts (
  request_id uuid primary key,
  application_id uuid references public.registration_applications(id),
  renewal_id uuid references public.tuition_renewal_cases(id),
  branch_id uuid not null references public.branches(id),
  actor_id uuid not null references auth.users(id),
  amount numeric(14,2) not null check (amount > 0 and amount = trunc(amount)),
  payment_id uuid not null unique references public.payments(id) deferrable initially deferred,
  invoice_id uuid not null references public.invoices(id) deferrable initially deferred,
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(application_id, renewal_id) = 1)
);
create index counter_cash_application on public.counter_cash_receipts(application_id);
create index counter_cash_renewal on public.counter_cash_receipts(renewal_id);
alter table public.counter_cash_receipts enable row level security;
revoke all on public.counter_cash_receipts from public, anon, authenticated;
grant select on public.counter_cash_receipts to authenticated;
create policy counter_cash_read on public.counter_cash_receipts for select to authenticated
  using (public.has_permission('finance.cash.record', branch_id));
create trigger counter_cash_immutable before update or delete on public.counter_cash_receipts
  for each row execute function public.guard_tuition_renewal_event();

-- Preserve legacy contracts, add cash evidence to the completion guard only.
create or replace function public.require_paid_registration_completion()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.curriculum_id is null and new.invoice_id is null
    and not exists(select 1 from public.registration_deposit_terms where application_id=new.id) then return new; end if;
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    if not (new.invoice_id is not null and public.registration_invoice_settled(new.invoice_id))
      and not exists (
        select 1 from public.registration_deposit_terms t where t.application_id=new.id
        and new.deposit_confirmed_at is not null and (
          coalesce((select sum(amount) from public.registration_momo_orders where application_id=new.id and state='PAID'),0)
          + coalesce((select sum(attributed_amount) from public.registration_payos_orders where application_id=new.id and state='PAID'),0)
          + coalesce((select sum(amount) from public.counter_cash_receipts where application_id=new.id),0)
        ) >= t.amount_due
      ) then raise exception 'REGISTRATION_PAYMENT_REQUIRED'; end if;
  end if;
  return new;
end $$;

-- Additional guard; existing provider guards remain in force.
create function public.guard_counter_cash_registration() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'registration_deposit_terms' then
    if exists(select 1 from public.counter_cash_receipts where application_id=old.application_id) then
      raise exception 'CASH_QUOTE_LOCKED'; end if;
  elsif tg_table_name = 'registration_applications' then
    if exists(select 1 from public.counter_cash_receipts where application_id=old.id)
      and (new.branch_id is distinct from old.branch_id or new.status in ('CANCELLED','REJECTED','EXPIRED')) then
      raise exception 'CASH_REFUND_REVIEW_REQUIRED'; end if;
  elsif new.registration_application_id is distinct from old.registration_application_id then
    raise exception 'Invoice registration link is immutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger counter_cash_quote_guard before update or delete on public.registration_deposit_terms
  for each row execute function public.guard_counter_cash_registration();
create trigger counter_cash_application_guard before update on public.registration_applications
  for each row execute function public.guard_counter_cash_registration();
create trigger counter_cash_invoice_guard before update on public.invoices
  for each row execute function public.guard_counter_cash_registration();
revoke all on function public.guard_counter_cash_registration() from public, anon, authenticated;

-- Permit a 50% plan to be paid off without rewriting its agreed payment option.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.tuition_renewal_cases'::regclass
    and contype='c' and pg_get_constraintdef(oid) like '%paid_amount%' loop
    execute format('alter table public.tuition_renewal_cases drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.tuition_renewal_cases add constraint renewal_cash_paid_bounds check (paid_amount >= 0 and paid_amount <= list_price);
alter table public.tuition_renewal_cases add constraint renewal_cash_deposit_state check (state <> 'DEPOSIT_PAID' or (paid_amount >= amount_due and paid_amount < list_price));
alter table public.tuition_renewal_cases add constraint renewal_cash_full_state check (state <> 'PAID' or paid_amount = list_price);

create function public.begin_tuition_cash_renewal(
  p_reminder uuid, p_plan_code text, p_payment_option text, p_starts_on date, p_due_on date, p_note text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb; branch uuid;
begin
  select t.branch_id_snapshot into branch from public.tuition_reminders r
    join public.enrollment_tuition t on t.id=r.enrollment_tuition_id where r.id=p_reminder;
  if auth.uid() is null or not coalesce(public.has_permission('finance.cash.record',branch),false) then
    raise exception 'CASH_UNAUTHORIZED'; end if;
  result := public.begin_tuition_renewal(p_reminder,p_plan_code,p_payment_option,p_starts_on,p_due_on,p_note,null);
  if result->>'result' = 'created' then
    -- This reservation was created inside THIS transaction and never sent to payOS.
    update public.tuition_payos_orders set state='CANCELLED'
      where case_id=(result->>'case_id')::uuid and state='RESERVED' and payment_link_id is null;
    insert into public.tuition_renewal_events(case_id,event_type,actor_id,metadata)
    values((result->>'case_id')::uuid,'CASH_COLLECTION_SELECTED',auth.uid(),'{"unused_reservation_released":true}');
  elsif exists(select 1 from public.tuition_payos_orders where case_id=(result->>'case_id')::uuid
    and state in ('RESERVED','PENDING','EXCEPTION')) then raise exception 'CASH_ONLINE_ORDER_OPEN';
  end if;
  return result;
end $$;
revoke all on function public.begin_tuition_cash_renewal(uuid,text,text,date,date,text) from public,anon;
grant execute on function public.begin_tuition_cash_renewal(uuid,text,text,date,date,text) to authenticated;

create function public.record_counter_cash(
  p_request uuid, p_kind text, p_source uuid, p_amount numeric, p_expected_paid numeric,
  p_cash_acknowledged boolean, p_due_on date default null, p_note text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_variable
declare
  app public.registration_applications%rowtype; terms public.registration_deposit_terms%rowtype;
  renewal public.tuition_renewal_cases%rowtype; inv public.invoices%rowtype;
  receipt public.counter_cash_receipts%rowtype; branch public.branches%rowtype;
  body jsonb; paid numeric; balance numeric; total numeric; threshold numeric;
  student uuid; invoice_id uuid; payment_id uuid := gen_random_uuid(); period_id uuid;
  provider record; today date := public.registration_vietnam_today(); result_state text;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'CASH_UNAUTHORIZED'; end if;
  if p_request is null or p_source is null or p_kind not in ('REGISTRATION','RENEWAL')
    or p_kind is null or p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount)
    or p_expected_paid is null or p_expected_paid < 0 or char_length(coalesce(p_note,'')) > 500 then
    raise exception 'CASH_INVALID'; end if;
  if p_cash_acknowledged is not true then raise exception 'CASH_ACK_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('counter-cash:'||p_request::text,0));
  if p_kind='REGISTRATION' then
    select * into app from public.registration_applications where id=p_source for update;
    if not found then raise exception 'CASH_SOURCE_NOT_FOUND'; end if;
    if not coalesce(public.registration_can('registration.complete',app.branch_id),false) then raise exception 'CASH_UNAUTHORIZED'; end if;
    select * into branch from public.branches where id=app.branch_id;
  else
    select * into renewal from public.tuition_renewal_cases where id=p_source for update;
    if not found then raise exception 'CASH_SOURCE_NOT_FOUND'; end if;
    if not coalesce(public.tuition_renewal_authorized(renewal.branch_id),false) then raise exception 'CASH_UNAUTHORIZED'; end if;
    select * into branch from public.branches where id=renewal.branch_id;
  end if;
  if not coalesce(public.has_permission('finance.cash.record',branch.id),false) then raise exception 'CASH_UNAUTHORIZED'; end if;
  body := jsonb_build_object('kind',p_kind,'source',p_source,'amount',p_amount,'expected_paid',p_expected_paid,
    'due_on',p_due_on,'note',nullif(btrim(coalesce(p_note,'')),''));
  select * into receipt from public.counter_cash_receipts where request_id=p_request;
  if found then
    if receipt.actor_id is distinct from auth.uid() or receipt.payload is distinct from body then raise exception 'CASH_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('result','duplicate','payment_id',receipt.payment_id,'invoice_id',receipt.invoice_id);
  end if;
  if p_kind='REGISTRATION' then
    if app.status not in ('VERIFIED','PAYMENT_PENDING','PAID','COMPLETED') then raise exception 'CASH_SOURCE_STATE'; end if;
    if exists(select 1 from public.registration_payos_orders where application_id=app.id and state in ('RESERVED','PENDING','EXCEPTION'))
      or exists(select 1 from public.registration_momo_orders where application_id=app.id and state in ('RESERVED','READY')) then
      raise exception 'CASH_ONLINE_ORDER_OPEN'; end if;
    select * into terms from public.registration_deposit_terms where application_id=app.id for update;
    if not found then raise exception 'REGISTRATION_QUOTE_REQUIRED'; end if;
    total := terms.tuition_amount; threshold := terms.amount_due;
    if app.invoice_id is not null then
      select * into inv from public.invoices where id=app.invoice_id for update;
      if inv.registration_application_id is distinct from app.id then raise exception 'CASH_INVOICE_REVIEW'; end if;
    end if;
    if inv.id is null then
      paid := public.registration_payos_paid_total(app.id)
        + coalesce((select sum(amount) from public.registration_momo_orders where application_id=app.id and state='PAID'),0);
      if p_due_on is null or p_due_on < today then raise exception 'CASH_DUE_REQUIRED'; end if;
    end if;
    student := app.linked_student_id;
  else
    if renewal.state='ERROR' then raise exception 'CASH_SOURCE_STATE'; end if;
    if exists(select 1 from public.tuition_payos_orders where case_id=renewal.id and state in ('RESERVED','PENDING','EXCEPTION')) then
      raise exception 'CASH_ONLINE_ORDER_OPEN'; end if;
    select * into inv from public.invoices where id=renewal.invoice_id for update;
    if not found then raise exception 'CASH_INVOICE_REVIEW'; end if;
    total := renewal.list_price; threshold := renewal.amount_due; student := renewal.student_id;
  end if;
  if inv.id is not null then
    if inv.status <> 'ISSUED' or inv.currency <> 'VND' or inv.total_amount <> total
      or inv.branch_id_snapshot <> branch.id or inv.student_id_snapshot is distinct from student then raise exception 'CASH_INVOICE_REVIEW'; end if;
    select b.outstanding_balance into balance from public.invoice_receivables b where b.invoice_id=inv.id;
    if balance is null then raise exception 'CASH_INVOICE_REVIEW'; end if;
    paid := total - balance;
  end if;
  if paid is distinct from p_expected_paid then raise exception 'CASH_STALE_BALANCE'; end if;
  if p_amount > total-paid then raise exception 'CASH_EXCEEDS_BALANCE'; end if;
  if paid+p_amount < threshold then raise exception 'CASH_BELOW_THRESHOLD'; end if;
  invoice_id := coalesce(inv.id,gen_random_uuid());
  -- Deferred FKs permit completion validation before student/receipt creation;
  -- no committed cash evidence can exist without its posted payment and invoice.
  insert into public.counter_cash_receipts(request_id,application_id,renewal_id,branch_id,actor_id,amount,payment_id,invoice_id,payload)
  values(p_request,case when p_kind='REGISTRATION' then app.id end,case when p_kind='RENEWAL' then renewal.id end,
    branch.id,auth.uid(),p_amount,payment_id,invoice_id,body);
  if p_kind='REGISTRATION' then
    if app.status <> 'COMPLETED' then
      perform pg_advisory_xact_lock(hashtextextended(lower(btrim(app.student_name))||':'||app.student_date_of_birth::text,0));
      perform set_config('registration.write','on',true);
      update public.registration_applications set deposit_confirmed_at=coalesce(deposit_confirmed_at,clock_timestamp()) where id=app.id;
      perform public.complete_registration_application(gen_random_uuid(),app.id,app.version,null,null);
      select * into app from public.registration_applications where id=app.id;
      student := app.linked_student_id;
    end if;
    if inv.id is null then
      insert into public.invoices(id,invoice_number,registration_application_id,student_id_snapshot,
        branch_id_snapshot,branch_code_snapshot,branch_name_snapshot,currency,subtotal,total_amount,status,notes)
      values(invoice_id,'INV-'||to_char(today,'YYYY')||'-'||lpad(nextval('public.invoice_number_seq')::text,6,'0'),app.id,student,
        branch.id,branch.code,branch.name,'VND',total,total,'DRAFT','Học phí đăng ký '||app.application_code);
      insert into public.invoice_items(invoice_id,line_no,item_type,description,quantity,unit_amount,line_total)
      select invoice_id,1,'TUITION',name,1,total,total from public.tuition_plans where id=terms.tuition_plan_id;
      update public.invoices set status='ISSUED',issued_on=today,due_on=p_due_on where id=invoice_id;
      perform set_config('registration.write','on',true);
      update public.registration_applications set invoice_id=invoice_id where id=app.id;
      perform set_config('registration.write','off',true);
      -- Existing verified provider receipts belong to the SAME bill, never re-enter them as cash.
      for provider in select * from public.registration_payos_orders where application_id=app.id and state='PAID' and finance_payment_id is null for update loop
        insert into public.payments(payment_number,student_id_snapshot,branch_id_snapshot,branch_code_snapshot,branch_name_snapshot,
          amount,currency,payment_method,paid_at,reference,notes,status)
        values('PAY-'||to_char(today,'YYYY')||'-'||lpad(nextval('public.payment_number_seq')::text,6,'0'),student,branch.id,branch.code,branch.name,
          provider.attributed_amount,'VND','BANK_TRANSFER',provider.paid_at,'PAYOS:'||provider.provider_reference,'Học phí đăng ký '||app.application_code,'POSTED') returning id into period_id;
        update public.registration_payos_orders set finance_payment_id=period_id where id=provider.id;
      end loop;
      for provider in
        select finance_payment_id as id,amount from public.registration_momo_orders where application_id=app.id and state='PAID'
        union all select finance_payment_id,attributed_amount from public.registration_payos_orders where application_id=app.id and state='PAID'
      loop
        if provider.id is null or exists(select 1 from public.payment_allocations a where a.payment_id=provider.id) then raise exception 'CASH_INVOICE_REVIEW'; end if;
        insert into public.payment_allocations(payment_id,invoice_id,amount) values(provider.id,invoice_id,provider.amount);
      end loop;
    end if;
  elsif renewal.renewal_tuition_id is null then
    insert into public.enrollment_tuition(enrollment_id,tuition_plan_id,starts_on,status,discount_type,discount_value,notes)
    select enrollment_id,renewal.tuition_plan_id,renewal.starts_on,'SCHEDULED','NONE',0,renewal.note
      from public.enrollment_tuition where id=renewal.source_tuition_id returning id into period_id;
    if (select amount from public.enrollment_tuition where id=period_id) is distinct from total then raise exception 'TUITION_PRICE_REJECTED'; end if;
    update public.invoices set enrollment_tuition_id=period_id where id=invoice_id and enrollment_tuition_id is null;
    if not found then raise exception 'TUITION_INVOICE_LINK_FAILED'; end if;
    update public.tuition_renewal_cases set renewal_tuition_id=period_id where id=renewal.id;
  end if;
  -- One transaction: receipt, allocation and source status either all persist or all roll back.
  insert into public.payments(id,payment_number,student_id_snapshot,branch_id_snapshot,branch_code_snapshot,branch_name_snapshot,
    amount,currency,payment_method,paid_at,reference,notes,status,created_by)
  values(payment_id,'PAY-'||to_char(today,'YYYY')||'-'||lpad(nextval('public.payment_number_seq')::text,6,'0'),student,branch.id,branch.code,branch.name,
    p_amount,'VND','CASH',clock_timestamp(),'CASH:'||p_request::text,nullif(btrim(coalesce(p_note,'')),''),'POSTED',auth.uid());
  insert into public.payment_allocations(payment_id,invoice_id,amount) values(payment_id,invoice_id,p_amount);
  result_state := case when paid+p_amount=total then 'PAID' else 'DEPOSIT_PAID' end;
  if p_kind='RENEWAL' then
    update public.tuition_renewal_cases set paid_amount=paid+p_amount,state=result_state,
      confirmation_status='AWAITING_TEMPLATE',last_event='CASH_RECORDED',updated_at=clock_timestamp() where id=renewal.id;
    if result_state='PAID' and renewal.starts_on <= today then
      update public.enrollment_tuition set status='ACTIVE' where id=coalesce(renewal.renewal_tuition_id,period_id) and status='SCHEDULED';
    end if;
    insert into public.tuition_renewal_events(case_id,event_type,actor_id,metadata)
      values(renewal.id,'CASH_RECORDED',auth.uid(),jsonb_build_object('payment_id',payment_id,'amount',p_amount,'paid_total',paid+p_amount));
  end if;
  return jsonb_build_object('result','posted','payment_id',payment_id,'invoice_id',invoice_id,'state',result_state,'paid_amount',paid+p_amount,'remaining',total-paid-p_amount);
end $$;
revoke all on function public.record_counter_cash(uuid,text,uuid,numeric,numeric,boolean,date,text) from public,anon;
grant execute on function public.record_counter_cash(uuid,text,uuid,numeric,numeric,boolean,date,text) to authenticated;

-- Reuse the counter bill when the first tuition period is opened.
alter function public.create_tuition_invoice(uuid,text) rename to create_tuition_invoice_before_counter_cash;
revoke all on function public.create_tuition_invoice_before_counter_cash(uuid,text) from public,anon,authenticated,service_role;
create function public.create_tuition_invoice(p_enrollment_tuition_id uuid,p_notes text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.enrollment_tuition%rowtype; inv public.invoices%rowtype; candidate public.invoices%rowtype; matches integer := 0;
begin
  -- Equivalent to production operational_admin(), which is absent from a
  -- clean historical replay. Preserve its existing global operations scope.
  if not (coalesce(public.has_role('SUPER_ADMIN'),false) or (
    coalesce(public.account_is_active(),false) and exists (
      select 1 from public.user_roles a join public.roles r on r.id=a.role_id
      where a.user_id=auth.uid() and r.code='OPERATIONS_LEAD' and a.branch_id is null and a.is_active
        and (a.valid_from is null or a.valid_from <= now()) and (a.valid_until is null or a.valid_until > now())
    )
  )) then raise exception 'SUPER_ADMIN role required'; end if;
  select * into t from public.enrollment_tuition where id=p_enrollment_tuition_id for update;
  if not found then return public.create_tuition_invoice_before_counter_cash(p_enrollment_tuition_id,p_notes); end if;
  if t.status='CANCELLED' then raise exception 'Cannot create an invoice from a cancelled tuition term'; end if;
  for candidate in select i.* from public.invoices i
    join public.student_placement_cases pc on pc.registration_application_id=i.registration_application_id
    join public.enrollments e on e.id=t.enrollment_id and e.student_id=i.student_id_snapshot
    where pc.student_id=e.student_id and pc.enrollment_id=e.id
      and (i.enrollment_id_snapshot is null or i.enrollment_tuition_id=t.id)
    order by i.id for update of i loop
    inv := candidate; matches := matches+1;
  end loop;
  if matches > 1 then raise exception 'CASH_INVOICE_REVIEW'; end if;
  if matches = 1 then
    if inv.status <> 'ISSUED' or inv.currency <> t.currency or inv.total_amount <> t.amount
      or inv.branch_id_snapshot <> t.branch_id_snapshot
      or not exists(select 1 from public.registration_deposit_terms q
        where q.application_id=inv.registration_application_id and q.tuition_plan_id=t.tuition_plan_id) then
      raise exception 'CASH_INVOICE_REVIEW'; end if;
    update public.invoices set enrollment_tuition_id=t.id,enrollment_id_snapshot=t.enrollment_id where id=inv.id;
    return inv.id;
  end if;
  return public.create_tuition_invoice_before_counter_cash(p_enrollment_tuition_id,p_notes);
end $$;
revoke all on function public.create_tuition_invoice(uuid,text) from public,anon;
grant execute on function public.create_tuition_invoice(uuid,text) to authenticated;

-- Bank transfers arriving after QR cancellation stay visible for reconciliation.
alter function public.record_verified_tuition_payos_webhook(bigint,text,text,bigint,text)
  rename to record_tuition_payos_before_counter_cash;
revoke all on function public.record_tuition_payos_before_counter_cash(bigint,text,text,bigint,text) from public,anon,authenticated,service_role;
create function public.record_verified_tuition_payos_webhook(p_order_code bigint,p_payment_link_id text,p_reference text,p_amount bigint,p_currency text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.tuition_payos_orders%rowtype;
begin
  if not coalesce(public.momo_service_request(),false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  select * into ord from public.tuition_payos_orders where order_code=p_order_code;
  if ord.id is not null then
    perform 1 from public.tuition_renewal_cases where id=ord.case_id for update;
    select * into ord from public.tuition_payos_orders where order_code=p_order_code for update;
    if ord.state in ('CANCELLED','EXPIRED','EXCEPTION') and ord.payment_link_id is not null then
      if p_payment_link_id is distinct from ord.payment_link_id or p_currency is distinct from 'VND'
        or p_amount is distinct from ord.amount or nullif(btrim(p_reference),'') is null then
        raise exception 'PAYOS_PAYLOAD_INVALID'; end if;
      insert into public.tuition_payos_webhook_events(order_code,provider_reference,amount,outcome,processed_at)
        values(p_order_code,p_reference,p_amount,'LATE_PAYMENT_REVIEW',clock_timestamp()) on conflict(order_code,provider_reference) do nothing;
      update public.tuition_payos_orders set state='EXCEPTION' where id=ord.id;
      return 'LATE_PAYMENT_REVIEW';
    end if;
  end if;
  return public.record_tuition_payos_before_counter_cash(p_order_code,p_payment_link_id,p_reference,p_amount,p_currency);
end $$;
revoke all on function public.record_verified_tuition_payos_webhook(bigint,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.record_verified_tuition_payos_webhook(bigint,text,text,bigint,text) to service_role;

create function public.counter_cash_summary(p_kind text,p_source uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare branch uuid; invoice uuid; paid numeric; receipts jsonb;
begin
  if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'CASH_UNAUTHORIZED'; end if;
  if p_kind='REGISTRATION' then
    select branch_id,invoice_id into branch,invoice from public.registration_applications where id=p_source;
    if branch is null or not coalesce(public.registration_can('registration.view',branch),false) then raise exception 'CASH_UNAUTHORIZED'; end if;
  elsif p_kind='RENEWAL' then
    select branch_id,invoice_id into branch,invoice from public.tuition_renewal_cases where id=p_source;
    if branch is null or not coalesce(public.tuition_renewal_authorized(branch),false) then raise exception 'CASH_UNAUTHORIZED'; end if;
  else raise exception 'CASH_INVALID'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('payment_id',r.payment_id,'amount',r.amount,'status',p.status,'paid_at',p.paid_at) order by r.created_at),'[]')
    into receipts from public.counter_cash_receipts r join public.payments p on p.id=r.payment_id
    where (p_kind='REGISTRATION' and r.application_id=p_source) or (p_kind='RENEWAL' and r.renewal_id=p_source);
  if invoice is not null then
    select total_amount-outstanding_balance into paid from public.invoice_receivables where invoice_id=invoice;
  end if;
  return jsonb_build_object('paid_amount',paid,'receipts',receipts);
end $$;
revoke all on function public.counter_cash_summary(text,uuid) from public,anon;
grant execute on function public.counter_cash_summary(text,uuid) to authenticated;

commit;
