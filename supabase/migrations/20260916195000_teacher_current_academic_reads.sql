-- Current teacher academic context uses the same assignment/time/branch boundary
-- as the canonical current-profile guard, with a distinct academic permission.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from roles r cross join permissions p where r.code='TEACHER' and p.code='academic.view_related' on conflict do nothing;
create function public.teacher_can_read_student_academic(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('TEACHER') and exists(select 1 from public.enrollments e join public.classes c on c.id=e.class_id
 where e.student_id=p_student and public.has_role_permission('TEACHER','academic.view_related',c.branch_id) and (
 (public.teacher_can_access_class(c.id) and e.status='ACTIVE' and not public.is_enrollment_paused_on(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date) and e.started_at <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
 and (e.ended_at is null or e.ended_at >= (now() at time zone 'Asia/Ho_Chi_Minh')::date))
 or exists(select 1 from public.session_occurrences o join public.schedules sc on sc.id=o.schedule_id
 where sc.class_id=c.id and public.teacher_can_access_session(o.id) and o.status='SCHEDULED' and e.status='ACTIVE'
 and e.started_at<=o.occurrence_date and (e.ended_at is null or e.ended_at>=o.occurrence_date)
 and ((o.occurrence_type='REGULAR' and not public.is_enrollment_paused_on(e.id,o.occurrence_date)) or exists(select 1 from public.session_occurrence_participants sp where sp.session_occurrence_id=o.id and sp.enrollment_id=e.id)))))
$$;

revoke all on function public.teacher_can_read_student_academic(uuid) from public,anon,authenticated;
grant execute on function public.teacher_can_read_student_academic(uuid) to authenticated;

create or replace function public.portal_academic_journey(p_student uuid,p_offset integer default 0)
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
 where e.student_id=p_student and (public.can_read_family_academic(p_student) or public.teacher_can_read_student_academic(p_student))
 order by e.is_primary desc,e.started_at,e.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;
