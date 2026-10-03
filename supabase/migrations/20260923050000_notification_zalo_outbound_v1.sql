-- Provider-neutral outbound foundation.
-- Reuses notification_jobs. Does not call Zalo and does not store tokens.

alter table public.notification_jobs
  alter column recipient_id drop not null;

alter table public.notification_jobs
  add column channel_link_id uuid references public.customer_channel_links(id),
  add column recipient_subject_type text,
  add column recipient_subject_id uuid,
  add column next_attempt_at timestamptz,
  add column delivered_at timestamptz,
  add column provider_message_id text;

do $$
declare
  status_check name;
begin
  select constraint_row.conname
  into status_check
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.notification_jobs'::regclass
    and constraint_row.contype = 'c'
    and pg_get_constraintdef(constraint_row.oid) like '%PENDING%PROCESSING%SENT%';
  execute format('alter table public.notification_jobs drop constraint %I', status_check);
end $$;

alter table public.notification_jobs
  add constraint notification_jobs_status_check
  check (status in (
    'PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED',
    'QUEUED', 'DELIVERED', 'RETRYING', 'SKIPPED_NO_CHANNEL'
  ));

alter table public.notification_jobs
  add constraint notification_jobs_recipient_check
  check (recipient_id is not null or channel = 'ZALO');

alter table public.notification_jobs
  add constraint notification_jobs_subject_check
  check (
    (recipient_subject_type is null and recipient_subject_id is null)
    or (
      recipient_subject_type in ('PROFILE', 'REGISTRATION', 'PARENT', 'STUDENT')
      and recipient_subject_id is not null
    )
  );

alter table public.notification_jobs
  add constraint notification_jobs_delivered_check
  check (status <> 'DELIVERED' or (delivered_at is not null and sent_at is not null));

alter table public.notification_jobs
  add constraint notification_jobs_retry_check
  check (status <> 'RETRYING' or next_attempt_at is not null);

alter table public.notification_jobs
  add constraint notification_jobs_provider_message_check
  check (provider_message_id is null or provider_message_id ~ '^[A-Za-z0-9_-]{1,80}$');

create index notification_jobs_domain_idx
  on public.notification_jobs(entity_type, entity_id, template_key);

create table public.notification_templates (
  template_key text primary key,
  provider text not null check (provider in ('ZALO', 'EMAIL', 'IN_APP')),
  provider_template_id text,
  status text not null check (status in ('DRAFT', 'APPROVED', 'DISABLED')),
  version integer not null default 1 check (version > 0),
  description text not null,
  parameter_schema jsonb not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  check (provider_template_id is null or provider_template_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  check (enabled = false or (status = 'APPROVED' and provider_template_id is not null)),
  check (jsonb_typeof(parameter_schema) = 'array')
);

insert into public.notification_templates(template_key, provider, status, description, parameter_schema)
values
  ('ZALO_REGISTRATION_CONFIRMED', 'ZALO', 'DRAFT', 'Xác nhận đăng ký', '["student_display_name","program_name","branch_name","portal_url"]'::jsonb),
  ('ZALO_PAYMENT_CONFIRMED', 'ZALO', 'DRAFT', 'Xác nhận thanh toán', '["student_display_name","amount_display","payment_reference","portal_url"]'::jsonb),
  ('ZALO_CLASS_ASSIGNED', 'ZALO', 'DRAFT', 'Xác nhận xếp lớp', '["student_display_name","class_name","teacher_display_name","start_date","schedule_display","portal_url"]'::jsonb),
  ('ZALO_LEARNING_REPORT_PUBLISHED', 'ZALO', 'DRAFT', 'Báo cáo học tập', '["student_display_name","report_period","secure_report_url"]'::jsonb),
  ('ZALO_TUITION_REMINDER', 'ZALO', 'DRAFT', 'Nhắc học phí', '["student_display_name","due_date","amount_due_display","secure_payment_url"]'::jsonb),
  ('ZALO_COURSE_EXPIRING', 'ZALO', 'DRAFT', 'Sắp hết khóa', '["student_display_name","remaining_sessions","portal_url"]'::jsonb);

alter table public.notification_templates enable row level security;
revoke all on public.notification_templates from public, anon, authenticated, service_role;
grant select on public.notification_templates to authenticated;
create policy notification_templates_admin_read
  on public.notification_templates
  for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create policy notification_branch_read
  on public.notification_jobs
  for select to authenticated
  using (branch_id is not null and public.registration_can('registration.view', branch_id));

create function notification_private.active_zalo_links(
  p_registration uuid,
  p_parent uuid,
  p_student uuid
) returns table(id uuid, subject_type text, subject_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select picked.id, picked.subject_type, picked.subject_id
  from (
    select distinct on (channel.provider_user_id)
      channel.id,
      case
        when channel.registration_application_id is not null then 'REGISTRATION'
        when channel.parent_id is not null then 'PARENT'
        else 'STUDENT'
      end as subject_type,
      coalesce(channel.registration_application_id, channel.parent_id, channel.student_id) as subject_id
    from public.customer_channel_links channel
    where channel.provider = 'ZALO'
      and channel.status = 'ACTIVE'
      and channel.provider_user_id is not null
      and (
        (p_registration is not null and channel.registration_application_id = p_registration)
        or (p_parent is not null and channel.parent_id = p_parent)
        or (p_student is not null and channel.student_id = p_student)
      )
    order by channel.provider_user_id, channel.created_at
  ) picked
$$;

create function notification_private.domain_notice_source(p_event text, p_entity uuid)
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
      'Đăng ký đã hoàn tất'::text,
      '/my-learning'::text,
      jsonb_build_object(
        'student_display_name', left(coalesce(app.student_name, 'Học viên'), 80),
        'program_name', left(coalesce(course.name, 'Chương trình đã đăng ký'), 80),
        'branch_name', left(branch.name, 80),
        'portal_url', '/my-learning'
      )
    from public.registration_applications app
    join public.branches branch on branch.id = app.branch_id
    left join public.courses course on course.id = app.course_id
    where app.id = p_entity
      and app.status = 'COMPLETED';
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

create function public.enqueue_domain_notification(p_event text, p_entity uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  src record;
  link record;
  created_id uuid;
  seen integer := 0;
  created integer := 0;
  subject_type text;
  subject_id uuid;
  job_status text;
  job_key text;
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

create function notification_private.refresh_zalo_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
  src record;
  link record;
begin
  select * into job from public.notification_jobs where id = p_job for update;
  if not found or job.channel is distinct from 'ZALO' then
    raise exception 'Invalid notification transition';
  end if;
  if job.status = 'FAILED' and coalesce(job.error_code, '') in (
    'ZALO_OUTBOUND_NOT_CONFIGURED', 'TEMPLATE_NOT_APPROVED', 'PROVIDER_NOT_CONFIGURED', 'RECIPIENT_INELIGIBLE'
  ) then
    raise exception 'Invalid notification transition';
  end if;
  if job.attempts >= 5 or job.status not in ('FAILED', 'SKIPPED_NO_CHANNEL', 'RETRYING') then
    raise exception 'Invalid notification transition';
  end if;
  select * into src from notification_private.domain_notice_source(job.entity_type, job.entity_id);
  if not found then
    update public.notification_jobs
    set status = 'FAILED', error_code = 'RECIPIENT_INELIGIBLE', next_attempt_at = null, updated_at = now()
    where id = job.id;
    return;
  end if;
  select * into link
  from notification_private.active_zalo_links(src.registration_id, src.parent_id, src.student_id)
  limit 1;
  if not found then
    update public.notification_jobs
    set status = 'SKIPPED_NO_CHANNEL', error_code = 'SKIPPED_NO_CHANNEL', channel_link_id = null,
      next_attempt_at = null, updated_at = now()
    where id = job.id;
    return;
  end if;
  update public.notification_jobs
  set status = 'QUEUED', error_code = null, channel_link_id = link.id,
    recipient_subject_type = link.subject_type, recipient_subject_id = link.subject_id,
    next_attempt_at = null, sent_at = null, provider_receipt = null, provider_message_id = null,
    updated_at = now()
  where id = job.id;
end $$;

create or replace function public.manage_notification(p_job uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.notification_jobs;
begin
  if not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  select * into j from public.notification_jobs where id = p_job for update;
  if not found then
    raise exception 'Job not found';
  end if;
  if p_action = 'RETRY' and j.channel = 'ZALO' then
    perform notification_private.refresh_zalo_job(j.id);
  elsif p_action = 'RETRY' and (j.status = 'FAILED' or (j.status = 'PROCESSING' and j.lease_until < now())) then
    update public.notification_jobs
    set status = 'PENDING', lease_token = null, lease_until = null, error_code = null, updated_at = now()
    where id = j.id;
  elsif p_action = 'CANCEL' and j.status in ('PENDING', 'FAILED', 'QUEUED', 'RETRYING', 'SKIPPED_NO_CHANNEL') then
    update public.notification_jobs
    set status = 'CANCELLED', next_attempt_at = null, updated_at = now()
    where id = j.id;
  else
    raise exception 'Invalid notification transition';
  end if;
  insert into public.notification_events(job_id, event, actor_id) values (j.id, p_action, auth.uid());
end $$;

create function public.settle_outbound_notification(p_job uuid, p_error text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
  next_attempts integer;
  next_status text;
begin
  if p_error is null or btrim(p_error) = '' then
    raise exception 'Live Zalo send is disabled';
  end if;
  if p_error not in (
    'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'ZALO_OUTBOUND_NOT_CONFIGURED',
    'TEMPLATE_NOT_APPROVED', 'PROVIDER_NOT_CONFIGURED', 'RECIPIENT_INELIGIBLE', 'PROVIDER_REJECTED'
  ) then
    raise exception 'Invalid provider error code';
  end if;
  select * into job from public.notification_jobs where id = p_job for update;
  if not found or job.channel is distinct from 'ZALO' or job.status not in ('QUEUED', 'RETRYING') then
    raise exception 'Outbound job is not sendable';
  end if;
  next_attempts := job.attempts + 1;
  if p_error in ('PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE') and next_attempts < 5 then
    next_status := 'RETRYING';
    update public.notification_jobs
    set status = next_status, attempts = next_attempts, error_code = p_error,
      next_attempt_at = now() + (next_attempts * interval '15 minutes'),
      sent_at = null, provider_receipt = null, provider_message_id = null, updated_at = now()
    where id = job.id;
  else
    next_status := 'FAILED';
    update public.notification_jobs
    set status = next_status, attempts = next_attempts, error_code = p_error,
      next_attempt_at = null, sent_at = null, provider_receipt = null, provider_message_id = null,
      updated_at = now()
    where id = job.id;
  end if;
  insert into public.notification_events(job_id, event, details)
  values (job.id, next_status, jsonb_build_object('error_code', p_error));
  return next_status;
end $$;

create function notification_private.emit_domain_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_name text;
  entity uuid;
begin
  if tg_table_name = 'payment_allocations' then
    event_name := 'PAYMENT_CONFIRMED';
    entity := new.payment_id;
  elsif tg_table_name = 'registration_applications' then
    if tg_op <> 'UPDATE' or new.status is distinct from 'COMPLETED' or old.status = 'COMPLETED' then
      return null;
    end if;
    event_name := 'REGISTRATION_COMPLETED';
    entity := new.id;
  elsif tg_table_name = 'student_placement_events' then
    if new.event_type is distinct from 'CLASS_ASSIGNED' then
      return null;
    end if;
    event_name := 'CLASS_ASSIGNED';
    entity := new.id;
  elsif tg_table_name = 'learning_reports' then
    if tg_op <> 'UPDATE' or new.status is distinct from 'PUBLISHED' or old.status = 'PUBLISHED' then
      return null;
    end if;
    event_name := case
      when new.report_type = 'END_OF_COURSE' then 'END_OF_COURSE_REPORT_PUBLISHED'
      else 'LEARNING_REPORT_PUBLISHED'
    end;
    entity := new.id;
  else
    return null;
  end if;
  begin
    perform public.enqueue_domain_notification(event_name, entity);
  exception
    when others then
      return null;
  end;
  return null;
end $$;

create trigger notification_payment_confirmed
after insert on public.payment_allocations
for each row execute function notification_private.emit_domain_event();

create trigger notification_registration_completed
after update of status on public.registration_applications
for each row execute function notification_private.emit_domain_event();

create trigger notification_class_assigned
after insert on public.student_placement_events
for each row execute function notification_private.emit_domain_event();

create trigger notification_report_published
after update of status on public.learning_reports
for each row execute function notification_private.emit_domain_event();

revoke all on function
  notification_private.active_zalo_links(uuid, uuid, uuid),
  notification_private.domain_notice_source(text, uuid),
  notification_private.refresh_zalo_job(uuid),
  notification_private.emit_domain_event()
from public, anon, authenticated, service_role;

revoke all on function
  public.enqueue_domain_notification(text, uuid),
  public.settle_outbound_notification(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.settle_outbound_notification(uuid, text) to service_role;
