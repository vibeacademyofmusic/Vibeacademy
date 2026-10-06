-- Map the approved ZBS tuition reminder 643118.
-- Leaves registration template 640377 untouched.
-- Keeps scheduled dispatch off: enabled stays false.
-- A second open, sent, or delivered send for the same reminder is rejected
-- so a later scheduler cannot duplicate a manual send. Failed sends can be retried.
-- Does not call Zalo and does not create a receivable.

update public.notification_templates
set status = 'APPROVED',
    provider_template_id = '643118',
    enabled = false,
    description = 'VIBE - Nhắc học phí và xác nhận tiếp tục học. Mẫu ZBS 643118, OA Vibe Academy. Tham số: customer_name, period, student_name, amount, due_date, student_code. Nút phản hồi Tiếp tục học và Dừng học. Không có đường dẫn.',
    parameter_schema = '["customer_name","period","student_name","amount","due_date","student_code"]'::jsonb
where template_key = 'ZALO_TUITION_REMINDER'
  and provider = 'ZALO';

create or replace function public.begin_tuition_zalo_send(p_reminder uuid, p_parent uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reminder public.tuition_reminders;
  student uuid;
  tuition uuid;
  tracking text;
  created uuid;
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  select * into reminder from public.tuition_reminders where id = p_reminder;
  if not found or reminder.status <> 'PENDING' then
    raise exception 'Tuition reminder not found';
  end if;
  if reminder.window_start > today then
    raise exception 'Tuition Zalo window has not started';
  end if;
  select enrollment.student_id, tuition_row.id
    into student, tuition
  from public.enrollment_tuition tuition_row
  join public.enrollments enrollment on enrollment.id = tuition_row.enrollment_id
  join public.branches branch on branch.id = tuition_row.branch_id_snapshot
  where tuition_row.id = reminder.enrollment_tuition_id
    and enrollment.student_id is not null;
  if not found then
    raise exception 'Tuition reminder branch mismatch';
  end if;
  if not exists (
    select 1
    from public.student_parents link
    join public.parents parent on parent.id = link.parent_id and parent.status = 'ACTIVE'
    where link.student_id = student
      and link.parent_id = p_parent
      and link.can_view_finance
      and link.is_active
      and (link.valid_from is null or link.valid_from <= clock_timestamp())
      and (link.valid_until is null or link.valid_until > clock_timestamp())
  ) then
    raise exception 'Tuition recipient not found';
  end if;
  if not exists (
    select 1 from public.tuition_zalo_consents consent
    where consent.student_id = student
      and consent.parent_id = p_parent
      and consent.revoked_at is null
  ) then
    raise exception 'Tuition Zalo consent required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tuition-zalo-send:' || p_reminder::text, 0));
  if exists (
    select 1 from public.tuition_zalo_sends send
    where send.reminder_id = reminder.id
      and send.send_status in ('PREPARED', 'SENT', 'DELIVERED')
  ) then
    raise exception 'Tuition Zalo already prepared';
  end if;
  tracking := replace(gen_random_uuid()::text, '-', '');
  insert into public.tuition_zalo_sends(
    tracking_id, reminder_id, student_id, parent_id, enrollment_tuition_id, template_key, send_status
  ) values (
    tracking, reminder.id, student, p_parent, tuition, 'ZALO_TUITION_REMINDER', 'PREPARED'
  ) returning id into created;
  return jsonb_build_object(
    'send_id', created,
    'tracking_id', tracking,
    'reminder_id', reminder.id,
    'student_id', student
  );
end $$;

create or replace function public.finish_tuition_zalo_send(
  p_send uuid,
  p_outcome text,
  p_error text default null,
  p_receipt text default null,
  p_message_id text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  send public.tuition_zalo_sends;
  parent_user uuid;
  created_job uuid;
  key text;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  if p_outcome not in ('ERROR', 'SENT') then
    raise exception 'Invalid tuition Zalo outcome';
  end if;
  if p_outcome = 'SENT' and (
    p_error is not null
    or nullif(btrim(coalesce(p_receipt, '')), '') is null
    or p_message_id is null
    or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$'
  ) then
    raise exception 'Sent tuition Zalo requires provider receipt';
  end if;
  if p_outcome = 'ERROR' and p_error not in ('PROVIDER_NOT_CONFIGURED', 'ZALO_PILOT_OUTBOUND_DISABLED') then
    raise exception 'Invalid tuition Zalo error';
  end if;
  select * into send from public.tuition_zalo_sends where id = p_send for update;
  if not found then
    raise exception 'Tuition Zalo send not found';
  end if;
  if send.send_status <> 'PREPARED' then
    return case send.send_status when 'SENT' then 'SENT' when 'DELIVERED' then 'SENT' when 'FAILED' then 'ERROR' else 'NOT_SENT' end;
  end if;

  update public.tuition_zalo_sends
  set send_status = case when p_outcome = 'SENT' then 'SENT' else 'FAILED' end,
      error_code = case when p_outcome = 'ERROR' then p_error else null end,
      provider_message_id = case when p_outcome = 'SENT' then p_message_id else null end,
      sent_at = case when p_outcome = 'SENT' then clock_timestamp() else null end
  where id = send.id;

  select user_id into parent_user from public.parents where id = send.parent_id;
  key := 'TUITION_ZALO:' || send.tracking_id;
  insert into public.notification_jobs(
    recipient_id, recipient_subject_type, recipient_subject_id, student_id, branch_id,
    channel, delivery_mode, template_key, payload, entity_type, entity_id,
    idempotency_key, status, attempts, error_code, provider_receipt, provider_message_id, sent_at, created_by
  )
  select parent_user, 'PARENT', send.parent_id, send.student_id, tuition.branch_id_snapshot,
    'ZALO', case when p_outcome = 'SENT' then 'LIVE' else 'MOCK' end, 'ZALO_TUITION_REMINDER',
    jsonb_build_object(
      'template_key', 'ZALO_TUITION_REMINDER',
      'provider_template_id', '643118',
      'template_kind', 'ZBS_RESPONSE',
      'outcome', p_outcome,
      'tracking_id', send.tracking_id,
      'reminder_id', send.reminder_id,
      'student_id', send.student_id,
      'parent_id', send.parent_id,
      'enrollment_tuition_id', send.enrollment_tuition_id
    ),
    'TUITION_REMINDER', send.reminder_id, key,
    case when p_outcome = 'SENT' then 'SENT' else 'FAILED' end,
    1,
    case when p_outcome = 'ERROR' then p_error else null end,
    case when p_outcome = 'SENT' then p_receipt else null end,
    case when p_outcome = 'SENT' then p_message_id else null end,
    case when p_outcome = 'SENT' then clock_timestamp() else null end,
    auth.uid()
  from public.enrollment_tuition tuition
  where tuition.id = send.enrollment_tuition_id
  on conflict (idempotency_key) do nothing
  returning id into created_job;

  if created_job is not null then
    update public.tuition_zalo_sends set job_id = created_job where id = send.id;
    insert into public.notification_events(job_id, event, actor_id, details)
    values (
      created_job,
      case when p_outcome = 'SENT' then 'CONFIRMED' else 'FAILED' end,
      auth.uid(),
      jsonb_build_object('mode', case when p_outcome = 'SENT' then 'LIVE' else 'MOCK' end, 'error_code', p_error, 'tracking_id', send.tracking_id)
    );
  end if;
  return p_outcome;
end $$;
