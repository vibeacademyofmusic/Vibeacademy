begin;
-- Preserve the stored notification enum. Consent is explicit and independently audited.
alter table public.registration_zalo_phone_consents drop constraint registration_zalo_phone_consents_source_check;
alter table public.registration_zalo_phone_consents add constraint registration_zalo_phone_consents_source_check check(source in ('REGISTRATION_FORM','REGISTRATION_RECORD'));
alter table public.registration_zalo_phone_consents add column confirmation_method text check(confirmation_method in ('IN_PERSON','PHONE','WRITTEN'));
alter table public.registration_zalo_phone_consents add column revoked_by uuid;

create or replace function public.registration_zalo_consent_details(p_application uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if not exists(select 1 from registration_applications where id=p_application) then raise exception 'REGISTRATION_NOT_FOUND'; end if;
 return jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object(
 'id',c.id,'phone',left(c.normalized_phone,4)||'…'||right(c.normalized_phone,3),
 'at',c.consented_at,'actor',coalesce(p.full_name,c.actor_id::text),'source',c.source,'method',c.confirmation_method,
 'revokedAt',c.revoked_at,'revokedBy',coalesce(r.full_name,c.revoked_by::text)) order by c.consented_at desc)
 from registration_zalo_phone_consents c left join profiles p on p.id=c.actor_id left join profiles r on r.id=c.revoked_by
 where c.application_id=p_application),'[]'::jsonb));
end $$;

create or replace function public.update_registration_zalo_consent(
 p_application uuid,p_expected uuid,p_operation text,p_phone text,p_confirmed boolean,p_method text,
 p_source text default 'REGISTRATION_RECORD')
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare c registration_zalo_phone_consents; j notification_jobs; result text; normalized text;
begin
 if auth.uid() is null or not has_role('SUPER_ADMIN') then raise exception 'Unauthorized'; end if;
 if p_operation is null or p_operation not in ('RECORD','REVOKE') or p_source is null or p_source not in ('REGISTRATION_FORM','REGISTRATION_RECORD') then raise exception 'PHONE_CONSENT_INVALID'; end if;
 if p_confirmed is distinct from true then raise exception 'PHONE_CONSENT_REQUIRED'; end if;
 -- Same lock order as claims/recovery. Expected consent fences stale tabs and double submits.
 perform 1 from notification_jobs where entity_id=p_application and entity_type='REGISTRATION_COMPLETED' and channel='ZALO' order by id for update;
 perform 1 from registration_applications where id=p_application for update;
 if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
 select * into c from registration_zalo_phone_consents where application_id=p_application and revoked_at is null for update;
 if c.id is distinct from p_expected then raise exception 'PHONE_CONSENT_STALE'; end if;
 if p_operation='RECORD' then
   if p_method is null or p_method not in ('IN_PERSON','PHONE','WRITTEN') then raise exception 'PHONE_CONSENT_SOURCE_REQUIRED'; end if;
   if p_phone is null or btrim(p_phone) !~ '^\+?[0-9 () .-]+$' then raise exception 'PHONE_INVALID'; end if;
   normalized:=notification_private.normalize_vn_phone(p_phone);
   if normalized is null then raise exception 'PHONE_INVALID'; end if;
 end if;
 if c.id is not null then
   update registration_zalo_phone_consents set revoked_at=clock_timestamp(),revoked_by=auth.uid() where id=c.id;
 end if;
 if p_operation='RECORD' then
   insert into registration_zalo_phone_consents(application_id,normalized_phone,notice_version,source,actor_id,confirmation_method)
   values(p_application,normalized,'zbs-phone-v1',p_source,auth.uid(),p_method);
 end if;
 -- Only explicitly recorded changes may replace a never-attempted snapshot.
 -- Checks alone retain the existing WRONG_RECIPIENT protection.
 for j in select * from notification_jobs where entity_id=p_application and entity_type='REGISTRATION_COMPLETED' and channel='ZALO' loop
   if j.attempts=0 and j.status in ('QUEUED','SKIPPED_NO_CHANNEL') and j.sent_at is null and j.provider_message_id is null and j.provider_receipt is null
      and not exists(select 1 from zalo_notification_attempts where job_id=j.id)
      and not exists(select 1 from notification_events where job_id=j.id and event in ('CLAIMED','SENT','FAILED')) then
     perform set_config('zalo.durable_write','on',true);
     update notification_jobs set payload=payload-'delivery',status='SKIPPED_NO_CHANNEL',error_code='NO_CONSENT',updated_at=clock_timestamp() where id=j.id;
     insert into notification_events(job_id,event,actor_id,details) values(j.id,'RETRY',auth.uid(),jsonb_build_object('source','CONSENT_'||p_operation,'previous_consent_id',c.id,'request_sent',false));
   end if;
 end loop;
 result:=reevaluate_registration_zalo_channel(p_application);
 return case when p_operation='REVOKE' then 'CONSENT_REVOKED' when result='NOT_SENDABLE' then 'CONSENT_RECORDED' else result end;
end $$;

create function public.create_registration_with_zalo_consent(
 p_request uuid,p_branch uuid,p_lead uuid,p_student_name text,p_student_date_of_birth date,
 p_parent_name text,p_parent_phone text,p_curriculum uuid,p_level uuid,p_subject uuid,
 p_desired_start date,p_preferred_schedule text,p_consent boolean,p_consent_method text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare app_id uuid;
begin
 app_id:=create_registration_application_with_academics(p_request,p_branch,p_lead,p_student_name,p_student_date_of_birth,
 p_parent_name,p_parent_phone,p_curriculum,p_level,p_subject,p_desired_start,p_preferred_schedule);
 if p_consent is true then
   perform update_registration_zalo_consent(app_id,null,'RECORD',p_parent_phone,true,p_consent_method,'REGISTRATION_FORM');
 end if;
 return app_id;
end $$;
revoke all on function public.registration_zalo_consent_details(uuid) from public,anon,authenticated,service_role;
grant execute on function public.registration_zalo_consent_details(uuid) to authenticated;
revoke all on function public.update_registration_zalo_consent(uuid,uuid,text,text,boolean,text,text) from public,anon,authenticated,service_role;
grant execute on function public.update_registration_zalo_consent(uuid,uuid,text,text,boolean,text,text) to authenticated;
revoke all on function public.create_registration_with_zalo_consent(uuid,uuid,uuid,text,date,text,text,uuid,uuid,uuid,date,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.create_registration_with_zalo_consent(uuid,uuid,uuid,text,date,text,text,uuid,uuid,uuid,date,text,boolean,text) to authenticated;

-- Both automatic and manual transports recheck the consent after reserving a claim.
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
revoke all on function public.authorize_zalo_registration_outbound(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.authorize_zalo_registration_outbound(uuid,boolean) to service_role;
create or replace function public.start_zalo_recovery_outbound(p_attempt uuid)
returns text language sql security definer set search_path=public,pg_temp as $$
 select authorize_zalo_registration_outbound(p_attempt,true);
$$;
notify pgrst,'reload schema';
commit;
