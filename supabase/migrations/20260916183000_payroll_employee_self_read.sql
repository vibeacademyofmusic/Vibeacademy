-- Linked employees cannot bypass inactive employment through their teacher identity.
create or replace function public.can_read_own_payroll(p_teacher uuid,p_branch uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.has_role_permission('TEACHER','payroll.view_own',p_branch) and exists(
  select 1 from public.teachers t where t.id=p_teacher and t.user_id=auth.uid() and t.status='ACTIVE'
   and not exists(select 1 from public.employees e cross join lateral hr_private.employee_at(e.id,(now() at time zone 'Asia/Ho_Chi_Minh')::date) v where e.teacher_id=t.id and v.employment_status<>'ACTIVE'))
$$;
create function public.own_payrolls(p_offset integer default 0) returns setof public.teacher_payrolls
language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if not public.account_is_active() then raise exception 'Unauthorized';end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid page';end if;
 return query select t.* from public.teacher_payrolls t join public.payroll_periods p on p.id=t.period_id where p.status in ('APPROVED','FINALIZED') and (public.can_read_employee_payroll(t.employee_id,t.branch_id) or public.can_read_own_payroll(t.teacher_id,t.branch_id)) order by p.starts_on desc,t.id offset p_offset limit 26;
end$$;
revoke all on function public.own_payrolls(integer) from public,anon,service_role;
grant execute on function public.own_payrolls(integer) to authenticated;
