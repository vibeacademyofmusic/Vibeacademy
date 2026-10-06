-- Operations lead: full operational authority across branches, without financial reports
-- and without the ability to change roles, permissions, or account status.
-- SUPER_ADMIN remains the unrestricted owner and is not widened.

insert into public.roles (code, name, is_system)
values ('OPERATIONS_LEAD', 'Điều hành vận hành', true)
on conflict (code) do update
set name = excluded.name,
    is_system = true;

insert into public.permissions (code, name, module, description)
values (
  'finance.report.view',
  'Xem báo cáo tài chính',
  'finance',
  'Financial dashboard, revenue, profit, cash-flow, analytics, and report exports. Not granted to operations lead.'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code = 'finance.report.view'
where role.code = 'FINANCE'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code = 'OPERATIONS_LEAD'
  and permission.code <> 'finance.report.view'
on conflict do nothing;

create or replace function public.is_operations_lead()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.account_is_active() and exists (
    select 1
    from public.user_roles assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.user_id = auth.uid()
      and role.code = 'OPERATIONS_LEAD'
      and assignment.branch_id is null
      and assignment.is_active
      and (assignment.valid_from is null or assignment.valid_from <= now())
      and (assignment.valid_until is null or assignment.valid_until > now())
  )
$$;

create or replace function public.operational_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_role('SUPER_ADMIN') or public.is_operations_lead()
$$;

create or replace function public.can_view_financial_reports(p_branch uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_global_super_admin()
    or (
      not public.is_operations_lead()
      and p_branch is not null
      and public.has_permission('finance.report.view', p_branch)
      and public.has_role_permission('FINANCE', 'finance.view', p_branch)
      and public.has_role_permission('FINANCE', 'payroll.view', p_branch)
      and public.has_role_permission('FINANCE', 'operating_expense.view', p_branch)
    )
$$;

create or replace function public.finance_action_allowed(p_permission text, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_branch is not null
    and p_permission is distinct from 'finance.report.view'
    and public.has_permission(p_permission, p_branch)
    and (
      public.is_global_super_admin()
      or public.has_role_permission('FINANCE', p_permission, p_branch)
      or public.is_operations_lead()
    )
$$;

revoke all on function public.is_operations_lead() from public, anon, authenticated;
revoke all on function public.operational_admin() from public, anon, authenticated;
revoke all on function public.can_view_financial_reports(uuid) from public, anon, authenticated;
revoke all on function public.finance_action_allowed(text, uuid) from public, anon, authenticated;
grant execute on function public.is_operations_lead() to authenticated;
grant execute on function public.operational_admin() to authenticated;
grant execute on function public.can_view_financial_reports(uuid) to authenticated;
grant execute on function public.finance_action_allowed(text, uuid) to authenticated;

create or replace function vibe_financial_report_private.authorized(p_branch uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.can_view_financial_reports(p_branch)
$$;

-- Summary and forecast views stay readable by maintenance roles. Authenticated
-- operations lead receives no financial report rows. Transaction ledgers stay operational.
do $wrap_financial_views$
declare
  view_name text;
  branch_column text;
  definition text;
  predicate text;
begin
  for view_name, branch_column in
    select *
    from (values
      ('branch_finance_summary', 'branch_id'),
      ('standard_branch_finance_summary', 'branch_id'),
      ('branch_monthly_cash_summary', 'branch_id'),
      ('branch_daily_cash_summary', 'branch_id'),
      ('branch_monthly_revenue_forecast', 'branch_id'),
      ('system_monthly_revenue_forecast', '')
    ) as financial_views(view_name, branch_column)
  loop
    if to_regclass('public.' || view_name) is null then
      continue;
    end if;
    definition := rtrim(pg_get_viewdef(format('public.%I', view_name)::regclass, true), E' \n\r;');
    if branch_column = '' then
      predicate := 'public.can_view_financial_reports(null) or current_user in (''postgres'', ''supabase_admin'')';
    else
      predicate := format(
        'public.can_view_financial_reports(financial_report_rows.%I) or current_user in (''postgres'', ''supabase_admin'')',
        branch_column
      );
    end if;
    execute format(
      'create or replace view public.%I with (security_invoker = true, security_barrier = true) as select * from (%s) financial_report_rows where %s',
      view_name,
      definition,
      predicate
    );
    execute format('revoke all on public.%I from public, anon', view_name);
    execute format('grant select on public.%I to authenticated, service_role', view_name);
  end loop;
end
$wrap_financial_views$;

-- Open operational tables that already name SUPER_ADMIN. Do not open the authorization catalog.
do $operations_lead_policies$
declare
  policy record;
  policy_name text;
begin
  for policy in
    select schemaname, tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
      and tablename not in ('roles', 'permissions', 'role_permissions', 'user_roles')
      and tablename not ilike '%credential%'
      and tablename not ilike '%secret%'
      and tablename not ilike '%token%'
      and (
        coalesce(qual, '') ilike '%SUPER_ADMIN%'
        or coalesce(with_check, '') ilike '%SUPER_ADMIN%'
      )
  loop
    policy_name := left('ops_lead_' || md5(policy.tablename || '.' || policy.policyname), 63);
    if policy.cmd = 'INSERT' then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.is_operations_lead())',
        policy_name,
        policy.tablename
      );
    elsif policy.cmd in ('SELECT', 'DELETE') then
      execute format(
        'create policy %I on public.%I for %s to authenticated using (public.is_operations_lead())',
        policy_name,
        policy.tablename,
        policy.cmd
      );
    else
      execute format(
        'create policy %I on public.%I for %s to authenticated using (public.is_operations_lead()) with check (public.is_operations_lead())',
        policy_name,
        policy.tablename,
        policy.cmd
      );
    end if;
  end loop;
end
$operations_lead_policies$;

-- Operational RPCs keep their business rules. The owner-only checks below stay on SUPER_ADMIN.
do $rewrite_operational_gates$
declare
  fn record;
  source text;
  rewritten text;
begin
  for fn in
    select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.proname not in (
        'has_role', 'has_permission', 'has_role_permission', 'is_global_super_admin',
        'is_operations_lead', 'operational_admin', 'can_view_financial_reports',
        'account_is_active', 'guard_profile_account_status', 'finance_action_allowed'
      )
  loop
    source := fn.definition;
    if source !~* 'has_role[[:space:]]*\([[:space:]]*''SUPER_ADMIN''[[:space:]]*\)' then
      continue;
    end if;
    if source ~* 'zalo_credentials|notification_private\.zalo' then
      continue;
    end if;
    if source ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?(user_roles|role_permissions|roles|permissions)\b' then
      continue;
    end if;
    rewritten := regexp_replace(
      source,
      '(public\.)?has_role[[:space:]]*\([[:space:]]*''SUPER_ADMIN''[[:space:]]*\)',
      'public.operational_admin()',
      'g'
    );
    if rewritten = source then
      continue;
    end if;
    execute rewritten;
  end loop;
end
$rewrite_operational_gates$;

create or replace function public.guard_authorization_catalog()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and public.is_operations_lead() and not public.is_global_super_admin() then
    raise exception 'AUTHORIZATION_CHANGE_DENIED';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

revoke all on function public.guard_authorization_catalog() from public, anon, authenticated;

drop trigger if exists authorization_catalog_guard on public.user_roles;
drop trigger if exists authorization_catalog_guard on public.roles;
drop trigger if exists authorization_catalog_guard on public.role_permissions;
drop trigger if exists authorization_catalog_guard on public.permissions;

create trigger authorization_catalog_guard
before insert or update or delete on public.user_roles
for each row execute function public.guard_authorization_catalog();

create trigger authorization_catalog_guard
before insert or update or delete on public.roles
for each row execute function public.guard_authorization_catalog();

create trigger authorization_catalog_guard
before insert or update or delete on public.role_permissions
for each row execute function public.guard_authorization_catalog();

create trigger authorization_catalog_guard
before insert or update or delete on public.permissions
for each row execute function public.guard_authorization_catalog();

-- These two production pilot accounts only. Other assignments are left untouched.
-- Remove SUPER_ADMIN from them so the permission bypass cannot apply.
delete from public.user_roles assignment
using auth.users account, public.roles role
where assignment.user_id = account.id
  and assignment.role_id = role.id
  and role.code = 'SUPER_ADMIN'
  and lower(account.email) in ('nguyenthitramy@vibe.edu.vn', 'thachthihuynh@vibe.edu.vn');

insert into public.user_roles (user_id, role_id, branch_id, is_active)
select account.id, role.id, null, true
from auth.users account
join public.roles role on role.code = 'OPERATIONS_LEAD'
where lower(account.email) in ('nguyenthitramy@vibe.edu.vn', 'thachthihuynh@vibe.edu.vn')
  and not exists (
    select 1
    from public.user_roles existing
    where existing.user_id = account.id
      and existing.role_id = role.id
      and existing.branch_id is null
  );
