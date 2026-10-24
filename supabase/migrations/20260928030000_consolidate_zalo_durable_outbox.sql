begin;
-- Consolidation batch 3. Main security/finance guards remain authoritative.
-- Explicit recorded consent only: deliberately excludes preview auto-consent trigger and pilot rows.
-- No tokens, business rows or preview migration-ledger entries are transferred.
-- Rollback: disable provider env and template first; keep consent, outbox and attempt history for audit.
-- Revert application before any later forward rollback. Never drop credential/history tables with data.
-- Template 640377 was approved for deposit registration copy. Sending remains disabled
-- until the OA application, recipient eligibility and merchant sandbox are verified.
update public.notification_templates
set provider_template_id = '640377', status = 'APPROVED', enabled = false,
    parameter_schema = '["customer_name","registration_code","student_name","program_name","branch_name","order_code","payment_status"]'::jsonb,
    description = 'Xác nhận đăng ký khi đã nhận cọc 50% qua MoMo'
where template_key = 'ZALO_REGISTRATION_CONFIRMED' and provider = 'ZALO';


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

-- Preview the approved template 640377 parameters and record Zalo acceptance
-- separately from delivery. This migration does not enable sending.

do $recover$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='preview_registration_zalo_payload') then
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='preview_registration_zalo_payload' and p.prosrc=$body$
declare
  app public.registration_applications;
  terms public.registration_deposit_terms;
  paid bigint;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  select * into app from public.registration_applications where id = p_application;
  if not found then
    raise exception 'Registration not found';
  end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  select coalesce(sum(ord.attributed_amount), 0) into paid
  from public.registration_payos_orders ord
  where ord.application_id = app.id and ord.state = 'PAID';
  return query
  select
    left(coalesce(app.parent_name, 'Phụ huynh'), 80),
    app.application_code,
    left(coalesce(app.student_name, 'Học viên'), 80),
    left(coalesce(curriculum.name, app.program_interest, 'Chương trình đã đăng ký'), 80),
    left(branch.name, 80),
    app.application_code,
    'Đã nhận cọc 50%'::text,
    app.status = 'COMPLETED',
    terms.tuition_amount is not null and paid >= terms.tuition_amount
  from public.branches branch
  left join public.curriculums curriculum on curriculum.id = app.curriculum_id
  where branch.id = app.branch_id;
end $body$) then
      raise exception 'Unexpected existing definition: public.preview_registration_zalo_payload';
    end if;
  else
    execute $definition$create function public.preview_registration_zalo_payload(p_application uuid)
returns table(
  customer_name text,
  registration_code text,
  student_name text,
  program_name text,
  branch_name text,
  order_code text,
  payment_status text,
  registration_completed boolean,
  tuition_fully_paid boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications;
  terms public.registration_deposit_terms;
  paid bigint;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  select * into app from public.registration_applications where id = p_application;
  if not found then
    raise exception 'Registration not found';
  end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  select coalesce(sum(ord.attributed_amount), 0) into paid
  from public.registration_payos_orders ord
  where ord.application_id = app.id and ord.state = 'PAID';
  return query
  select
    left(coalesce(app.parent_name, 'Phụ huynh'), 80),
    app.application_code,
    left(coalesce(app.student_name, 'Học viên'), 80),
    left(coalesce(curriculum.name, app.program_interest, 'Chương trình đã đăng ký'), 80),
    left(branch.name, 80),
    app.application_code,
    'Đã nhận cọc 50%'::text,
    app.status = 'COMPLETED',
    terms.tuition_amount is not null and paid >= terms.tuition_amount
  from public.branches branch
  left join public.curriculums curriculum on curriculum.id = app.curriculum_id
  where branch.id = app.branch_id;
end $$;$definition$;
  end if;
end $recover$;

do $recover$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_zalo_template_acceptance') then
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_zalo_template_acceptance' and p.prosrc=$body$
declare
  job public.notification_jobs;
begin
  if p_message_id is null or btrim(p_message_id) = '' then
    raise exception 'Provider message id required';
  end if;
  select * into job from public.notification_jobs where id = p_job for update;
  if not found or job.channel is distinct from 'ZALO' or job.status not in ('QUEUED', 'RETRYING') then
    raise exception 'Outbound job is not sendable';
  end if;
  update public.notification_jobs
  set status = 'SENT', attempts = job.attempts + 1, error_code = null,
    sent_at = clock_timestamp(), delivered_at = null,
    provider_receipt = 'ZALO_ACCEPTED', provider_message_id = left(btrim(p_message_id), 80),
    next_attempt_at = null, updated_at = clock_timestamp()
  where id = job.id;
  insert into public.notification_events(job_id, event, details)
  values (job.id, 'SENT', jsonb_build_object('state', 'ACCEPTED'));
  return 'ACCEPTED';
end $body$) then
      raise exception 'Unexpected existing definition: public.record_zalo_template_acceptance';
    end if;
  else
    execute $definition$create function public.record_zalo_template_acceptance(p_job uuid, p_message_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
begin
  if p_message_id is null or btrim(p_message_id) = '' then
    raise exception 'Provider message id required';
  end if;
  select * into job from public.notification_jobs where id = p_job for update;
  if not found or job.channel is distinct from 'ZALO' or job.status not in ('QUEUED', 'RETRYING') then
    raise exception 'Outbound job is not sendable';
  end if;
  update public.notification_jobs
  set status = 'SENT', attempts = job.attempts + 1, error_code = null,
    sent_at = clock_timestamp(), delivered_at = null,
    provider_receipt = 'ZALO_ACCEPTED', provider_message_id = left(btrim(p_message_id), 80),
    next_attempt_at = null, updated_at = clock_timestamp()
  where id = job.id;
  insert into public.notification_events(job_id, event, details)
  values (job.id, 'SENT', jsonb_build_object('state', 'ACCEPTED'));
  return 'ACCEPTED';
end $$;$definition$;
  end if;
end $recover$;

do $recover$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_zalo_template_delivery') then
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_zalo_template_delivery' and p.prosrc=$body$
declare
  job public.notification_jobs;
begin
  if p_message_id is null or btrim(p_message_id) = '' then
    raise exception 'Provider message id required';
  end if;
  select * into job from public.notification_jobs
  where channel = 'ZALO' and provider_message_id = left(btrim(p_message_id), 80)
  for update;
  if not found or job.status is distinct from 'SENT' then
    raise exception 'Accepted Zalo message not found';
  end if;
  update public.notification_jobs
  set status = 'DELIVERED', delivered_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = job.id;
  insert into public.notification_events(job_id, event, details)
  values (job.id, 'DELIVERED', jsonb_build_object('state', 'DELIVERED'));
  return 'DELIVERED';
end $body$) then
      raise exception 'Unexpected existing definition: public.record_zalo_template_delivery';
    end if;
  else
    execute $definition$create function public.record_zalo_template_delivery(p_message_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
begin
  if p_message_id is null or btrim(p_message_id) = '' then
    raise exception 'Provider message id required';
  end if;
  select * into job from public.notification_jobs
  where channel = 'ZALO' and provider_message_id = left(btrim(p_message_id), 80)
  for update;
  if not found or job.status is distinct from 'SENT' then
    raise exception 'Accepted Zalo message not found';
  end if;
  update public.notification_jobs
  set status = 'DELIVERED', delivered_at = clock_timestamp(), updated_at = clock_timestamp()
  where id = job.id;
  insert into public.notification_events(job_id, event, details)
  values (job.id, 'DELIVERED', jsonb_build_object('state', 'DELIVERED'));
  return 'DELIVERED';
end $$;$definition$;
  end if;
end $recover$;

alter table public.notification_jobs drop constraint notification_jobs_check;
alter table public.notification_jobs
  add constraint notification_jobs_check
  check ((status in ('SENT', 'DELIVERED')) = (sent_at is not null));

revoke all on function
  public.preview_registration_zalo_payload(uuid),
  public.record_zalo_template_acceptance(uuid, text),
  public.record_zalo_template_delivery(text)
from public, anon, authenticated, service_role;
grant execute on function public.preview_registration_zalo_payload(uuid) to authenticated;
grant execute on function public.record_zalo_template_acceptance(uuid, text) to service_role;
grant execute on function public.record_zalo_template_delivery(text) to service_role;

-- Phone registration confirmation for an explicit consent.
-- Does not arm sending, does not read tokens, and does not rewrite old jobs.

create table if not exists public.registration_zalo_phone_consents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.registration_applications(id),
  normalized_phone text not null check (normalized_phone ~ '^84[0-9]{9}$'),
  notice_version text not null check (notice_version = 'zbs-phone-v1'),
  source text not null check (source = 'REGISTRATION_FORM'),
  consented_at timestamptz not null default clock_timestamp(),
  actor_id uuid,
  revoked_at timestamptz
);

create unique index if not exists registration_zalo_phone_consents_open_idx
  on public.registration_zalo_phone_consents(application_id)
  where revoked_at is null;

alter table public.registration_zalo_phone_consents enable row level security;
revoke all on public.registration_zalo_phone_consents from public, anon, authenticated, service_role;
grant select on public.registration_zalo_phone_consents to service_role;

do $recover$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='notification_private' and p.proname='normalize_vn_phone') then
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='notification_private' and p.proname='normalize_vn_phone' and p.prosrc=$body$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if digits ~ '^84[0-9]{9}$' then
    return digits;
  end if;
  if digits ~ '^0[0-9]{9}$' then
    return '84' || substring(digits from 2);
  end if;
  return null;
end $body$) then
      raise exception 'Unexpected existing definition: notification_private.normalize_vn_phone';
    end if;
  else
    execute $definition$create function notification_private.normalize_vn_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if digits ~ '^84[0-9]{9}$' then
    return digits;
  end if;
  if digits ~ '^0[0-9]{9}$' then
    return '84' || substring(digits from 2);
  end if;
  return null;
end $$;$definition$;
  end if;
end $recover$;

revoke all on function notification_private.normalize_vn_phone(text) from public, anon, authenticated, service_role;

do $recover$
begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_registration_zalo_phone_consent') then
    if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_registration_zalo_phone_consent' and p.prosrc=$body$
declare
  normalized text := notification_private.normalize_vn_phone(p_phone);
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_confirmed is distinct from true then
    raise exception 'PHONE_CONSENT_REQUIRED';
  end if;
  if normalized is null then
    raise exception 'PHONE_INVALID';
  end if;
  if not exists (select 1 from public.registration_applications where id = p_application) then
    raise exception 'Registration not found';
  end if;
  update public.registration_zalo_phone_consents
  set revoked_at = clock_timestamp()
  where application_id = p_application and revoked_at is null and normalized_phone is distinct from normalized;
  insert into public.registration_zalo_phone_consents(
    application_id, normalized_phone, notice_version, source, actor_id
  )
  select p_application, normalized, 'zbs-phone-v1', 'REGISTRATION_FORM', auth.uid()
  where not exists (
    select 1 from public.registration_zalo_phone_consents
    where application_id = p_application and revoked_at is null and normalized_phone = normalized
  );
  return left(normalized, 4) || '…' || right(normalized, 3);
end $body$) then
      raise exception 'Unexpected existing definition: public.record_registration_zalo_phone_consent';
    end if;
  else
    execute $definition$create function public.record_registration_zalo_phone_consent(
  p_application uuid,
  p_phone text,
  p_confirmed boolean
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized text := notification_private.normalize_vn_phone(p_phone);
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_confirmed is distinct from true then
    raise exception 'PHONE_CONSENT_REQUIRED';
  end if;
  if normalized is null then
    raise exception 'PHONE_INVALID';
  end if;
  if not exists (select 1 from public.registration_applications where id = p_application) then
    raise exception 'Registration not found';
  end if;
  update public.registration_zalo_phone_consents
  set revoked_at = clock_timestamp()
  where application_id = p_application and revoked_at is null and normalized_phone is distinct from normalized;
  insert into public.registration_zalo_phone_consents(
    application_id, normalized_phone, notice_version, source, actor_id
  )
  select p_application, normalized, 'zbs-phone-v1', 'REGISTRATION_FORM', auth.uid()
  where not exists (
    select 1 from public.registration_zalo_phone_consents
    where application_id = p_application and revoked_at is null and normalized_phone = normalized
  );
  return left(normalized, 4) || '…' || right(normalized, 3);
end $$;$definition$;
  end if;
end $recover$;
do $$
declare
  status_check name;
begin
  select constraint_row.conname into status_check
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.notification_jobs'::regclass
    and constraint_row.contype = 'c'
    and pg_get_constraintdef(constraint_row.oid) like '%SKIPPED_NO_CHANNEL%';
  execute format('alter table public.notification_jobs drop constraint %I', status_check);
end $$;

alter table public.notification_jobs
  add constraint notification_jobs_status_check
  check (status in (
    'PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED',
    'QUEUED', 'DELIVERED', 'RETRYING', 'SKIPPED_NO_CHANNEL', 'ACCEPTANCE_UNKNOWN'
  ));

create function notification_private.registration_phone_payment_status(p_application uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case payment_option
    when 'DEPOSIT_50' then 'Đã nhận cọc 50%'
    when 'FULL' then 'Đã thanh toán đủ'
    else 'CHƯA XÁC ĐỊNH'
  end
  from public.registration_deposit_terms
  where application_id = p_application;
$$;

revoke all on function notification_private.registration_phone_payment_status(uuid) from public, anon, authenticated, service_role;

create or replace function public.enqueue_domain_notification(p_event text, p_entity uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  src record;
  link record;
  consent public.registration_zalo_phone_consents;
  created_id uuid;
  seen integer := 0;
  created integer := 0;
  subject_type text;
  subject_id uuid;
  job_status text;
  job_key text;
  phone_status text;
  parameters jsonb;
  tracking text;
begin
  if p_event is null or p_event not in (
    'REGISTRATION_COMPLETED', 'PAYMENT_CONFIRMED', 'CLASS_ASSIGNED', 'FIRST_CLASS_UPCOMING',
    'SCHEDULE_CHANGED', 'LEARNING_REPORT_PUBLISHED', 'TUITION_REMINDER', 'COURSE_EXPIRING',
    'END_OF_COURSE_REPORT_PUBLISHED'
  ) then
    raise exception 'Unsupported notification event';
  end if;
  if p_event not in (
    'PAYMENT_CONFIRMED', 'REGISTRATION_COMPLETED', 'CLASS_ASSIGNED',
    'LEARNING_REPORT_PUBLISHED', 'END_OF_COURSE_REPORT_PUBLISHED'
  ) then
    return 0;
  end if;
  select * into src from notification_private.domain_notice_source(p_event, p_entity);
  if not found then
    return 0;
  end if;
  if p_event = 'REGISTRATION_COMPLETED' then
    select * into consent
    from public.registration_zalo_phone_consents
    where application_id = p_entity and revoked_at is null
    order by consented_at desc
    limit 1;
    if found then
      phone_status := coalesce(notification_private.registration_phone_payment_status(p_entity), 'CHƯA XÁC ĐỊNH');
      parameters := src.parameters || jsonb_build_object('payment_status', phone_status);
      created_id := gen_random_uuid();
      tracking := replace(created_id::text, '-', '');
      job_key := concat_ws(':', 'domain', p_event, p_entity::text, src.template_key, 'phone', consent.id::text);
      insert into public.notification_jobs(
        id, recipient_id, student_id, branch_id, channel, delivery_mode, template_key, payload,
        entity_type, entity_id, idempotency_key, status,
        recipient_subject_type, recipient_subject_id, created_by
      ) values (
        created_id, null, src.student_id, src.branch_id, 'ZALO', 'LIVE', src.template_key,
        jsonb_build_object(
          'title', src.title,
          'href', src.href,
          'parameters', parameters,
          'delivery', jsonb_build_object(
            'channel', 'PHONE',
            'normalized_recipient', consent.normalized_phone,
            'consent_id', consent.id,
            'template_id', '640377',
            'notice_version', consent.notice_version,
            'tracking_id', tracking
          )
        ),
        p_event, p_entity, job_key, 'QUEUED', 'REGISTRATION', p_entity, auth.uid()
      ) on conflict (idempotency_key) do nothing returning id into created_id;
      if created_id is not null then
        created := 1;
        insert into public.notification_events(job_id, event, actor_id) values (created_id, 'CREATED', auth.uid());
      end if;
      return created;
    end if;
    src.parameters := src.parameters || jsonb_build_object(
      'payment_status', coalesce(notification_private.registration_phone_payment_status(p_entity), 'CHƯA XÁC ĐỊNH')
    );
  end if;
  for link in
    select * from notification_private.active_zalo_links(src.registration_id, src.parent_id, src.student_id)
  loop
    seen := seen + 1;
    created_id := null;
    insert into public.notification_jobs(
      recipient_id, student_id, branch_id, channel, delivery_mode, template_key, payload,
      entity_type, entity_id, idempotency_key, status, channel_link_id,
      recipient_subject_type, recipient_subject_id, created_by
    ) values (
      null, src.student_id, src.branch_id, 'ZALO', 'LIVE', src.template_key,
      jsonb_build_object('title', src.title, 'href', src.href, 'parameters', src.parameters),
      p_event, p_entity,
      concat_ws(':', 'domain', p_event, p_entity::text, src.template_key, link.id::text),
      'QUEUED', link.id, link.subject_type, link.subject_id, auth.uid()
    ) on conflict (idempotency_key) do nothing returning id into created_id;
    if created_id is not null then
      created := created + 1;
      insert into public.notification_events(job_id, event, actor_id) values (created_id, 'CREATED', auth.uid());
    end if;
  end loop;
  if seen = 0 then
    subject_type := case
      when src.registration_id is not null then 'REGISTRATION'
      when src.parent_id is not null then 'PARENT'
      else 'STUDENT'
    end;
    subject_id := coalesce(src.registration_id, src.parent_id, src.student_id);
    job_status := 'SKIPPED_NO_CHANNEL';
    job_key := concat_ws(':', 'domain', p_event, p_entity::text, src.template_key, 'no-channel');
    created_id := null;
    insert into public.notification_jobs(
      recipient_id, student_id, branch_id, channel, delivery_mode, template_key, payload,
      entity_type, entity_id, idempotency_key, status, error_code,
      recipient_subject_type, recipient_subject_id, created_by
    ) values (
      null, src.student_id, src.branch_id, 'ZALO', 'LIVE', src.template_key,
      jsonb_build_object('title', src.title, 'href', src.href, 'parameters', src.parameters),
      p_event, p_entity, job_key, job_status, job_status,
      subject_type, subject_id, auth.uid()
    ) on conflict (idempotency_key) do nothing returning id into created_id;
    if created_id is not null then
      created := created + 1;
      insert into public.notification_events(job_id, event, actor_id) values (created_id, 'CREATED', auth.uid());
    end if;
  end if;
  return created;
end $$;

create function public.claim_zalo_phone_send(p_job uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
begin
  select * into job from public.notification_jobs where id = p_job for update;
  if not found or job.payload->'delivery'->>'channel' is distinct from 'PHONE' then
    return 'NOT_CLAIMED';
  end if;
  if job.status = 'ACCEPTANCE_UNKNOWN' then
    return 'AMBIGUOUS';
  end if;
  if job.status in ('SENT', 'DELIVERED') then
    return 'ALREADY_ACCEPTED';
  end if;
  if job.status not in ('QUEUED', 'RETRYING') then
    return 'NOT_CLAIMED';
  end if;
  update public.notification_jobs
  set status = 'PROCESSING', attempts = job.attempts + 1, lease_token = gen_random_uuid(),
    lease_until = clock_timestamp() + interval '2 minutes', updated_at = clock_timestamp()
  where id = job.id and status in ('QUEUED', 'RETRYING');
  if not found then
    return 'NOT_CLAIMED';
  end if;
  return 'CLAIMED';
end $$;

create function public.record_zalo_phone_acceptance(p_job uuid, p_message_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_message_id is null or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    return 'INVALID';
  end if;
  update public.notification_jobs
  set status = 'SENT', error_code = null, sent_at = clock_timestamp(), delivered_at = null,
    provider_message_id = p_message_id, provider_receipt = 'ZALO_PHONE_ACCEPTED',
    lease_token = null, lease_until = null, updated_at = clock_timestamp()
  where id = p_job and status = 'PROCESSING' and payload->'delivery'->>'channel' = 'PHONE' and provider_message_id is null;
  if not found then
    return 'NOT_RECORDED';
  end if;
  insert into public.notification_events(job_id, event, details)
  values (p_job, 'SENT', jsonb_build_object('state', 'ACCEPTED', 'channel', 'PHONE'));
  return 'ACCEPTED';
end $$;

create function public.mark_zalo_phone_ambiguous(p_job uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notification_jobs
  set status = 'ACCEPTANCE_UNKNOWN', error_code = 'PROVIDER_TIMEOUT',
    lease_token = null, lease_until = null, updated_at = clock_timestamp()
  where id = p_job and status = 'PROCESSING' and payload->'delivery'->>'channel' = 'PHONE' and provider_message_id is null;
  if not found then
    return 'NOT_MARKED';
  end if;
  insert into public.notification_events(job_id, event, details)
  values (p_job, 'FAILED', jsonb_build_object('state', 'ACCEPTANCE_UNKNOWN'));
  return 'AMBIGUOUS';
end $$;

create function public.record_zalo_phone_rejection(p_job uuid, p_error text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_error not in ('PROVIDER_REJECTED', 'ZALO_TOKEN_EXPIRED', 'ZALO_OUTBOUND_NOT_CONFIGURED') then
    return 'INVALID';
  end if;
  update public.notification_jobs
  set status = 'FAILED', error_code = p_error, lease_token = null, lease_until = null, updated_at = clock_timestamp()
  where id = p_job and status = 'PROCESSING' and payload->'delivery'->>'channel' = 'PHONE' and provider_message_id is null;
  if not found then
    return 'NOT_RECORDED';
  end if;
  return 'REJECTED';
end $$;

create function public.record_zalo_phone_delivery(
  p_message_id text,
  p_tracking_id text,
  p_recipient_phone text,
  p_sender_id text,
  p_delivery_time text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
  device_time timestamptz;
begin
  if p_sender_id is null or p_recipient_phone is null or p_recipient_phone = p_sender_id then
    return 'IGNORED';
  end if;
  if p_recipient_phone !~ '^84[0-9]{9}$' or p_delivery_time !~ '^[0-9]{10,16}$' then
    return 'IGNORED';
  end if;
  device_time := to_timestamp(p_delivery_time::numeric / 1000.0);
  select * into job
  from public.notification_jobs
  where channel = 'ZALO'
    and provider_message_id = p_message_id
    and payload->'delivery'->>'tracking_id' = p_tracking_id
    and payload->'delivery'->>'normalized_recipient' = p_recipient_phone
    and payload->'delivery'->>'channel' = 'PHONE'
  for update;
  if not found then
    return 'IGNORED';
  end if;
  if job.status = 'DELIVERED' then
    return 'IDEMPOTENT';
  end if;
  if job.status is distinct from 'SENT' then
    return 'IGNORED';
  end if;
  update public.notification_jobs
  set status = 'DELIVERED', delivered_at = device_time, updated_at = clock_timestamp()
  where id = job.id and status = 'SENT';
  insert into public.notification_events(job_id, event, details)
  values (job.id, 'DELIVERED', jsonb_build_object('state', 'DELIVERED', 'delivery_time', p_delivery_time));
  return 'DELIVERED';
end $$;


create or replace function public.registration_zalo_phone_status(p_application uuid)
returns table(masked_phone text, consent_present boolean, notice_version text, blocked_reason text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  consent public.registration_zalo_phone_consents;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  select * into consent
  from public.registration_zalo_phone_consents
  where application_id = p_application and revoked_at is null;
  return query select
    case when consent.id is null then null else left(consent.normalized_phone, 4) || '…' || right(consent.normalized_phone, 3) end,
    consent.id is not null,
    consent.notice_version,
    case when consent.id is null then 'NO_CONSENT' else null end;
end $$;

drop function if exists public.preview_zalo_dispatch_decision(bigint);

create function public.preview_zalo_dispatch_decision(p_order_code bigint)
returns table(decision text, job_id uuid, provider_user_id text, idempotency_key text, parameters jsonb, delivery_channel text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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
    when 'DEPOSIT_50' then 'Đã nhận cọc 50%'
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
  if job.status not in ('QUEUED', 'RETRYING') then
    return query select 'NOT_SENDABLE', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  return query select 'SEND', job.id, target.normalized_phone, job.idempotency_key, job.payload->'parameters', 'PHONE'::text;
end $$;

revoke all on function public.preview_zalo_dispatch_decision(bigint) from public, anon, authenticated, service_role;
grant execute on function public.preview_zalo_dispatch_decision(bigint) to service_role;

create or replace function public.preview_registration_zalo_payload(p_application uuid)
returns table(
  customer_name text,
  registration_code text,
  student_name text,
  program_name text,
  branch_name text,
  order_code text,
  payment_status text,
  registration_completed boolean,
  tuition_fully_paid boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  app public.registration_applications;
  terms public.registration_deposit_terms;
  paid bigint;
  sent_status text;
  sent_order text;
begin
  if auth.uid() is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  select * into app from public.registration_applications where id = p_application;
  if not found then
    raise exception 'Registration not found';
  end if;
  select * into terms from public.registration_deposit_terms where application_id = app.id;
  select coalesce(sum(ord.attributed_amount), 0) into paid
  from public.registration_payos_orders ord
  where ord.application_id = app.id and ord.state = 'PAID';
  select job.payload->'parameters'->>'payment_status', job.payload->'parameters'->>'order_code'
    into sent_status, sent_order
  from public.notification_jobs job
  where job.entity_id = app.id and job.payload->'delivery'->>'channel' = 'PHONE'
  order by job.created_at desc
  limit 1;
  return query
  select
    left(coalesce(app.parent_name, 'Phụ huynh'), 80),
    app.application_code,
    left(coalesce(app.student_name, 'Học viên'), 80),
    left(coalesce(curriculum.name, app.program_interest, 'Chương trình đã đăng ký'), 80),
    left(branch.name, 80),
    coalesce(sent_order, app.application_code),
    coalesce(sent_status, notification_private.registration_phone_payment_status(app.id), 'CHƯA XÁC ĐỊNH'),
    app.status = 'COMPLETED',
    terms.tuition_amount is not null and paid >= terms.tuition_amount
  from public.branches branch
  left join public.curriculums curriculum on curriculum.id = app.curriculum_id
  where branch.id = app.branch_id;
end $$;

revoke all on function public.record_registration_zalo_phone_consent(uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.registration_zalo_phone_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_zalo_phone_send(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_zalo_phone_acceptance(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.mark_zalo_phone_ambiguous(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_zalo_phone_rejection(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.record_zalo_phone_delivery(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_zalo_dispatch_decision(bigint) from public, anon, authenticated, service_role;
grant execute on function public.record_registration_zalo_phone_consent(uuid, text, boolean) to authenticated;
grant execute on function public.registration_zalo_phone_status(uuid) to authenticated;
grant execute on function public.claim_zalo_phone_send(uuid) to service_role;
grant execute on function public.record_zalo_phone_acceptance(uuid, text) to service_role;
grant execute on function public.mark_zalo_phone_ambiguous(uuid) to service_role;
grant execute on function public.record_zalo_phone_rejection(uuid, text) to service_role;
grant execute on function public.record_zalo_phone_delivery(text, text, text, text, text) to service_role;
grant execute on function public.preview_zalo_dispatch_decision(bigint) to service_role;


-- Reviewed source: 20260927010000_zalo_failure_diagnostics_v1.sql
-- Preserve provider error numbers without storing response bodies, tokens or phone numbers.
-- Existing callers and grants remain compatible. No job is requeued or sent here.
create or replace function public.record_zalo_phone_rejection(p_job uuid, p_error text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare provider_error integer;
begin
  if p_error is null or (p_error not in (
    'PROVIDER_REJECTED', 'ZALO_TOKEN_EXPIRED', 'ZALO_TOKEN_INVALID',
    'ZALO_OUTBOUND_NOT_CONFIGURED', 'RECIPIENT_INELIGIBLE'
  ) and p_error !~ '^ZALO_PROVIDER_-?[0-9]{1,6}$') then
    return 'INVALID';
  end if;
  if p_error = 'ZALO_TOKEN_INVALID' then provider_error := -124;
  elsif p_error ~ '^ZALO_PROVIDER_' then provider_error := substring(p_error from 15)::integer;
  end if;
  update public.notification_jobs
  set status = 'FAILED', error_code = p_error, lease_token = null,
    lease_until = null, updated_at = clock_timestamp()
  where id = p_job and status = 'PROCESSING'
    and payload->'delivery'->>'channel' = 'PHONE' and provider_message_id is null;
  if not found then return 'NOT_RECORDED'; end if;
  insert into public.notification_events(job_id, event, details)
  values (p_job, 'FAILED', jsonb_strip_nulls(jsonb_build_object(
    'channel', 'PHONE', 'error_code', p_error, 'provider_error', provider_error)));
  return 'REJECTED';
end $$;
revoke all on function public.record_zalo_phone_rejection(uuid,text) from public, anon, authenticated;
grant execute on function public.record_zalo_phone_rejection(uuid,text) to service_role;

-- Reviewed source: 20260927020000_zalo_durable_recovery_v1.sql
-- Server-only rotating OA credentials. Never exposed through authenticated RPCs.
create table notification_private.zalo_credentials (
 app_id text not null, oa_id text not null, primary key(app_id,oa_id),
 access_token text, refresh_token text, expires_at timestamptz,
 version bigint not null default 1,
 state text not null check(state in ('READY','VERIFYING','NEEDS_REFRESH','REFRESHING','UNCERTAIN','REAUTH_REQUIRED','PROOF_INVALID')),
 operation_id uuid, operation_started_at timestamptz, committed_operation uuid,
 error_code text, updated_at timestamptz not null default clock_timestamp()
);
alter table notification_private.zalo_credentials enable row level security;
revoke all on notification_private.zalo_credentials from public,anon,authenticated,service_role;

create function public.zalo_credential_command(
 p_action text, p_app text, p_oa text, p_version bigint default null,
 p_operation uuid default null, p_access text default null, p_refresh text default null,
 p_expires_at timestamptz default null, p_error text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c notification_private.zalo_credentials; result jsonb;
begin
 if p_app is null or p_app !~ '^[0-9]{8,32}$' or p_oa is null or p_oa !~ '^[0-9]{8,32}$' then raise exception 'INVALID_IDENTITY'; end if;
 if p_action='BOOTSTRAP' then
  insert into notification_private.zalo_credentials(app_id,oa_id,access_token,refresh_token,expires_at,state,error_code)
  values(p_app,p_oa,nullif(p_access,''),nullif(p_refresh,''),p_expires_at,
   case when nullif(p_refresh,'') is null then 'REAUTH_REQUIRED' else 'NEEDS_REFRESH' end,
   case when nullif(p_refresh,'') is null then 'ZALO_REFRESH_TOKEN_MISSING' else null end)
  on conflict do nothing;
 end if;
 select * into c from notification_private.zalo_credentials where app_id=p_app and oa_id=p_oa for update;
 if p_action='READ' or p_action='BOOTSTRAP' then
  if c.app_id is null then return null; end if;
  return to_jsonb(c);
 end if;
 if p_action='REPLACE' and c.app_id is null and p_version=0 then
  insert into notification_private.zalo_credentials(app_id,oa_id,state) values(p_app,p_oa,'REAUTH_REQUIRED') on conflict do nothing;
  select * into c from notification_private.zalo_credentials where app_id=p_app and oa_id=p_oa for update;
  if c.version<>1 or c.access_token is not null then return jsonb_build_object('state','STALE'); end if;
 elsif c.version is distinct from p_version then return jsonb_build_object('state','STALE');
 end if;
 if p_action='CLAIM' then
  -- A lease is never stolen: a single-use refresh may already have been consumed.
  if c.state not in ('READY','NEEDS_REFRESH') or c.operation_id is not null then return jsonb_build_object('state','BUSY_OR_BLOCKED'); end if;
  if c.refresh_token is null or p_operation is null then return jsonb_build_object('state','REAUTH_REQUIRED'); end if;
  update notification_private.zalo_credentials set state='REFRESHING',operation_id=p_operation,
   operation_started_at=clock_timestamp(),error_code=null,updated_at=clock_timestamp() where app_id=p_app and oa_id=p_oa;
  return jsonb_build_object('state','CLAIMED');
 elsif p_action='COMMIT' then
  if c.committed_operation=p_operation and c.state='READY' then return jsonb_build_object('state','COMMITTED'); end if;
  if c.state<>'REFRESHING' or c.operation_id is distinct from p_operation then return jsonb_build_object('state','STALE'); end if;
 elsif p_action='REPLACE' then
  if c.refresh_token is not null and c.refresh_token=p_refresh then return jsonb_build_object('state','REAUTH_REQUIRED'); end if;
  -- Reauthorization must not race an in-flight refresh. An old uncertain lock can
  -- only be replaced explicitly after the 15s network timeout has passed.
  if c.state='REFRESHING' and c.operation_started_at>clock_timestamp()-interval '1 minute' then return jsonb_build_object('state','BUSY'); end if;
 elsif p_action='VERIFY' then
  if c.state<>'VERIFYING' then return jsonb_build_object('state','STALE'); end if;
  update notification_private.zalo_credentials set state='READY',error_code=null,updated_at=clock_timestamp() where app_id=p_app and oa_id=p_oa;
  return jsonb_build_object('state','VERIFIED');
 elsif p_action='BLOCK' then
  if p_error is null or p_error not in ('ZALO_TOKEN_INVALID','ZALO_PROOF_INVALID','ZALO_REFRESH_UNCERTAIN','ZALO_RECONNECT_REQUIRED','ZALO_REFRESH_TOKEN_MISSING') then raise exception 'INVALID_ERROR'; end if;
  if p_operation is null and c.state='REFRESHING' then return jsonb_build_object('state','STALE'); end if;
  if p_operation is not null and c.operation_id is distinct from p_operation then return jsonb_build_object('state','STALE'); end if;
  update notification_private.zalo_credentials set state=case
   when p_error='ZALO_TOKEN_INVALID' and refresh_token is not null then 'NEEDS_REFRESH'
   when p_error='ZALO_PROOF_INVALID' then 'PROOF_INVALID'
   when p_error='ZALO_REFRESH_UNCERTAIN' then 'UNCERTAIN' else 'REAUTH_REQUIRED' end,
   error_code=p_error,updated_at=clock_timestamp() where app_id=p_app and oa_id=p_oa;
  return jsonb_build_object('state','BLOCKED');
 else raise exception 'INVALID_COMMAND';
 end if;
 if nullif(btrim(p_access),'') is null or nullif(btrim(p_refresh),'') is null or length(p_access)>8192 or length(p_refresh)>8192 then raise exception 'INVALID_CREDENTIAL_PAIR'; end if;
 if p_action='COMMIT' and (p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '26 hours') then raise exception 'INVALID_EXPIRY'; end if;
 update notification_private.zalo_credentials set access_token=p_access,refresh_token=p_refresh,expires_at=p_expires_at,
  version=c.version+1,state=case when p_action='REPLACE' then 'NEEDS_REFRESH' else 'VERIFYING' end,
  operation_id=null,operation_started_at=null,committed_operation=p_operation,error_code=null,updated_at=clock_timestamp()
 where app_id=p_app and oa_id=p_oa;
 return jsonb_build_object('state','COMMITTED');
end $$;
revoke all on function public.zalo_credential_command(text,text,text,bigint,uuid,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.zalo_credential_command(text,text,text,bigint,uuid,text,text,timestamptz,text) to service_role;

create table public.zalo_notification_attempts (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.notification_jobs(id),
 attempt_number integer not null, credential_version bigint not null,
 state text not null check(state in ('REQUESTING','REJECTED','ACCEPTED','UNKNOWN')),
 started_at timestamptz not null default clock_timestamp(), completed_at timestamptz,
 http_status integer check(http_status between 100 and 599), provider_error integer,
 error_code text, provider_message_id text check(provider_message_id ~ '^[A-Za-z0-9_-]{1,80}$'),
 unique(job_id,attempt_number)
);
alter table public.zalo_notification_attempts enable row level security;
revoke all on public.zalo_notification_attempts from public,anon,authenticated,service_role;
grant select on public.zalo_notification_attempts to authenticated;
create policy zalo_attempt_admin_read on public.zalo_notification_attempts for select to authenticated using(public.has_role('SUPER_ADMIN'));

-- The database repeats business/recipient/template checks while claiming the job.
-- Preserve the phone authorization contract introduced in 20260925210000.
create function notification_private.zalo_retry_eligible(p_job uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select j.status='FAILED' and j.attempts<5 and j.sent_at is null and j.delivered_at is null
 and j.provider_message_id is null and j.payload->'delivery'->>'channel'='PHONE'
 and j.entity_type='REGISTRATION_COMPLETED' and j.channel='ZALO'
 and (
   exists(select 1 from zalo_notification_attempts a where a.job_id=j.id and a.attempt_number=j.attempts and a.state='REJECTED')
   -- Legacy evidence is narrow and explicit: the saved, definitive -124 response.
   -- A generic FAILED job or absent message ID is not evidence of rejection.
   or (j.attempts=1 and not exists(select 1 from zalo_notification_attempts a where a.job_id=j.id)
     and (select e.details->>'provider_error' from notification_events e where e.job_id=j.id order by e.created_at desc,e.id desc limit 1)='-124'
     and j.error_code='ZALO_TOKEN_INVALID')
 ) from notification_jobs j where j.id=p_job
$$;
revoke all on function notification_private.zalo_retry_eligible(uuid) from public,anon,authenticated,service_role;

create function public.prepare_zalo_registration_retry(p_job uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs; ord bigint; decision record;
begin
 if auth.uid() is null or not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 select * into j from notification_jobs where id=p_job for update;
 if not (coalesce(notification_private.zalo_retry_eligible(p_job),false) or (j.status='QUEUED' and j.channel='ZALO' and j.entity_type='REGISTRATION_COMPLETED' and j.payload->'delivery'->>'channel'='PHONE' and j.attempts<5)) then return jsonb_build_object('state','ZALO_RETRY_DENIED'); end if;
 select order_code into ord from registration_payos_orders where application_id=j.entity_id and state='PAID' order by paid_at desc limit 1;
 perform set_config('zalo.durable_write','on',true);
 update notification_jobs set status='QUEUED',error_code=null,lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
 select * into decision from preview_zalo_dispatch_decision(ord);
 if decision.decision is distinct from 'SEND' or decision.job_id is distinct from j.id then
  update notification_jobs set status=j.status,error_code=j.error_code where id=j.id;
  return jsonb_build_object('state',coalesce(decision.decision,'ZALO_RETRY_DENIED'));
 end if;
 insert into notification_events(job_id,event,actor_id,details) values(j.id,'RETRY',auth.uid(),jsonb_build_object('source','MANUAL','previous_error',j.error_code));
 return jsonb_build_object('state','QUEUED','orderCode',ord);
end $$;
revoke all on function public.prepare_zalo_registration_retry(uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_zalo_registration_retry(uuid) to authenticated;

create function public.claim_zalo_registration_attempt(p_order_code bigint,p_version bigint,p_app text,p_oa text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs; decision record; attempt uuid:=gen_random_uuid(); expected jsonb; src record; c notification_private.zalo_credentials;
begin
 select * into decision from preview_zalo_dispatch_decision(p_order_code);
 if decision.decision is distinct from 'SEND' then return jsonb_build_object('state',coalesce(decision.decision,'NOT_CLAIMED')); end if;
 select * into j from notification_jobs where id=decision.job_id for update;
 -- Locks hold current eligibility steady until the claim commits.
 perform 1 from registration_applications where id=j.entity_id for share;
 perform 1 from registration_deposit_terms where application_id=j.entity_id for share;
 perform 1 from registration_payos_orders where application_id=j.entity_id for share;
 perform 1 from registration_zalo_phone_consents where application_id=j.entity_id and revoked_at is null for share;
 perform 1 from notification_templates where template_key=j.template_key for share;
 select * into decision from preview_zalo_dispatch_decision(p_order_code);
 if decision.decision is distinct from 'SEND' or j.attempts>=5 then return jsonb_build_object('state','NOT_CLAIMED'); end if;
 if j.provider_message_id is not null or j.sent_at is not null or exists(select 1 from zalo_notification_attempts where job_id=j.id and state in ('REQUESTING','UNKNOWN','ACCEPTED')) then return jsonb_build_object('state','AMBIGUOUS'); end if;
 if j.payload->'delivery'->>'template_id' is distinct from '640377' or not exists(select 1 from notification_templates where template_key=j.template_key and provider='ZALO' and status='APPROVED' and provider_template_id='640377') then return jsonb_build_object('state','PAYLOAD_REJECTED'); end if;
 select * into src from notification_private.domain_notice_source('REGISTRATION_COMPLETED',j.entity_id);
 expected:=src.parameters||jsonb_build_object('payment_status',notification_private.registration_phone_payment_status(j.entity_id));
 if expected is null or expected is distinct from j.payload->'parameters' then return jsonb_build_object('state','PAYLOAD_REJECTED'); end if;
 if not exists(select 1 from registration_zalo_phone_consents where id::text=j.payload->'delivery'->>'consent_id' and application_id=j.entity_id and revoked_at is null and normalized_phone=decision.provider_user_id) then return jsonb_build_object('state','NO_CONSENT'); end if;
 select * into c from notification_private.zalo_credentials where app_id=p_app and oa_id=p_oa for share;
 if c.version is distinct from p_version or c.state is distinct from 'READY' or c.refresh_token is null or c.expires_at is null or c.expires_at<=clock_timestamp()+interval '30 seconds' then return jsonb_build_object('state','ZALO_CREDENTIAL_CHANGED'); end if;
 perform set_config('zalo.durable_write','on',true);
 insert into zalo_notification_attempts(id,job_id,attempt_number,credential_version,state) values(attempt,j.id,j.attempts+1,p_version,'REQUESTING');
 update notification_jobs set status='PROCESSING',attempts=attempts+1,lease_token=attempt,lease_until=clock_timestamp()+interval '2 minutes',error_code=null,updated_at=clock_timestamp() where id=j.id;
 insert into notification_events(job_id,event,details) values(j.id,'CLAIMED',jsonb_build_object('attempt_id',attempt,'credential_version',p_version));
 return jsonb_build_object('state','CLAIMED','attemptId',attempt,'jobId',j.id,'phone',decision.provider_user_id,'parameters',decision.parameters);
end $$;

create function public.finish_zalo_registration_attempt(p_attempt uuid,p_state text,p_http integer default null,p_provider_error integer default null,p_message_id text default null,p_error text default null) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare a zalo_notification_attempts; j notification_jobs;
begin
 select * into a from zalo_notification_attempts where id=p_attempt;
 if not found then return 'NOT_RECORDED'; end if;
 select * into j from notification_jobs where id=a.job_id for update;
 select * into a from zalo_notification_attempts where id=p_attempt for update;
 if a.state=p_state and a.state<>'REQUESTING' then return a.state; end if;
 if a.state<>'REQUESTING' or j.status<>'PROCESSING' or j.lease_token is distinct from a.id then return 'NOT_RECORDED'; end if;
 if p_state is null or p_state not in ('ACCEPTED','REJECTED','UNKNOWN') then return 'INVALID'; end if;
 if p_state='ACCEPTED' and (p_message_id is null or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$') then return 'INVALID'; end if;
 if p_state='REJECTED' and (p_provider_error is null or p_provider_error <> all(array[-101,-103,-104,-106,-107,-108,-109,-110,-111,-112,-1121,-1122,-1123,-1124,-113,-1131,-115,-116,-117,-118,-120,-1202,-121,-122,-124,-1241,-125,-126,-127,-130,-131,-132,-135,-1351,-136,-137,-138,-1381,-139,-140,-141,-142,-143,-144,-1441,-145,-147,-1471,-1472,-148,-149,-1491,-150,-151,-152,-153,-158,-159,-160,-161,-162,-249])) then return 'INVALID'; end if;
 if p_error is not null and p_error !~ '^ZALO_[A-Z0-9_-]{1,64}$' then return 'INVALID'; end if;
 perform set_config('zalo.durable_write','on',true);
 update zalo_notification_attempts set state=p_state,completed_at=clock_timestamp(),http_status=p_http,provider_error=p_provider_error,provider_message_id=p_message_id,error_code=p_error where id=a.id;
 update notification_jobs set status=case p_state when 'ACCEPTED' then 'SENT' when 'REJECTED' then 'FAILED' else 'ACCEPTANCE_UNKNOWN' end,
  sent_at=case when p_state='ACCEPTED' then clock_timestamp() end,
  provider_message_id=p_message_id,provider_receipt=case when p_state='ACCEPTED' then 'ZALO_PHONE_ACCEPTED' end,
  error_code=case when p_state='UNKNOWN' then 'ZALO_ACCEPTANCE_UNKNOWN' else p_error end,
  lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
 insert into notification_events(job_id,event,details) values(j.id,case p_state when 'ACCEPTED' then 'SENT' else 'FAILED' end,
  jsonb_build_object('attempt_id',a.id,'state',p_state,'http_status',p_http,'provider_error',p_provider_error,'error_code',p_error));
 return p_state;
end $$;

create function public.block_zalo_registration_job(p_job uuid,p_error text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_error is null or p_error !~ '^ZALO_[A-Z_]{1,64}$' then return 'INVALID'; end if;
 update notification_jobs set error_code=p_error,updated_at=clock_timestamp() where id=p_job and status in('QUEUED','RETRYING') and channel='ZALO' and payload->'delivery'->>'channel'='PHONE' and error_code is distinct from p_error;
 if found then insert into notification_events(job_id,event,details) values(p_job,'BLOCKED',jsonb_build_object('error_code',p_error,'request_sent',false)); end if;
 return 'BLOCKED';
end $$;

-- Old retry/settle paths cannot accidentally erase ambiguity or phone history.
create function notification_private.guard_phone_attempt() returns trigger language plpgsql as $$
begin
 if old.channel='ZALO' and old.payload->'delivery'->>'channel'='PHONE' then
  if old.status in('SENT','DELIVERED','ACCEPTANCE_UNKNOWN') and new.status is distinct from old.status and not(old.status='SENT' and new.status='DELIVERED') then raise exception 'PHONE_RECONCILIATION_REQUIRED'; end if;
  if new.status is distinct from old.status and new.status in('PENDING','QUEUED','RETRYING','PROCESSING','SKIPPED_NO_CHANNEL','SENT','FAILED','ACCEPTANCE_UNKNOWN') and current_setting('zalo.durable_write',true) is distinct from 'on' then raise exception 'USE_DURABLE_PHONE_DISPATCH'; end if;
 end if;
 return new;
end $$;
create trigger notification_phone_durable_guard before update on notification_jobs for each row execute function notification_private.guard_phone_attempt();
revoke all on function notification_private.guard_phone_attempt() from public,anon,authenticated,service_role;
revoke all on function public.claim_zalo_phone_send(uuid),public.record_zalo_phone_acceptance(uuid,text),public.record_zalo_phone_rejection(uuid,text),public.mark_zalo_phone_ambiguous(uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_zalo_registration_attempt(bigint,bigint,text,text),public.finish_zalo_registration_attempt(uuid,text,integer,integer,text,text),public.block_zalo_registration_job(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_zalo_registration_attempt(bigint,bigint,text,text),public.finish_zalo_registration_attempt(uuid,text,integer,integer,text,text),public.block_zalo_registration_job(uuid,text) to service_role;

-- Stale REQUESTING is rendered as outcome unknown and is never reclaimable.
-- Owner confirmation remains independent of authenticated delivery evidence.
create table public.zalo_owner_receipts(job_id uuid primary key references notification_jobs(id),confirmed_by uuid not null,confirmed_at timestamptz not null default clock_timestamp());
alter table public.zalo_owner_receipts enable row level security;
revoke all on public.zalo_owner_receipts from public,anon,authenticated,service_role;
grant select on public.zalo_owner_receipts to authenticated;
create policy zalo_owner_receipts_admin_read on public.zalo_owner_receipts for select to authenticated using(public.has_role('SUPER_ADMIN'));
create function public.confirm_zalo_owner_receipt(p_job uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if not exists(select 1 from notification_jobs where id=p_job and channel='ZALO' and status in('SENT','DELIVERED','ACCEPTANCE_UNKNOWN')) then return false; end if;
 insert into zalo_owner_receipts(job_id,confirmed_by) values(p_job,auth.uid()) on conflict do nothing;
 return true;
end $$;
revoke all on function public.confirm_zalo_owner_receipt(uuid) from public,anon,authenticated,service_role;
grant execute on function public.confirm_zalo_owner_receipt(uuid) to authenticated;

commit;
