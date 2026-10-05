-- Provider-neutral outbox. No external network calls or private source payloads.
create schema notification_private;
revoke all on schema notification_private from public,anon,authenticated,service_role;
create table public.notification_jobs (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id),
 student_id uuid references public.students(id), branch_id uuid references public.branches(id),
 channel text not null check(channel in('EMAIL','ZALO','IN_APP')),
 delivery_mode text not null default 'LIVE' check(delivery_mode in('LIVE','MOCK')),
 template_key text not null, payload jsonb not null,
 entity_type text not null, entity_id uuid not null, idempotency_key text not null unique,
 status text not null default 'PENDING' check(status in('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
 provider_receipt text, error_code text, created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz,
 check((status='SENT')=(sent_at is not null)),
 check(status<>'SENT' or nullif(provider_receipt,'') is not null)
);
create index notification_queue_status on public.notification_jobs(status,created_at,id);
create index notification_recipient on public.notification_jobs(recipient_id,created_at desc,id);
create table public.notification_events (
 id bigint generated always as identity primary key,job_id uuid not null references public.notification_jobs(id),
 event text not null,actor_id uuid,created_at timestamptz not null default now(),details jsonb not null default '{}'
);
create table public.notification_inbox (
 job_id uuid primary key references public.notification_jobs(id),recipient_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.notification_jobs enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_inbox enable row level security;
revoke all on public.notification_jobs,public.notification_events,public.notification_inbox from public,anon,authenticated,service_role;
grant select on public.notification_jobs,public.notification_events to authenticated;
create policy notification_admin_read on public.notification_jobs for select to authenticated using(public.has_role('SUPER_ADMIN'));
create policy notification_event_admin_read on public.notification_events for select to authenticated using(public.has_role('SUPER_ADMIN'));

-- For background delivery, mirror role validity without impersonating auth.uid().
create function notification_private.recipient_allowed(p_user uuid,p_student uuid,p_branch uuid,p_template text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from profiles where id=p_user and status='ACTIVE') and exists(
 select 1 from user_roles ur join roles r on r.id=ur.role_id
 where ur.user_id=p_user and ur.is_active and (ur.valid_from is null or ur.valid_from<=now())
 and (ur.valid_until is null or ur.valid_until>now()) and (r.code<>'SUPER_ADMIN' or ur.branch_id is null)
 and (ur.branch_id is null or ur.branch_id=p_branch)
 and (p_template='ONBOARDING' or (
 exists(select 1 from role_permissions rp join permissions p on p.id=rp.permission_id where rp.role_id=r.id
 and p.code=(case when p_template='TUITION_REMINDER' then 'tuition' when p_template in('MONTHLY_REPORT','END_OF_COURSE') then 'learning_reports' else 'attendance' end)||case r.code when 'STUDENT' then '.view_own' when 'PARENT' then '.view_related' else '.unsupported' end)
 and ((r.code='STUDENT' and exists(select 1 from students s where s.id=p_student and s.user_id=p_user and s.status in('ACTIVE','PAUSED','GRADUATED')))
 or (r.code='PARENT' and exists(select 1 from parents p join student_parents sp on sp.parent_id=p.id where p.user_id=p_user and p.status='ACTIVE' and sp.student_id=p_student and sp.is_active
 and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now()) and (p_template<>'TUITION_REMINDER' or sp.can_view_finance is true)))))))
$$;

create function public.enqueue_notification_event(p_event text,p_entity uuid,p_channel text default 'IN_APP',p_mode text default 'LIVE')
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare s uuid;b uuid;u uuid;v text:='1';t text;target text;title text;rec record;j uuid;n integer:=0;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 if p_channel is null or p_channel not in('EMAIL','ZALO','IN_APP') or p_mode is null or p_mode not in('LIVE','MOCK') then raise exception 'Invalid channel or mode';end if;
 t:=p_event;
 case p_event
 when 'ONBOARDING' then
  select id into u from profiles where id=p_entity and status='ACTIVE';target:='/';title:='Chào mừng bạn đến Vibe Academy';
 when 'TUITION_REMINDER' then
  select e.student_id,et.branch_id_snapshot into s,b from tuition_reminders r join enrollment_tuition et on et.id=r.enrollment_tuition_id join enrollments e on e.id=et.enrollment_id
  where r.id=p_entity and r.status='PENDING' and r.window_start<=(now() at time zone 'Asia/Ho_Chi_Minh')::date and e.status='ACTIVE' and et.status in('ACTIVE','SCHEDULED');
  target:='/my-learning';title:='Bạn có nhắc học phí cần xem';
 when 'LEARNING_REPORT' then
  select student_id,branch_id,version::text,case report_type when 'MONTHLY' then 'MONTHLY_REPORT' else 'END_OF_COURSE' end into s,b,v,t from learning_reports where id=p_entity and status='APPROVED';
  target:='/my-learning';title:='Báo cáo học tập đã được duyệt';
 when 'SCHEDULE_CHANGED' then
  -- One event per session revision. Audience uses enrolled students for that class.
  select c.branch_id,o.updated_at::text into b,v from session_occurrences o join schedules sc on sc.id=o.schedule_id join classes c on c.id=sc.class_id where o.id=p_entity;
  target:='/my-learning';title:='Lịch học có cập nhật';
 when 'ATTENDANCE_NOTICE' then
  select e.student_id,c.branch_id,a.updated_at::text into s,b,v from attendance_records a join enrollments e on e.id=a.enrollment_id join classes c on c.id=e.class_id where a.id=p_entity;
  target:='/my-learning';title:='Điểm danh buổi học có cập nhật';
 when 'FEEDBACK_FOLLOW_UP' then
  select student_id,branch_id,respondent_user_id,version::text into s,b,u,v from lesson_feedback where id=p_entity and resolution_status<>'OPEN';
  target:='/my-learning';title:='Phản hồi buổi học đã được cập nhật';
 else raise exception 'Unsupported notification event';end case;
 if (p_event='ONBOARDING' and u is null) or (p_event<>'ONBOARDING' and b is null) then raise exception 'Eligible source not found';end if;
 for rec in
  with audience_students as (
   select s as sid where s is not null
   union select e.student_id from enrollments e join schedules sc on sc.class_id=e.class_id join session_occurrences o on o.schedule_id=sc.id
   where p_event='SCHEDULE_CHANGED' and o.id=p_entity and e.status='ACTIVE' and e.started_at<=o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
  ), audience as (
   select u as uid,s as sid where p_event='ONBOARDING'
   union select st.user_id,a.sid from audience_students a join students st on st.id=a.sid
   union select p.user_id,a.sid from audience_students a join student_parents sp on sp.student_id=a.sid join parents p on p.id=sp.parent_id
  ) select distinct uid,sid from audience where uid is not null and (u is null or uid=u)
 loop
  if not notification_private.recipient_allowed(rec.uid,rec.sid,b,t) then continue;end if;
  j:=null;
  insert into notification_jobs(recipient_id,student_id,branch_id,channel,delivery_mode,template_key,payload,entity_type,entity_id,idempotency_key,created_by)
  values(rec.uid,rec.sid,b,p_channel,p_mode,t,jsonb_build_object('title',title,'href',target),p_event,p_entity,
   concat_ws(':',p_event,p_entity,v,rec.uid,coalesce(rec.sid::text,''),p_channel,p_mode),auth.uid()) on conflict(idempotency_key) do nothing returning id into j;
  if j is not null then n:=n+1;insert into notification_events(job_id,event,actor_id) values(j,'CREATED',auth.uid());end if;
 end loop;return n;
end $$;

create function public.manage_notification(p_job uuid,p_action text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 select * into j from notification_jobs where id=p_job for update;
 if not found then raise exception 'Job not found';end if;
 if p_action='RETRY' and (j.status='FAILED' or (j.status='PROCESSING' and j.lease_until<now())) then
  update notification_jobs set status='PENDING',lease_token=null,lease_until=null,error_code=null,updated_at=now() where id=j.id;
 elsif p_action='CANCEL' and j.status in('PENDING','FAILED') then
  update notification_jobs set status='CANCELLED',updated_at=now() where id=j.id;
 else raise exception 'Invalid notification transition';end if;
 insert into notification_events(job_id,event,actor_id) values(j.id,p_action,auth.uid());
end $$;

-- Worker-only RPCs; neither anonymous nor authenticated clients can forge receipts.
create function public.claim_notification(p_job uuid)
returns setof public.notification_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs;
begin
 select * into j from notification_jobs where id=p_job and status='PENDING' for update skip locked;
 if not found then return;end if;
 if not notification_private.recipient_allowed(j.recipient_id,j.student_id,j.branch_id,j.template_key) then
  update notification_jobs set status='CANCELLED',error_code='RECIPIENT_INELIGIBLE',updated_at=now() where id=j.id;
  insert into notification_events(job_id,event) values(j.id,'RECIPIENT_INELIGIBLE');return;
 end if;
 return query update notification_jobs set status='PROCESSING',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now() where id=j.id returning *;
 insert into notification_events(job_id,event) values(j.id,'CLAIMED');
end $$;
create function public.complete_notification(p_job uuid,p_lease uuid,p_receipt text default null,p_error text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs;
begin
 select * into j from notification_jobs where id=p_job for update;
 if not found or j.status<>'PROCESSING' or j.lease_token is distinct from p_lease or j.lease_until<now() then raise exception 'Stale delivery lease';end if;
 if p_error is null and (nullif(btrim(p_receipt),'') is null or length(p_receipt)>500) then raise exception 'Provider confirmation required';end if;
 if p_error is not null and p_error not in('PROVIDER_NOT_CONFIGURED','PROVIDER_REJECTED','PROVIDER_TIMEOUT','RECIPIENT_INELIGIBLE') then raise exception 'Invalid provider error code';end if;
 if p_error is null and j.channel='IN_APP' and j.delivery_mode='LIVE' then
  insert into notification_inbox(job_id,recipient_id) values(j.id,j.recipient_id) on conflict do nothing;
 end if;
 update notification_jobs set status=case when p_error is null then 'SENT' else 'FAILED' end,provider_receipt=case when p_error is null then p_receipt end,error_code=p_error,sent_at=case when p_error is null then now() end,lease_token=null,lease_until=null,updated_at=now() where id=j.id;
 insert into notification_events(job_id,event,details) values(j.id,case when p_error is null then 'CONFIRMED' else 'FAILED' end,jsonb_build_object('mode',j.delivery_mode,'error_code',p_error));
end $$;

create function public.deliver_in_app_notification(p_job uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare j notification_jobs;
begin
 if not public.has_role('SUPER_ADMIN') then raise exception 'Unauthorized';end if;
 if not exists(select 1 from notification_jobs where id=p_job and channel='IN_APP' and delivery_mode='LIVE') then raise exception 'Only live in-app delivery allowed';end if;
 select * into j from public.claim_notification(p_job);if j.id is null then return;end if;
 perform public.complete_notification(j.id,j.lease_token,'in-app:'||j.id);
end $$;
create function public.own_notifications(p_offset integer default 0)
returns table(id uuid,title text,href text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select j.id,j.payload->>'title',j.payload->>'href',i.created_at from notification_inbox i join notification_jobs j on j.id=i.job_id
 where i.recipient_id=auth.uid() and notification_private.recipient_allowed(j.recipient_id,j.student_id,j.branch_id,j.template_key)
 order by i.created_at desc,j.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;
revoke all on all functions in schema notification_private from public,anon,authenticated,service_role;
revoke all on function public.enqueue_notification_event(text,uuid,text,text),public.manage_notification(uuid,text),public.claim_notification(uuid),public.complete_notification(uuid,uuid,text,text),public.deliver_in_app_notification(uuid),public.own_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function public.enqueue_notification_event(text,uuid,text,text),public.manage_notification(uuid,text),public.deliver_in_app_notification(uuid),public.own_notifications(integer) to authenticated;
grant execute on function public.claim_notification(uuid),public.complete_notification(uuid,uuid,text,text) to service_role;
