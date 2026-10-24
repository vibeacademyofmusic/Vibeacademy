-- Local channel recovery: no sends, no automatic consent, no business-record writes.
begin;
create or replace function public.record_registration_zalo_phone_consent(
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
  -- Same lock order as dispatch: job, registration, consent.
  perform 1 from notification_jobs where entity_id=p_application and entity_type='REGISTRATION_COMPLETED' and channel='ZALO' order by id for update;
  perform 1 from registration_applications where id=p_application for update;
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
end $$;
create or replace function public.preview_zalo_dispatch_decision(p_order_code bigint)
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
  if not exists(select 1 from notification_templates where template_key=job.template_key and provider='ZALO' and enabled and status='APPROVED' and provider_template_id='640377') then
    return query select 'GATE_DISABLED', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if job.status not in ('QUEUED', 'RETRYING') then
    return query select 'NOT_SENDABLE', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  return query select 'SEND', job.id, target.normalized_phone, job.idempotency_key, job.payload->'parameters', 'PHONE'::text;
end $$;

create or replace function public.reevaluate_registration_zalo_channel(p_application uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs; c registration_zalo_phone_consents; src record;
begin
 if auth.uid() is null or not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 -- Serialize with manual recovery/worker claims; never replace an attempted recipient.
 perform 1 from notification_jobs where entity_id=p_application and entity_type='REGISTRATION_COMPLETED' and channel='ZALO' order by id for update;
 perform 1 from registration_applications where id=p_application and status='COMPLETED' for update;
 if not found then return 'NOT_SENDABLE'; end if;
 if (select count(*) from notification_jobs where entity_id=p_application and entity_type='REGISTRATION_COMPLETED' and channel='ZALO') <> 1 then return 'ZALO_RETRY_DENIED'; end if;
 select * into j from notification_jobs where entity_id=p_application and entity_type='REGISTRATION_COMPLETED' and channel='ZALO';
 if j.status in ('SENT','DELIVERED') or j.sent_at is not null or j.provider_message_id is not null then return 'ALREADY_ACCEPTED'; end if;
 if j.attempts<>0 or exists(select 1 from zalo_notification_attempts where job_id=j.id) or j.status not in ('SKIPPED_NO_CHANNEL','QUEUED') then return 'ZALO_RETRY_DENIED'; end if;
 select * into c from registration_zalo_phone_consents where application_id=p_application and revoked_at is null for share;
 if not found then return 'NO_CONSENT'; end if;
 if not exists(select 1 from notification_templates where template_key=j.template_key and provider='ZALO' and enabled and status='APPROVED' and provider_template_id='640377') then return 'GATE_DISABLED'; end if;
 if j.payload->'delivery'->>'channel'='PHONE' then
   if j.payload->'delivery'->>'consent_id' is distinct from c.id::text or j.payload->'delivery'->>'normalized_recipient' is distinct from c.normalized_phone then return 'WRONG_RECIPIENT'; end if;
   return 'CHANNEL_READY';
 end if;
 if j.status <> 'SKIPPED_NO_CHANNEL' then return 'ZALO_RETRY_DENIED'; end if;
 select * into src from notification_private.domain_notice_source('REGISTRATION_COMPLETED',p_application);
 if not found or notification_private.registration_phone_payment_status(p_application) is null then return 'NOT_SENDABLE'; end if;
 perform set_config('zalo.durable_write','on',true);
 update notification_jobs set status='QUEUED',error_code=null,updated_at=clock_timestamp(),
   payload=jsonb_build_object('title',src.title,'href',src.href,'parameters',src.parameters||jsonb_build_object('payment_status',notification_private.registration_phone_payment_status(p_application)),
     'delivery',jsonb_build_object('channel','PHONE','normalized_recipient',c.normalized_phone,'consent_id',c.id,'template_id','640377','notice_version',c.notice_version,'tracking_id',replace(j.id::text,'-','')))
 where id=j.id;
 insert into notification_events(job_id,event,actor_id,details) values(j.id,'RETRY',auth.uid(),jsonb_build_object('source','CHANNEL_REEVALUATION','previous_status',j.status,'request_sent',false));
 return 'CHANNEL_READY';
end $$;
revoke all on function public.reevaluate_registration_zalo_channel(uuid) from public,anon,authenticated,service_role;
grant execute on function public.reevaluate_registration_zalo_channel(uuid) to authenticated;
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
    case when consent.id is null then 'NO_CONSENT'
      when exists(select 1 from notification_jobs j where j.entity_id=p_application and j.entity_type='REGISTRATION_COMPLETED' and j.channel='ZALO' and j.payload->'delivery'->>'channel'='PHONE' and (j.payload->'delivery'->>'consent_id' is distinct from consent.id::text or j.payload->'delivery'->>'normalized_recipient' is distinct from consent.normalized_phone)) then 'WRONG_RECIPIENT'
      else null end;
end $$;
commit;
