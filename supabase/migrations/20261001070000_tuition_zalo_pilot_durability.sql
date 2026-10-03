-- Future send identity is captured before outbound I/O. Historical rows stay unknown.
alter table public.tuition_zalo_sends
  add column app_id text check (app_id is null or app_id ~ '^[0-9]{8,32}$'),
  add column provider_template_id text check (provider_template_id is null or provider_template_id ~ '^[0-9]{1,20}$'),
  add column context_captured_at timestamptz;
alter table public.integration_webhook_events add column next_attempt_at timestamptz;

create function public.snapshot_tuition_zalo_send_context(p_tracking_id text,p_app_id text,p_oa_id text,p_template_id text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate public.tuition_zalo_sends;
begin
  if p_app_id is null or p_oa_id is null or p_template_id is null then return 'invalid_context'; end if;
  if not exists(select 1 from notification_private.zalo_credentials where app_id=p_app_id and oa_id=p_oa_id and state='READY')
    or not exists(select 1 from notification_templates where template_key='ZALO_TUITION_REMINDER' and provider_template_id=p_template_id)
    then return 'context_mismatch'; end if;
  select * into candidate from tuition_zalo_sends where tracking_id=p_tracking_id for update;
  if not found or candidate.send_status<>'PREPARED' then return 'send_not_prepared'; end if;
  if candidate.context_captured_at is not null then
    if candidate.app_id=p_app_id and candidate.oa_id=p_oa_id and candidate.provider_template_id=p_template_id then return 'captured'; end if;
    return 'context_mismatch';
  end if;
  update tuition_zalo_sends set app_id=p_app_id,oa_id=p_oa_id,provider_template_id=p_template_id,context_captured_at=clock_timestamp() where id=candidate.id;
  return 'captured';
end $$;
revoke all on function public.snapshot_tuition_zalo_send_context(text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.snapshot_tuition_zalo_send_context(text,text,text,text) to service_role;

-- Shared reply writer retains cross-source deduplication. Guard webhook App against
-- the immutable snapshot when one exists; absent historical identity is not invented.
create or replace function public.apply_tuition_zalo_response(p_payload jsonb,p_oa_id text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare message jsonb; candidate public.tuition_zalo_sends; outcome text;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then return 'invalid_payload'; end if;
  if p_payload->>'event_name' is distinct from 'user_click_response_button' then return 'ignored'; end if;
  if p_oa_id is null or p_payload->>'oa_id' is distinct from p_oa_id then return 'oa_mismatch'; end if;
  if coalesce(p_payload->>'app_id','') !~ '^[0-9]{8,32}$' then return 'app_mismatch'; end if;
  if coalesce(p_payload->>'timestamp','') !~ '^[0-9]{10,16}$' then return 'invalid_time'; end if;
  message:=p_payload->'message';
  if jsonb_typeof(message) is distinct from 'object' then return 'invalid_message'; end if;
  if message->>'button_type' is distinct from 'response' then return 'invalid_button'; end if;
  select * into candidate from tuition_zalo_sends where tracking_id=message->>'tracking_id';
  if found and candidate.context_captured_at is not null then
    if candidate.app_id is distinct from p_payload->>'app_id' then return 'app_mismatch'; end if;
    if candidate.oa_id is distinct from p_oa_id then return 'oa_mismatch'; end if;
    if candidate.provider_template_id is distinct from '643118' then return 'template_mismatch'; end if;
  end if;
  outcome:=public.record_tuition_zalo_reply('Zalo ZBS',message->>'tracking_id',p_payload->>'msg_id',message->>'data',message->>'submit_time',p_oa_id);
  return case when outcome='conflict' then 'recorded' else outcome end;
end $$;

create or replace function public.process_tuition_zalo_webhook(p_event_id uuid,p_oa_id text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare event public.integration_webhook_events; applied text; message jsonb; candidate public.tuition_zalo_sends;
begin
  select * into event from integration_webhook_events where id=p_event_id and provider='ZALO'
    and event_type in ('user_click_response_button','user_received_message') and status='ACCEPTED' for update;
  if not found then return 'missing_event'; end if;
  if event.processed_at is not null then return 'duplicate'; end if;
  begin
    if event.event_type='user_click_response_button' then
      applied:=public.apply_tuition_zalo_response(event.payload,p_oa_id);
    else
      message:=event.payload->'message';
      -- Ingress already verified App/OA/signature. Delivery remains distinct from response.
      select * into candidate from tuition_zalo_sends where tracking_id=message->>'tracking_id';
      if found and candidate.context_captured_at is not null and candidate.app_id is distinct from event.payload->>'app_id' then
        applied:='app_mismatch';
      elsif found and candidate.oa_id is not null and candidate.oa_id is distinct from p_oa_id then
        applied:='oa_mismatch';
      else
        applied:=public.note_tuition_zalo_delivery(message->>'tracking_id',message->>'msg_id',message->>'delivery_time');
      end if;
    end if;
    if applied in ('recorded','duplicate','conflict','DELIVERED','IDEMPOTENT') then
      perform public.mark_zalo_webhook_processed(event.id,null);
      update integration_webhook_events set next_attempt_at=null where id=event.id;
    else
      perform public.mark_zalo_webhook_processed(event.id,upper(coalesce(applied,'APPLY_FAILED')));
      update integration_webhook_events set next_attempt_at=clock_timestamp()+make_interval(secs=>least(900,15*power(2,least(event.attempt_count,6))::integer)) where id=event.id;
    end if;
  exception when others then
    perform public.mark_zalo_webhook_processed(event.id,'APPLY_FAILED');
    update integration_webhook_events set next_attempt_at=clock_timestamp()+interval '1 minute' where id=event.id;
    return 'apply_failed';
  end;
  return applied;
end $$;

create or replace function public.replay_pending_tuition_zalo_clicks(p_oa_id text,p_limit integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare event record; applied text; replayed integer:=0;
begin
  if p_oa_id is null or p_oa_id !~ '^[0-9]{8,32}$' or p_limit is null or p_limit<1 or p_limit>20 then return 0; end if;
  for event in select id from integration_webhook_events where provider='ZALO'
    and event_type in ('user_click_response_button','user_received_message') and status='ACCEPTED' and processed_at is null
    and received_at<clock_timestamp()-interval '15 seconds' and (next_attempt_at is null or next_attempt_at<=clock_timestamp())
    order by received_at,id limit p_limit for update skip locked
  loop
    applied:=public.process_tuition_zalo_webhook(event.id,p_oa_id);
    if applied in ('recorded','duplicate','conflict','DELIVERED','IDEMPOTENT') then replayed:=replayed+1; end if;
  end loop;
  return replayed;
end $$;

-- When send-result persistence finally succeeds, wake early callbacks immediately.
create function public.wake_tuition_zalo_callbacks() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.send_status in ('SENT','DELIVERED') and old.send_status='PREPARED' then
    update integration_webhook_events set next_attempt_at=null where id in (
      select id from integration_webhook_events where provider='ZALO' and processed_at is null
      and payload->'message'->>'tracking_id'=new.tracking_id for update skip locked
    );
  end if;
  return new;
end $$;
create trigger tuition_zalo_send_wake_callbacks after update on tuition_zalo_sends for each row execute function public.wake_tuition_zalo_callbacks();
revoke all on function public.wake_tuition_zalo_callbacks() from public,anon,authenticated,service_role;

-- Recovery sources must also match immutable send context.
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
  if p_response not in ('Tiếp tục học', 'Dừng học', 'Yêu cầu khác') then
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
  if send.context_captured_at is not null and (send.app_id is distinct from p_app_id or send.provider_template_id is distinct from p_template_id) then
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
  if submit_at < coalesce(send.context_captured_at,send.sent_at) then
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

create or replace function public.record_tuition_zalo_api_reply(
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
  elsif exists (select 1 from tuition_zalo_sends candidate where candidate.tracking_id=p_tracking_id
    and candidate.context_captured_at is not null and candidate.app_id is distinct from p_app_id) then
    outcome := 'app_mismatch';
  elsif exists (select 1 from tuition_zalo_sends candidate where candidate.tracking_id=p_tracking_id
    and candidate.context_captured_at is not null and candidate.provider_template_id is distinct from p_template_id) then
    outcome := 'template_mismatch';
  elsif p_submit_ms is null or p_submit_ms !~ '^[0-9]{13}$' then
    outcome := 'invalid_time';
  elsif exists (
    select 1 from public.tuition_zalo_sends candidate
    where candidate.tracking_id = p_tracking_id
      and candidate.sent_at is not null
      and coalesce(candidate.context_captured_at,candidate.sent_at) > to_timestamp(p_submit_ms::numeric / 1000.0)
  ) then
    outcome := 'invalid_time';
  else
    outcome := public.record_tuition_zalo_reply('Zalo response API', p_tracking_id, p_message_id, p_button, p_submit_ms, p_oa_id);
  end if;
  if p_submit_ms ~ '^[0-9]{13}$' and p_tracking_id ~ '^[A-Za-z0-9]{1,48}$' and p_message_id ~ '^[A-Za-z0-9_-]{1,80}$' and p_button in ('Tiếp tục học', 'Dừng học', 'Yêu cầu khác') and p_oa_id ~ '^[0-9]{8,32}$' then
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


alter table public.zalo_webhook_receipts add column relay_request_id text, add column invocation_id text;
create or replace function public.record_zalo_webhook_receipt(p_receipt jsonb) returns void
language sql security definer set search_path=public,pg_temp as $$
  insert into public.zalo_webhook_receipts(payload_digest,event_type,message_id,tracking_id,verified,http_status,outcome,console_test,relay_request_id,invocation_id)
  values (p_receipt->>'payloadDigest',left(p_receipt->>'eventName',80),left(p_receipt->>'messageId',80),left(p_receipt->>'trackingId',80),
    (p_receipt->>'verified')::boolean,(p_receipt->>'httpStatus')::integer,left(p_receipt->>'outcome',80),(p_receipt->>'consoleTest')::boolean,
    left(p_receipt->>'relayRequestId',160),left(p_receipt->>'invocationId',160));
$$;
