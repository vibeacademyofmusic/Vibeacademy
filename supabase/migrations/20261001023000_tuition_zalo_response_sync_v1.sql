-- Shared tuition-reply capture for webhook, response API, and report import.
-- A click is not a payment. Checkpoint and activation live here; this file
-- does not call Zalo.

alter table public.tuition_zalo_replies drop constraint tuition_zalo_replies_source_check;
alter table public.tuition_zalo_replies add constraint tuition_zalo_replies_source_check
  check (source in ('Zalo ZBS', 'Zalo response report import', 'Zalo response API'));

create table public.tuition_zalo_reply_api_events (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid references public.tuition_zalo_replies(id),
  template_id text not null,
  app_id text not null,
  oa_id text not null,
  tracking_id text not null,
  message_id text not null,
  response_text text not null,
  submit_time timestamptz not null,
  result text not null check (result in ('recorded', 'duplicate', 'conflict', 'mismatch', 'oa_mismatch', 'invalid_button', 'invalid_time', 'unknown_tracking', 'message_mismatch', 'send_not_accepted', 'template_mismatch', 'app_mismatch')),
  recorded_at timestamptz not null default clock_timestamp()
);

create table public.tuition_zalo_response_sync (
  id boolean primary key default true check (id),
  activated_at timestamptz,
  checkpoint_ms bigint,
  overlap_ms integer not null default 300000 check (overlap_ms between 60000 and 3600000),
  page_limit integer not null default 20 check (page_limit between 1 and 50),
  interval_seconds integer check (interval_seconds is null or interval_seconds >= 60),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  last_error_detail text,
  auth_backoff_until timestamptz,
  auth_failures integer not null default 0 check (auth_failures >= 0),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.tuition_zalo_response_sync(id) values (true);

alter table public.tuition_zalo_reply_api_events enable row level security;
alter table public.tuition_zalo_response_sync enable row level security;
revoke all on public.tuition_zalo_reply_api_events, public.tuition_zalo_response_sync
  from public, anon, authenticated, service_role;
grant select on public.tuition_zalo_reply_api_events, public.tuition_zalo_response_sync to authenticated;
create policy tuition_zalo_reply_api_events_admin_read
  on public.tuition_zalo_reply_api_events for select to authenticated
  using (public.has_role('SUPER_ADMIN'));
create policy tuition_zalo_response_sync_admin_read
  on public.tuition_zalo_response_sync for select to authenticated
  using (public.has_role('SUPER_ADMIN'));

create index integration_webhook_events_tuition_click_pending_idx
  on public.integration_webhook_events(received_at, id)
  where provider = 'ZALO'
    and event_type = 'user_click_response_button'
    and processed_at is null;

create function public.record_tuition_zalo_reply(
  p_source text,
  p_tracking text,
  p_message_id text,
  p_button text,
  p_submit_ms text,
  p_oa_id text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  choice text;
  submit_at timestamptz;
  reply_event_key text;
  send public.tuition_zalo_sends;
  inserted uuid;
  different boolean;
begin
  if p_source is null or p_source not in ('Zalo ZBS', 'Zalo response report import', 'Zalo response API') then
    return 'invalid_source';
  end if;
  if p_oa_id is null or p_oa_id !~ '^[0-9]{8,32}$' then
    return 'oa_mismatch';
  end if;
  if p_message_id is null or p_message_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    return 'invalid_message';
  end if;
  if p_button = 'Tiếp tục học' then
    choice := 'CONTINUE';
  elsif p_button = 'Dừng học' then
    choice := 'STOP';
  else
    return 'invalid_button';
  end if;
  if p_tracking is null or p_tracking !~ '^[A-Za-z0-9]{1,48}$' then
    return 'invalid_tracking';
  end if;
  if p_submit_ms is null or p_submit_ms !~ '^[0-9]{13}$' then
    return 'invalid_time';
  end if;
  submit_at := to_timestamp(p_submit_ms::numeric / 1000.0);
  select * into send from public.tuition_zalo_sends where tracking_id = p_tracking for update;
  if not found then
    return 'unknown_tracking';
  end if;
  if send.send_status not in ('SENT', 'DELIVERED') or send.provider_message_id is null then
    return 'send_not_accepted';
  end if;
  if send.provider_message_id is distinct from p_message_id then
    return 'message_mismatch';
  end if;
  if send.oa_id is not null and send.oa_id is distinct from p_oa_id then
    return 'oa_mismatch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('tuition-zalo-reply:' || send.reminder_id::text, 0));
  if exists (
    select 1 from public.tuition_zalo_replies reply
    where reply.tracking_id = p_tracking
      and reply.provider_message_id = p_message_id
      and reply.button_data = p_button
      and floor(extract(epoch from reply.submit_time)) = floor(extract(epoch from submit_at))
  ) then
    return 'duplicate';
  end if;
  different := exists (
    select 1 from public.tuition_zalo_replies reply
    where reply.provider_message_id = p_message_id
      and reply.tracking_id = p_tracking
      and reply.button_data <> p_button
  );
  reply_event_key := p_tracking || ':' || p_submit_ms || ':' || p_button || ':' || p_message_id;
  insert into public.tuition_zalo_replies(
    send_id, reminder_id, student_id, tracking_id, reply_choice, button_data,
    submit_time, provider_message_id, oa_id, source, event_key
  ) values (
    send.id, send.reminder_id, send.student_id, p_tracking, choice, p_button,
    submit_at, p_message_id, p_oa_id, p_source, reply_event_key
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
      updated_at = excluded.updated_at
  where public.tuition_zalo_reply_states.student_id = excluded.student_id;
  if different then
    return 'conflict';
  end if;
  return 'recorded';
end $$;

create or replace function public.apply_tuition_zalo_response(p_payload jsonb, p_oa_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  message jsonb;
  outcome text;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return 'invalid_payload';
  end if;
  if p_payload->>'event_name' is distinct from 'user_click_response_button' then
    return 'ignored';
  end if;
  if p_oa_id is null or p_oa_id !~ '^[0-9]{8,32}$' or p_payload->>'oa_id' is distinct from p_oa_id then
    return 'oa_mismatch';
  end if;
  message := p_payload->'message';
  if jsonb_typeof(message) is distinct from 'object' then
    return 'invalid_message';
  end if;
  if message->>'button_type' is distinct from 'response' then
    return 'invalid_button';
  end if;
  outcome := public.record_tuition_zalo_reply(
    'Zalo ZBS',
    message->>'tracking_id',
    p_payload->>'msg_id',
    message->>'data',
    message->>'submit_time',
    p_oa_id
  );
  if outcome = 'conflict' then
    return 'recorded';
  end if;
  return outcome;
end $$;

create or replace function public.import_tuition_zalo_response_report(
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
  submit_at timestamptz;
  submit_ms text;
  outcome text;
  inserted uuid;
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
  if p_response not in ('Tiếp tục học', 'Dừng học') then
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
  if not found or send.send_status not in ('SENT', 'DELIVERED') or send.template_key <> 'ZALO_TUITION_REMINDER' or send.oa_id is distinct from p_oa_id then
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
  outcome := public.record_tuition_zalo_reply('Zalo response report import', p_tracking_id, p_message_id, p_response, submit_ms, p_oa_id);
  if outcome = 'duplicate' then
    return 'duplicate';
  end if;
  if outcome not in ('recorded', 'conflict') then
    return outcome;
  end if;
  select id into inserted from public.tuition_zalo_replies where event_key = p_tracking_id || ':' || submit_ms || ':' || p_response || ':' || p_message_id;
  insert into public.tuition_zalo_reply_imports(
    reply_id, filename, sha256, sheet, sheet_row, template_id, app_id, oa_id, student_code,
    tracking_id, message_id, method, response_text, submit_time_raw, submit_timezone, submit_time, actor_id, result
  ) values (
    inserted, p_filename, p_sha256, p_sheet, p_row, p_template_id, p_app_id, p_oa_id, p_student_code,
    p_tracking_id, p_message_id, p_method, p_response, p_submit_time_raw, 'Asia/Ho_Chi_Minh', submit_at, p_actor, outcome
  );
  return outcome;
end $$;

create function public.record_tuition_zalo_api_reply(
  p_template_id text,
  p_app_id text,
  p_oa_id text,
  p_row_oa_id text,
  p_tracking_id text,
  p_message_id text,
  p_button text,
  p_submit_ms text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  outcome text;
  reply uuid;
  submit_at timestamptz;
begin
  if p_template_id is null or p_template_id !~ '^[0-9]{1,20}$' or p_app_id is null or p_app_id !~ '^[0-9]{8,32}$' then
    return 'invalid_report';
  end if;
  if p_oa_id is null or p_row_oa_id is distinct from p_oa_id then
    outcome := 'oa_mismatch';
  elsif not exists (
    select 1 from public.notification_templates template
    where template.template_key = 'ZALO_TUITION_REMINDER'
      and template.provider_template_id = p_template_id
  ) then
    outcome := 'template_mismatch';
  elsif p_app_id is distinct from (
    select credential.app_id from notification_private.zalo_credentials credential
    where credential.oa_id = p_oa_id
    limit 1
  ) then
    outcome := 'app_mismatch';
  elsif p_submit_ms is null or p_submit_ms !~ '^[0-9]{13}$' then
    outcome := 'invalid_time';
  elsif exists (
    select 1 from public.tuition_zalo_sends candidate
    where candidate.tracking_id = p_tracking_id
      and candidate.sent_at is not null
      and candidate.sent_at > to_timestamp(p_submit_ms::numeric / 1000.0)
  ) then
    outcome := 'invalid_time';
  else
    outcome := public.record_tuition_zalo_reply('Zalo response API', p_tracking_id, p_message_id, p_button, p_submit_ms, p_oa_id);
  end if;
  if p_submit_ms ~ '^[0-9]{13}$' and p_tracking_id ~ '^[A-Za-z0-9]{1,48}$' and p_message_id ~ '^[A-Za-z0-9_-]{1,80}$' and p_button in ('Tiếp tục học', 'Dừng học') and p_oa_id ~ '^[0-9]{8,32}$' then
    submit_at := to_timestamp(p_submit_ms::numeric / 1000.0);
    if exists (
      select 1 from public.tuition_zalo_reply_api_events prior
      where prior.tracking_id = p_tracking_id
        and prior.message_id = p_message_id
        and prior.response_text = p_button
        and prior.submit_time = submit_at
        and prior.result = outcome
    ) then
      return outcome;
    end if;
    select id into reply
    from public.tuition_zalo_replies
    where event_key = p_tracking_id || ':' || p_submit_ms || ':' || p_button || ':' || p_message_id;
    insert into public.tuition_zalo_reply_api_events(
      reply_id, template_id, app_id, oa_id, tracking_id, message_id, response_text, submit_time, result
    ) values (
      reply, p_template_id, p_app_id, p_oa_id, p_tracking_id, p_message_id, p_button, submit_at, outcome
    );
  end if;
  return outcome;
end $$;

create function public.mark_zalo_webhook_processed(p_event_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_error is null then
    update public.integration_webhook_events
    set processed_at = clock_timestamp(), processing_error = null
    where id = p_event_id and provider = 'ZALO';
    return;
  end if;
  if p_error !~ '^[A-Z0-9_]{1,40}$' then
    p_error := 'APPLY_FAILED';
  end if;
  update public.integration_webhook_events
  set processing_error = p_error,
      attempt_count = attempt_count + 1,
      processed_at = null
  where id = p_event_id and provider = 'ZALO';
end $$;

create function public.replay_pending_tuition_zalo_clicks(p_oa_id text, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event record;
  applied text;
  replayed integer := 0;
begin
  if p_oa_id is null or p_oa_id !~ '^[0-9]{8,32}$' or p_limit is null or p_limit < 1 or p_limit > 20 then
    return 0;
  end if;
  for event in
    select id, payload
    from public.integration_webhook_events
    where provider = 'ZALO'
      and event_type = 'user_click_response_button'
      and status = 'ACCEPTED'
      and processed_at is null
      and attempt_count < 8
      and received_at < clock_timestamp() - interval '15 seconds'
    order by received_at, id
    limit p_limit
    for update skip locked
  loop
    begin
      applied := public.apply_tuition_zalo_response(event.payload, p_oa_id);
      update public.integration_webhook_events
      set processed_at = clock_timestamp(), processing_error = null
      where id = event.id;
      replayed := replayed + 1;
    exception when others then
      update public.integration_webhook_events
      set processing_error = 'APPLY_FAILED',
          attempt_count = attempt_count + 1
      where id = event.id;
    end;
  end loop;
  return replayed;
end $$;

create function public.note_tuition_zalo_response_probe(
  p_http integer,
  p_error integer,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  detail text;
  failures integer;
begin
  detail := left(coalesce(p_message, ''), 120);
  if detail !~ '^[A-Za-z0-9 ._-]{0,120}$' then
    detail := '';
  end if;
  if p_http between 200 and 299 and p_error = 0 then
    update public.tuition_zalo_response_sync
    set activated_at = coalesce(activated_at, clock_timestamp()),
        last_success_at = clock_timestamp(),
        auth_backoff_until = null,
        auth_failures = 0,
        updated_at = clock_timestamp()
    where id;
    return;
  end if;
  if p_error in (-124, -1241) then
    update public.tuition_zalo_response_sync
    set auth_failures = auth_failures + 1,
        last_error_at = clock_timestamp(),
        last_error_code = p_error::text,
        last_error_detail = detail,
        updated_at = clock_timestamp()
    where id
    returning auth_failures into failures;
    update public.tuition_zalo_response_sync
    set auth_backoff_until = clock_timestamp() + case
      when failures <= 1 then interval '15 minutes'
      when failures = 2 then interval '1 hour'
      else interval '6 hours'
    end
    where id;
    return;
  end if;
  update public.tuition_zalo_response_sync
  set last_error_at = clock_timestamp(),
      last_error_code = case when p_error is null then 'HTTP' else p_error::text end,
      last_error_detail = detail,
      updated_at = clock_timestamp()
  where id;
end $$;

create function public.commit_tuition_zalo_response_window(p_to_ms bigint, p_complete boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row public.tuition_zalo_response_sync;
begin
  select * into row from public.tuition_zalo_response_sync where id for update;
  if row.activated_at is null then
    return 'inactive';
  end if;
  if p_complete is distinct from true or p_to_ms is null or p_to_ms <= 0 then
    return 'held';
  end if;
  update public.tuition_zalo_response_sync
  set checkpoint_ms = p_to_ms,
      last_success_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id;
  return 'advanced';
end $$;

create function public.tuition_zalo_response_sync_gate()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'activated', sync.activated_at is not null,
    'checkpoint_ms', sync.checkpoint_ms,
    'overlap_ms', sync.overlap_ms,
    'page_limit', sync.page_limit,
    'interval_seconds', sync.interval_seconds,
    'auth_backoff_until', sync.auth_backoff_until,
    'earliest_send_ms', (
      select floor(extract(epoch from min(sent_at)) * 1000)::bigint
      from public.tuition_zalo_sends
      where send_status in ('SENT', 'DELIVERED') and sent_at is not null
    )
  )
  from public.tuition_zalo_response_sync sync
  where sync.id;
$$;

create function public.tuition_zalo_response_sync_status()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sync public.tuition_zalo_response_sync;
  credential_count integer;
  credential_app text;
  credential_oa text;
begin
  if not coalesce(public.has_role('SUPER_ADMIN'), false) then
    raise exception 'SUPER_ADMIN role required';
  end if;
  select * into sync from public.tuition_zalo_response_sync where id;
  select count(*) into credential_count from notification_private.zalo_credentials;
  if credential_count = 1 then
    select app_id, oa_id into credential_app, credential_oa from notification_private.zalo_credentials limit 1;
  end if;
  return jsonb_build_object(
    'activated', sync.activated_at is not null,
    'last_success_at', sync.last_success_at,
    'last_error_at', sync.last_error_at,
    'last_error_code', sync.last_error_code,
    'last_error_detail', sync.last_error_detail,
    'auth_backoff_until', sync.auth_backoff_until,
    'checkpoint_ms', sync.checkpoint_ms,
    'interval_seconds', sync.interval_seconds,
    'webhook_clicks', (
      select count(*) from public.integration_webhook_events
      where provider = 'ZALO' and event_type = 'user_click_response_button' and status = 'ACCEPTED'
    ),
    'webhook_pending', (
      select count(*) from public.integration_webhook_events
      where provider = 'ZALO' and event_type = 'user_click_response_button' and status = 'ACCEPTED' and processed_at is null
    ),
    'credential_app_id', credential_app,
    'credential_oa_id', credential_oa
  );
end $$;

revoke all on function public.record_tuition_zalo_reply(text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.record_tuition_zalo_api_reply(text, text, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.mark_zalo_webhook_processed(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.replay_pending_tuition_zalo_clicks(text, integer) from public, anon, authenticated, service_role;
revoke all on function public.note_tuition_zalo_response_probe(integer, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.commit_tuition_zalo_response_window(bigint, boolean) from public, anon, authenticated, service_role;
revoke all on function public.tuition_zalo_response_sync_gate() from public, anon, authenticated, service_role;
revoke all on function public.tuition_zalo_response_sync_status() from public, anon, authenticated, service_role;
grant execute on function public.record_tuition_zalo_reply(text, text, text, text, text, text) to service_role;
grant execute on function public.record_tuition_zalo_api_reply(text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.mark_zalo_webhook_processed(uuid, text) to service_role;
grant execute on function public.replay_pending_tuition_zalo_clicks(text, integer) to service_role;
grant execute on function public.note_tuition_zalo_response_probe(integer, integer, text) to service_role;
grant execute on function public.commit_tuition_zalo_response_window(bigint, boolean) to service_role;
grant execute on function public.tuition_zalo_response_sync_gate() to service_role;
grant execute on function public.tuition_zalo_response_sync_status() to authenticated;
