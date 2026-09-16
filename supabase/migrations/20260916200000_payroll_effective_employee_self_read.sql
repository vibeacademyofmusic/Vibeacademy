-- A linked employee must have an ACTIVE version effective today. A missing
-- current version (e.g. future hire) is not evidence of active employment.
create or replace function public.can_read_own_payroll(p_teacher uuid,p_branch uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role_permission('TEACHER','payroll.view_own',p_branch) and exists(
  select 1 from public.teachers t where t.id=p_teacher and t.user_id=auth.uid() and t.status='ACTIVE'
  and not exists(select 1 from public.employees e where e.teacher_id=t.id and not exists(
   select 1 from hr_private.employee_at(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date) v
   where v.employment_status='ACTIVE')))
$$;
