-- Staff tuition renewal from a reminder. Customer Zalo replies stay informational.
-- Invoice, payment allocation, and payOS signature verification stay on the existing engines.
-- A checkout is not a payment. The verified payOS webhook is the only posting path.

create table public.tuition_renewal_cases (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null unique references public.tuition_reminders(id),
  source_tuition_id uuid not null references public.enrollment_tuition(id),
  renewal_tuition_id uuid unique references public.enrollment_tuition(id),
  invoice_id uuid unique references public.invoices(id),
  student_id uuid not null references public.students(id),
  parent_id uuid not null references public.parents(id),
  branch_id uuid not null references public.branches(id),
  tuition_plan_id uuid not null references public.tuition_plans(id),
  plan_code text not null check (plan_code in ('VIBE_3_MONTHS', 'VIBE_12_MONTHS')),
  payment_option text not null check (payment_option in ('DEPOSIT_50', 'FULL')),
  list_price numeric(14,2) not null check (list_price > 0 and list_price = trunc(list_price)),
  amount_due numeric(14,2) not null check (amount_due > 0 and amount_due = trunc(amount_due)),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  starts_on date not null,
  due_on date not null,
  note text,
  state text not null default 'CHECKOUT_PENDING' check (state in (
    'CHECKOUT_PENDING', 'AWAITING_TEMPLATE', 'AWAITING_ZBS', 'AWAITING_PAYMENT',
    'DEPOSIT_PAID', 'PAID', 'ERROR'
  )),
  zbs_status text not null default 'NONE' check (zbs_status in ('NONE', 'AWAITING_TEMPLATE', 'QUEUED', 'SENT', 'FAILED')),
  zbs_template_id text,
  zbs_tracking_id text,
  zbs_error_code text,
  zbs_attempts integer not null default 0 check (zbs_attempts >= 0),
  zbs_attempted_at timestamptz,
  confirmation_status text not null default 'NONE' check (confirmation_status in ('NONE', 'AWAITING_TEMPLATE', 'SENT', 'FAILED')),
  confirmed_by uuid references auth.users(id),
  last_event text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (payment_option = 'FULL' and amount_due = list_price)
    or (payment_option = 'DEPOSIT_50' and amount_due * 2 = list_price)
  ),
  check (paid_amount = 0 or paid_amount = amount_due),
  check (state <> 'DEPOSIT_PAID' or (payment_option = 'DEPOSIT_50' and paid_amount = amount_due)),
  check (state <> 'PAID' or (payment_option = 'FULL' and paid_amount = amount_due))
);

create table public.tuition_payos_orders (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tuition_renewal_cases(id),
  invoice_id uuid not null references public.invoices(id),
  provider text not null default 'PAYOS' check (provider = 'PAYOS'),
  order_code bigint not null unique,
  amount bigint not null check (amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  description text not null check (char_length(description) between 1 and 25),
  state text not null default 'RESERVED' check (state in ('RESERVED', 'PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'EXCEPTION')),
  payment_link_id text unique,
  checkout_url text,
  qr_code text,
  provider_reference text unique,
  finance_payment_id uuid unique references public.payments(id),
  created_at timestamptz not null default clock_timestamp(),
  activated_at timestamptz,
  paid_at timestamptz,
  check (state <> 'PAID' or (provider_reference is not null and paid_at is not null and finance_payment_id is not null)),
  check (state <> 'PENDING' or (payment_link_id is not null and checkout_url is not null))
);

create unique index tuition_one_open_payos_order
  on public.tuition_payos_orders(case_id)
  where state in ('RESERVED', 'PENDING');

create table public.tuition_payos_webhook_events (
  id bigint generated always as identity primary key,
  order_code bigint not null references public.tuition_payos_orders(order_code),
  provider_reference text not null,
  amount bigint not null,
  outcome text not null,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  unique (order_code, provider_reference)
);

create table public.tuition_renewal_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tuition_renewal_cases(id),
  event_type text not null,
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create function public.guard_tuition_renewal_event() returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' then raise exception 'Renewal events are append-only'; end if;
  return new;
end $$;
create trigger tuition_renewal_events_append_only
before update or delete on public.tuition_renewal_events
for each row execute function public.guard_tuition_renewal_event();

alter table public.tuition_renewal_cases enable row level security;
alter table public.tuition_payos_orders enable row level security;
alter table public.tuition_payos_webhook_events enable row level security;
alter table public.tuition_renewal_events enable row level security;
revoke all on public.tuition_renewal_cases, public.tuition_payos_orders,
  public.tuition_payos_webhook_events, public.tuition_renewal_events
  from public, anon, authenticated;
grant select on public.tuition_renewal_cases, public.tuition_payos_orders, public.tuition_renewal_events to authenticated;

create policy tuition_renewal_cases_read on public.tuition_renewal_cases
for select to authenticated using (public.has_permission('finance.invoice.create', branch_id));
create policy tuition_payos_orders_read on public.tuition_payos_orders
for select to authenticated using (exists (
  select 1 from public.tuition_renewal_cases renewal
  where renewal.id = case_id and public.has_permission('finance.invoice.create', renewal.branch_id)
));
create policy tuition_renewal_events_read on public.tuition_renewal_events
for select to authenticated using (exists (
  select 1 from public.tuition_renewal_cases renewal
  where renewal.id = case_id and public.has_permission('finance.invoice.create', renewal.branch_id)
));

create function public.tuition_branch_list_price(p_branch uuid, p_plan uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select price.list_price
  from public.tuition_plan_branch_prices price
  where price.tuition_plan_id = p_plan and price.status = 'ACTIVE' and price.currency = 'VND'
    and (price.branch_id = p_branch or price.branch_id is null)
  order by case when price.branch_id = p_branch then 0 else 1 end, price.created_at desc
  limit 1
$$;

create function public.tuition_renewal_authorized(p_branch uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_permission('finance.invoice.create', p_branch)
$$;

create function public.preview_tuition_renewal(p_reminder uuid, p_plan_code text, p_payment_option text, p_starts_on date)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  reminder public.tuition_reminders%rowtype;
  source public.enrollment_tuition%rowtype;
  enrollment public.enrollments%rowtype;
  plan public.tuition_plans%rowtype;
  parent_id uuid;
  price numeric;
  due numeric;
  open_case uuid;
begin
  if not public.tuition_renewal_authorized((
    select source_row.branch_id_snapshot from public.tuition_reminders reminder_row
    join public.enrollment_tuition source_row on source_row.id = reminder_row.enrollment_tuition_id
    where reminder_row.id = p_reminder
  )) then raise exception 'TUITION_RENEWAL_UNAUTHORIZED'; end if;
  select * into reminder from public.tuition_reminders where id = p_reminder;
  if not found then raise exception 'TUITION_REMINDER_NOT_FOUND'; end if;
  select * into source from public.enrollment_tuition where id = reminder.enrollment_tuition_id;
  select * into enrollment from public.enrollments where id = source.enrollment_id;
  select * into plan from public.tuition_plans where code = p_plan_code and status = 'ACTIVE';
  if plan.code is null or plan.code not in ('VIBE_3_MONTHS', 'VIBE_12_MONTHS') then raise exception 'TUITION_PLAN_REJECTED'; end if;
  if p_payment_option not in ('DEPOSIT_50', 'FULL') then raise exception 'TUITION_PAYMENT_OPTION_REJECTED'; end if;
  price := public.tuition_branch_list_price(source.branch_id_snapshot, plan.id);
  if price is null or price <= 0 or price <> trunc(price) or (p_payment_option = 'DEPOSIT_50' and price % 2 <> 0) then
    raise exception 'TUITION_PRICE_UNAVAILABLE';
  end if;
  due := case when p_payment_option = 'DEPOSIT_50' then price / 2 else price end;
  select id into open_case from public.tuition_renewal_cases where reminder_id = reminder.id;
  select link.parent_id into parent_id
  from public.student_parents link
  join public.parents parent on parent.id = link.parent_id and parent.status = 'ACTIVE'
  where link.student_id = enrollment.student_id and link.is_active and link.can_view_finance and link.is_primary
  order by link.created_at limit 1;
  return jsonb_build_object(
    'list_price', price, 'amount_due', due, 'payment_option', p_payment_option,
    'plan_code', plan.code, 'plan_name', plan.name, 'currency', 'VND',
    'current_ends_on', source.effective_ends_on, 'suggested_start', source.effective_ends_on + 1,
    'branch_name', source.branch_name_snapshot, 'open_case_id', open_case, 'parent_id', parent_id
  );
end $$;

create function public.begin_tuition_renewal(
  p_reminder uuid, p_plan_code text, p_payment_option text, p_starts_on date, p_due_on date,
  p_note text, p_asserted_price numeric default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  reminder public.tuition_reminders%rowtype;
  source public.enrollment_tuition%rowtype;
  enrollment public.enrollments%rowtype;
  student public.students%rowtype;
  plan public.tuition_plans%rowtype;
  existing public.tuition_renewal_cases%rowtype;
  parent_id uuid;
  price numeric;
  due numeric;
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
  renewal_id uuid;
  invoice_id uuid;
  invoice_number text;
  order_id uuid;
  order_code bigint;
  description text;
begin
  if p_note is not null and char_length(p_note) > 2000 then raise exception 'TUITION_NOTE_TOO_LONG'; end if;
  if p_starts_on is null or p_due_on is null or p_due_on < today then raise exception 'TUITION_DATE_REJECTED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tuition-renewal:' || p_reminder::text, 0));
  select * into reminder from public.tuition_reminders where id = p_reminder for update;
  if not found then raise exception 'TUITION_REMINDER_NOT_FOUND'; end if;
  select * into source from public.enrollment_tuition where id = reminder.enrollment_tuition_id for update;
  select * into enrollment from public.enrollments where id = source.enrollment_id;
  if enrollment.status <> 'ACTIVE' or source.status = 'CANCELLED' then raise exception 'TUITION_SOURCE_UNAVAILABLE'; end if;
  if not public.tuition_renewal_authorized(source.branch_id_snapshot) then raise exception 'TUITION_RENEWAL_UNAUTHORIZED'; end if;
  select * into plan from public.tuition_plans where code = p_plan_code and status = 'ACTIVE';
  if plan.id is null or plan.code not in ('VIBE_3_MONTHS', 'VIBE_12_MONTHS') or p_payment_option not in ('DEPOSIT_50', 'FULL') then
    raise exception 'TUITION_PLAN_REJECTED';
  end if;
  price := public.tuition_branch_list_price(source.branch_id_snapshot, plan.id);
  if price is null then raise exception 'TUITION_PRICE_UNAVAILABLE'; end if;
  if p_asserted_price is not null and p_asserted_price is distinct from price then raise exception 'TUITION_PRICE_REJECTED'; end if;
  due := case when p_payment_option = 'DEPOSIT_50' then price / 2 else price end;
  if p_starts_on <= source.effective_ends_on then raise exception 'TUITION_DATE_REJECTED'; end if;
  select link.parent_id into parent_id
  from public.student_parents link
  join public.parents parent on parent.id = link.parent_id and parent.status = 'ACTIVE'
  where link.student_id = enrollment.student_id and link.is_active and link.can_view_finance and link.is_primary
  limit 1;
  if parent_id is null then raise exception 'TUITION_PAYER_REQUIRED'; end if;
  select * into student from public.students where id = enrollment.student_id;
  select * into existing from public.tuition_renewal_cases where reminder_id = reminder.id for update;
  if found then
    if existing.plan_code = plan.code and existing.payment_option = p_payment_option
       and existing.starts_on = p_starts_on and existing.due_on = p_due_on and existing.state not in ('DEPOSIT_PAID', 'PAID', 'ERROR') then
      return jsonb_build_object('result', 'duplicate', 'case_id', existing.id, 'invoice_id', existing.invoice_id,
        'list_price', existing.list_price, 'amount_due', existing.amount_due, 'state', existing.state);
    end if;
    return jsonb_build_object('result', 'open_renewal', 'case_id', existing.id, 'state', existing.state,
      'invoice_id', existing.invoice_id, 'list_price', existing.list_price, 'amount_due', existing.amount_due);
  end if;
  if exists (select 1 from public.enrollment_tuition term
    where term.enrollment_id = enrollment.id and term.status = 'SCHEDULED') then
    raise exception 'TUITION_RENEWAL_ALREADY_SCHEDULED';
  end if;
  insert into public.enrollment_tuition(enrollment_id, tuition_plan_id, starts_on, status, discount_type, discount_value, notes)
  values (enrollment.id, plan.id, p_starts_on, 'SCHEDULED', 'NONE', 0, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into renewal_id;
  if (select amount from public.enrollment_tuition where id = renewal_id) is distinct from price then
    raise exception 'TUITION_PRICE_REJECTED';
  end if;
  invoice_id := gen_random_uuid();
  invoice_number := 'INV-' || to_char(today, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  insert into public.invoices(id, invoice_number, enrollment_tuition_id, enrollment_id_snapshot, student_id_snapshot,
    branch_id_snapshot, branch_code_snapshot, branch_name_snapshot, currency, subtotal, total_amount, status, notes, created_by)
  select invoice_id, invoice_number, renewal.id, renewal.enrollment_id, student.id, renewal.branch_id_snapshot,
    renewal.branch_code_snapshot, renewal.branch_name_snapshot, renewal.currency, renewal.amount, renewal.amount, 'DRAFT',
    'Gia hạn học phí', auth.uid()
  from public.enrollment_tuition renewal where renewal.id = renewal_id;
  insert into public.invoice_items(invoice_id, line_no, item_type, description, quantity, unit_amount, line_total)
  select invoice_id, 1, 'TUITION', renewal.plan_name_snapshot, 1, renewal.amount, renewal.amount
  from public.enrollment_tuition renewal where renewal.id = renewal_id;
  update public.invoices set status = 'ISSUED', issued_on = today, due_on = p_due_on where id = invoice_id;
  insert into public.tuition_renewal_cases(reminder_id, source_tuition_id, renewal_tuition_id, invoice_id, student_id, parent_id,
    branch_id, tuition_plan_id, plan_code, payment_option, list_price, amount_due, starts_on, due_on, note, confirmed_by, last_event)
  values (reminder.id, source.id, renewal_id, invoice_id, student.id, parent_id, source.branch_id_snapshot, plan.id, plan.code,
    p_payment_option, price, due, p_starts_on, p_due_on, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), 'INVOICE_CREATED')
  returning id into existing.id;
  order_code := nextval('public.registration_payos_order_code_seq');
  description := left('HP ' || right(invoice_number, 12), 25);
  insert into public.tuition_payos_orders(case_id, invoice_id, order_code, amount, description)
  values (existing.id, invoice_id, order_code, due::bigint, description)
  returning id into order_id;
  insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
  values (existing.id, 'RENEWAL_OPENED', auth.uid(), jsonb_build_object('plan_code', plan.code, 'payment_option', p_payment_option, 'list_price', price, 'amount_due', due)),
    (existing.id, 'INVOICE_CREATED', auth.uid(), jsonb_build_object('invoice_id', invoice_id, 'invoice_number', invoice_number)),
    (existing.id, 'CHECKOUT_RESERVED', auth.uid(), jsonb_build_object('order_code', order_code));
  return jsonb_build_object('result', 'created', 'case_id', existing.id, 'invoice_id', invoice_id, 'invoice_number', invoice_number,
    'order_code', order_code, 'order_id', order_id, 'amount_due', due, 'list_price', price, 'state', 'CHECKOUT_PENDING', 'description', description);
end $$;

create function public.activate_tuition_payos_checkout(
  p_case uuid, p_order_code bigint, p_amount bigint, p_payment_link_id text, p_checkout_url text, p_qr_code text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.tuition_payos_orders%rowtype; renewal public.tuition_renewal_cases%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  select * into renewal from public.tuition_renewal_cases where id = p_case for update;
  if not found then raise exception 'TUITION_RENEWAL_NOT_FOUND'; end if;
  select * into ord from public.tuition_payos_orders where case_id = renewal.id and order_code = p_order_code for update;
  if not found then raise exception 'PAYOS_ORDER_UNKNOWN'; end if;
  if ord.state = 'PENDING' and ord.payment_link_id = p_payment_link_id and ord.checkout_url = p_checkout_url and ord.amount = p_amount then
    return 'ALREADY_ACTIVE';
  end if;
  if ord.state <> 'RESERVED' or ord.amount <> p_amount or p_checkout_url is null or p_checkout_url !~ '^https://pay[.]payos[.]vn/' then
    raise exception 'PAYOS_CHECKOUT_MISMATCH';
  end if;
  update public.tuition_payos_orders set state = 'PENDING', payment_link_id = p_payment_link_id, checkout_url = p_checkout_url,
    qr_code = nullif(p_qr_code, ''), activated_at = clock_timestamp() where id = ord.id;
  update public.tuition_renewal_cases set state = 'AWAITING_TEMPLATE', zbs_status = 'AWAITING_TEMPLATE', last_event = 'CHECKOUT_ACTIVATED', updated_at = clock_timestamp()
  where id = renewal.id and state = 'CHECKOUT_PENDING';
  insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
  values (renewal.id, 'CHECKOUT_ACTIVATED', null, jsonb_build_object('order_code', p_order_code, 'amount', p_amount));
  return 'ACTIVATED';
end $$;

create function public.note_tuition_renewal_notice(
  p_case uuid, p_kind text, p_status text, p_error_code text, p_tracking text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare renewal public.tuition_renewal_cases%rowtype;
begin
  if not public.tuition_renewal_authorized((select branch_id from public.tuition_renewal_cases where id = p_case))
     and not coalesce(public.momo_service_request(), false) then raise exception 'TUITION_RENEWAL_UNAUTHORIZED'; end if;
  if p_kind not in ('PAYMENT', 'CONFIRMATION') then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_status not in ('AWAITING_TEMPLATE', 'QUEUED', 'SENT', 'FAILED') then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,80}$' then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  if p_tracking is not null and p_tracking !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception 'TUITION_NOTICE_REJECTED'; end if;
  select * into renewal from public.tuition_renewal_cases where id = p_case for update;
  if not found then raise exception 'TUITION_RENEWAL_NOT_FOUND'; end if;
  if p_kind = 'PAYMENT' then
    update public.tuition_renewal_cases set zbs_status = p_status, zbs_error_code = p_error_code, zbs_tracking_id = coalesce(p_tracking, zbs_tracking_id),
      zbs_attempts = zbs_attempts + 1, zbs_attempted_at = clock_timestamp(),
      state = case
        when state in ('DEPOSIT_PAID', 'PAID') then state
        when p_status = 'SENT' then 'AWAITING_PAYMENT'
        when p_status = 'FAILED' then 'AWAITING_ZBS'
        else 'AWAITING_TEMPLATE' end,
      last_event = 'ZBS_' || p_status, updated_at = clock_timestamp()
    where id = renewal.id;
  else
    update public.tuition_renewal_cases set confirmation_status = case when p_status = 'QUEUED' then 'AWAITING_TEMPLATE' else p_status end,
      last_event = 'CONFIRMATION_' || p_status, updated_at = clock_timestamp() where id = renewal.id;
  end if;
  insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
  values (renewal.id, case when p_kind = 'PAYMENT' then 'ZBS_PAYMENT' else 'ZBS_CONFIRMATION' end, auth.uid(),
    jsonb_build_object('status', p_status, 'error_code', p_error_code));
  return p_status;
end $$;

create function public.record_verified_tuition_payos_webhook(
  p_order_code bigint, p_payment_link_id text, p_reference text, p_amount bigint, p_currency text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ord public.tuition_payos_orders%rowtype;
  renewal public.tuition_renewal_cases%rowtype;
  invoice public.invoices%rowtype;
  payment_id uuid;
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  if p_currency is distinct from 'VND' or p_reference is null or btrim(p_reference) = '' then raise exception 'PAYOS_PAYLOAD_INVALID'; end if;
  select * into ord from public.tuition_payos_orders where order_code = p_order_code;
  if not found then raise exception 'PAYOS_ORDER_UNKNOWN'; end if;
  select * into renewal from public.tuition_renewal_cases where id = ord.case_id for update;
  select * into ord from public.tuition_payos_orders where order_code = p_order_code for update;
  select * into invoice from public.invoices where id = ord.invoice_id;
  if ord.payment_link_id is distinct from p_payment_link_id then raise exception 'PAYOS_LINK_MISMATCH'; end if;
  if p_amount is distinct from ord.amount or p_amount::numeric is distinct from renewal.amount_due or invoice.total_amount < renewal.amount_due then
    raise exception 'PAYOS_AMOUNT_MISMATCH';
  end if;
  if ord.state = 'PAID' then
    if ord.provider_reference is distinct from p_reference then raise exception 'PAYOS_REFERENCE_CONFLICT'; end if;
    return case when renewal.state = 'DEPOSIT_PAID' then 'ALREADY_DEPOSIT' else 'ALREADY_PAID' end;
  end if;
  if ord.state <> 'PENDING' or renewal.state in ('DEPOSIT_PAID', 'PAID') then raise exception 'PAYOS_ORDER_STATE_CONFLICT'; end if;
  payment_id := gen_random_uuid();
  insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot, branch_code_snapshot, branch_name_snapshot,
    amount, currency, payment_method, paid_at, reference, notes, status)
  select payment_id, 'PAY-' || to_char(today, 'YYYY') || '-' || lpad(nextval('public.payment_number_seq')::text, 6, '0'),
    invoice.student_id_snapshot, invoice.branch_id_snapshot, invoice.branch_code_snapshot, invoice.branch_name_snapshot,
    p_amount, 'VND', 'BANK_TRANSFER', clock_timestamp(), 'PAYOS:' || p_reference, 'Thanh toan hoc phi ' || invoice.invoice_number, 'POSTED';
  insert into public.payment_allocations(payment_id, invoice_id, amount)
  values (payment_id, invoice.id, p_amount);
  update public.tuition_payos_orders set state = 'PAID', provider_reference = p_reference, finance_payment_id = payment_id, paid_at = clock_timestamp()
  where id = ord.id;
  update public.tuition_renewal_cases set paid_amount = p_amount,
    state = case when payment_option = 'DEPOSIT_50' then 'DEPOSIT_PAID' else 'PAID' end,
    confirmation_status = 'AWAITING_TEMPLATE',
    last_event = case when payment_option = 'DEPOSIT_50' then 'DEPOSIT_RECORDED' else 'PAYMENT_RECORDED' end,
    updated_at = clock_timestamp()
  where id = renewal.id;
  if renewal.payment_option = 'FULL' and renewal.starts_on <= today then
    update public.enrollment_tuition set status = 'ACTIVE' where id = renewal.renewal_tuition_id and status = 'SCHEDULED';
  end if;
  insert into public.tuition_payos_webhook_events(order_code, provider_reference, amount, outcome, processed_at)
  values (ord.order_code, p_reference, p_amount, 'VERIFIED', clock_timestamp());
  insert into public.tuition_renewal_events(case_id, event_type, metadata)
  values (renewal.id, 'WEBHOOK_VERIFIED', jsonb_build_object('order_code', p_order_code, 'amount', p_amount)),
    (renewal.id, case when renewal.payment_option = 'DEPOSIT_50' then 'DEPOSIT_RECORDED' else 'PAYMENT_RECORDED' end, jsonb_build_object('payment_id', payment_id)),
    (renewal.id, 'CONFIRMATION_BLOCKED', jsonb_build_object('status', 'AWAITING_TEMPLATE'));
  return case when renewal.payment_option = 'DEPOSIT_50' then 'DEPOSIT_PAID' else 'PAID' end;
end $$;

revoke all on function public.tuition_branch_list_price(uuid, uuid) from public, anon, authenticated;
revoke all on function public.preview_tuition_renewal(uuid, text, text, date) from public, anon;
grant execute on function public.preview_tuition_renewal(uuid, text, text, date) to authenticated;
revoke all on function public.begin_tuition_renewal(uuid, text, text, date, date, text, numeric) from public, anon;
grant execute on function public.begin_tuition_renewal(uuid, text, text, date, date, text, numeric) to authenticated;
revoke all on function public.activate_tuition_payos_checkout(uuid, bigint, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.activate_tuition_payos_checkout(uuid, bigint, bigint, text, text, text) to service_role;
revoke all on function public.note_tuition_renewal_notice(uuid, text, text, text, text) from public, anon;
grant execute on function public.note_tuition_renewal_notice(uuid, text, text, text, text) to authenticated, service_role;
revoke all on function public.record_verified_tuition_payos_webhook(bigint, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.record_verified_tuition_payos_webhook(bigint, text, text, bigint, text) to service_role;

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'finance.invoice.create'
where role.code = 'FINANCE'
on conflict do nothing;
