-- Phase Z1: Payment POSTED → Zalo tuition-received enqueue.
-- Reuses notification_jobs / notification_templates. Does not call Zalo OpenAPI.
-- Locked policy: fan-out finance-eligible parents with ACTIVE Zalo parent links.

-- =========================================================
-- Template registry: additive columns for Z1 event contract
-- =========================================================

alter table public.notification_templates
  add column if not exists event_type text,
  add column if not exists payload_schema jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.notification_templates
set payload_schema = coalesce(
  payload_schema,
  (
    select jsonb_object_agg(value, 'string')
    from jsonb_array_elements_text(parameter_schema) as value
  )
)
where payload_schema is null
  and jsonb_typeof(parameter_schema) = 'array';

update public.notification_templates
set payload_schema = '{}'::jsonb
where payload_schema is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notification_templates'::regclass
      and conname = 'notification_templates_payload_schema_check'
  ) then
    alter table public.notification_templates
      add constraint notification_templates_payload_schema_check
      check (jsonb_typeof(payload_schema) = 'object');
  end if;
end $$;

insert into public.notification_templates(
  template_key, provider, provider_template_id, status, version, description,
  parameter_schema, payload_schema, event_type, enabled
) values (
  'ZALO_PAYMENT_RECEIVED',
  'ZALO',
  null,
  'PENDING',
  1,
  'Thanh toán học phí đã ghi nhận',
  '["student_name","amount","payment_date","payment_number"]'::jsonb,
  jsonb_build_object(
    'student_name', 'string',
    'amount', 'money',
    'payment_date', 'date',
    'payment_number', 'string'
  ),
  'TUITION_PAYMENT_RECEIVED',
  false
) on conflict (template_key) do update
set
  event_type = excluded.event_type,
  payload_schema = excluded.payload_schema,
  parameter_schema = excluded.parameter_schema,
  description = excluded.description,
  updated_at = now()
where public.notification_templates.event_type is distinct from excluded.event_type
   or public.notification_templates.payload_schema is distinct from excluded.payload_schema;

-- =========================================================
-- Recipient resolution (no phone / primary guessing)
-- =========================================================

create or replace function notification_private.zalo_payment_ready(p_template text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.notification_templates template
    where template.template_key = p_template
      and template.provider = 'ZALO'
      and coalesce(template.event_type, '') = 'TUITION_PAYMENT_RECEIVED'
      and template.status = 'APPROVED'
      and template.enabled = true
      and nullif(btrim(coalesce(template.provider_template_id, '')), '') is not null
      and jsonb_typeof(template.payload_schema) = 'object'
      and template.payload_schema <> '{}'::jsonb
  )
$$;

create or replace function notification_private.finance_zalo_parents(p_student uuid)
returns table(parent_id uuid, channel_link_id uuid, provider_user_id text, profile_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    parent.id,
    channel.id,
    channel.provider_user_id,
    parent.user_id
  from public.student_parents relation
  join public.parents parent on parent.id = relation.parent_id
  join public.customer_channel_links channel
    on channel.provider = 'ZALO'
   and channel.status = 'ACTIVE'
   and channel.parent_id = parent.id
   and channel.provider_user_id is not null
  where relation.student_id = p_student
    and relation.is_active
    and relation.can_view_finance is true
    and (relation.valid_from is null or relation.valid_from <= now())
    and (relation.valid_until is null or relation.valid_until > now())
    and parent.status = 'ACTIVE'
$$;

-- =========================================================
-- Authoritative enqueue: payments.status = POSTED only
-- =========================================================

create or replace function public.enqueue_tuition_payment_received(p_payment uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payment public.payments%rowtype;
  student_name text;
  parameters jsonb;
  payload jsonb;
  parent record;
  created_id uuid;
  created integer := 0;
  seen integer := 0;
begin
  if auth.uid() is not null and not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_payment is null then
    return 0;
  end if;
  select * into payment from public.payments where id = p_payment;
  if not found or payment.status is distinct from 'POSTED' then
    return 0;
  end if;
  select left(coalesce(student.full_name, 'Học viên'), 80)
  into student_name
  from public.students student
  where student.id = payment.student_id_snapshot;
  parameters := jsonb_build_object(
    'student_name', coalesce(student_name, 'Học viên'),
    'amount', trim(to_char(payment.amount, 'FM999999999990.00')) || ' ' || payment.currency,
    'payment_date', to_char((payment.paid_at at time zone 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD'),
    'payment_number', left(payment.payment_number, 40)
  );
  payload := jsonb_build_object(
    'title', 'Thanh toán đã được ghi nhận',
    'href', '/my-learning',
    'parameters', parameters
  );
  for parent in
    select * from notification_private.finance_zalo_parents(payment.student_id_snapshot)
  loop
    seen := seen + 1;
    created_id := null;
    insert into public.notification_jobs(
      recipient_id, student_id, branch_id, channel, delivery_mode, template_key, payload,
      entity_type, entity_id, idempotency_key, status, channel_link_id,
      recipient_subject_type, recipient_subject_id, created_by
    ) values (
      parent.profile_id,
      payment.student_id_snapshot,
      payment.branch_id_snapshot,
      'ZALO',
      'LIVE',
      'ZALO_PAYMENT_RECEIVED',
      payload,
      'TUITION_PAYMENT_RECEIVED',
      payment.id,
      concat_ws(':', 'TUITION_PAYMENT_RECEIVED', payment.id::text, 'ZALO_PAYMENT_RECEIVED', parent.channel_link_id::text, 'ZALO'),
      'PENDING',
      parent.channel_link_id,
      'PARENT',
      parent.parent_id,
      auth.uid()
    ) on conflict (idempotency_key) do nothing
    returning id into created_id;
    if created_id is not null then
      created := created + 1;
      insert into public.notification_events(job_id, event, actor_id)
      values (created_id, 'CREATED', auth.uid());
    end if;
  end loop;
  if seen = 0 then
    created_id := null;
    insert into public.notification_jobs(
      recipient_id, student_id, branch_id, channel, delivery_mode, template_key, payload,
      entity_type, entity_id, idempotency_key, status, error_code,
      recipient_subject_type, recipient_subject_id, created_by
    ) values (
      null,
      payment.student_id_snapshot,
      payment.branch_id_snapshot,
      'ZALO',
      'LIVE',
      'ZALO_PAYMENT_RECEIVED',
      payload,
      'TUITION_PAYMENT_RECEIVED',
      payment.id,
      concat_ws(':', 'TUITION_PAYMENT_RECEIVED', payment.id::text, 'ZALO_PAYMENT_RECEIVED', 'no-link', 'ZALO'),
      'SKIPPED_NO_CHANNEL',
      'ZALO_RECIPIENT_NOT_LINKED',
      'STUDENT',
      payment.student_id_snapshot,
      auth.uid()
    ) on conflict (idempotency_key) do nothing
    returning id into created_id;
    if created_id is not null then
      created := created + 1;
      insert into public.notification_events(job_id, event, actor_id, details)
      values (created_id, 'SKIPPED_NO_CHANNEL', auth.uid(), jsonb_build_object('error_code', 'ZALO_RECIPIENT_NOT_LINKED'));
    end if;
  end if;
  return created;
end $$;

create or replace function notification_private.emit_tuition_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.status = 'POSTED' then
    begin
      perform public.enqueue_tuition_payment_received(new.id);
    exception
      when others then
        null;
    end;
  elsif tg_op = 'UPDATE' and new.status = 'POSTED' and old.status is distinct from 'POSTED' then
    begin
      perform public.enqueue_tuition_payment_received(new.id);
    exception
      when others then
        null;
    end;
  end if;
  return null;
end $$;

-- Replace allocation-based PAYMENT_CONFIRMED path with POSTED payment path.
drop trigger if exists notification_payment_confirmed on public.payment_allocations;
drop trigger if exists notification_tuition_payment_received on public.payments;
create trigger notification_tuition_payment_received
after insert or update of status on public.payments
for each row execute function notification_private.emit_tuition_payment_received();

-- =========================================================
-- Delivery guards / claim / complete (fail-closed for Zalo)
-- =========================================================

create or replace function notification_private.guard_delivery()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('PROCESSING', 'SENT') and new.status is distinct from old.status then
    if new.channel = 'ZALO' and new.entity_type = 'TUITION_PAYMENT_RECEIVED' then
      if not exists (
        select 1 from public.payments payment
        where payment.id = new.entity_id and payment.status = 'POSTED'
      ) then
        raise exception 'Notification source no longer eligible';
      end if;
      if new.channel_link_id is not null and not exists (
        select 1 from public.customer_channel_links channel
        where channel.id = new.channel_link_id
          and channel.provider = 'ZALO'
          and channel.status = 'ACTIVE'
          and channel.provider_user_id is not null
      ) then
        raise exception 'Notification recipient no longer eligible';
      end if;
    else
      if new.recipient_id is not null
        and not notification_private.recipient_allowed(new.recipient_id, new.student_id, new.branch_id, new.template_key) then
        raise exception 'Notification recipient no longer eligible';
      end if;
    end if;
    if new.template_key = 'TUITION_REMINDER' and not exists (
      select 1
      from tuition_reminders reminder
      join enrollment_tuition term on term.id = reminder.enrollment_tuition_id
      join enrollments enrollment on enrollment.id = term.enrollment_id
      where reminder.id = new.entity_id
        and reminder.status = 'PENDING'
        and term.status in ('ACTIVE', 'SCHEDULED')
        and enrollment.status = 'ACTIVE'
        and term.effective_ends_on >= (now() at time zone 'Asia/Ho_Chi_Minh')::date
    ) then
      raise exception 'Notification source no longer eligible';
    end if;
  end if;
  return new;
end $$;

create or replace function public.claim_notification(p_job uuid)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
begin
  select * into job from public.notification_jobs where id = p_job and status = 'PENDING' for update skip locked;
  if not found then
    return;
  end if;
  if job.channel = 'ZALO' and job.entity_type = 'TUITION_PAYMENT_RECEIVED' then
    if not exists (
      select 1 from public.payments payment
      where payment.id = job.entity_id and payment.status = 'POSTED'
    ) then
      update public.notification_jobs
      set status = 'CANCELLED', error_code = 'RECIPIENT_INELIGIBLE', updated_at = now()
      where id = job.id;
      insert into public.notification_events(job_id, event) values (job.id, 'RECIPIENT_INELIGIBLE');
      return;
    end if;
    if job.channel_link_id is null or not exists (
      select 1 from public.customer_channel_links channel
      where channel.id = job.channel_link_id
        and channel.provider = 'ZALO'
        and channel.status = 'ACTIVE'
        and channel.provider_user_id is not null
    ) then
      update public.notification_jobs
      set status = 'SKIPPED_NO_CHANNEL', error_code = 'ZALO_RECIPIENT_NOT_LINKED', updated_at = now()
      where id = job.id;
      insert into public.notification_events(job_id, event, details)
      values (job.id, 'SKIPPED_NO_CHANNEL', jsonb_build_object('error_code', 'ZALO_RECIPIENT_NOT_LINKED'));
      return;
    end if;
  elsif job.recipient_id is null
    or not notification_private.recipient_allowed(job.recipient_id, job.student_id, job.branch_id, job.template_key) then
    update public.notification_jobs
    set status = 'CANCELLED', error_code = 'RECIPIENT_INELIGIBLE', updated_at = now()
    where id = job.id;
    insert into public.notification_events(job_id, event) values (job.id, 'RECIPIENT_INELIGIBLE');
    return;
  end if;
  return query
    update public.notification_jobs
    set status = 'PROCESSING',
        attempts = attempts + 1,
        lease_token = gen_random_uuid(),
        lease_until = now() + interval '5 minutes',
        updated_at = now()
    where id = job.id
    returning *;
  insert into public.notification_events(job_id, event) values (job.id, 'CLAIMED');
end $$;

create or replace function public.complete_notification(
  p_job uuid,
  p_lease uuid,
  p_receipt text default null,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.notification_jobs;
begin
  select * into job from public.notification_jobs where id = p_job for update;
  if not found
    or job.status <> 'PROCESSING'
    or job.lease_token is distinct from p_lease
    or job.lease_until < now() then
    raise exception 'Stale delivery lease';
  end if;
  if p_error is null and (nullif(btrim(p_receipt), '') is null or length(p_receipt) > 500) then
    raise exception 'Provider confirmation required';
  end if;
  if p_error is not null and p_error not in (
    'PROVIDER_NOT_CONFIGURED',
    'PROVIDER_REJECTED',
    'PROVIDER_TIMEOUT',
    'RECIPIENT_INELIGIBLE',
    'ZALO_OUTBOUND_NOT_CONFIGURED',
    'ZALO_RECIPIENT_NOT_LINKED',
    'TEMPLATE_NOT_APPROVED'
  ) then
    raise exception 'Invalid provider error code';
  end if;
  if p_error is null and job.channel = 'ZALO' then
    if not notification_private.zalo_payment_ready(job.template_key) then
      raise exception 'Live Zalo send is disabled';
    end if;
  end if;
  if p_error is null and job.channel = 'IN_APP' and job.delivery_mode = 'LIVE' then
    insert into public.notification_inbox(job_id, recipient_id)
    values (job.id, job.recipient_id)
    on conflict do nothing;
  end if;
  update public.notification_jobs
  set status = case when p_error is null then 'SENT' else 'FAILED' end,
      provider_receipt = case when p_error is null then p_receipt end,
      error_code = p_error,
      sent_at = case when p_error is null then now() end,
      lease_token = null,
      lease_until = null,
      updated_at = now()
  where id = job.id;
  insert into public.notification_events(job_id, event, details)
  values (
    job.id,
    case when p_error is null then 'CONFIRMED' else 'FAILED' end,
    jsonb_build_object('mode', job.delivery_mode, 'error_code', p_error)
  );
end $$;

create or replace function public.enqueue_notification_event(
  p_event text,
  p_entity uuid,
  p_channel text default 'IN_APP',
  p_mode text default 'LIVE'
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s uuid;
  b uuid;
  u uuid;
  v text := '1';
  t text;
  target text;
  title text;
  rec record;
  j uuid;
  n integer := 0;
begin
  if not public.has_role('SUPER_ADMIN') then
    raise exception 'Unauthorized';
  end if;
  if p_channel is null or p_channel not in ('EMAIL', 'ZALO', 'IN_APP')
    or p_mode is null or p_mode not in ('LIVE', 'MOCK') then
    raise exception 'Invalid channel or mode';
  end if;
  if p_event = 'TUITION_PAYMENT_RECEIVED' then
    if p_channel is distinct from 'ZALO' or p_mode is distinct from 'LIVE' then
      raise exception 'Unsupported notification event';
    end if;
    return public.enqueue_tuition_payment_received(p_entity);
  end if;
  t := p_event;
  case p_event
    when 'ONBOARDING' then
      select id into u from profiles where id = p_entity and status = 'ACTIVE';
      target := '/';
      title := 'Chào mừng bạn đến Vibe Academy';
    when 'TUITION_REMINDER' then
      select e.student_id, et.branch_id_snapshot into s, b
      from tuition_reminders r
      join enrollment_tuition et on et.id = r.enrollment_tuition_id
      join enrollments e on e.id = et.enrollment_id
      where r.id = p_entity
        and r.status = 'PENDING'
        and r.window_start <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
        and e.status = 'ACTIVE'
        and et.status in ('ACTIVE', 'SCHEDULED');
      target := '/my-learning';
      title := 'Bạn có nhắc học phí cần xem';
    when 'LEARNING_REPORT' then
      select student_id, branch_id, version::text,
             case report_type when 'MONTHLY' then 'MONTHLY_REPORT' else 'END_OF_COURSE' end
      into s, b, v, t
      from learning_reports
      where id = p_entity and status = 'APPROVED';
      target := '/my-learning';
      title := 'Báo cáo học tập đã được duyệt';
    when 'SCHEDULE_CHANGED' then
      select c.branch_id, o.updated_at::text into b, v
      from session_occurrences o
      join schedules sc on sc.id = o.schedule_id
      join classes c on c.id = sc.class_id
      where o.id = p_entity;
      target := '/my-learning';
      title := 'Lịch học có cập nhật';
    when 'ATTENDANCE_NOTICE' then
      select e.student_id, c.branch_id, a.updated_at::text into s, b, v
      from attendance_records a
      join enrollments e on e.id = a.enrollment_id
      join classes c on c.id = e.class_id
      where a.id = p_entity;
      target := '/my-learning';
      title := 'Điểm danh buổi học có cập nhật';
    when 'FEEDBACK_FOLLOW_UP' then
      select student_id, branch_id, respondent_user_id, version::text into s, b, u, v
      from lesson_feedback
      where id = p_entity and resolution_status = 'RESOLVED';
      target := '/my-learning';
      title := 'Phản hồi buổi học đã được cập nhật';
    else
      raise exception 'Unsupported notification event';
  end case;
  if (p_event = 'ONBOARDING' and u is null) or (p_event <> 'ONBOARDING' and b is null) then
    raise exception 'Eligible source not found';
  end if;
  for rec in
    with audience_students as (
      select s as sid where s is not null
      union
      select e.student_id
      from enrollments e
      join schedules sc on sc.class_id = e.class_id
      join session_occurrences o on o.schedule_id = sc.id
      where p_event = 'SCHEDULE_CHANGED'
        and o.id = p_entity
        and e.status = 'ACTIVE'
        and e.started_at <= o.occurrence_date
        and (e.ended_at is null or e.ended_at >= o.occurrence_date)
    ), audience as (
      select u as uid, s as sid where p_event = 'ONBOARDING'
      union
      select st.user_id, a.sid from audience_students a join students st on st.id = a.sid
      union
      select p.user_id, a.sid
      from audience_students a
      join student_parents sp on sp.student_id = a.sid
      join parents p on p.id = sp.parent_id
    )
    select distinct uid, sid from audience where uid is not null and (u is null or uid = u)
  loop
    if not notification_private.recipient_allowed(rec.uid, rec.sid, b, t) then
      continue;
    end if;
    j := null;
    insert into notification_jobs(
      recipient_id, student_id, branch_id, channel, delivery_mode, template_key, payload,
      entity_type, entity_id, idempotency_key, created_by
    ) values (
      rec.uid, rec.sid, b, p_channel, p_mode, t,
      jsonb_build_object('title', title, 'href', target),
      p_event, p_entity,
      concat_ws(':', p_event, p_entity, v, rec.uid, p_channel, p_mode),
      auth.uid()
    ) on conflict (idempotency_key) do nothing
    returning id into j;
    if j is not null then
      n := n + 1;
      insert into notification_events(job_id, event, actor_id) values (j, 'CREATED', auth.uid());
    end if;
  end loop;
  return n;
end $$;

create or replace function public.settle_outbound_notification(p_job uuid, p_error text)
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
    'TEMPLATE_NOT_APPROVED', 'PROVIDER_NOT_CONFIGURED', 'RECIPIENT_INELIGIBLE',
    'PROVIDER_REJECTED', 'ZALO_RECIPIENT_NOT_LINKED'
  ) then
    raise exception 'Invalid provider error code';
  end if;
  select * into job from public.notification_jobs where id = p_job for update;
  if not found or job.channel is distinct from 'ZALO' or job.status not in ('QUEUED', 'RETRYING', 'PENDING', 'PROCESSING') then
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

revoke all on function
  notification_private.zalo_payment_ready(text),
  notification_private.finance_zalo_parents(uuid),
  notification_private.emit_tuition_payment_received()
from public, anon, authenticated, service_role;

revoke all on function public.enqueue_tuition_payment_received(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.enqueue_tuition_payment_received(uuid) to authenticated;
