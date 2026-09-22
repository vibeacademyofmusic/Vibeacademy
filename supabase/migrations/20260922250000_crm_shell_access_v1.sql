-- Business shell admission. Data access stays on crm_can and row policies.

create function public.crm_shell_may_enter()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.account_is_active(), false)
    and (
      public.has_role('SUPER_ADMIN')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        join public.branches b on b.id = ur.branch_id
        where ur.user_id = auth.uid()
          and r.code <> 'SUPER_ADMIN'
          and ur.branch_id is not null
          and ur.is_active
          and (ur.valid_from is null or ur.valid_from <= now())
          and (ur.valid_until is null or ur.valid_until > now())
          and p.code = 'crm.view'
      )
    )
$$;

revoke all on function public.crm_shell_may_enter() from public, anon, authenticated, service_role;
grant execute on function public.crm_shell_may_enter() to authenticated;
