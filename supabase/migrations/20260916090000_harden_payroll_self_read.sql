-- Preserve approved/finalized self-read, but require a live identity and scoped role.
create function public.can_read_own_payroll(p_teacher uuid, p_branch uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.account_is_active() and exists (
    select 1 from public.teachers t
    join public.user_roles ur on ur.user_id = t.user_id
    join public.roles r on r.id = ur.role_id
    where t.id = p_teacher and t.user_id = auth.uid() and t.status = 'ACTIVE'
      and r.code = 'TEACHER' and ur.is_active
      and (ur.valid_from is null or ur.valid_from <= now())
      and (ur.valid_until is null or ur.valid_until > now())
      and (ur.branch_id is null or ur.branch_id = p_branch)
  )
$$;
revoke all on function public.can_read_own_payroll(uuid,uuid) from public, anon, authenticated;
grant execute on function public.can_read_own_payroll(uuid,uuid) to authenticated;

create or replace function public.can_read_payroll_period(p_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.has_role('SUPER_ADMIN') or exists (
    select 1 from public.teacher_payrolls r
    join public.payroll_periods p on p.id = r.period_id
    where p.id = p_id and p.status in ('APPROVED','FINALIZED')
      and public.can_read_own_payroll(r.teacher_id, p.branch_id)
  )
$$;
revoke all on function public.can_read_payroll_period(uuid) from public, anon, authenticated;
grant execute on function public.can_read_payroll_period(uuid) to authenticated;

alter policy payroll_read on public.teacher_payrolls using (
  public.has_role('SUPER_ADMIN') or (
    public.can_read_own_payroll(teacher_id, branch_id)
    and exists (select 1 from public.payroll_periods p
      where p.id = period_id and p.status in ('APPROVED','FINALIZED'))
  )
);
