-- Respect the existing per-child finance visibility flag on historical debt reads.
create or replace function public.can_read_student_history(p_student uuid,p_branch uuid,p_domain text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_branch is not null and p_domain in ('attendance','learning_reports','tuition') and (
 public.has_role('SUPER_ADMIN')
 or (public.has_role_permission('STUDENT',p_domain||'.view_own',p_branch) and exists(
  select 1 from public.students s where s.id=p_student and s.user_id=auth.uid()
  and s.status in ('ACTIVE','PAUSED','GRADUATED')))
 or (public.has_role_permission('PARENT',p_domain||'.view_related',p_branch) and exists(
  select 1 from public.parents p join public.student_parents sp on sp.parent_id=p.id
  where p.user_id=auth.uid() and p.status='ACTIVE' and sp.student_id=p_student and sp.is_active
  and (p_domain<>'tuition' or sp.can_view_finance is true)
  and (sp.valid_from is null or sp.valid_from<=now()) and (sp.valid_until is null or sp.valid_until>now()))))
$$;
