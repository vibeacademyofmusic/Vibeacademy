begin;

-- Owner-approved bearer links: no parent login. The rest of the portal keeps its RLS.
-- No old published report is automatically made public and no provider is enabled here.
create table notification_private.learning_report_links (
  report_id uuid primary key references public.learning_reports(id),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  revoked_at timestamptz,
  pdf_state text not null default 'PENDING' check (pdf_state in ('PENDING','BUILDING','READY','FAILED')),
  pdf_lease uuid,
  pdf_lease_until timestamptz,
  pdf_path text,
  pdf_sha256 text check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes integer,
  pdf_error text,
  pdf_retry_at timestamptz,
  request_count bigint not null default 0,
  last_requested_at timestamptz,
  check (pdf_state <> 'READY' or (pdf_path is not null and pdf_sha256 is not null and pdf_bytes > 0))
);
revoke all on notification_private.learning_report_links from public, anon, authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('learning-report-pdfs','learning-report-pdfs',false,10485760,array['application/pdf'])
on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='learning-report-pdfs' and public) then
    raise exception 'Report PDF bucket must be private';
  end if;
end $$;

create function notification_private.prepare_learning_report_link(p_report uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into notification_private.learning_report_links(report_id,created_by)
  select r.id,auth.uid() from learning_reports r
  where r.id=p_report and r.status='PUBLISHED' and r.snapshot_data is not null
    and r.approved_at is not null and r.approved_by is not null
  on conflict(report_id) do nothing;
end $$;

create function notification_private.report_link_on_publish() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status='PUBLISHED' and old.status is distinct from 'PUBLISHED' then
    perform notification_private.prepare_learning_report_link(new.id);
    -- The older generic emitter swallows exceptions. Repeating its idempotent enqueue
    -- here makes report publication and its outbox atomic instead of silently losing work.
    perform public.enqueue_domain_notification(case when new.report_type='END_OF_COURSE' then 'END_OF_COURSE_REPORT_PUBLISHED' else 'LEARNING_REPORT_PUBLISHED' end,new.id);
  end if;
  return new;
end $$;
create trigger report_link_on_publish after update of status on public.learning_reports
for each row execute function notification_private.report_link_on_publish();

-- No bearer token is placed in notification_jobs: its branch readers are broader than report readers.
create function notification_private.learning_report_job_context(p_job uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('user_id',c.provider_user_id,'report_id',r.id,'token',l.token,
   'pdf_state',l.pdf_state,'parameters',jsonb_build_object(
     'customer_name',p.full_name,
     'student_name',r.snapshot_data#>>'{student,name}',
     'student_code',r.snapshot_data#>>'{student,code}',
     'program_name',r.snapshot_data#>>'{academic,curriculum}',
     'report_type',case r.report_type when 'MONTHLY' then 'Báo cáo tháng' else 'Báo cáo cuối kỳ' end,
     'report_period',to_char(r.period_start,'DD/MM/YYYY')||'-'||to_char(r.period_end,'DD/MM/YYYY'),
     'report_link_id',l.token))
 from notification_jobs j
 join learning_reports r on r.id=j.entity_id and r.student_id=j.student_id and r.branch_id=j.branch_id
 join notification_private.learning_report_links l on l.report_id=r.id and l.revoked_at is null
 join customer_channel_links c on c.id=j.channel_link_id and c.parent_id=j.recipient_subject_id
 join parents parent on parent.id=c.parent_id and parent.status='ACTIVE'
 join profiles p on p.id=parent.user_id and p.status='ACTIVE'
 where j.id=p_job and j.channel='ZALO' and j.delivery_mode='LIVE'
   and j.template_key='ZALO_LEARNING_REPORT_PUBLISHED'
   and j.entity_type in ('LEARNING_REPORT_PUBLISHED','END_OF_COURSE_REPORT_PUBLISHED')
   and j.recipient_subject_type='PARENT'
   and r.status='PUBLISHED' and r.snapshot_data is not null
   and c.provider='ZALO' and c.status='ACTIVE' and c.consent_at is not null and c.provider_user_id is not null
   and exists(select 1 from student_parents sp where sp.parent_id=parent.id and sp.student_id=r.student_id
     and sp.is_active and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now()))
$$;

create function notification_private.prepare_learning_report_job() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.channel='ZALO' and new.template_key='ZALO_LEARNING_REPORT_PUBLISHED'
    and new.entity_type in ('LEARNING_REPORT_PUBLISHED','END_OF_COURSE_REPORT_PUBLISHED') then
   perform notification_private.prepare_learning_report_link(new.entity_id);
   new.payload:=jsonb_build_object('title','Báo cáo học tập đã phát hành',
     'href','/my-learning','report_id',new.entity_id);
 end if;
 return new;
end $$;
create trigger prepare_learning_report_job before insert on public.notification_jobs
for each row execute function notification_private.prepare_learning_report_job();

update public.notification_templates
set parameter_schema='["customer_name","student_name","student_code","program_name","report_type","report_period","report_link_id"]'::jsonb,
 description='Báo cáo học tập — CTA mở PDF riêng không đăng nhập; chờ mẫu được duyệt'
where template_key='ZALO_LEARNING_REPORT_PUBLISHED' and enabled=false and status='DRAFT';

create function public.learning_report_link_manage(p_report uuid,p_action text default 'READ') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l notification_private.learning_report_links;
begin
 if auth.uid() is null or not coalesce(has_role('SUPER_ADMIN'),false) then raise exception 'Unauthorized'; end if;
 if p_action not in ('READ','CREATE','REVOKE') then raise exception 'Invalid action'; end if;
 if not exists(select 1 from learning_reports where id=p_report and status='PUBLISHED') then raise exception 'Report not published'; end if;
 if p_action='CREATE' then perform notification_private.prepare_learning_report_link(p_report); end if;
 if p_action='REVOKE' then
   update notification_private.learning_report_links set revoked_at=coalesce(revoked_at,clock_timestamp()) where report_id=p_report;
 end if;
 select * into l from notification_private.learning_report_links where report_id=p_report;
 if l.report_id is null then return null; end if;
 if p_action in ('CREATE','REVOKE') then
   insert into learning_report_events(report_id,event,version,actor_id)
   select id,'PDF_LINK_'||p_action,version,auth.uid() from learning_reports where id=p_report;
 end if;
 return jsonb_build_object('path',case when l.revoked_at is null then '/r/learning/'||l.token||'/pdf' end,
   'revoked_at',l.revoked_at,'pdf_state',l.pdf_state,'pdf_error',l.pdf_error,
   'request_count',l.request_count,'last_requested_at',l.last_requested_at);
end $$;

create function public.resolve_learning_report_pdf(p_token text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('report_id',r.id,'version',r.version,'path',l.pdf_path,
   'sha256',l.pdf_sha256,'bytes',l.pdf_bytes,'state',l.pdf_state)
 from notification_private.learning_report_links l join learning_reports r on r.id=l.report_id
 where p_token ~ '^[0-9a-f]{64}$' and l.token=p_token and l.revoked_at is null
   and r.status='PUBLISHED' and r.approved_at is not null and r.approved_by is not null
$$;

create function public.claim_learning_report_pdf(p_report uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l notification_private.learning_report_links; r learning_reports; lease uuid;
begin
 select * into l from notification_private.learning_report_links where report_id=p_report and revoked_at is null for update skip locked;
 if not found then return null; end if;
 select * into r from learning_reports where id=p_report and status='PUBLISHED';
 if not found or r.snapshot_data is null then return null; end if;
 if l.pdf_state='READY' then return jsonb_build_object('state','READY','path',l.pdf_path); end if;
 if l.pdf_state='BUILDING' and l.pdf_lease_until>now() then return jsonb_build_object('state','BUSY'); end if;
 lease:=gen_random_uuid();
 update notification_private.learning_report_links set pdf_state='BUILDING',pdf_lease=lease,
   pdf_lease_until=now()+interval '2 minutes',pdf_error=null where report_id=p_report;
 return jsonb_build_object('state','CLAIMED','lease',lease,'path',p_report::text||'/v'||r.version::text||'.pdf',
   'document',jsonb_build_object('id',r.id,'version',r.version,'type',r.report_type,'snapshot',public_report_snapshot(r.snapshot_data)));
end $$;

create function public.finish_learning_report_pdf(p_report uuid,p_lease uuid,p_sha256 text default null,p_bytes integer default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare v integer;
begin
 if p_sha256 is not null and (p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes<1 or p_bytes>10485760) then raise exception 'Invalid PDF'; end if;
 select version into v from learning_reports where id=p_report and status='PUBLISHED';
 if v is null then return false; end if;
 update notification_private.learning_report_links set
   pdf_state=case when p_sha256 is null then 'FAILED' else 'READY' end,
   pdf_path=case when p_sha256 is not null then p_report::text||'/v'||v::text||'.pdf' end,
   pdf_sha256=p_sha256,pdf_bytes=p_bytes,pdf_error=case when p_sha256 is null then 'PDF_PREPARATION_FAILED' end,
   pdf_retry_at=case when p_sha256 is null then now()+interval '5 minutes' end,
   pdf_lease=null,pdf_lease_until=null
 where report_id=p_report and pdf_lease=p_lease and pdf_state='BUILDING' and revoked_at is null;
 return found;
end $$;

create function public.note_learning_report_pdf_request(p_token text) returns void
language sql security definer set search_path=public,pg_temp as $$
 update notification_private.learning_report_links set request_count=request_count+1,last_requested_at=clock_timestamp()
 where token=p_token and revoked_at is null and pdf_state='READY'
$$;

create table notification_private.learning_report_send_attempts (
 id uuid primary key default gen_random_uuid(),job_id uuid not null references notification_jobs(id),
 state text not null check(state in ('REQUESTING','ACCEPTED','REJECTED','UNKNOWN')),
 app_id text not null,oa_id text not null,template_id text not null,template_version integer not null,
 credential_version bigint not null,provider_user_id text not null,
 created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 message_id text,error_code text
);
create index learning_report_attempt_job on notification_private.learning_report_send_attempts(job_id,created_at desc);
revoke all on notification_private.learning_report_send_attempts from public,anon,authenticated,service_role;

create function public.learning_report_delivery_work(p_limit integer default 5) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'reports',coalesce((select jsonb_agg(report_id) from (select report_id from notification_private.learning_report_links
    where revoked_at is null and (pdf_retry_at is null or pdf_retry_at<=now())
      and (pdf_state in ('PENDING','FAILED') or (pdf_state='BUILDING' and pdf_lease_until<=now()))
    order by created_at limit greatest(1,least(coalesce(p_limit,5),10))) s),'[]'::jsonb),
  'jobs',coalesce((select jsonb_agg(id) from (select j.id from notification_jobs j
    where j.channel='ZALO' and j.delivery_mode='LIVE' and j.template_key='ZALO_LEARNING_REPORT_PUBLISHED'
      and j.status in ('QUEUED','RETRYING','FAILED') and j.attempts<5 and (j.next_attempt_at is null or j.next_attempt_at<=now())
      and not exists(select 1 from notification_private.learning_report_send_attempts a where a.job_id=j.id and a.state in ('REQUESTING','UNKNOWN','ACCEPTED'))
    order by j.updated_at,j.id limit greatest(1,least(coalesce(p_limit,5),10))) s),'[]'::jsonb))
$$;

create function public.prepare_learning_report_zbs(p_job uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx jsonb; t notification_templates;
begin
 ctx:=notification_private.learning_report_job_context(p_job);
 if ctx is null then return jsonb_build_object('state','REPORT_RECIPIENT_INELIGIBLE'); end if;
 if ctx->>'pdf_state'<>'READY' then return jsonb_build_object('state','PDF_NOT_READY'); end if;
 select * into t from notification_templates where template_key='ZALO_LEARNING_REPORT_PUBLISHED' and provider='ZALO';
 if t.status is distinct from 'APPROVED' or t.enabled is distinct from true or t.provider_template_id is null
    or t.parameter_schema is distinct from '["customer_name","student_name","student_code","program_name","report_type","report_period","report_link_id"]'::jsonb then
   return jsonb_build_object('state','REPORT_TEMPLATE_NOT_READY');
 end if;
 return ctx||jsonb_build_object('state','READY','template_id',t.provider_template_id,'template_version',t.version);
end $$;

create function public.claim_learning_report_zbs(p_job uuid,p_app text,p_oa text,p_credential_version bigint,p_template text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs; ctx jsonb; a uuid;
begin
 select * into j from notification_jobs where id=p_job for update skip locked;
 if not found or j.channel<>'ZALO' or j.delivery_mode<>'LIVE' or j.template_key<>'ZALO_LEARNING_REPORT_PUBLISHED'
    or j.status not in ('QUEUED','RETRYING','FAILED') or j.attempts>=5 or j.next_attempt_at>now() then return null; end if;
 if exists(select 1 from notification_private.learning_report_send_attempts where job_id=p_job and state in ('REQUESTING','UNKNOWN','ACCEPTED')) then return null; end if;
 if not exists(select 1 from notification_private.zalo_credentials where app_id=p_app and oa_id=p_oa
   and version=p_credential_version and state='READY' and expires_at>now()+interval '1 minute') then return null; end if;
 ctx:=prepare_learning_report_zbs(p_job);
 if ctx->>'state'<>'READY' or ctx->>'template_id' is distinct from p_template then return null; end if;
 if exists(select 1 from jsonb_each_text(ctx->'parameters') x where x.key<>'report_link_id'
   and (nullif(btrim(x.value),'') is null or char_length(x.value)>30 or x.value ~ '[[:cntrl:]]')) then return null; end if;
 insert into notification_private.learning_report_send_attempts(job_id,state,app_id,oa_id,credential_version,template_id,template_version,provider_user_id)
 values(p_job,'REQUESTING',p_app,p_oa,p_credential_version,p_template,(ctx->>'template_version')::integer,ctx->>'user_id') returning id into a;
 update notification_jobs set status='PROCESSING',attempts=attempts+1,lease_token=a,lease_until=null,
   error_code=null,updated_at=clock_timestamp() where id=p_job;
 return ctx||jsonb_build_object('attempt_id',a);
end $$;

create function public.finish_learning_report_zbs(p_attempt uuid,p_state text,p_message text default null,p_error text default null) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare a notification_private.learning_report_send_attempts;
begin
 if p_state not in ('ACCEPTED','REJECTED','UNKNOWN') then raise exception 'Invalid result'; end if;
 if p_state='ACCEPTED' and (p_message is null or p_message !~ '^[A-Za-z0-9_-]{1,80}$') then raise exception 'Message id required'; end if;
 select * into a from notification_private.learning_report_send_attempts where id=p_attempt for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.state=p_state and a.message_id is not distinct from p_message then return a.state; end if;
 if a.state<>'REQUESTING' then raise exception 'Conflicting result'; end if;
 update notification_private.learning_report_send_attempts set state=p_state,message_id=p_message,
   error_code=left(p_error,80),finished_at=clock_timestamp() where id=p_attempt;
 update notification_jobs set status=case when p_state='ACCEPTED' then 'SENT' else 'FAILED' end,
   provider_message_id=case when p_state='ACCEPTED' then p_message end,
   provider_receipt=case when p_state='ACCEPTED' then p_message end,
   sent_at=case when p_state='ACCEPTED' then clock_timestamp() end,
   error_code=case when p_state='UNKNOWN' then 'REPORT_ACCEPTANCE_UNKNOWN' else left(p_error,80) end,
   next_attempt_at=case when p_state='REJECTED' then now()+interval '30 minutes' end,
   lease_token=null,lease_until=null,updated_at=clock_timestamp() where id=a.job_id;
 insert into notification_events(job_id,event,details) values(a.job_id,p_state,
   jsonb_build_object('purpose','LEARNING_REPORT','attempt_id',a.id,'error_code',left(p_error,80)));
 return p_state;
end $$;

create function public.note_learning_report_zbs_blocked(p_job uuid,p_error text) returns void
language sql security definer set search_path=public,pg_temp as $$
 update notification_jobs set error_code=p_error,updated_at=clock_timestamp()
 where id=p_job and channel='ZALO' and template_key='ZALO_LEARNING_REPORT_PUBLISHED'
   and status in ('QUEUED','RETRYING','FAILED') and p_error in
   ('REPORT_RECIPIENT_INELIGIBLE','REPORT_TEMPLATE_NOT_READY','PDF_NOT_READY','REPORT_PARAMETERS_INVALID','REPORT_ACCEPTANCE_UNKNOWN','REPORT_SENDING_DISABLED','REPORT_ORIGIN_MISSING','REPORT_CREDENTIAL_NOT_READY')
$$;

-- An interrupted network call cannot safely be replayed. Surface it for reconciliation.
create function public.reconcile_learning_report_attempts() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare a record; n integer:=0;
begin
 for a in select id from notification_private.learning_report_send_attempts
   where state='REQUESTING' and created_at<now()-interval '5 minutes' for update skip locked loop
   perform finish_learning_report_zbs(a.id,'UNKNOWN',null,'REPORT_WORKER_INTERRUPTED'); n:=n+1;
 end loop;
 return n;
end $$;

revoke all on function notification_private.prepare_learning_report_link(uuid),notification_private.report_link_on_publish(),
 notification_private.learning_report_job_context(uuid),notification_private.prepare_learning_report_job() from public,anon,authenticated,service_role;
revoke all on function public.learning_report_link_manage(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.learning_report_link_manage(uuid,text) to authenticated;
revoke all on function public.resolve_learning_report_pdf(text),public.claim_learning_report_pdf(uuid),
 public.finish_learning_report_pdf(uuid,uuid,text,integer),public.note_learning_report_pdf_request(text),
 public.learning_report_delivery_work(integer),public.prepare_learning_report_zbs(uuid),
 public.claim_learning_report_zbs(uuid,text,text,bigint,text),public.finish_learning_report_zbs(uuid,text,text,text),
 public.note_learning_report_zbs_blocked(uuid,text),public.reconcile_learning_report_attempts() from public,anon,authenticated,service_role;
grant execute on function public.resolve_learning_report_pdf(text),public.claim_learning_report_pdf(uuid),
 public.finish_learning_report_pdf(uuid,uuid,text,integer),public.note_learning_report_pdf_request(text),
 public.learning_report_delivery_work(integer),public.prepare_learning_report_zbs(uuid),
 public.claim_learning_report_zbs(uuid,text,text,bigint,text),public.finish_learning_report_zbs(uuid,text,text,text),
 public.note_learning_report_zbs_blocked(uuid,text),public.reconcile_learning_report_attempts() to service_role;

commit;
