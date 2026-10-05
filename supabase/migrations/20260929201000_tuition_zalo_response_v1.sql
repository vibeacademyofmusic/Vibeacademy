-- Tuition ZBS quick-reply capture.
-- Official event: user_click_response_button.
-- message.data is the fixed button label. message.tracking_id is the partner id
-- sent with the phone template. Root msg_id is the Zalo message id.
-- Signature stays on the webhook route. This migration does not call Zalo,
-- does not assign a provider template id, and does not change enrollment,
-- class, debt, or tuition reminder status.

update public.notification_templates
set description = 'Thông báo kỳ học và học phí. Mẫu ZBS phản hồi nhanh: nút cố định Tiếp tục học và Dừng học. Không gắn nút liên kết.',
    parameter_schema = '["parent_name","student_name","student_code","branch_name","period_start","period_end","tuition_status"]'::jsonb
where template_key = 'ZALO_TUITION_REMINDER'
  and status = 'DRAFT'
  and enabled = false
  and provider_template_id is null;

create table public.tuition_zalo_sends (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null unique check (tracking_id ~ '^[A-Za-z0-9]{1,48}$'),
  reminder_id uuid not null references public.tuition_reminders(id),
  student_id uuid not null references public.students(id),
  parent_id uuid not null references public.parents(id),
  enrollment_tuition_id uuid not null references public.enrollment_tuition(id),
  job_id uuid references public.notification_jobs(id),
  template_key text not null default 'ZALO_TUITION_REMINDER',
  provider_message_id text,
  oa_id text,
  send_status text not null check (send_status in ('PREPARED', 'FAILED', 'SENT', 'DELIVERED')),
  error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (provider_message_id is null or provider_message_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  check (oa_id is null or oa_id ~ '^[0-9]{8,32}$'),
  check (
    (send_status = 'PREPARED' and sent_at is null and delivered_at is null and provider_message_id is null and error_code is null)
    or (send_status = 'FAILED' and sent_at is null and delivered_at is null and provider_message_id is null and error_code is not null)
    or (send_status = 'SENT' and sent_at is not null and delivered_at is null and provider_message_id is not null and error_code is null)
    or (send_status = 'DELIVERED' and sent_at is not null and delivered_at is not null and provider_message_id is not null and error_code is null)
  )
);

create index tuition_zalo_sends_reminder_idx
  on public.tuition_zalo_sends(reminder_id, created_at desc, id);

create table public.tuition_zalo_replies (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.tuition_zalo_sends(id),
  reminder_id uuid not null references public.tuition_reminders(id),
  student_id uuid not null references public.students(id),
  tracking_id text not null check (tracking_id ~ '^[A-Za-z0-9]{1,48}$'),
  reply_choice text not null check (reply_choice in ('CONTINUE', 'STOP')),
  button_data text not null check (button_data in ('Tiếp tục học', 'Dừng học')),
  submit_time timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  provider_message_id text not null check (provider_message_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  oa_id text not null check (oa_id ~ '^[0-9]{8,32}$'),
  source text not null default 'Zalo ZBS' check (source = 'Zalo ZBS'),
  event_key text not null unique,
  seq bigint generated always as identity,
  check (
    (reply_choice = 'CONTINUE' and button_data = 'Tiếp tục học')
    or (reply_choice = 'STOP' and button_data = 'Dừng học')
  )
);

create index tuition_zalo_replies_reminder_idx
  on public.tuition_zalo_replies(reminder_id, submit_time desc, received_at desc, seq desc);

create table public.tuition_zalo_reply_states (
  reminder_id uuid primary key references public.tuition_reminders(id),
  student_id uuid not null references public.students(id),
  reply_choice text not null check (reply_choice in ('CONTINUE', 'STOP')),
  submit_time timestamptz not null,
  needs_review boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.tuition_zalo_sends enable row level security;
alter table public.tuition_zalo_replies enable row level security;
alter table public.tuition_zalo_reply_states enable row level security;
revoke all on public.tuition_zalo_sends, public.tuition_zalo_replies, public.tuition_zalo_reply_states
  from public, anon, authenticated, service_role;
grant select on public.tuition_zalo_sends, public.tuition_zalo_replies, public.tuition_zalo_reply_states to authenticated;

create policy tuition_zalo_sends_admin_read
  on public.tuition_zalo_sends for select to authenticated
  using (public.has_role('SUPER_ADMIN'));
create policy tuition_zalo_replies_admin_read
  on public.tuition_zalo_replies for select to authenticated
  using (public.has_role('SUPER_ADMIN'));
create policy tuition_zalo_reply_states_admin_read
  on public.tuition_zalo_reply_states for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create function public.begin_tuition_zalo_send(p_reminder uuid, p_parent uuid)
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
  where tuition_row.id = reminder.enrollment_tuition_id;
  if not found then
    raise exception 'Tuition reminder not found';
  end if;
  if not exists (
    select 1
    from public.student_parents link
    join public.parents parent on parent.id = link.parent_id and parent.status = 'ACTIVE'
    where link.student_id = student
      and link.parent_id = p_parent
      and link.can_view_finance
      and link.is_active
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

create function public.finish_tuition_zalo_send(
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
  if p_outcome = 'ERROR' and p_error is distinct from 'PROVIDER_NOT_CONFIGURED' then
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

create function public.note_tuition_zalo_delivery(
  p_tracking_id text,
  p_message_id text,
  p_delivery_time text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  send public.tuition_zalo_sends;
  device_time timestamptz;
begin
  if p_tracking_id is null or p_tracking_id !~ '^[A-Za-z0-9]{1,48}$'
    or p_message_id is null or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$'
    or p_delivery_time is null or p_delivery_time !~ '^[0-9]{13}$' then
    return 'IGNORED';
  end if;
  device_time := to_timestamp(p_delivery_time::numeric / 1000.0);
  select * into send
  from public.tuition_zalo_sends
  where tracking_id = p_tracking_id
  for update;
  if not found or send.provider_message_id is distinct from p_message_id then
    return 'IGNORED';
  end if;
  if send.send_status = 'DELIVERED' then
    return 'IDEMPOTENT';
  end if;
  if send.send_status is distinct from 'SENT' then
    return 'IGNORED';
  end if;
  update public.tuition_zalo_sends
  set send_status = 'DELIVERED', delivered_at = device_time
  where id = send.id and send_status = 'SENT';
  return 'DELIVERED';
end $$;

create function public.apply_tuition_zalo_response(p_payload jsonb, p_oa_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  message jsonb;
  tracking text;
  button text;
  choice text;
  submit_raw text;
  submit_at timestamptz;
  msg_id text;
  oa text;
  reply_event_key text;
  send public.tuition_zalo_sends;
  inserted uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'invalid_payload';
  end if;
  if p_payload->>'event_name' is distinct from 'user_click_response_button' then
    return 'ignored';
  end if;
  oa := p_payload->>'oa_id';
  if p_oa_id is null or p_oa_id !~ '^[0-9]{8,32}$' or oa is distinct from p_oa_id then
    return 'oa_mismatch';
  end if;
  msg_id := p_payload->>'msg_id';
  if msg_id is null or msg_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    return 'invalid_message';
  end if;
  message := p_payload->'message';
  if jsonb_typeof(message) is distinct from 'object' then
    return 'invalid_message';
  end if;
  if message->>'button_type' is distinct from 'response' then
    return 'invalid_button';
  end if;
  button := message->>'data';
  if button = 'Tiếp tục học' then
    choice := 'CONTINUE';
  elsif button = 'Dừng học' then
    choice := 'STOP';
  else
    return 'invalid_button';
  end if;
  tracking := message->>'tracking_id';
  if tracking is null or tracking !~ '^[A-Za-z0-9]{1,48}$' then
    return 'invalid_tracking';
  end if;
  submit_raw := message->>'submit_time';
  if submit_raw is null or submit_raw !~ '^[0-9]{13}$' then
    return 'invalid_time';
  end if;
  submit_at := to_timestamp(submit_raw::numeric / 1000.0);

  select * into send from public.tuition_zalo_sends where tracking_id = tracking for update;
  if not found then
    return 'unknown_tracking';
  end if;
  if send.send_status not in ('SENT', 'DELIVERED') or send.provider_message_id is null then
    return 'send_not_accepted';
  end if;
  if send.provider_message_id is distinct from msg_id then
    return 'message_mismatch';
  end if;
  if send.oa_id is not null and send.oa_id is distinct from oa then
    return 'oa_mismatch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tuition-zalo-reply:' || send.reminder_id::text, 0));
  reply_event_key := tracking || ':' || submit_raw || ':' || button || ':' || msg_id;
  insert into public.tuition_zalo_replies(
    send_id, reminder_id, student_id, tracking_id, reply_choice, button_data,
    submit_time, provider_message_id, oa_id, source, event_key
  ) values (
    send.id, send.reminder_id, send.student_id, tracking, choice, button,
    submit_at, msg_id, oa, 'Zalo ZBS', reply_event_key
  )
  on conflict (event_key) do nothing
  returning id into inserted;
  if inserted is null then
    return 'duplicate';
  end if;

  if exists (
    select 1 from public.tuition_zalo_reply_states state
    where state.reminder_id = send.reminder_id
      and state.student_id <> send.student_id
  ) then
    raise exception 'Tuition reply student mismatch';
  end if;

  insert into public.tuition_zalo_reply_states(
    reminder_id, student_id, reply_choice, submit_time, needs_review, updated_at
  )
  select send.reminder_id, send.student_id, picked.reply_choice, picked.submit_time,
    (
      select count(distinct prior.reply_choice) > 1
      from public.tuition_zalo_replies prior
      where prior.reminder_id = send.reminder_id
    ),
    clock_timestamp()
  from (
    select reply.reply_choice, reply.submit_time
    from public.tuition_zalo_replies reply
    where reply.reminder_id = send.reminder_id
    order by reply.submit_time desc, reply.received_at desc, reply.seq desc
    limit 1
  ) picked
  on conflict (reminder_id) do update
  set reply_choice = excluded.reply_choice,
      submit_time = excluded.submit_time,
      needs_review = excluded.needs_review,
      updated_at = excluded.updated_at;
  return 'recorded';
end $$;

revoke all on function public.begin_tuition_zalo_send(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.finish_tuition_zalo_send(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.note_tuition_zalo_delivery(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.apply_tuition_zalo_response(jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.begin_tuition_zalo_send(uuid, uuid) to authenticated;
grant execute on function public.finish_tuition_zalo_send(uuid, text, text, text, text) to authenticated;
grant execute on function public.note_tuition_zalo_delivery(text, text, text) to service_role;
grant execute on function public.apply_tuition_zalo_response(jsonb, text) to service_role;

create or replace view public.tuition_reminder_operations with (security_invoker = true) as
select r.id, r.enrollment_tuition_id, r.window_start, r.window_end, r.status, r.marked_at, r.reason,
  et.enrollment_id, et.tuition_plan_id, et.starts_on, et.effective_ends_on, et.plan_name_snapshot,
  et.branch_id_snapshot, et.branch_name_snapshot, et.amount, et.currency, e.student_id, s.full_name, s.student_code,
  r.event_code, et.duration_months_snapshot,
  case
    when r.event_code = 'BALANCE_50_V1' and et.duration_months_snapshot = 12 then r.window_start
    when r.event_code = 'RENEWAL_V1' and et.duration_months_snapshot = 3 then r.window_start + 14
    else null
  end as red_on,
  state.reply_choice,
  state.submit_time as reply_submit_time,
  state.needs_review as reply_needs_review
from tuition_reminders r
join enrollment_tuition et on et.id = r.enrollment_tuition_id
join enrollments e on e.id = et.enrollment_id
join students s on s.id = e.student_id
left join public.tuition_zalo_reply_states state on state.reminder_id = r.id;
