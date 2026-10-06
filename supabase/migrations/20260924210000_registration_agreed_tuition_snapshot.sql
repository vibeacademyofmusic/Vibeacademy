-- Snapshot the agreed tuition, not only the list price.
-- deposit_due stays ceil(agreed VND / 2) via the existing generated column.
-- A quote can be replaced only before any MoMo order exists.
-- After a class invoice exists, each deposit receipt is allocated once.

alter table public.registration_deposit_terms
  add column list_amount bigint,
  add column discount_type text not null default 'NONE',
  add column discount_value numeric(14,2) not null default 0,
  add column discount_name text,
  add column discount_amount bigint not null default 0;

update public.registration_deposit_terms
set list_amount = tuition_amount
where list_amount is null;

alter table public.registration_deposit_terms
  alter column list_amount set not null;

alter table public.registration_deposit_terms
  add constraint registration_deposit_terms_discount_check check (
    discount_type in ('NONE', 'PERCENT', 'FIXED')
    and discount_value >= 0
    and discount_amount >= 0
    and list_amount = tuition_amount + discount_amount
    and list_amount <= 100000000
    and (discount_type = 'NONE' or nullif(btrim(discount_name), '') is not null)
  );

drop function public.set_registration_deposit_quote(uuid, integer, uuid);

create function public.set_registration_deposit_quote(
  p_application uuid,
  p_version integer,
  p_plan uuid,
  p_discount_type text default 'NONE',
  p_discount_value numeric default 0,
  p_discount_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications%rowtype;
  price public.tuition_plan_branch_prices%rowtype;
  discount_type text;
  discount_amount numeric;
  list_amount bigint;
  agreed bigint;
begin
  app := public.registration_lock(p_application, p_version, 'registration.update');
  discount_type := upper(coalesce(nullif(btrim(p_discount_type), ''), 'NONE'));
  if app.status <> 'VERIFIED' or p_plan is null
     or exists(select 1 from public.registration_momo_orders where application_id = p_application)
     or not exists(select 1 from public.tuition_plans where id = p_plan and status = 'ACTIVE') then
    raise exception 'REGISTRATION_QUOTE_DENIED';
  end if;
  if discount_type <> 'NONE' and nullif(btrim(p_discount_name), '') is null then
    raise exception 'REGISTRATION_DISCOUNT_EVIDENCE_REQUIRED';
  end if;
  select * into price from public.tuition_plan_branch_prices
  where tuition_plan_id = p_plan and status = 'ACTIVE' and currency = 'VND'
    and (branch_id = app.branch_id or branch_id is null)
  order by (branch_id = app.branch_id) desc, created_at desc limit 1;
  if not found or price.list_price <= 0 or price.list_price > 100000000
     or price.list_price <> trunc(price.list_price) then
    raise exception 'REGISTRATION_PRICE_UNAVAILABLE';
  end if;
  discount_amount := public.calculate_tuition_discount_amount(
    price.list_price, discount_type, coalesce(p_discount_value, 0));
  if discount_amount <> trunc(discount_amount) then
    raise exception 'REGISTRATION_DISCOUNT_NOT_WHOLE_VND';
  end if;
  list_amount := price.list_price::bigint;
  agreed := list_amount - discount_amount::bigint;
  if agreed <= 0 or agreed > 100000000 then
    raise exception 'REGISTRATION_PRICE_UNAVAILABLE';
  end if;
  insert into public.registration_deposit_terms(
    application_id, branch_id, tuition_plan_id, price_id, tuition_amount, quoted_by,
    list_amount, discount_type, discount_value, discount_name, discount_amount)
  values (
    app.id, app.branch_id, p_plan, price.id, agreed, auth.uid(),
    list_amount, discount_type, coalesce(p_discount_value, 0),
    nullif(btrim(p_discount_name), ''), discount_amount::bigint)
  on conflict (application_id) do update set
    tuition_plan_id = excluded.tuition_plan_id,
    price_id = excluded.price_id,
    tuition_amount = excluded.tuition_amount,
    quoted_by = excluded.quoted_by,
    quoted_at = clock_timestamp(),
    list_amount = excluded.list_amount,
    discount_type = excluded.discount_type,
    discount_value = excluded.discount_value,
    discount_name = excluded.discount_name,
    discount_amount = excluded.discount_amount;
  return app.id;
end $$;

create function public.allocate_registration_deposits_to_invoice(
  p_application uuid,
  p_invoice uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications%rowtype;
  invoice public.invoices%rowtype;
  receipt record;
  outstanding numeric;
  allocated integer := 0;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'REGISTRATION_UNAUTHORIZED';
  end if;
  if p_application is null or p_invoice is null then
    raise exception 'REGISTRATION_INVALID';
  end if;
  select * into app from public.registration_applications where id = p_application for update;
  if not found or app.status <> 'COMPLETED' or app.linked_student_id is null then
    raise exception 'REGISTRATION_ALLOCATION_DENIED';
  end if;
  select * into invoice from public.invoices where id = p_invoice for update;
  if not found or invoice.status <> 'ISSUED'
     or invoice.student_id_snapshot <> app.linked_student_id
     or invoice.branch_id_snapshot <> app.branch_id then
    raise exception 'REGISTRATION_INVOICE_MISMATCH';
  end if;
  for receipt in
    select payment.id, payment.amount
    from public.registration_momo_orders ord
    join public.payments payment on payment.id = ord.finance_payment_id
    where ord.application_id = app.id and ord.state = 'PAID' and payment.status = 'POSTED'
    order by ord.paid_at, ord.id
    for update of payment
  loop
    if exists (
      select 1 from public.payment_allocations allocation
      where allocation.payment_id = receipt.id and allocation.invoice_id = invoice.id
    ) then
      continue;
    end if;
    select outstanding_balance into outstanding
    from public.invoice_receivables where invoice_id = invoice.id;
    if coalesce(outstanding, 0) <= 0 then
      exit;
    end if;
    perform public.allocate_payment_to_invoice(
      receipt.id, invoice.id, least(receipt.amount, outstanding));
    allocated := allocated + 1;
  end loop;
  if app.invoice_id is null then
    perform set_config('registration.write', 'on', true);
    update public.registration_applications
    set invoice_id = invoice.id, updated_at = clock_timestamp()
    where id = app.id and invoice_id is null;
    perform set_config('registration.write', 'off', true);
  end if;
  return allocated;
end $$;

revoke all on function public.set_registration_deposit_quote(uuid, integer, uuid, text, numeric, text)
  from public, anon;
grant execute on function public.set_registration_deposit_quote(uuid, integer, uuid, text, numeric, text)
  to authenticated;
revoke all on function public.allocate_registration_deposits_to_invoice(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.allocate_registration_deposits_to_invoice(uuid, uuid)
  to authenticated;

-- Prefer the stored curriculum name. The seven ZBS parameter names stay those recorded for template 640377.
create or replace function notification_private.domain_notice_source(p_event text, p_entity uuid)
returns table(
  student_id uuid,
  parent_id uuid,
  registration_id uuid,
  branch_id uuid,
  template_key text,
  title text,
  href text,
  parameters jsonb
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_event = 'PAYMENT_CONFIRMED' then
    return query
    select
      payment.student_id_snapshot,
      (
        select relation.parent_id
        from public.student_parents relation
        where relation.student_id = payment.student_id_snapshot
          and relation.is_active
        order by relation.is_primary desc
        limit 1
      ),
      null::uuid,
      payment.branch_id_snapshot,
      'ZALO_PAYMENT_CONFIRMED'::text,
      'Thanh toán đã được xác nhận'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'student_display_name', left(coalesce(student.full_name, 'Học viên'), 80),
        'amount_display', trim(to_char(payment.amount, 'FM999999999990')) || ' VND',
        'payment_reference', left(payment.payment_number, 40),
        'portal_url', '/my-learning'
      )
    from public.payments payment
    join public.students student on student.id = payment.student_id_snapshot
    where payment.id = p_entity
      and payment.status = 'POSTED'
      and exists (
        select 1
        from public.payment_allocations allocation
        join public.invoice_receivables receivable on receivable.invoice_id = allocation.invoice_id
        where allocation.payment_id = payment.id
          and receivable.invoice_status = 'ISSUED'
          and receivable.receivable_status = 'PAID'
      );
  elsif p_event = 'REGISTRATION_COMPLETED' then
    return query
    select
      app.linked_student_id,
      app.linked_parent_id,
      app.id,
      app.branch_id,
      'ZALO_REGISTRATION_CONFIRMED'::text,
      'Xác nhận đăng ký tại VIBE Academy'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'customer_name', left(coalesce(app.parent_name, 'Phụ huynh'), 80),
        'registration_code', app.application_code,
        'student_name', left(coalesce(app.student_name, 'Học viên'), 80),
        'program_name', left(coalesce(curriculum.name, app.program_interest, 'Chương trình đã đăng ký'), 80),
        'branch_name', left(branch.name, 80),
        'order_code', app.application_code,
        'payment_status', 'Đã nhận cọc 50%'
      )
    from public.registration_applications app
    join public.branches branch on branch.id = app.branch_id
    left join public.curriculums curriculum on curriculum.id = app.curriculum_id
    where app.id = p_entity
      and app.status = 'COMPLETED'
      and app.deposit_confirmed_at is not null;
  elsif p_event = 'CLASS_ASSIGNED' then
    return query
    select
      placement.student_id,
      app.linked_parent_id,
      app.id,
      placement.branch_id,
      'ZALO_CLASS_ASSIGNED'::text,
      'Học viên đã được xếp lớp'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'student_display_name', left(coalesce(student.full_name, 'Học viên'), 80),
        'class_name', left(class_row.name, 80),
        'teacher_display_name', left(coalesce(teacher.full_name, 'Sẽ thông báo'), 80),
        'start_date', to_char(placement.scheduled_start_date, 'YYYY-MM-DD'),
        'schedule_display', left(coalesce(nullif(btrim(placement.preferred_schedule), ''), 'Xem lịch trên cổng học viên'), 120),
        'portal_url', '/my-learning'
      )
    from public.student_placement_events event
    join public.student_placement_cases placement on placement.id = event.placement_id
    join public.registration_applications app on app.id = placement.registration_application_id
    join public.classes class_row on class_row.id = placement.assigned_class_id
    join public.students student on student.id = placement.student_id
    left join public.teachers teacher on teacher.id = placement.assigned_teacher_id
    where event.id = p_entity
      and event.event_type = 'CLASS_ASSIGNED'
      and placement.status = 'SCHEDULED';
  elsif p_event in ('LEARNING_REPORT_PUBLISHED', 'END_OF_COURSE_REPORT_PUBLISHED') then
    return query
    select
      report.student_id,
      (
        select relation.parent_id
        from public.student_parents relation
        where relation.student_id = report.student_id
          and relation.is_active
        order by relation.is_primary desc
        limit 1
      ),
      null::uuid,
      report.branch_id,
      'ZALO_LEARNING_REPORT_PUBLISHED'::text,
      'Báo cáo học tập đã phát hành'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'student_display_name', left(coalesce(student.full_name, 'Học viên'), 80),
        'report_period', to_char(report.period_start, 'YYYY-MM-DD') || ' - ' || to_char(report.period_end, 'YYYY-MM-DD'),
        'secure_report_url', '/my-learning'
      )
    from public.learning_reports report
    join public.students student on student.id = report.student_id
    where report.id = p_entity
      and report.status = 'PUBLISHED'
      and report.approved_at is not null
      and report.approved_by is not null
      and (
        (p_event = 'LEARNING_REPORT_PUBLISHED' and report.report_type = 'MONTHLY')
        or (p_event = 'END_OF_COURSE_REPORT_PUBLISHED' and report.report_type = 'END_OF_COURSE')
      );
  end if;
end $$;
