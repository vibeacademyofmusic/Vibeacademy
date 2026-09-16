-- Read-only family portal projections. No new table access or business writes.
create function public.portal_students(p_student uuid default null,p_offset integer default 0)
returns table(id uuid,student_code text,full_name text)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.id,s.student_code,s.full_name from public.students s
 where (p_student is null or s.id=p_student) and (
  public.student_can_access_self(s.id) or public.parent_can_access_student(s.id)
  or exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id
   where e.student_id=s.id and public.can_read_student_history(s.id,c.branch_id,'attendance')))
 order by s.full_name,s.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

create function public.portal_academic_journey(p_student uuid,p_offset integer default 0)
returns table(program_id uuid,curriculum text,status text,is_primary boolean,current_level_id uuid,levels jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
 select e.id,c.name,e.status,e.is_primary,e.current_level_id,
 coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'status',lp.status,
  'subjects',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'name',s.name,'status',s.status,'is_required',s.is_required,'completion_rule',s.completion_rule,
   'progressStatus',coalesce(sp.status,'NOT_STARTED'),
   'components',coalesce((select jsonb_agg(jsonb_build_object('id',cc.id,'name',cc.name,
    'status',cc.status,'is_required',cc.is_required,'progressStatus',coalesce(cp.status,'NOT_STARTED')) order by cc.sort_order,cc.id)
    from curriculum_subject_components cc left join student_component_progress cp
    on cp.component_id=cc.id and cp.subject_progress_id=sp.id where cc.subject_id=s.id),'[]'::jsonb)) order by s.sort_order,s.id)
   from curriculum_subjects s left join student_subject_progress sp on sp.subject_id=s.id and sp.level_progress_id=lp.id
   where s.level_id=l.id),'[]'::jsonb)) order by l.sequence_no,l.id)
  from student_level_progress lp join curriculum_levels l on l.id=lp.level_id where lp.enrollment_id=e.id),'[]'::jsonb)
 from student_curriculum_enrollments e join curriculums c on c.id=e.curriculum_id
 where e.student_id=p_student and exists(select 1 from public.portal_students(p_student,0))
 order by e.is_primary desc,e.started_at,e.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

create function public.portal_upcoming_sessions(p_student uuid,p_offset integer default 0)
returns table(session_id uuid,starts_at timestamptz,ends_at timestamptz,class_name text)
language sql stable security definer set search_path=public,pg_temp as $$
 select distinct o.id,o.starts_at,o.ends_at,c.name
 from public.enrollments e join public.classes c on c.id=e.class_id
 join public.schedules sc on sc.class_id=c.id join public.session_occurrences o on o.schedule_id=sc.id
 where e.student_id=p_student and public.can_read_student_history(p_student,c.branch_id,'attendance')
 and e.status='ACTIVE' and o.status='SCHEDULED' and o.ends_at>=now()
 and e.started_at<=o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
 and ((o.occurrence_type='REGULAR' and not public.is_enrollment_paused_on(e.id,o.occurrence_date))
  or exists(select 1 from public.session_occurrence_participants p where p.session_occurrence_id=o.id and p.enrollment_id=e.id))
 order by o.starts_at,o.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;

revoke all on function public.portal_students(uuid,integer),public.portal_academic_journey(uuid,integer),public.portal_upcoming_sessions(uuid,integer) from public,anon,authenticated;
grant execute on function public.portal_students(uuid,integer),public.portal_academic_journey(uuid,integer),public.portal_upcoming_sessions(uuid,integer) to authenticated;
