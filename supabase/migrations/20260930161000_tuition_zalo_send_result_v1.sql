-- Record a definitive Zalo rejection for the one authorized tuition test.
-- Ambiguous results stay PREPARED and are not given an error that permits retry.

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
