-- User-facing wording: cọc becomes thanh toán. Internal codes stay DEPOSIT_50.
-- Sent Zalo jobs keep the text that was actually delivered.

CREATE OR REPLACE FUNCTION notification_private.registration_phone_payment_status(p_application uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case payment_option
    when 'DEPOSIT_50' then 'Đã nhận thanh toán 50%'
    when 'FULL' then 'Đã thanh toán đủ'
    else 'CHƯA XÁC ĐỊNH'
  end
  from public.registration_deposit_terms
  where application_id = p_application;
$function$;

CREATE OR REPLACE FUNCTION public.preview_zalo_dispatch_decision(p_order_code bigint)
 RETURNS TABLE(decision text, job_id uuid, provider_user_id text, idempotency_key text, parameters jsonb, delivery_channel text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  target record;
  job public.notification_jobs;
  expected text;
begin
  select ord.application_id, app.status as application_status, ord.state as order_state,
    terms.payment_option, consent.normalized_phone, consent.id as consent_id
  into target
  from public.registration_payos_orders ord
  join public.registration_applications app on app.id = ord.application_id
  join public.registration_deposit_terms terms on terms.application_id = ord.application_id
  left join public.registration_zalo_phone_consents consent
    on consent.application_id = ord.application_id and consent.revoked_at is null
  where ord.order_code = p_order_code;
  if not found then
    return query select 'NOT_THIS_APPLICATION', null::uuid, null::text, null::text, null::jsonb, null::text;
    return;
  end if;
  if target.order_state is distinct from 'PAID' or target.application_status is distinct from 'COMPLETED' then
    return query select 'NOT_SENDABLE', null::uuid, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if target.normalized_phone is null then
    return query select 'NO_CONSENT', null::uuid, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  expected := case target.payment_option
    when 'DEPOSIT_50' then 'Đã nhận thanh toán 50%'
    when 'FULL' then 'Đã thanh toán đủ'
    else null
  end;
  select * into job
  from public.notification_jobs notification
  where notification.entity_type = 'REGISTRATION_COMPLETED'
    and notification.entity_id = target.application_id
    and notification.channel = 'ZALO'
    and notification.template_key = 'ZALO_REGISTRATION_CONFIRMED'
    and notification.payload->'delivery'->>'channel' = 'PHONE'
  order by notification.created_at
  limit 1;
  if job.id is null then
    return query select 'NO_JOB', null::uuid, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if job.status = 'ACCEPTANCE_UNKNOWN' then
    return query select 'AMBIGUOUS', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if job.status in ('SENT', 'DELIVERED') then
    return query select 'ALREADY_ACCEPTED', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if job.payload->'delivery'->>'normalized_recipient' is distinct from target.normalized_phone then
    return query select 'WRONG_RECIPIENT', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if not exists (
    select 1 from public.registration_zalo_phone_consents consent
    where consent.id = target.consent_id
      and consent.revoked_at is null
      and consent.normalized_phone = job.payload->'delivery'->>'normalized_recipient'
  ) then
    return query select 'NO_CONSENT', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if expected is null or job.payload->'parameters'->>'payment_status' is distinct from expected then
    return query select 'PAYLOAD_REJECTED', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if not exists (
    select 1 from public.notification_templates template
    where template.template_key = job.template_key
      and template.provider = 'ZALO'
      and template.provider_template_id = '640377'
      and template.status = 'APPROVED'
      and template.enabled
  ) then
    return query select 'GATE_DISABLED', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if job.status not in ('QUEUED', 'RETRYING') then
    return query select 'NOT_SENDABLE', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  return query select 'SEND', job.id, target.normalized_phone, job.idempotency_key, job.payload->'parameters', 'PHONE'::text;
end $function$;

CREATE OR REPLACE FUNCTION public.complete_momo_deposit_registration(p_application uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare app public.registration_applications%rowtype;
  student_id uuid; parent_id uuid; placement_id uuid; finance_id uuid;
  ord public.registration_momo_orders%rowtype; branch public.branches%rowtype;
begin
  if not coalesce(public.momo_service_request(), false) then
    raise exception 'MOMO_SERVER_ONLY';
  end if;
  select * into app from public.registration_applications where id = p_application for update;
  if app.status = 'COMPLETED' then return 'ALREADY_COMPLETED'; end if;
  if app.status <> 'PAID' or app.deposit_confirmed_at is null then
    raise exception 'REGISTRATION_PAYMENT_REQUIRED';
  end if;
  if nullif(btrim(coalesce(app.student_name, '')), '') is null or app.student_date_of_birth is null
     or (not coalesce(app.student_over_18, false) and nullif(btrim(coalesce(app.parent_name, '')), '') is null) then
    return 'REVIEW_INCOMPLETE_IDENTITY';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    lower(btrim(app.student_name)) || ':' || app.student_date_of_birth::text, 0));
  if exists(select 1 from public.students s where s.date_of_birth = app.student_date_of_birth
     and lower(btrim(coalesce(s.full_name, ''))) = lower(btrim(app.student_name))) then
    return 'REVIEW_POSSIBLE_DUPLICATE';
  end if;
  student_id := gen_random_uuid();
  parent_id := null;
  placement_id := gen_random_uuid();
  perform set_config('registration.write', 'on', true);
  insert into public.students(id, student_code, full_name, date_of_birth, default_branch_id, admission_date, status)
  values(student_id, null, btrim(app.student_name), app.student_date_of_birth,
    app.branch_id, public.registration_vietnam_today(), 'ACTIVE');
  if nullif(btrim(coalesce(app.parent_name, '')), '') is not null then
    parent_id := gen_random_uuid();
    insert into public.parents(id, parent_code, status)
    values(parent_id, 'PH-' || substr(replace(parent_id::text, '-', ''), 1, 8), 'ACTIVE');
    insert into public.student_parents(student_id, parent_id, relationship, is_primary)
    values(student_id, parent_id, 'GUARDIAN', true);
  end if;
  insert into public.student_placement_cases(id, student_id, registration_application_id,
    branch_id, status, desired_start_date, preferred_schedule)
  values(placement_id, student_id, app.id, app.branch_id, 'UNASSIGNED',
    app.desired_start_date, app.preferred_schedule);
  select * into branch from public.branches where id = app.branch_id;
  for ord in select * from public.registration_momo_orders
    where application_id = app.id and state = 'PAID' order by paid_at for update loop
    finance_id := gen_random_uuid();
    insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot,
      branch_code_snapshot, branch_name_snapshot, amount, currency, payment_method,
      paid_at, reference, notes, status)
    values(finance_id, 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-'
      || lpad(nextval('public.payment_number_seq')::text, 6, '0'), student_id,
      branch.id, branch.code, branch.name, ord.amount, 'VND', 'OTHER', ord.paid_at,
      'MOMO:' || ord.provider_transaction_id, 'Thanh toán hồ sơ ' || app.application_code, 'POSTED');
    update public.registration_momo_orders set finance_payment_id = finance_id where id = ord.id;
  end loop;
  update public.registration_applications set linked_student_id = student_id,
    linked_parent_id = parent_id, status = 'COMPLETED', completed_at = clock_timestamp(),
    version = version + 1, updated_at = clock_timestamp() where id = app.id;
  insert into public.registration_application_events(id, application_id, event_type,
    from_status, to_status, actor_id, metadata)
  values(gen_random_uuid(), app.id, 'REGISTRATION_COMPLETED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'MOMO_DEPOSIT', 'student_id', student_id, 'parent_id', parent_id)),
    (gen_random_uuid(), app.id, 'PLACEMENT_OPENED', 'PAID', 'COMPLETED', null,
    jsonb_build_object('source', 'MOMO_DEPOSIT', 'placement_id', placement_id));
  insert into public.student_placement_events(id, placement_id, event_type, actor_id)
  values(gen_random_uuid(), placement_id, 'PLACEMENT_OPENED', null);
  perform set_config('registration.write', 'off', true);
  return 'COMPLETED';
end $function$;

CREATE OR REPLACE FUNCTION public.post_reviewed_momo_deposit_receipts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare ord public.registration_momo_orders%rowtype;
  branch public.branches%rowtype; finance_id uuid;
begin
  if new.status <> 'COMPLETED' or old.status = 'COMPLETED' or new.deposit_confirmed_at is null then
    return new;
  end if;
  select * into branch from public.branches where id = new.branch_id;
  for ord in select * from public.registration_momo_orders
    where application_id = new.id and state = 'PAID' and finance_payment_id is null
    order by paid_at for update loop
    finance_id := gen_random_uuid();
    insert into public.payments(id, payment_number, student_id_snapshot, branch_id_snapshot,
      branch_code_snapshot, branch_name_snapshot, amount, currency, payment_method,
      paid_at, reference, notes, status)
    values(finance_id, 'PAY-' || to_char(timezone('Asia/Ho_Chi_Minh', now()), 'YYYY') || '-'
      || lpad(nextval('public.payment_number_seq')::text, 6, '0'), new.linked_student_id,
      branch.id, branch.code, branch.name, ord.amount, 'VND', 'OTHER', ord.paid_at,
      'MOMO:' || ord.provider_transaction_id, 'Thanh toán hồ sơ ' || new.application_code, 'POSTED');
    update public.registration_momo_orders set finance_payment_id = finance_id where id = ord.id;
  end loop;
  return new;
end $function$;

update public.notification_templates
set description = 'Xác nhận đăng ký khi đã nhận thanh toán 50% qua MoMo'
where template_key = 'ZALO_REGISTRATION_CONFIRMED'
  and description = 'Xác nhận đăng ký khi đã nhận cọc 50% qua MoMo';
