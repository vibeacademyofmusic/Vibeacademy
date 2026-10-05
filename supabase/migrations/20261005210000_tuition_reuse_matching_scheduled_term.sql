-- Reuse a matching existing unbilled planned period without changing its state.
-- Authorization, price checks, existing-invoice/renewal denial and webhook-only payment posting remain intact.
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
  planned public.enrollment_tuition%rowtype;
  planned_count integer;
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
  select * into enrollment from public.enrollments where id = source.enrollment_id for update;
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
  -- Reconcile an already planned, unbilled matching term; never create a second term.
  -- Any mismatch or existing financial/renewal relationship keeps the original denial.
  select count(*) into planned_count from public.enrollment_tuition
    where enrollment_id = enrollment.id and status = 'SCHEDULED';
  if planned_count > 0 then
    if planned_count <> 1 then raise exception 'TUITION_RENEWAL_ALREADY_SCHEDULED'; end if;
    select * into planned from public.enrollment_tuition
      where enrollment_id = enrollment.id and status = 'SCHEDULED' for update;
    if planned.starts_on is distinct from p_starts_on
       or planned.tuition_plan_id is distinct from plan.id
       or planned.branch_id_snapshot is distinct from source.branch_id_snapshot
       or planned.currency is distinct from 'VND'
       or planned.list_price is distinct from price or planned.amount is distinct from price
       or planned.discount_type is distinct from 'NONE' or planned.discount_amount <> 0
       or planned.effective_ends_on is distinct from planned.base_ends_on
       or exists (select 1 from public.invoices where enrollment_tuition_id = planned.id)
       or exists (select 1 from public.tuition_renewal_cases where renewal_tuition_id = planned.id)
    then raise exception 'TUITION_RENEWAL_ALREADY_SCHEDULED'; end if;
  end if;
  invoice_id := gen_random_uuid();
  invoice_number := 'INV-' || to_char(today, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  insert into public.invoices(id, invoice_number, enrollment_tuition_id, enrollment_id_snapshot, student_id_snapshot,
    branch_id_snapshot, branch_code_snapshot, branch_name_snapshot, currency, subtotal, total_amount, status, notes, created_by)
  values (invoice_id, invoice_number, planned.id, enrollment.id, student.id, source.branch_id_snapshot,
    source.branch_code_snapshot, source.branch_name_snapshot, source.currency, price, price, 'DRAFT',
    'Gia hạn học phí', auth.uid());
  insert into public.invoice_items(invoice_id, line_no, item_type, description, quantity, unit_amount, line_total)
  values (invoice_id, 1, 'TUITION', plan.name, 1, price, price);
  update public.invoices set status = 'ISSUED', issued_on = today, due_on = p_due_on where id = invoice_id;
  insert into public.tuition_renewal_cases(reminder_id, source_tuition_id, renewal_tuition_id, invoice_id, student_id, parent_id,
    branch_id, tuition_plan_id, plan_code, payment_option, list_price, amount_due, starts_on, due_on, note, confirmed_by, last_event)
  values (reminder.id, source.id, planned.id, invoice_id, student.id, parent_id, source.branch_id_snapshot, plan.id, plan.code,
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
  if planned.id is not null then
    insert into public.tuition_renewal_events(case_id, event_type, actor_id, metadata)
    values (existing.id, 'SCHEDULED_TERM_REUSED', auth.uid(), jsonb_build_object('tuition_id', planned.id));
  end if;
  return jsonb_build_object('result', 'created', 'case_id', existing.id, 'invoice_id', invoice_id, 'invoice_number', invoice_number,
    'order_code', order_code, 'order_id', order_id, 'amount_due', due, 'list_price', price, 'state', 'CHECKOUT_PENDING', 'description', description);
end $$;
