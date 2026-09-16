-- A parent with two children in one session receives one generic event notice.
create or replace function public.enqueue_notification_event(p_event text,p_entity uuid,p_channel text default 'IN_APP',p_mode text default 'LIVE')
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
  select student_id,branch_id,respondent_user_id,version::text into s,b,u,v from lesson_feedback where id=p_entity and resolution_status='RESOLVED';
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
   concat_ws(':',p_event,p_entity,v,rec.uid,p_channel,p_mode),auth.uid()) on conflict(idempotency_key) do nothing returning id into j;
  if j is not null then n:=n+1;insert into notification_events(job_id,event,actor_id) values(j,'CREATED',auth.uid());end if;
 end loop;return n;
end $$;
