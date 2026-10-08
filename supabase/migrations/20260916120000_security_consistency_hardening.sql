-- Canonical SUPER_ADMIN is global. A malformed branch-scoped assignment must
-- not become a global bypass through the legacy role helper.
create or replace function public.has_role(role_code text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(
 select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and r.code=role_code and ur.is_active
 and (r.code<>'SUPER_ADMIN' or ur.branch_id is null)
 and (ur.valid_from is null or ur.valid_from<=now())
 and (ur.valid_until is null or ur.valid_until>now()))
$$;
create or replace function public.has_permission(p_permission text,p_branch uuid default null) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(select 1 from public.permissions where code=p_permission) and exists(
 select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
 where ur.user_id=auth.uid() and ur.is_active
 and (ur.valid_from is null or ur.valid_from<=now()) and (ur.valid_until is null or ur.valid_until>now())
 and ((r.code='SUPER_ADMIN' and ur.branch_id is null) or
 (r.code<>'SUPER_ADMIN' and (ur.branch_id is null or (p_branch is not null and ur.branch_id=p_branch))
 and exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=r.id and p.code=p_permission))))
$$;
create or replace function public.has_role_permission(p_role text,p_permission text,p_branch uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.account_is_active() and exists(
 select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
 join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id
 where ur.user_id=auth.uid() and r.code=p_role and p.code=p_permission
 and ur.is_active and (ur.valid_from is null or ur.valid_from<=now())
 and (ur.valid_until is null or ur.valid_until>now())
 and (r.code<>'SUPER_ADMIN' or ur.branch_id is null)
 and (ur.branch_id is null or ur.branch_id=p_branch))
$$;
revoke all on function public.has_role(text),public.has_permission(text,uuid),public.has_role_permission(text,text,uuid) from public,anon;
grant execute on function public.has_role(text),public.has_permission(text,uuid),public.has_role_permission(text,text,uuid) to authenticated;

-- Default grants can make a simple view writable. Keep the off-cycle projection
-- explicitly read-only and prevent service clients from inserting approval
-- history directly rather than going through the maker/checker RPC.
revoke all on public.payroll_off_cycle_correction_runs from public,anon,authenticated,service_role;
grant select on public.payroll_off_cycle_correction_runs to authenticated,service_role;
revoke insert,update,delete,truncate,references,trigger on
 public.financial_approval_requests,public.financial_approval_events,public.payroll_corrections
 from service_role;
