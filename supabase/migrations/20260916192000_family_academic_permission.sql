-- Academic access has its own permission; attendance access cannot substitute for it.
insert into public.permissions(code,name,module) values
 ('academic.view_own','View own academic journey','academic'),
 ('academic.view_related','View linked child academic journey','academic') on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on
 (r.code='STUDENT' and p.code='academic.view_own') or (r.code='PARENT' and p.code='academic.view_related')
on conflict do nothing;

create function public.can_read_family_academic(p_student uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role('SUPER_ADMIN') or exists(
  select 1 from public.students s where s.id=p_student and exists(
   select 1 from (select s.default_branch_id as branch_id union
    select c.branch_id from public.enrollments e join public.classes c on c.id=e.class_id where e.student_id=s.id) b
   where b.branch_id is not null and (
    (s.user_id=auth.uid() and s.status in ('ACTIVE','PAUSED','GRADUATED')
     and public.has_role_permission('STUDENT','academic.view_own',b.branch_id))
    or (public.has_role_permission('PARENT','academic.view_related',b.branch_id) and exists(
     select 1 from public.parents p join public.student_parents sp on sp.parent_id=p.id
     where p.user_id=auth.uid() and p.status='ACTIVE' and sp.student_id=s.id and sp.is_active
     and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now()))))))
$$;
revoke all on function public.can_read_family_academic(uuid) from public,anon,authenticated;
grant execute on function public.can_read_family_academic(uuid) to authenticated;

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
 where e.student_id=p_student and public.can_read_family_academic(p_student)
 order by e.is_primary desc,e.started_at,e.id limit 26 offset greatest(0,least(coalesce(p_offset,0),100000))
$$;
