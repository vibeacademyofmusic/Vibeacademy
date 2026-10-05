begin;
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
 if j.provider_receipt is not null or exists(select 1 from notification_events where job_id=j.id and event in ('CLAIMED','SENT','FAILED')) or j.attempts<>0 or exists(select 1 from zalo_notification_attempts where job_id=j.id) or j.status not in ('SKIPPED_NO_CHANNEL','QUEUED') then return 'ZALO_RETRY_DENIED'; end if;
 select * into c from registration_zalo_phone_consents where application_id=p_application and revoked_at is null for share;
 if not found then return 'NO_CONSENT'; end if;
 if j.payload->'delivery'->>'channel'='PHONE' then
   if j.payload->'delivery'->>'consent_id' is distinct from c.id::text or j.payload->'delivery'->>'normalized_recipient' is distinct from c.normalized_phone then return 'WRONG_RECIPIENT'; end if;
   if j.status='QUEUED' then return 'CHANNEL_READY'; end if;
   if not exists(select 1 from notification_templates where template_key=j.template_key and enabled and status='APPROVED') then return 'GATE_DISABLED'; end if;
 end if;
 if j.status <> 'SKIPPED_NO_CHANNEL' then return 'ZALO_RETRY_DENIED'; end if;
 select * into src from notification_private.domain_notice_source('REGISTRATION_COMPLETED',p_application);
 if not found or notification_private.registration_phone_payment_status(p_application) is null then return 'NOT_SENDABLE'; end if;
 perform set_config('zalo.durable_write','on',true);
 update notification_jobs set status=case when exists(select 1 from notification_templates where template_key=j.template_key and enabled and status='APPROVED') then 'QUEUED' else 'SKIPPED_NO_CHANNEL' end,error_code=case when exists(select 1 from notification_templates where template_key=j.template_key and enabled and status='APPROVED') then null else 'GATE_DISABLED' end,updated_at=clock_timestamp(),
   payload=jsonb_build_object('title',src.title,'href',src.href,'parameters',src.parameters||jsonb_build_object('payment_status',notification_private.registration_phone_payment_status(p_application)),
     'delivery',jsonb_build_object('channel','PHONE','normalized_recipient',c.normalized_phone,'consent_id',c.id,'template_id','640377','notice_version',c.notice_version,'tracking_id',replace(j.id::text,'-','')))
 where id=j.id;
 insert into notification_events(job_id,event,actor_id,details) values(j.id,'RETRY',auth.uid(),jsonb_build_object('source','CHANNEL_REEVALUATION','previous_status',j.status,'request_sent',false));
 return case when exists(select 1 from notification_templates where template_key=j.template_key and enabled and status='APPROVED') then 'CHANNEL_READY' else 'GATE_DISABLED' end;
end $$;
-- Both pages use this scoped view/preparation. No network calls occur in SQL.
create or replace function public.zalo_registration_recovery(p_job uuid,p_action text default 'VIEW',p_expected integer default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs; a registration_applications; c registration_zalo_phone_consents; reason text; mode text:='BLOCKED'; ord bigint; d record; h jsonb;
begin
 if auth.uid() is null or not has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_action not in ('VIEW','CHECK','PREPARE') then raise exception 'Invalid action'; end if;
 select * into j from notification_jobs where id=p_job and channel='ZALO' and entity_type='REGISTRATION_COMPLETED' for update;
 if not found then raise exception 'Unauthorized'; end if;
 select * into a from registration_applications where id=j.entity_id;
 -- SUPER_ADMIN is the existing cross-branch recovery role; do not widen it.
 if a.id is null or a.branch_id is distinct from j.branch_id then raise exception 'Unauthorized'; end if;
 if p_action='PREPARE' and (p_expected is null or p_expected<>j.attempts) then return jsonb_build_object('state','BLOCKED','reason','STALE_ACTION','attempts',j.attempts,'jobId',j.id,'applicationId',a.id); end if;
 if p_action in ('CHECK','PREPARE') and j.attempts=0 and j.sent_at is null and j.provider_message_id is null and not exists(select 1 from zalo_notification_attempts where job_id=j.id) and not exists(select 1 from notification_events where job_id=j.id and event in ('CLAIMED','SENT','FAILED')) then
   perform reevaluate_registration_zalo_channel(a.id);
   select * into j from notification_jobs where id=p_job;
 end if;
 select * into c from registration_zalo_phone_consents where application_id=a.id and revoked_at is null;
 select coalesce(jsonb_agg(jsonb_build_object('number',attempt_number,'state',state,'http',http_status,'providerError',provider_error) order by attempt_number),'[]'::jsonb) into h from zalo_notification_attempts where job_id=j.id;
 if j.status='DELIVERED' or j.delivered_at is not null then mode:='DELIVERED'; reason:='DELIVERED';
 elsif j.status='SENT' or j.sent_at is not null or j.provider_message_id is not null then mode:='ACCEPTED'; reason:='ACCEPTED';
 elsif j.status in ('PROCESSING','ACCEPTANCE_UNKNOWN') or (not exists(select 1 from zalo_notification_attempts where job_id=j.id) and exists(select 1 from notification_events where job_id=j.id and event in ('CLAIMED','SENT'))) or exists(select 1 from zalo_notification_attempts where job_id=j.id and state in ('REQUESTING','UNKNOWN','ACCEPTED')) then mode:='UNCERTAIN'; reason:='ZALO_ACCEPTANCE_UNKNOWN';
 elsif a.status<>'COMPLETED' then reason:='NOT_SENDABLE';
 elsif c.id is null then reason:='NO_CONSENT';
 elsif j.payload->'delivery'->>'channel' is distinct from 'PHONE' then reason:='CHANNEL_SNAPSHOT_REQUIRED';
 elsif j.payload->'delivery'->>'consent_id' is distinct from c.id::text or j.payload->'delivery'->>'normalized_recipient' is distinct from c.normalized_phone then reason:='WRONG_RECIPIENT';
 elsif not exists(select 1 from notification_templates where template_key=j.template_key and provider='ZALO' and enabled and status='APPROVED' and provider_template_id='640377') then reason:='GATE_DISABLED';
 else
   select order_code into ord from registration_payos_orders where application_id=a.id and state='PAID' order by paid_at desc limit 1;
   if notification_private.zalo_retry_eligible(j.id) then
     mode:='RETRY'; reason:='CHANNEL_READY';
     if p_action='PREPARE' then
       perform prepare_zalo_registration_retry(j.id);
       select * into d from preview_zalo_dispatch_decision(ord);
       if d.decision is distinct from 'SEND' then mode:='BLOCKED';reason:=coalesce(d.decision,'NOT_SENDABLE'); end if;
     end if;
   else
     select * into d from preview_zalo_dispatch_decision(ord);
     if d.decision='SEND' and d.job_id=j.id and j.attempts=0 and not exists(select 1 from notification_events where job_id=j.id and event in ('CLAIMED','SENT','FAILED')) then mode:='SEND';reason:='CHANNEL_READY';
     else reason:=case when j.attempts>0 then 'ZALO_RETRY_DENIED' else coalesce(d.decision,'NOT_SENDABLE') end; end if;
   end if;
 end if;
 return jsonb_build_object('state',mode,'reason',reason,'jobId',j.id,'applicationId',a.id,'attempts',j.attempts,'orderCode',ord,
 'consentedPhone',case when c.id is not null then left(c.normalized_phone,4)||'…'||right(c.normalized_phone,3) end,
 'snapshotPhone',case when j.payload->'delivery'->>'normalized_recipient' is not null then left(j.payload->'delivery'->>'normalized_recipient',4)||'…'||right(j.payload->'delivery'->>'normalized_recipient',3) end,'history',h);
end $$;
revoke all on function public.zalo_registration_recovery(uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.zalo_registration_recovery(uuid,text,integer) to authenticated;

-- CAS over the rendered attempt count fences double clicks and stale pages,
-- including a duplicate arriving after a definitive rejection has completed.
create or replace function public.claim_zalo_registration_recovery(p_job uuid,p_expected integer,p_order_code bigint,p_version bigint,p_app text,p_oa text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs; d record; claimed jsonb;
begin
 select * into j from notification_jobs where id=p_job for update;
 if j.id is null or p_expected is null or j.attempts<>p_expected then return jsonb_build_object('state','STALE_ACTION'); end if;
 select * into d from preview_zalo_dispatch_decision(p_order_code);
 if d.job_id is distinct from j.id then return jsonb_build_object('state','NOT_SENDABLE'); end if;
 claimed:=claim_zalo_registration_attempt(p_order_code,p_version,p_app,p_oa);
 if claimed->>'state'='CLAIMED' then
   -- Reserve first; the outbound boundary, not eligibility checks, counts a send.
   update notification_jobs set attempts=j.attempts where id=j.id;
 end if;
 return claimed;
end $$;
revoke all on function public.claim_zalo_registration_recovery(uuid,integer,bigint,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_zalo_registration_recovery(uuid,integer,bigint,bigint,text,text) to service_role;
create or replace function public.start_zalo_recovery_outbound(p_attempt uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare a zalo_notification_attempts; j notification_jobs;
begin
 select * into a from zalo_notification_attempts where id=p_attempt;
 if not found then return 'DENIED'; end if;
 select * into j from notification_jobs where id=a.job_id for update;
 if a.state<>'REQUESTING' or j.status<>'PROCESSING' or j.lease_token is distinct from a.id or j.attempts<>a.attempt_number-1 then return 'DENIED'; end if;
 update notification_jobs set attempts=a.attempt_number where id=j.id;
 return 'STARTED';
end $$;
revoke all on function public.start_zalo_recovery_outbound(uuid) from public,anon,authenticated,service_role;
grant execute on function public.start_zalo_recovery_outbound(uuid) to service_role;
commit;
