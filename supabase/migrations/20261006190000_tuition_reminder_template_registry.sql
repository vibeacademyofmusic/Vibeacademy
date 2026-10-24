-- The tuition reminder reads its Zalo template id from notification_templates.
-- The row stays on the currently approved id until a new contract is verified.
-- Registration template 640377 is not updated. Sending stays disabled.

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
  template_id text;
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
  if p_outcome = 'ERROR' and p_error not in ('PROVIDER_NOT_CONFIGURED', 'ZALO_PILOT_OUTBOUND_DISABLED', 'PROVIDER_REJECTED', 'ZALO_TOKEN_INVALID', 'ZALO_PROOF_INVALID') then
    raise exception 'Invalid tuition Zalo error';
  end if;
  select * into send from public.tuition_zalo_sends where id = p_send for update;
  if not found then
    raise exception 'Tuition Zalo send not found';
  end if;
  if send.send_status <> 'PREPARED' then
    return case send.send_status when 'SENT' then 'SENT' when 'DELIVERED' then 'SENT' when 'FAILED' then 'ERROR' else 'NOT_SENT' end;
  end if;

  select provider_template_id into template_id
  from public.notification_templates
  where template_key = 'ZALO_TUITION_REMINDER' and provider = 'ZALO' and status = 'APPROVED';
  template_id := coalesce(send.provider_template_id, template_id);

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
      'provider_template_id', template_id,
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
    if coalesce(message->>'template_id','') <> '' and candidate.provider_template_id is distinct from message->>'template_id' then return 'template_mismatch'; end if;
  end if;
  outcome:=public.record_tuition_zalo_reply('Zalo ZBS',message->>'tracking_id',p_payload->>'msg_id',message->>'data',message->>'submit_time',p_oa_id);
  return case when outcome='conflict' then 'recorded' else outcome end;
end $$;
