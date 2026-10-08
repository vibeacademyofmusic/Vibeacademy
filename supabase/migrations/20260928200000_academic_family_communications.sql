-- Local academic E2E: use canonical journals and published visibility.
begin;
CREATE OR REPLACE FUNCTION public.learning_report_source(p_enrollment_id uuid, p_start date, p_end date) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
with context as (
  select e.*, s.full_name,s.student_code,c.branch_id,c.name class_name,b.name branch_name
  from enrollments e join students s on s.id=e.student_id join classes c on c.id=e.class_id join branches b on b.id=c.branch_id
  where e.id=p_enrollment_id
), sessions as (
  select o.id,o.occurrence_type,a.id attendance_id,a.status attendance_status
  from context e join schedules sc on sc.class_id=e.class_id join session_occurrences o on o.schedule_id=sc.id
  left join attendance_records a on a.session_occurrence_id=o.id and a.enrollment_id=e.id
  where o.status = 'COMPLETED'
    and o.starts_at >= (p_start::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and o.starts_at < ((p_end+1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and (a.id is not null or
      (o.occurrence_type='MAKEUP' and exists(select 1 from session_occurrence_participants sp where sp.session_occurrence_id=o.id and sp.enrollment_id=e.id)) or
      (o.occurrence_type='REGULAR' and e.started_at <= o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
        and not exists(select 1 from enrollment_pauses ep where ep.enrollment_id=e.id and ep.status='ACTIVE' and o.occurrence_date between ep.starts_on and ep.ends_on)))
), journal_rows as (
  select j.content,j.repertoire,j.skills,j.homework,j.observation,j.updated_at
  from sessions s join learning_journals j on j.attendance_record_id=s.attendance_id
  where not exists(select 1 from student_learning_journal_entries e where e.attendance_record_id=s.attendance_id)
  union all
  select e.progress_note as content, '' as repertoire, '' as skills, e.individual_homework as homework,
    e.observation, e.updated_at
  from sessions s join student_learning_journal_entries e on e.attendance_record_id=s.attendance_id
  join session_learning_journals j on j.id=e.session_journal_id where j.status='SUBMITTED'
), subjects as (
  select l.name grade,lp.status grade_status,cs.name,cs.is_required,cs.completion_rule,
    coalesce(sp.status,'NOT_STARTED') status,sp.score,
    coalesce((select jsonb_agg(jsonb_build_object('name',cc.name,'required',cc.is_required,'status',coalesce(cp.status,'NOT_STARTED'),'score',cp.score) order by cc.sort_order,cc.id)
      from curriculum_subject_components cc left join student_component_progress cp on cp.component_id=cc.id and cp.subject_progress_id=sp.id
      where cc.subject_id=cs.id and cc.status='ACTIVE' and cs.completion_rule='ALL_REQUIRED_COMPONENTS'),'[]'::jsonb) components
  from context e join student_level_progress lp on lp.enrollment_id=e.student_curriculum_enrollment_id
  join curriculum_levels l on l.id=lp.level_id
  join curriculum_subjects cs on cs.level_id=l.id and cs.status='ACTIVE'
  left join student_subject_progress sp on sp.subject_id=cs.id and sp.level_progress_id=lp.id
)
select jsonb_build_object(
 'schema_version',1,'as_of',now(),'period_start',p_start,'period_end',p_end,
 'student',jsonb_build_object('id',e.student_id,'name',e.full_name,'code',e.student_code),
 'branch',jsonb_build_object('id',e.branch_id,'name',e.branch_name),'class_name',e.class_name,
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('code',t.teacher_code,'name',p.full_name,'role',ct.teacher_role) order by t.teacher_code)
   from class_teachers ct join teachers t on t.id=ct.teacher_id left join profiles p on p.id=t.user_id
   where ct.class_id=e.class_id and ct.assigned_at<=p_end and (ct.ended_at is null or ct.ended_at>=p_start)),'[]'::jsonb),
 'academic',jsonb_build_object('curriculum',cu.name,'current_grade',cl.name,'status',ce.status,
   'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by s.grade,s.name) from subjects s),'[]'::jsonb)),
 'attendance',(select jsonb_build_object('scheduled',count(*),'attended',count(*) filter(where attendance_status in ('PRESENT','LATE')),
   'present',count(*) filter(where attendance_status='PRESENT'),'late',count(*) filter(where attendance_status='LATE'),
   'absent',count(*) filter(where attendance_status='ABSENT'),'excused',count(*) filter(where attendance_status='EXCUSED'),
   'unmarked',count(*) filter(where attendance_status is null),'makeup',count(*) filter(where occurrence_type='MAKEUP'),
   'rate',round(100.0 * count(*) filter(where attendance_status in ('PRESENT','LATE')) / nullif(count(*) filter(where attendance_status is not null),0),1)) from sessions),
 'journals',jsonb_build_object('count',(select count(*) from journal_rows),'excerpts',coalesce((select jsonb_agg(to_jsonb(j)) from (select * from journal_rows order by updated_at desc limit 30) j),'[]'::jsonb))
) from context e left join student_curriculum_enrollments ce on ce.id=e.student_curriculum_enrollment_id
left join curriculums cu on cu.id=ce.curriculum_id left join curriculum_levels cl on cl.id=ce.current_level_id;
$$;
CREATE OR REPLACE FUNCTION public.public_report_snapshot(p_snapshot jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select jsonb_build_object(
 'schema_version',p_snapshot->'schema_version','as_of',p_snapshot->'as_of',
 'period_start',p_snapshot->'period_start','period_end',p_snapshot->'period_end',
 'student',jsonb_build_object('id',p_snapshot#>'{student,id}','name',p_snapshot#>'{student,name}','code',p_snapshot#>'{student,code}'),
 'branch',jsonb_build_object('id',p_snapshot#>'{branch,id}','name',p_snapshot#>'{branch,name}'),
 'class_name',p_snapshot->'class_name',
 'attendance',(select jsonb_object_agg(k,p_snapshot->'attendance'->k) from unnest(array['scheduled','attended','present','late','absent','excused','unmarked','makeup','rate']) k),
 'teacher_summary',(select jsonb_object_agg(k,p_snapshot->'teacher_summary'->k) from unnest(array['achievement','difficulty','intervention','next_month_plan','practice_consistency','lesson_preparation','learning_attitude','general_comment','strengths','improvement_areas','next_focus','recommendation']) k),
 'academic',jsonb_build_object('curriculum',p_snapshot#>'{academic,curriculum}','current_grade',p_snapshot#>'{academic,current_grade}','status',p_snapshot#>'{academic,status}',
  'subjects',coalesce((select jsonb_agg(jsonb_build_object('grade',s->'grade','grade_status',s->'grade_status','name',s->'name','is_required',s->'is_required','completion_rule',s->'completion_rule','status',s->'status','score',s->'score',
   'components',coalesce((select jsonb_agg(jsonb_build_object('name',c->'name','required',c->'required','status',c->'status','score',c->'score')) from jsonb_array_elements(coalesce(s->'components','[]'::jsonb)) c),'[]'::jsonb)))
   from jsonb_array_elements(coalesce(p_snapshot#>'{academic,subjects}','[]'::jsonb)) s),'[]'::jsonb)),
 'journals',jsonb_build_object('count',p_snapshot#>'{journals,count}','excerpts',coalesce((select jsonb_agg(jsonb_build_object('content',j->'content','repertoire',j->'repertoire','skills',j->'skills','homework',j->'homework','observation',j->'observation','updated_at',j->'updated_at')) from jsonb_array_elements(coalesce(p_snapshot#>'{journals,excerpts}','[]'::jsonb)) j),'[]'::jsonb)),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('code',t->'code','name',t->'name','role',t->'role')) from jsonb_array_elements(coalesce(p_snapshot->'teachers','[]'::jsonb)) t),'[]'::jsonb))
$$;
CREATE OR REPLACE FUNCTION public.student_approved_reports(p_student uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(report_id uuid, report_type text, period_start date, period_end date, approved_at timestamp with time zone, snapshot jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 select r.id,r.report_type,r.period_start,r.period_end,r.approved_at,public.public_report_snapshot(r.snapshot_data)
 from public.learning_reports r where r.student_id=p_student and r.status='PUBLISHED'
 and public.can_read_student_history(r.student_id,r.branch_id,'learning_reports')
 order by r.period_end desc,r.id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0))
$$;
CREATE OR REPLACE FUNCTION public.submit_session_learning_journal(p_session uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  actor uuid := auth.uid();
  journal public.session_learning_journals%rowtype;
begin
  if actor is null or not public.can_write_session_journal(p_session) then raise exception 'JOURNAL_UNAUTHORIZED'; end if;
  if not exists(select 1 from session_occurrences where id=p_session and status='COMPLETED') then raise exception 'JOURNAL_SESSION_NOT_COMPLETED'; end if;
  select * into journal from public.session_learning_journals where session_occurrence_id = p_session for update;
  if not found then raise exception 'JOURNAL_SESSION_MISSING'; end if;
  if nullif(btrim(journal.content_covered), '') is null then raise exception 'JOURNAL_CONTENT_REQUIRED'; end if;
  if exists(
    select 1
    from public.attendance_records attendance
    left join public.student_learning_journal_entries entry on entry.attendance_record_id = attendance.id
    where attendance.session_occurrence_id = p_session
      and attendance.status in ('PRESENT','LATE')
      and (entry.id is null or nullif(btrim(entry.progress_note), '') is null or entry.observation = 'NOT_RECORDED')
  ) then
    raise exception 'JOURNAL_PROGRESS_REQUIRED';
  end if;
  perform set_config('journal.taxonomy_write', 'on', true);
  update public.session_learning_journals set
    status = 'SUBMITTED',
    submitted_at = coalesce(submitted_at, clock_timestamp()),
    submitted_by = coalesce(submitted_by, actor),
    version = version + 1,
    updated_at = clock_timestamp()
  where id = journal.id;
  perform set_config('journal.taxonomy_write', 'off', true);
  return journal.id;
end $$;

create table public.learning_conversations (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('REPORT','FEEDBACK')),
 entity_id uuid not null,
 source_version integer not null,
 student_id uuid not null references public.students(id),
 branch_id uuid not null references public.branches(id),
 state text not null default 'OPEN' check(state in ('OPEN','IN_PROGRESS','RESOLVED')),
 assignee_id uuid references public.profiles(id),
 version integer not null default 1,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(kind,entity_id,source_version)
);
create table public.learning_conversation_messages (
 id uuid primary key,
 conversation_id uuid not null references public.learning_conversations(id),
 actor_id uuid not null references public.profiles(id),
 visibility text not null check(visibility in ('PUBLIC','INTERNAL')),
 body text not null check(length(btrim(body)) between 1 and 4000),
 resulting_state text not null check(resulting_state in ('OPEN','IN_PROGRESS','RESOLVED')),
 created_at timestamptz not null default now()
);
alter table public.learning_conversations enable row level security;
alter table public.learning_conversation_messages enable row level security;
revoke all on public.learning_conversations, public.learning_conversation_messages from anon, authenticated;

create function public.learning_source_access(p_kind text,p_entity uuid)
returns table(student_id uuid,branch_id uuid,source_version integer,staff boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s uuid;b uuid;v integer; is_staff boolean; teacher uuid;
begin
 if auth.uid() is null or not account_is_active() then return; end if;
 if p_kind='REPORT' then
  select r.student_id,r.branch_id,r.version into s,b,v from learning_reports r where r.id=p_entity and r.status='PUBLISHED';
 elsif p_kind='FEEDBACK' then
  select f.student_id,f.branch_id,1,f.teacher_id into s,b,v,teacher from lesson_feedback f where f.id=p_entity;
 else return; end if;
 if s is null then return; end if;
 is_staff:=has_role('SUPER_ADMIN') or
  (has_role('BRANCH_ADMIN') and has_permission('students.view',b)) or
  (has_role('ACADEMIC_ADMIN') and has_permission('learning_reports.view',b)) or
  (has_role('TEACHER') and case when p_kind='FEEDBACK' then exists(select 1 from teachers where id=teacher and user_id=auth.uid() and status='ACTIVE') else teacher_can_access_student(s) end);
 if is_staff or can_read_student_history(s,b,case when p_kind='REPORT' then 'learning_reports' else 'attendance' end) then
  return query select s,b,v,is_staff;
 end if;
end$$;
revoke all on function public.learning_source_access(text,uuid) from public,anon;
grant execute on function public.learning_source_access(text,uuid) to authenticated;

create function public.learning_report_document(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'version',r.version,'type',r.report_type,'snapshot',public_report_snapshot(r.snapshot_data))
 from learning_reports r join learning_source_access('REPORT',p_id) a on a.student_id=r.student_id
 where r.id=p_id and r.status='PUBLISHED'
$$;
revoke all on function public.learning_report_document(uuid) from public,anon;
grant execute on function public.learning_report_document(uuid) to authenticated;

create function public.learning_conversation_read(p_kind text,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a record;t learning_conversations;
begin
 select * into a from learning_source_access(p_kind,p_entity);
 if not found then raise exception 'CONVERSATION_DENIED'; end if;
 select * into t from learning_conversations where kind=p_kind and entity_id=p_entity and source_version=a.source_version;
 return jsonb_build_object('id',t.id,'version',coalesce(t.version,0),'state',coalesce(t.state,'OPEN'),'staff',a.staff,'assignee_id',case when a.staff then t.assignee_id end,
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'visibility',m.visibility,'state',m.resulting_state,'at',m.created_at,'author',p.full_name) order by m.created_at,m.id)
  from learning_conversation_messages m join profiles p on p.id=m.actor_id where m.conversation_id=t.id and (a.staff or m.visibility='PUBLIC')),'[]'::jsonb));
end$$;
revoke all on function public.learning_conversation_read(text,uuid) from public,anon;
grant execute on function public.learning_conversation_read(text,uuid) to authenticated;

-- Registry entries are pending, not fake provider template approvals.
insert into notification_templates(template_key,provider,status,description,parameter_schema,enabled,event_type,payload_schema)
select k,'ZALO','PENDING',d,'[]'::jsonb,false,k,'{}'::jsonb from (values
 ('LEARNING_REPORT_THREAD_UPDATED','Cập nhật trao đổi học tập — chờ mẫu tin, consent và URL được duyệt'),
 ('LESSON_FEEDBACK_UPDATED','Cập nhật phản hồi học tập — chờ mẫu tin, consent và URL được duyệt'),
 ('LESSON_FEEDBACK_REQUESTED','Mời phản hồi buổi học — chờ mẫu tin, consent và URL được duyệt')) as x(k,d)
on conflict(template_key) do nothing;

create function public.learning_conversation_write(p_kind text,p_entity uuid,p_request uuid,p_version integer,p_body text,p_internal boolean default false,p_resolve boolean default false,p_assignee uuid default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a record;t learning_conversations;prior_message learning_conversation_messages;recipient record;job uuid;k text;
begin
 select * into a from learning_source_access(p_kind,p_entity);
 if not found then raise exception 'CONVERSATION_DENIED'; end if;
 if p_request is null or p_body is null or length(btrim(p_body)) not between 1 and 4000 or p_internal is null or p_resolve is null then raise exception 'CONVERSATION_INVALID'; end if;
 if not a.staff and (p_internal or p_resolve or p_assignee is not null) then raise exception 'CONVERSATION_DENIED'; end if;
 if p_assignee is not null and (p_assignee<>auth.uid() or not a.staff) then raise exception 'CONVERSATION_ASSIGNEE_DENIED'; end if;
 -- Source-level lock serializes first creation, retries and concurrent replies.
 perform pg_advisory_xact_lock(hashtextextended(p_kind||p_entity::text,0));
 select * into t from learning_conversations where kind=p_kind and entity_id=p_entity and source_version=a.source_version for update;
 select * into prior_message from learning_conversation_messages where id=p_request;
 if found then
  if prior_message.conversation_id is distinct from t.id or prior_message.actor_id<>auth.uid() or prior_message.body<>btrim(p_body) or prior_message.visibility<>(case when p_internal then 'INTERNAL' else 'PUBLIC' end) then raise exception 'CONVERSATION_REQUEST_REUSED'; end if;
  return t.id;
 end if;
 if coalesce(t.version,0) is distinct from p_version then raise exception 'CONVERSATION_CHANGED'; end if;
 if t.id is null then
  insert into learning_conversations(kind,entity_id,source_version,student_id,branch_id,created_by)
  values(p_kind,p_entity,a.source_version,a.student_id,a.branch_id,auth.uid()) returning * into t;
 end if;
 update learning_conversations set
 state=case when p_internal then state when p_resolve then 'RESOLVED' when a.staff then 'IN_PROGRESS' else 'OPEN' end,
 assignee_id=coalesce(p_assignee,assignee_id),version=version+1,updated_at=clock_timestamp() where id=t.id returning * into t;
 insert into learning_conversation_messages(id,conversation_id,actor_id,visibility,body,resulting_state)
 values(p_request,t.id,auth.uid(),case when p_internal then 'INTERNAL' else 'PUBLIC' end,btrim(p_body),t.state);
 if a.staff and not p_internal then
  k:=case when p_kind='REPORT' then 'LEARNING_REPORT_THREAD_UPDATED' else 'LESSON_FEEDBACK_UPDATED' end;
  -- Blocked durable jobs: no provider template, purpose-specific consent or public URL exists yet.
  for recipient in select distinct m.actor_id from learning_conversation_messages m
    where m.conversation_id=t.id and m.visibility='PUBLIC' and m.actor_id<>auth.uid()
      and (exists(select 1 from students s where s.id=a.student_id and s.user_id=m.actor_id)
       or exists(select 1 from parents p join student_parents sp on sp.parent_id=p.id where p.user_id=m.actor_id and p.status='ACTIVE' and sp.student_id=a.student_id and sp.is_active and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now())))
  loop
   insert into notification_jobs(recipient_id,student_id,branch_id,channel,delivery_mode,template_key,payload,entity_type,entity_id,idempotency_key,status,error_code,created_by)
   values(recipient.actor_id,a.student_id,a.branch_id,'ZALO','LIVE',k,jsonb_build_object('title','Trao đổi học tập đã được cập nhật','href','/my-learning/conversations/'||lower(p_kind)||'/'||p_entity,'source_version',a.source_version),
   k,p_entity,k||':'||p_request||':'||recipient.actor_id,'SKIPPED_NO_CHANNEL','ZALO_ACADEMIC_TEMPLATE_CONSENT_URL_REQUIRED',auth.uid())
   on conflict(idempotency_key) do nothing returning id into job;
   if job is not null then insert into notification_events(job_id,event,actor_id) values(job,'CREATED',auth.uid()); end if;
  end loop;
 end if;
 return t.id;
end$$;
revoke all on function public.learning_conversation_write(text,uuid,uuid,integer,text,boolean,boolean,uuid) from public,anon;
grant execute on function public.learning_conversation_write(text,uuid,uuid,integer,text,boolean,boolean,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
