-- Operations leads already hold operating-expense permissions and open this screen.
-- The read gate still required the FINANCE role, so the page raised
-- OPERATING_EXPENSE_UNAUTHORIZED. Financial reports stay denied.

create or replace function public.can_read_operating_expense_branch(p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(public.account_is_active(), false)
    and p_branch is not null
    and (
      public.is_global_super_admin()
      or public.is_operations_lead()
      or public.has_role_permission('FINANCE', 'operating_expense.view', p_branch)
      or public.has_role_permission('FINANCE', 'operating_expense.manage', p_branch)
    );
$$;

create or replace function vibe_operating_expense_private.can_manage(p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(public.account_is_active(), false)
    and p_branch is not null
    and (
      public.is_global_super_admin()
      or public.is_operations_lead()
      or public.has_role_permission('FINANCE', 'operating_expense.manage', p_branch)
    );
$$;

create or replace function public.list_operating_expense_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.uid() is null or not coalesce(public.account_is_active(), false) then
    raise exception 'OPERATING_EXPENSE_UNAUTHORIZED';
  end if;
  if not (
    public.is_global_super_admin()
    or public.is_operations_lead()
    or exists(
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid()
        and r.code = 'FINANCE'
        and ur.is_active
        and (ur.valid_from is null or ur.valid_from <= now())
        and (ur.valid_until is null or ur.valid_until > now())
        and exists(
          select 1
          from public.role_permissions rp
          join public.permissions p on p.id = rp.permission_id
          where rp.role_id = r.id
            and p.code in ('operating_expense.view', 'operating_expense.manage')
        )
    )
  ) then
    raise exception 'OPERATING_EXPENSE_UNAUTHORIZED';
  end if;

  return jsonb_build_object(
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'code', b.code) order by b.name, b.id)
      from public.branches b
      where b.status = 'ACTIVE'
        and public.can_read_operating_expense_branch(b.id)
    ), '[]'::jsonb),
    'templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'branch_id', t.branch_id, 'branch_name', b.name, 'category', t.category,
        'custom_category_name', t.custom_category_name, 'name', t.name, 'vendor', t.vendor,
        'amount_mode', t.amount_mode, 'expected_amount', t.expected_amount, 'currency', t.currency,
        'effective_from', t.effective_from, 'effective_to', t.effective_to, 'status', t.status, 'version', t.version
      ) order by b.name, t.name, t.id)
      from public.operating_expense_templates t
      join public.branches b on b.id = t.branch_id
      where public.can_read_operating_expense_branch(t.branch_id)
    ), '[]'::jsonb),
    'categories', jsonb_build_array(
      'RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'FIXED_PHONE', 'SECURITY', 'CLEANING', 'SOFTWARE', 'MAINTENANCE', 'OTHER'
    ),
    'payment_status', 'NO_OUTGOING_PAYMENT_LEDGER'
  );
end;
$fn$;
