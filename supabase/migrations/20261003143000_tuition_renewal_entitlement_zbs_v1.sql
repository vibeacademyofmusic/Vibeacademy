-- A renewal invoice can exist before its tuition period.
-- The scheduled period is created only after a verified payOS payment.
-- Preparation uses tuition.renewal.prepare and does not grant cash confirmation.

insert into public.permissions(code, name, module, description)
values ('tuition.renewal.prepare', 'Prepare a branch tuition renewal', 'tuition', 'Prepare a renewal invoice without recording cash')
on conflict (code) do nothing;

delete from public.role_permissions
where role_id = (select id from public.roles where code = 'FINANCE')
  and permission_id = (select id from public.permissions where code = 'finance.invoice.create');

insert into public.role_permissions(role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'tuition.renewal.prepare'
where role.code = 'FINANCE'
on conflict do nothing;

alter table public.invoices alter column enrollment_tuition_id drop not null;
comment on column public.invoices.enrollment_tuition_id is
  'Null only while a tuition renewal invoice is waiting for a verified payment. The payOS webhook links the scheduled period once.';

drop policy if exists tuition_renewal_cases_read on public.tuition_renewal_cases;
drop policy if exists tuition_payos_orders_read on public.tuition_payos_orders;
drop policy if exists tuition_renewal_events_read on public.tuition_renewal_events;

create policy tuition_renewal_cases_read on public.tuition_renewal_cases
for select to authenticated using (public.has_permission('tuition.renewal.prepare', branch_id));
create policy tuition_payos_orders_read on public.tuition_payos_orders
for select to authenticated using (exists (
  select 1 from public.tuition_renewal_cases renewal
  where renewal.id = case_id and public.has_permission('tuition.renewal.prepare', renewal.branch_id)
));
create policy tuition_renewal_events_read on public.tuition_renewal_events
for select to authenticated using (exists (
  select 1 from public.tuition_renewal_cases renewal
  where renewal.id = case_id and public.has_permission('tuition.renewal.prepare', renewal.branch_id)
));

create or replace function public.tuition_renewal_authorized(p_branch uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_permission('tuition.renewal.prepare', p_branch)
$$;
revoke all on function public.tuition_renewal_authorized(uuid) from public, anon, authenticated;

insert into public.notification_templates(
  template_key, provider, status, enabled, description, parameter_schema, payload_schema, event_type
) values (
  'ZALO_TUITION_PAYMENT', 'ZALO', 'PENDING', false,
  'TUITION_PAYMENT_REQUEST. Chờ mã mẫu ZBS đã duyệt. Không dùng 643118 hoặc 640377.',
  '["customer_name","payment_status","student_name","invoice_code","tuition_package","package_amount","payment_type","amount_due","payment_deadline","payment_link_id"]'::jsonb,
  '{"purpose":"TUITION_PAYMENT_REQUEST","cta":"payment_link_id","cta_url":"https://pay.payos.vn/web/{payment_link_id}"}'::jsonb,
  'TUITION_PAYMENT_REQUEST'
), (
  'ZALO_TUITION_PAYMENT_CONFIRMATION', 'ZALO', 'PENDING', false,
  'TUITION_PAYMENT_CONFIRMATION. Trạng thái khách hàng chỉ là Đã nhận cọc 50% hoặc Đã thanh toán.',
  '["customer_name","payment_status","student_name","invoice_code","tuition_package","package_amount","payment_type","amount_due","payment_deadline","payment_link_id"]'::jsonb,
  '{"purpose":"TUITION_PAYMENT_CONFIRMATION"}'::jsonb,
  'TUITION_PAYMENT_CONFIRMATION'
) on conflict (template_key) do nothing;

create or replace function public.begin_tuition_renewal(
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
  invoice_id := gen_random_uuid();
  invoice_number := 'INV-' || to_char(today, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  insert into public.invoices(id, invoice_number, enrollment_tuition_id, enrollment_id_snapshot, student_id_snapshot,
    branch_id_snapshot, branch_code_snapshot, branch_name_snapshot, currency, subtotal, total_amount, status, notes, created_by)
  values (invoice_id, invoice_number, null, enrollment.id, student.id, source.branch_id_snapshot,
    source.branch_code_snapshot, source.branch_name_snapshot, source.currency, price, price, 'DRAFT',
    'Gia hạn học phí', auth.uid());
  insert into public.invoice_items(invoice_id, line_no, item_type, description, quantity, unit_amount, line_total)
  values (invoice_id, 1, 'TUITION', plan.name, 1, price, price);
  update public.invoices set status = 'ISSUED', issued_on = today, due_on = p_due_on where id = invoice_id;
  insert into public.tuition_renewal_cases(reminder_id, source_tuition_id, renewal_tuition_id, invoice_id, student_id, parent_id,
    branch_id, tuition_plan_id, plan_code, payment_option, list_price, amount_due, starts_on, due_on, note, confirmed_by, last_event)
  values (reminder.id, source.id, null, invoice_id, student.id, parent_id, source.branch_id_snapshot, plan.id, plan.code,
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

create or replace function public.activate_tuition_payos_checkout(
  p_case uuid, p_order_code bigint, p_amount bigint, p_payment_link_id text, p_checkout_url text, p_qr_code text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare ord public.tuition_payos_orders%rowtype; renewal public.tuition_renewal_cases%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then raise exception 'PAYOS_SERVER_ONLY'; end if;
  select * into renewal from public.tuition_renewal_cases where id = p_case for update;
  if not found then raise exception 'TUITION_RENEWAL_NOT_FOUND'; end if;
  select * into ord from public.tuition_payos_orders where case_id = renewal.id and order_code = p_order_code for update;
  if not found then raise exception 'PAYOS_ORDER_UNKNOWN'; end if;
  if p_payment_link_id is null or p_payment_link_id !~ '^[A-Za-z0-9]{8,64}$'
     or p_checkout_url is distinct from 'https://pay.payos.vn/web/' || p_payment_link_id then
    raise exception 'PAYOS_CHECKOUT_MISMATCH';
  end if;
  if ord.state = 'PENDING' and ord.payment_link_id = p_payment_link_id and ord.checkout_url = p_checkout_url and ord.amount = p_amount then
    return 'ALREADY_ACTIVE';
  end if;
  if ord.state <> 'RESERVED' or ord.amount <> p_amount then raise exception 'PAYOS_CHECKOUT_MISMATCH'; end if;
  update public.tuition_payos_orders set state = 'PENDING', payment_link_id = p_payment_link_id, checkout_url = p_checkout_url,
    qr_code = nullif(p_qr_code, ''), activated_at = clock_timestamp() where id = ord.id;
  update public.tuition_renewal_cases set state = 'AWAITING_TEMPLATE', zbs_status = 'AWAITING_TEMPLATE', last_event = 'CHECKOUT_ACTIVATED', updated_at = clock_timestamp()
  where id = renewal.id and state = 'CHECKOUT_PENDING';
  insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
  values (renewal.id, 'CHECKOUT_ACTIVATED', null, jsonb_build_object('order_code', p_order_code, 'amount', p_amount));
  return 'ACTIVATED';
end $$;

create or replace function public.record_verified_tuition_payos_webhook(
  p_order_code bigint, p_payment_link_id text, p_reference text, p_amount bigint, p_currency text
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ord public.tuition_payos_orders%rowtype;
  renewal public.tuition_renewal_cases%rowtype;
  invoice public.invoices%rowtype;
  payment_id uuid;
  period_id uuid;
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
  if renewal.renewal_tuition_id is null then
    insert into public.enrollment_tuition(enrollment_id, tuition_plan_id, starts_on, status, discount_type, discount_value, notes)
    select source.enrollment_id, renewal.tuition_plan_id, renewal.starts_on, 'SCHEDULED', 'NONE', 0, renewal.note
    from public.enrollment_tuition source where source.id = renewal.source_tuition_id
    returning id into period_id;
    if (select amount from public.enrollment_tuition where id = period_id) is distinct from renewal.list_price then
      raise exception 'TUITION_PRICE_REJECTED';
    end if;
    update public.invoices set enrollment_tuition_id = period_id where id = invoice.id and enrollment_tuition_id is null;
    if not found then raise exception 'TUITION_INVOICE_LINK_FAILED'; end if;
    update public.tuition_renewal_cases set renewal_tuition_id = period_id where id = renewal.id;
    if renewal.payment_option = 'FULL' and renewal.starts_on <= today then
      update public.enrollment_tuition set status = 'ACTIVE' where id = period_id and status = 'SCHEDULED';
    end if;
  end if;
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
  insert into public.tuition_payos_webhook_events(order_code, provider_reference, amount, outcome, processed_at)
  values (ord.order_code, p_reference, p_amount, 'VERIFIED', clock_timestamp());
  insert into public.tuition_renewal_events(case_id, event_type, metadata)
  values (renewal.id, 'WEBHOOK_VERIFIED', jsonb_build_object('order_code', p_order_code, 'amount', p_amount)),
    (renewal.id, case when renewal.payment_option = 'DEPOSIT_50' then 'DEPOSIT_RECORDED' else 'PAYMENT_RECORDED' end, jsonb_build_object('payment_id', payment_id)),
    (renewal.id, 'CONFIRMATION_BLOCKED', jsonb_build_object('status', 'AWAITING_TEMPLATE'));
  return case when renewal.payment_option = 'DEPOSIT_50' then 'DEPOSIT_PAID' else 'PAID' end;
end $$;
