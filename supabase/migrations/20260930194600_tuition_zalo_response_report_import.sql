-- Recover one tuition reply from a Zalo response report.
-- This is not a webhook. It does not invent a signature or a provider event.
-- The report clock is Vietnam time, which has no daylight-saving offset.

alter table public.tuition_zalo_replies drop constraint tuition_zalo_replies_source_check;
alter table public.tuition_zalo_replies add constraint tuition_zalo_replies_source_check
  check (source in ('Zalo ZBS', 'Zalo response report import'));

create table public.tuition_zalo_reply_imports (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references public.tuition_zalo_replies(id),
  filename text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  sheet text not null,
  sheet_row integer not null check (sheet_row > 1),
  template_id text not null,
  app_id text not null,
  oa_id text not null,
  student_code text not null,
  tracking_id text not null,
  message_id text not null,
  method text not null,
  response_text text not null,
  submit_time_raw text not null,
  submit_timezone text not null,
  submit_time timestamptz not null,
  imported_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  result text not null check (result in ('recorded', 'conflict')),
  unique (sha256, sheet, sheet_row)
);

alter table public.tuition_zalo_reply_imports enable row level security;
revoke all on public.tuition_zalo_reply_imports from public, anon, authenticated, service_role;
grant select on public.tuition_zalo_reply_imports to authenticated;
create policy tuition_zalo_reply_imports_admin_read
  on public.tuition_zalo_reply_imports for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create or replace function public.apply_tuition_zalo_response(p_payload jsonb, p_oa_id text)
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
  if exists (
    select 1 from public.tuition_zalo_replies reply
    where reply.tracking_id = tracking
      and reply.provider_message_id = msg_id
      and reply.button_data = button
      and floor(extract(epoch from reply.submit_time)) = floor(extract(epoch from submit_at))
  ) then
    return 'duplicate';
  end if;
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

create function public.import_tuition_zalo_response_report(
  p_filename text,
  p_sha256 text,
  p_sheet text,
  p_row integer,
  p_template_id text,
  p_app_id text,
  p_oa_id text,
  p_student_code text,
  p_tracking_id text,
  p_message_id text,
  p_submit_time_raw text,
  p_method text,
  p_response text,
  p_actor uuid
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  send public.tuition_zalo_sends;
  matches integer;
  choice text;
  submit_at timestamptz;
  submit_ms text;
  reply_event_key text;
  inserted uuid;
  outcome text;
begin
  if p_actor is null or not exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    join public.profiles profile on profile.id = assignment.user_id
    where assignment.user_id = p_actor
      and role.code = 'SUPER_ADMIN'
      and assignment.branch_id is null
      and assignment.is_active
      and profile.status = 'ACTIVE'
      and (assignment.valid_from is null or assignment.valid_from <= clock_timestamp())
      and (assignment.valid_until is null or assignment.valid_until > clock_timestamp())
  ) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  if p_filename is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_sheet is null or p_row is null or p_row < 2 then
    return 'invalid_report';
  end if;
  if p_submit_time_raw is null or p_submit_time_raw !~ '^[0-9]{2}:[0-9]{2}:[0-9]{2} [0-9]{2}/[0-9]{2}/[0-9]{4}$' then
    return 'invalid_time';
  end if;
  if p_method is distinct from 'phone' then
    return 'method_rejected';
  end if;
  if p_response = 'Tiếp tục học' then
    choice := 'CONTINUE';
  elsif p_response = 'Dừng học' then
    choice := 'STOP';
  else
    return 'invalid_button';
  end if;
  if p_tracking_id !~ '^[A-Za-z0-9]{1,48}$' or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$' or p_oa_id !~ '^[0-9]{8,32}$' or p_app_id !~ '^[0-9]{8,32}$' or p_template_id !~ '^[0-9]{1,20}$' then
    return 'invalid_report';
  end if;
  if exists (
    select 1 from public.tuition_zalo_reply_imports prior
    where prior.sha256 = p_sha256 and prior.sheet = p_sheet and prior.sheet_row = p_row
  ) then
    return 'duplicate';
  end if;
  if not exists (
    select 1 from public.notification_templates template
    where template.template_key = 'ZALO_TUITION_REMINDER'
      and template.provider_template_id = p_template_id
  ) then
    return 'template_mismatch';
  end if;
  if p_app_id is distinct from (
    select credential.app_id from notification_private.zalo_credentials credential
    where credential.oa_id = p_oa_id
    limit 1
  ) then
    return 'app_mismatch';
  end if;

  select count(*) into matches
  from public.tuition_zalo_sends candidate
  where candidate.tracking_id = p_tracking_id
     or candidate.provider_message_id = p_message_id;
  if matches <> 1 then
    return 'ambiguous';
  end if;
  select * into send
  from public.tuition_zalo_sends candidate
  where candidate.tracking_id = p_tracking_id
    and candidate.provider_message_id = p_message_id
  for update;
  if not found then
    return 'mismatch';
  end if;
  if send.send_status not in ('SENT', 'DELIVERED') or send.template_key <> 'ZALO_TUITION_REMINDER' or send.oa_id is distinct from p_oa_id then
    return 'mismatch';
  end if;
  if not exists (
    select 1 from public.students student
    where student.id = send.student_id and student.student_code = p_student_code
  ) then
    return 'student_mismatch';
  end if;

  submit_at := (to_timestamp(p_submit_time_raw, 'HH24:MI:SS DD/MM/YYYY') at time zone 'UTC') at time zone 'Asia/Ho_Chi_Minh';
  if to_char(submit_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI:SS DD/MM/YYYY') is distinct from p_submit_time_raw then
    return 'invalid_time';
  end if;
  if submit_at < send.sent_at then
    return 'invalid_time';
  end if;
  submit_ms := (floor(extract(epoch from submit_at) * 1000))::bigint::text;
  perform pg_advisory_xact_lock(hashtextextended('tuition-zalo-reply:' || send.reminder_id::text, 0));
  if exists (
    select 1 from public.tuition_zalo_replies reply
    where reply.tracking_id = p_tracking_id
      and reply.provider_message_id = p_message_id
      and reply.button_data = p_response
      and floor(extract(epoch from reply.submit_time)) = floor(extract(epoch from submit_at))
  ) then
    return 'duplicate';
  end if;
  outcome := case
    when exists (
      select 1 from public.tuition_zalo_replies reply
      where reply.provider_message_id = p_message_id
        and reply.tracking_id = p_tracking_id
        and reply.button_data <> p_response
    ) then 'conflict'
    else 'recorded'
  end;
  reply_event_key := p_tracking_id || ':' || submit_ms || ':' || p_response || ':' || p_message_id;
  insert into public.tuition_zalo_replies(
    send_id, reminder_id, student_id, tracking_id, reply_choice, button_data,
    submit_time, provider_message_id, oa_id, source, event_key
  ) values (
    send.id, send.reminder_id, send.student_id, p_tracking_id, choice, p_response,
    submit_at, p_message_id, p_oa_id, 'Zalo response report import', reply_event_key
  )
  on conflict (event_key) do nothing
  returning id into inserted;
  if inserted is null then
    return 'duplicate';
  end if;
  insert into public.tuition_zalo_reply_imports(
    reply_id, filename, sha256, sheet, sheet_row, template_id, app_id, oa_id, student_code,
    tracking_id, message_id, method, response_text, submit_time_raw, submit_timezone, submit_time, actor_id, result
  ) values (
    inserted, p_filename, p_sha256, p_sheet, p_row, p_template_id, p_app_id, p_oa_id, p_student_code,
    p_tracking_id, p_message_id, p_method, p_response, p_submit_time_raw, 'Asia/Ho_Chi_Minh', submit_at, p_actor, outcome
  );
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
      updated_at = excluded.updated_at
  where public.tuition_zalo_reply_states.student_id = excluded.student_id;
  return outcome;
end $$;

revoke all on function public.import_tuition_zalo_response_report(text, text, text, integer, text, text, text, text, text, text, text, text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.import_tuition_zalo_response_report(text, text, text, integer, text, text, text, text, text, text, text, text, text, uuid) to service_role;
