-- Additive teaching RPCs only. Existing academic/attendance/journal tables and triggers remain authoritative.
-- Internal roster mirrors the dated REGULAR and explicit MAKEUP contracts enforced by
-- validate_attendance_record_class / validate_session_occurrence_status. All workspace
-- reads and writes use this one helper; it is not a separately persisted roster.
create or replace function public.session_teaching_roster(p_session uuid)
returns table(enrollment_id uuid, student_id uuid)
language sql stable security definer set search_path=public,pg_temp as $$
 select e.id,e.student_id from public.session_occurrences o
 join public.schedules sc on sc.id=o.schedule_id join public.enrollments e on e.class_id=sc.class_id
 where o.id=p_session and (
  (o.occurrence_type='MAKEUP' and exists(select 1 from public.session_occurrence_participants p where p.session_occurrence_id=o.id and p.enrollment_id=e.id))
  or (o.occurrence_type='REGULAR' and e.started_at<=o.occurrence_date
      and (e.ended_at is null or e.ended_at>=o.occurrence_date)
      and not public.is_enrollment_paused_on(e.id,o.occurrence_date)))
$$;
revoke all on function public.session_teaching_roster(uuid) from public,anon,authenticated;

create or replace function public.session_teaching_academic(p_program uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'name',cur.name,'level_id',e.current_level_id,'level_name',l.name,
  'started_at',lp.started_at,'level_status',lp.status,'subjects',coalesce((
   select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'rule',s.completion_rule,
    'progress_id',sp.id,'status',coalesce(sp.status,'NOT_STARTED'),'components',coalesce((
     select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'rule',c.completion_rule,
      'progress_id',cp.id,'status',coalesce(cp.status,'NOT_STARTED'),'items',coalesce((
       select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'progress_id',ip.id,'status',coalesce(ip.status,'NOT_STARTED')) order by i.sort_order,i.id)
       from curriculum_component_items i left join student_component_item_progress ip on ip.item_id=i.id and ip.component_progress_id=cp.id
       where i.component_id=c.id and i.status='ACTIVE'),'[]'::jsonb)) order by c.sort_order,c.id)
     from curriculum_subject_components c left join student_component_progress cp on cp.component_id=c.id and cp.subject_progress_id=sp.id
     where c.subject_id=s.id and c.status='ACTIVE'),'[]'::jsonb)) order by s.sort_order,s.id)
   from curriculum_subjects s left join student_subject_progress sp on sp.subject_id=s.id and sp.level_progress_id=lp.id
   where s.level_id=e.current_level_id and s.status='ACTIVE'),'[]'::jsonb))
 from student_curriculum_enrollments e join curriculums cur on cur.id=e.curriculum_id
 left join curriculum_levels l on l.id=e.current_level_id
 left join student_level_progress lp on lp.enrollment_id=e.id and lp.level_id=e.current_level_id
 where e.id=p_program and e.status='ACTIVE'
$$;
revoke all on function public.session_teaching_academic(uuid) from public,anon,authenticated;

-- Same relationship as teacher_can_access_session, without the scheduled/completed filter,
-- so a cancelled session can still be read by its actual teacher.
create or replace function public.teacher_assigned_to_session(p_session uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.session_actual_teachers v
 join public.teachers t on t.id=v.teacher_id
 where v.session_id=p_session and t.user_id=auth.uid() and t.status='ACTIVE'
 and public.has_role_permission('TEACHER','attendance.view',v.branch_id)
 and (v.is_locked or exists(select 1 from public.session_teacher_assignments a where a.session_id=v.session_id and a.teacher_id=t.id and a.effective_status='ACTIVE')
 or public.teacher_can_access_class(v.class_id)))
$$;
revoke all on function public.teacher_assigned_to_session(uuid) from public,anon,authenticated;

create or replace function public.teacher_session_workspace(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce(public.account_is_active(),false) or not
   (public.has_role('SUPER_ADMIN') or public.teacher_can_access_session(p_session) or public.teacher_assigned_to_session(p_session)) then raise exception 'TEACHING_UNAUTHORIZED'; end if;
 select jsonb_build_object(
  'id',o.id,'class_id',c.id,'class_name',c.name,'date',o.occurrence_date,'starts_at',o.starts_at,'ends_at',o.ends_at,
  'status',o.status,'type',o.occurrence_type,'room',r.name,'teacher',t.full_name,'assignment_type',actual.assignment_type,
  'scope_from',lf.name,'scope_to',lt.name,'note',o.notes,
  'journal',(select jsonb_build_object('id',j.id,'content_covered',j.content_covered,'curriculum_context',j.curriculum_context,
    'status',j.status,'version',j.version,'submitted_at',j.submitted_at,'submitted_by',j.submitted_by,
    'revision_count',j.revision_count,'revised_at',j.revised_at,'revised_by',j.revised_by)
    from session_learning_journals j where j.session_occurrence_id=o.id),
  'participants',coalesce((select jsonb_agg(jsonb_build_object(
    'enrollment_id',rr.enrollment_id,'student_id',rr.student_id,'name',st.full_name,
    'attendance_id',a.id,'attendance',a.status,'compatibility',public.class_enrollment_compatibility(c.id,rr.student_id),
    'academic',case when public.has_role('SUPER_ADMIN') or public.teacher_can_read_student_academic(rr.student_id)
       then public.session_teaching_academic(current_academic.student_curriculum_enrollment_id) else null end,
    'academic_readable',public.has_role('SUPER_ADMIN') or public.teacher_can_read_student_academic(rr.student_id),
    'entry',(select (to_jsonb(entry)-'internal_note') || jsonb_build_object('codes',coalesce((
      select jsonb_agg(sel.option_code order by sel.option_code) from student_journal_observation_selections sel where sel.entry_id=entry.id),'[]'::jsonb))
      from student_learning_journal_entries entry where entry.attendance_record_id=a.id)
   ) order by st.full_name,rr.enrollment_id)
   from public.session_teaching_roster(o.id) rr join students st on st.id=rr.student_id
   left join attendance_records a on a.session_occurrence_id=o.id and a.enrollment_id=rr.enrollment_id
   left join lateral public.class_student_current_level(c.id,rr.student_id) current_academic on true),'[]'::jsonb),
  'options',jsonb_build_object(
    'observations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) from learning_observation_options x where active),
    'focus',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) from learning_focus_options x where active),
    'reasons',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) from learning_attention_reasons x where active),
    'homework',(select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) from learning_homework_parts x where active))
 ) into result
 from session_occurrences o join schedules sc on sc.id=o.schedule_id join classes c on c.id=sc.class_id
 left join rooms r on r.id=o.room_id left join session_actual_teachers actual on actual.session_id=o.id
 left join teachers t on t.id=actual.teacher_id
 left join curriculum_levels lf on lf.id=c.accepted_from_level_id left join curriculum_levels lt on lt.id=c.accepted_to_level_id
 where o.id=p_session;
 if result is null then raise exception 'TEACHING_SESSION_MISSING'; end if;
 return result;
end $$;

-- One narrow command boundary, no direct table write grants for teachers.
create or replace function public.teacher_session_write(p_session uuid,p_action text,p_enrollment uuid default null,p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
 o public.session_occurrences%rowtype; student uuid; class_id uuid; attendance public.attendance_records%rowtype;
 journal public.session_learning_journals%rowtype; entry public.student_learning_journal_entries%rowtype;
 level_progress uuid; progress uuid; kind text; next_status text; old_status text; structure record;
begin
 if auth.uid() is null or not coalesce(public.account_is_active(),false) then raise exception 'TEACHING_UNAUTHORIZED'; end if;
 -- Lock session before checking assignment so completion, reassignment and lane writes serialize.
 select * into o from session_occurrences where id=p_session for update;
 if not found then raise exception 'TEACHING_SESSION_MISSING'; end if;
 if o.status='CANCELLED' then
  if not (public.has_role('SUPER_ADMIN') or public.teacher_assigned_to_session(p_session)) then raise exception 'TEACHING_UNAUTHORIZED'; end if;
  raise exception 'TEACHING_CANCELLED';
 end if;
 if not (public.has_role('SUPER_ADMIN') or public.teacher_can_access_session(p_session)) then raise exception 'TEACHING_UNAUTHORIZED'; end if;
 select sc.class_id into class_id from schedules sc where sc.id=o.schedule_id;
 if p_action in ('attendance','progress','journal') then
  select rr.student_id into student from public.session_teaching_roster(p_session) rr where rr.enrollment_id=p_enrollment;
  if student is null then raise exception 'TEACHING_PARTICIPANT_DENIED'; end if;
  select * into attendance from attendance_records where session_occurrence_id=p_session and enrollment_id=p_enrollment for update;
 end if;
 if p_action='attendance' then
  if p_payload->>'status' is null or p_payload->>'status' not in ('PRESENT','ABSENT','LATE','EXCUSED') then raise exception 'TEACHING_STATUS_INVALID'; end if;
  -- Do not silently invalidate an existing qualitative entry when correcting attendance.
  if p_payload->>'status' in ('ABSENT','EXCUSED') and exists(select 1 from student_learning_journal_entries e where e.attendance_record_id=attendance.id
    and (e.observation<>'NOT_RECORDED' or nullif(btrim(e.progress_note),'') is not null)) then raise exception 'TEACHING_ATTENDANCE_HAS_FEEDBACK'; end if;
  insert into attendance_records(session_occurrence_id,enrollment_id,status,marked_at,marked_by)
  values(p_session,p_enrollment,p_payload->>'status',clock_timestamp(),auth.uid())
  on conflict(session_occurrence_id,enrollment_id) do update set status=excluded.status,marked_at=excluded.marked_at,marked_by=excluded.marked_by;
 elsif p_action='progress' then
  if attendance.status is null or attendance.status not in ('PRESENT','LATE') then raise exception 'TEACHING_ATTENDANCE_REQUIRED'; end if;
  if not (public.has_role('SUPER_ADMIN') or public.teacher_can_read_student_academic(student)) then raise exception 'TEACHING_ACADEMIC_DENIED'; end if;
  progress := (p_payload->>'progress_id')::uuid; kind := p_payload->>'kind'; next_status := p_payload->>'status';
  if next_status is null or next_status not in ('NOT_STARTED','IN_PROGRESS','PASS','MERIT','DISTINCTION') then raise exception 'TEACHING_STATUS_INVALID'; end if;
  select lp.id into level_progress from public.class_student_current_level(class_id,student) current_academic
  join student_level_progress lp on lp.enrollment_id=current_academic.student_curriculum_enrollment_id and lp.level_id=current_academic.current_level_id
  join curriculum_levels l on l.id=lp.level_id join curriculums cur on cur.id=l.curriculum_id
  where l.status='ACTIVE' and cur.status='ACTIVE' for update of lp;
  if level_progress is null then raise exception 'TEACHING_ACADEMIC_MISSING'; end if;
  if exists(select 1 from student_level_progress where id=level_progress and (started_at is null or started_at>now())) then raise exception 'TEACHING_FUTURE_LEVEL'; end if;
  if kind='subject' then
   select sp.status,s.completion_rule into structure from student_subject_progress sp join curriculum_subjects s on s.id=sp.subject_id
   where sp.id=progress and sp.level_progress_id=level_progress and s.level_id=(select level_id from student_level_progress where id=level_progress) and s.status='ACTIVE';
   if not found or structure.completion_rule not in ('DIRECT_ASSESSMENT','MANUAL') then raise exception 'TEACHING_PROGRESS_DENIED'; end if;
   old_status:=structure.status;
  elsif kind='component' then
   select cp.status,c.completion_rule into structure from student_component_progress cp
   join student_subject_progress sp on sp.id=cp.subject_progress_id join curriculum_subject_components c on c.id=cp.component_id and c.subject_id=sp.subject_id
   join curriculum_subjects s on s.id=sp.subject_id
   where cp.id=progress and sp.level_progress_id=level_progress and s.status='ACTIVE' and c.status='ACTIVE';
   if not found or structure.completion_rule<>'DIRECT_ASSESSMENT' then raise exception 'TEACHING_PROGRESS_DENIED'; end if;
   old_status:=structure.status;
  elsif kind='item' then
   select ip.status into old_status from student_component_item_progress ip
   join student_component_progress cp on cp.id=ip.component_progress_id
   join student_subject_progress sp on sp.id=cp.subject_progress_id
   join curriculum_component_items i on i.id=ip.item_id and i.component_id=cp.component_id
   join curriculum_subject_components c on c.id=cp.component_id and c.subject_id=sp.subject_id
   join curriculum_subjects s on s.id=sp.subject_id
   where ip.id=progress and sp.level_progress_id=level_progress and i.status='ACTIVE' and c.status='ACTIVE' and s.status='ACTIVE';
   if not found then raise exception 'TEACHING_PROGRESS_DENIED'; end if;
  else raise exception 'TEACHING_PROGRESS_DENIED'; end if;
  if old_status is distinct from p_payload->>'expected_status' then raise exception 'TEACHING_STALE'; end if;
  -- These are the SAME student progress writes used by admin actions, retaining all
  -- future-start, sealed-grade and component/subject/level roll-up triggers.
  if kind='subject' then update student_subject_progress set status=next_status where id=progress;
  elsif kind='component' then update student_component_progress set status=next_status where id=progress;
  else update student_component_item_progress set status=next_status where id=progress; end if;
 elsif p_action='context' then
  select * into journal from session_learning_journals where session_occurrence_id=p_session for update;
  if coalesce(journal.version,0) <> coalesce((p_payload->>'version')::integer,-1) then raise exception 'TEACHING_STALE'; end if;
  perform public.save_session_learning_context(p_session,p_payload->>'content',nullif(p_payload->>'context',''));
 elsif p_action='journal' then
  if attendance.id is null then raise exception 'JOURNAL_ATTENDANCE_MISSING'; end if;
  select * into entry from student_learning_journal_entries where attendance_record_id=attendance.id for update;
  if coalesce(entry.version,0) <> coalesce((p_payload->>'version')::integer,-1) then raise exception 'TEACHING_STALE'; end if;
  perform public.save_student_learning_entry(attendance.id,p_payload->>'observation',p_payload->>'progress_note',p_payload->>'homework',
    coalesce((p_payload->>'homework_custom')::boolean,false),nullif(p_payload->>'focus',''),coalesce((p_payload->>'attention')::boolean,false),
    nullif(p_payload->>'attention_reason',''),p_payload->>'attention_detail',p_payload->>'family_note',
    array(select jsonb_array_elements_text(coalesce(p_payload->'codes','[]'::jsonb))));
  select * into journal from session_learning_journals where session_occurrence_id=p_session;
  -- The existing context writer owns submitted revision metadata; retain original submit actor/time.
  if journal.status='SUBMITTED' then perform public.save_session_learning_context(p_session,null,journal.curriculum_context); end if;
 elsif p_action='complete' then
  if o.status<>'SCHEDULED' then raise exception 'TEACHING_STATUS_INVALID'; end if;
  perform public.set_session_occurrence_status(p_session,'COMPLETED');
 elsif p_action='submit' then
  perform public.submit_session_learning_journal(p_session);
 else raise exception 'TEACHING_ACTION_INVALID'; end if;
end $$;
revoke all on function public.teacher_session_workspace(uuid),public.teacher_session_write(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.teacher_session_workspace(uuid),public.teacher_session_write(uuid,text,uuid,jsonb) to authenticated;

-- Schedule list keeps the same authorization and adds the room and roster the teacher needs to open a session.
drop function public.teacher_portal_sessions(boolean, integer);
create function public.teacher_portal_sessions(p_history boolean default false, p_offset integer default 0)
returns table(session_id uuid, class_name text, starts_at timestamptz, ends_at timestamptz, status text, room_name text, roster_count integer)
language sql stable security definer set search_path=public,pg_temp as $$
 select o.id, c.name, o.starts_at, o.ends_at, o.status, r.name,
  (select count(*)::integer from public.session_teaching_roster(o.id))
 from session_occurrences o
 join schedules s on s.id=o.schedule_id
 join classes c on c.id=s.class_id
 join session_actual_teachers a on a.session_id=o.id
 join teachers t on t.id=a.teacher_id
 left join rooms r on r.id=o.room_id
 where t.user_id=auth.uid() and t.status='ACTIVE' and public.teacher_can_access_session(o.id)
 and ((p_history and o.status='COMPLETED') or (not p_history and o.status='SCHEDULED' and o.ends_at>=now()))
 order by case when p_history then o.starts_at end desc, case when not p_history then o.starts_at end, o.id
 limit 26 offset greatest(0, least(coalesce(p_offset, 0), 100000))
$$;
revoke all on function public.teacher_portal_sessions(boolean, integer) from public, anon, authenticated;
grant execute on function public.teacher_portal_sessions(boolean, integer) to authenticated;
