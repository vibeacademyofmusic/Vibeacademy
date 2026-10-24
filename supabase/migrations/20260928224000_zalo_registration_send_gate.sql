begin;
-- A disabled template is the database kill switch for registration PHONE sends.
-- Check at preview/claim and again at the last boundary before HTTP. A claim
-- made just before shutdown is released without recording a provider request.
-- Operators must also pause workers and reconcile already in-flight requests.

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
  if not exists (
    select 1 from public.notification_templates template
    where template.template_key = job.template_key
      and template.provider = 'ZALO'
      and template.provider_template_id = '640377'
      and template.status = 'APPROVED'
      and template.enabled
  ) then
    return query select 'GATE_DISABLED', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  if job.status not in ('QUEUED', 'RETRYING') then
    return query select 'NOT_SENDABLE', job.id, null::text, null::text, null::jsonb, 'PHONE'::text;
    return;
  end if;
  return query select 'SEND', job.id, target.normalized_phone, job.idempotency_key, job.payload->'parameters', 'PHONE'::text;
end $$;

create or replace function public.claim_zalo_registration_attempt(p_order_code bigint,p_version bigint,p_app text,p_oa text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs; decision record; attempt uuid:=gen_random_uuid(); expected jsonb; src record; c notification_private.zalo_credentials;
begin
 select * into decision from preview_zalo_dispatch_decision(p_order_code);
 if decision.decision is distinct from 'SEND' then return jsonb_build_object('state',coalesce(decision.decision,'NOT_CLAIMED')); end if;
 select * into j from notification_jobs where id=decision.job_id for update;
 -- Locks hold current eligibility steady until the claim commits.
 perform 1 from registration_applications where id=j.entity_id for share;
 perform 1 from registration_deposit_terms where application_id=j.entity_id for share;
 perform 1 from registration_payos_orders where application_id=j.entity_id for share;
 perform 1 from registration_zalo_phone_consents where application_id=j.entity_id and revoked_at is null for share;
 perform 1 from notification_templates where template_key=j.template_key for share;
 select * into decision from preview_zalo_dispatch_decision(p_order_code);
 if decision.decision is distinct from 'SEND' or j.attempts>=5 then return jsonb_build_object('state','NOT_CLAIMED'); end if;
 if j.provider_message_id is not null or j.sent_at is not null or exists(select 1 from zalo_notification_attempts where job_id=j.id and state in ('REQUESTING','UNKNOWN','ACCEPTED')) then return jsonb_build_object('state','AMBIGUOUS'); end if;
 if j.payload->'delivery'->>'template_id' is distinct from '640377' or not exists(select 1 from notification_templates where template_key=j.template_key and provider='ZALO' and status='APPROVED' and provider_template_id='640377' and enabled) then return jsonb_build_object('state','PAYLOAD_REJECTED'); end if;
 select * into src from notification_private.domain_notice_source('REGISTRATION_COMPLETED',j.entity_id);
 expected:=src.parameters||jsonb_build_object('payment_status',notification_private.registration_phone_payment_status(j.entity_id));
 if expected is null or expected is distinct from j.payload->'parameters' then return jsonb_build_object('state','PAYLOAD_REJECTED'); end if;
 if not exists(select 1 from registration_zalo_phone_consents where id::text=j.payload->'delivery'->>'consent_id' and application_id=j.entity_id and revoked_at is null and normalized_phone=decision.provider_user_id) then return jsonb_build_object('state','NO_CONSENT'); end if;
 select * into c from notification_private.zalo_credentials where app_id=p_app and oa_id=p_oa for share;
 if c.version is distinct from p_version or c.state is distinct from 'READY' or c.refresh_token is null or c.expires_at is null or c.expires_at<=clock_timestamp()+interval '30 seconds' then return jsonb_build_object('state','ZALO_CREDENTIAL_CHANGED'); end if;
 perform set_config('zalo.durable_write','on',true);
 insert into zalo_notification_attempts(id,job_id,attempt_number,credential_version,state) values(attempt,j.id,j.attempts+1,p_version,'REQUESTING');
 update notification_jobs set status='PROCESSING',attempts=attempts+1,lease_token=attempt,lease_until=clock_timestamp()+interval '2 minutes',error_code=null,updated_at=clock_timestamp() where id=j.id;
 insert into notification_events(job_id,event,details) values(j.id,'CLAIMED',jsonb_build_object('attempt_id',attempt,'credential_version',p_version));
 return jsonb_build_object('state','CLAIMED','attemptId',attempt,'jobId',j.id,'phone',decision.provider_user_id,'parameters',decision.parameters);
end $$;

create or replace function public.authorize_zalo_registration_outbound(p_attempt uuid,p_manual boolean)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare a zalo_notification_attempts; j notification_jobs;
begin
 select * into a from zalo_notification_attempts where id=p_attempt;
 if not found then return 'DENIED'; end if;
 select * into j from notification_jobs where id=a.job_id for update;
 select * into a from zalo_notification_attempts where id=p_attempt for update;
 if p_manual is null or a.state<>'REQUESTING' or j.status<>'PROCESSING' or j.lease_token is distinct from a.id
    or j.attempts<>(a.attempt_number-(case when p_manual then 1 else 0 end)) then return 'DENIED'; end if;
 if not exists(select 1 from public.notification_templates template
   where template.template_key=j.template_key and template.provider='ZALO'
     and template.provider_template_id='640377' and template.status='APPROVED' and template.enabled) then
   perform set_config('zalo.durable_write','on',true);
   update public.zalo_notification_attempts set state='REJECTED',completed_at=clock_timestamp(),error_code='ZALO_GATE_DISABLED' where id=a.id;
   update public.notification_jobs set status='SKIPPED_NO_CHANNEL',error_code='GATE_DISABLED',attempts=a.attempt_number-1,
     lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
   insert into public.notification_events(job_id,event,details) values(j.id,'FAILED',jsonb_build_object('source','TEMPLATE_OUTBOUND_GUARD','attempt_id',a.id,'request_sent',false));
   return 'GATE_DISABLED';
 end if;
 if not exists(select 1 from registration_zalo_phone_consents c where c.application_id=j.entity_id and c.revoked_at is null
   and c.id::text=j.payload->'delivery'->>'consent_id' and c.normalized_phone=j.payload->'delivery'->>'normalized_recipient') then
   perform set_config('zalo.durable_write','on',true);
   -- Definitively blocked locally; never invent a provider response or an unknown send.
   update zalo_notification_attempts set state='REJECTED',completed_at=clock_timestamp(),error_code='ZALO_CONSENT_WITHDRAWN' where id=a.id;
   update notification_jobs set status='SKIPPED_NO_CHANNEL',error_code='NO_CONSENT',attempts=a.attempt_number-1,
     lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=j.id;
   insert into notification_events(job_id,event,details) values(j.id,'FAILED',jsonb_build_object('source','CONSENT_OUTBOUND_GUARD','attempt_id',a.id,'request_sent',false));
   return 'NO_CONSENT';
 end if;
 if p_manual then update notification_jobs set attempts=a.attempt_number where id=j.id; end if;
 return 'STARTED';
end $$;

notify pgrst,'reload schema';
commit;
