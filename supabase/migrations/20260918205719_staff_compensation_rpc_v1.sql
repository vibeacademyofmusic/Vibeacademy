-- VIBE Academy — Staff Compensation RPC V1
-- Additive API layer for Staff Foundation V1.
--
-- Goals:
--   1) Configure effective-dated recurring Staff compensation through a guarded RPC.
--   2) Reject wrong component shapes and ambiguous date overlaps.
--   3) Preserve an audit trail through public.employee_audit.
--
-- This migration DOES NOT modify the legacy Payroll generator.
-- It does not post BONUS/TRAVEL_EXPENSE event components into Payroll.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_STAFF_COMPENSATION_RPC_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;

  if to_regclass('public.employees') is null
     or to_regclass('public.employee_versions') is null
     or to_regclass('public.employee_audit') is null
     or to_regclass('public.teachers') is null
     or to_regclass('public.teacher_branches') is null
     or to_regclass('public.staff_role_assignments') is null
     or to_regclass('public.payroll_component_catalog') is null
     or to_regclass('public.staff_compensation_components') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_role(text)') is null
  then
    raise exception 'VIBE_STAFF_COMPENSATION_RPC_PREREQUISITE_MISSING';
  end if;

  if to_regprocedure(
       'public.configure_staff_compensation_component(uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text)'
     ) is not null
     or to_regprocedure(
       'public.end_staff_compensation_component(uuid,date,text)'
     ) is not null
  then
    raise exception 'VIBE_STAFF_COMPENSATION_RPC_ALREADY_EXISTS';
  end if;
end;
$preflight$;

create function public.configure_staff_compensation_component(
  p_employee uuid,
  p_component_code text,
  p_branch uuid,
  p_amount numeric,
  p_rate numeric,
  p_percentage numeric,
  p_basis_component_code text,
  p_currency text,
  p_class_type text,
  p_effective_from date,
  p_effective_to date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  e public.employees%rowtype;
  ev public.employee_versions%rowtype;
  catalog public.payroll_component_catalog%rowtype;
  existing public.staff_compensation_components%rowtype;
  inserted public.staff_compensation_components%rowtype;
  normalized_component text;
  normalized_basis text;
  normalized_currency text;
  normalized_class_type text;
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(),false)
     or not coalesce(public.has_role('SUPER_ADMIN'),false)
  then
    raise exception 'STAFF_COMPENSATION_UNAUTHORIZED';
  end if;

  if p_employee is null then
    raise exception 'STAFF_COMPENSATION_EMPLOYEE_REQUIRED';
  end if;

  normalized_component := upper(btrim(coalesce(p_component_code,'')));
  if normalized_component = '' then
    raise exception 'STAFF_COMPENSATION_COMPONENT_REQUIRED';
  end if;

  if p_branch is null then
    raise exception 'STAFF_COMPENSATION_BRANCH_REQUIRED';
  end if;

  if p_effective_from is null or not isfinite(p_effective_from) then
    raise exception 'STAFF_COMPENSATION_EFFECTIVE_FROM_REQUIRED';
  end if;

  if p_effective_to is not null
     and (not isfinite(p_effective_to) or p_effective_to < p_effective_from)
  then
    raise exception 'STAFF_COMPENSATION_INVALID_EFFECTIVE_RANGE';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 2000
  then
    raise exception 'STAFF_COMPENSATION_REASON_REQUIRED';
  end if;

  select *
    into e
  from public.employees
  where id = p_employee
  for update;

  if not found then
    raise exception 'STAFF_COMPENSATION_EMPLOYEE_NOT_FOUND';
  end if;

  if p_effective_from < e.hire_date then
    raise exception 'STAFF_COMPENSATION_BEFORE_HIRE_DATE';
  end if;

  select *
    into ev
  from public.employee_versions v
  where v.employee_id = e.id
    and v.effective_on <= p_effective_from
  order by v.effective_on desc, v.version desc
  limit 1;

  if not found or ev.employment_status <> 'ACTIVE' then
    raise exception 'STAFF_COMPENSATION_ACTIVE_EMPLOYMENT_REQUIRED';
  end if;

  if not exists(
    select 1
    from public.branches b
    where b.id = p_branch
      and b.status = 'ACTIVE'
  ) then
    raise exception 'STAFF_COMPENSATION_ACTIVE_BRANCH_REQUIRED';
  end if;

  select *
    into catalog
  from public.payroll_component_catalog c
  where c.code = normalized_component
    and c.status = 'ACTIVE';

  if not found then
    raise exception 'STAFF_COMPENSATION_COMPONENT_NOT_FOUND';
  end if;

  if not catalog.recurring_configurable
     or catalog.default_calculation_method = 'EVENT'
  then
    raise exception 'STAFF_COMPENSATION_EVENT_COMPONENT_NOT_CONFIGURABLE';
  end if;

  normalized_basis :=
    nullif(upper(btrim(coalesce(p_basis_component_code,''))), '');

  normalized_currency :=
    nullif(upper(btrim(coalesce(p_currency,''))), '');

  normalized_class_type :=
    nullif(upper(btrim(coalesce(p_class_type,''))), '');

  if normalized_class_type is not null
     and normalized_class_type not in ('ONE_ON_ONE','GROUP')
  then
    raise exception 'STAFF_COMPENSATION_INVALID_CLASS_TYPE';
  end if;

  if catalog.default_calculation_method = 'FIXED_AMOUNT' then
    if p_amount is null
       or p_amount <= 0
       or p_amount = 'NaN'::numeric
       or p_rate is not null
       or p_percentage is not null
       or normalized_basis is not null
       or normalized_class_type is not null
       or normalized_currency is null
       or normalized_currency !~ '^[A-Z]{3}$'
    then
      raise exception 'STAFF_COMPENSATION_INVALID_FIXED_AMOUNT_SHAPE';
    end if;

  elsif catalog.default_calculation_method in ('PER_SESSION','PER_HOUR') then
    if p_rate is null
       or p_rate <= 0
       or p_rate = 'NaN'::numeric
       or p_amount is not null
       or p_percentage is not null
       or normalized_basis is not null
       or normalized_currency is null
       or normalized_currency !~ '^[A-Z]{3}$'
    then
      raise exception 'STAFF_COMPENSATION_INVALID_RATE_SHAPE';
    end if;

    if catalog.default_calculation_method = 'PER_HOUR'
       and normalized_class_type is not null
    then
      raise exception 'STAFF_COMPENSATION_CLASS_TYPE_ONLY_FOR_SESSION_RATE';
    end if;

  elsif catalog.default_calculation_method = 'PERCENTAGE' then
    if p_percentage is null
       or p_percentage <= 0
       or p_percentage > 100
       or p_percentage = 'NaN'::numeric
       or p_amount is not null
       or p_rate is not null
       or normalized_currency is not null
       or normalized_class_type is not null
       or normalized_basis is null
       or normalized_basis = normalized_component
       or not exists(
         select 1
         from public.payroll_component_catalog basis
         where basis.code = normalized_basis
           and basis.status = 'ACTIVE'
       )
    then
      raise exception 'STAFF_COMPENSATION_INVALID_PERCENTAGE_SHAPE';
    end if;

  else
    raise exception 'STAFF_COMPENSATION_UNSUPPORTED_CALCULATION_METHOD';
  end if;

  if normalized_component = 'TEACHING_PER_SESSION' then
    if e.teacher_id is null then
      raise exception 'STAFF_COMPENSATION_TEACHER_PROFILE_REQUIRED';
    end if;

    if not exists(
      select 1
      from public.teachers t
      join public.teacher_branches tb
        on tb.teacher_id = t.id
       and tb.branch_id = p_branch
      where t.id = e.teacher_id
        and t.status = 'ACTIVE'
    ) then
      raise exception 'STAFF_COMPENSATION_ACTIVE_TEACHER_BRANCH_REQUIRED';
    end if;

    if not exists(
      select 1
      from public.staff_role_assignments sra
      where sra.employee_id = e.id
        and sra.role_code = 'TEACHER'
        and sra.branch_id = p_branch
        and sra.status = 'ACTIVE'
        and sra.effective_from <= p_effective_from
        and (
          (p_effective_to is null and sra.effective_to is null)
          or
          (p_effective_to is not null
            and (sra.effective_to is null or sra.effective_to >= p_effective_to))
        )
    ) then
      raise exception 'STAFF_COMPENSATION_ACTIVE_TEACHER_ROLE_REQUIRED';
    end if;
  end if;

  -- Idempotency for an exact same-start configuration.
  select *
    into existing
  from public.staff_compensation_components s
  where s.employee_id = e.id
    and s.component_code = normalized_component
    and s.branch_id = p_branch
    and s.effective_from = p_effective_from
    and s.class_type is not distinct from normalized_class_type
  limit 1;

  if found then
    if existing.calculation_method = catalog.default_calculation_method
       and existing.amount is not distinct from p_amount
       and existing.rate is not distinct from p_rate
       and existing.percentage is not distinct from p_percentage
       and existing.basis_component_code is not distinct from normalized_basis
       and existing.currency is not distinct from normalized_currency
       and existing.effective_to is not distinct from p_effective_to
       and existing.status = 'ACTIVE'
    then
      return jsonb_build_object(
        'status','ALREADY_CONFIGURED',
        'component_id',existing.id,
        'employee_id',existing.employee_id,
        'component_code',existing.component_code,
        'branch_id',existing.branch_id,
        'effective_from',existing.effective_from,
        'effective_to',existing.effective_to
      );
    end if;
  end if;

  -- Prevent ambiguous active ranges.
  if exists(
    select 1
    from public.staff_compensation_components s
    where s.employee_id = e.id
      and s.component_code = normalized_component
      and s.branch_id = p_branch
      and s.status = 'ACTIVE'
      and daterange(s.effective_from,s.effective_to,'[]')
          && daterange(p_effective_from,p_effective_to,'[]')
      and (
        catalog.default_calculation_method <> 'PER_SESSION'
        or s.class_type is null
        or normalized_class_type is null
        or s.class_type = normalized_class_type
      )
  ) then
    raise exception 'STAFF_COMPENSATION_OVERLAP';
  end if;

  insert into public.staff_compensation_components(
    employee_id,
    component_code,
    branch_id,
    calculation_method,
    amount,
    rate,
    percentage,
    basis_component_code,
    currency,
    class_type,
    effective_from,
    effective_to,
    status,
    reason,
    created_by
  )
  values(
    e.id,
    normalized_component,
    p_branch,
    catalog.default_calculation_method,
    p_amount,
    p_rate,
    p_percentage,
    normalized_basis,
    normalized_currency,
    normalized_class_type,
    p_effective_from,
    p_effective_to,
    'ACTIVE',
    btrim(p_reason),
    auth.uid()
  )
  returning * into inserted;

  insert into public.employee_audit(
    employee_id,
    action,
    after_data,
    reason,
    actor
  )
  values(
    e.id,
    'COMPENSATION_COMPONENT_CREATED',
    to_jsonb(inserted),
    btrim(p_reason),
    auth.uid()
  );

  return jsonb_build_object(
    'status','CONFIGURED',
    'component_id',inserted.id,
    'employee_id',inserted.employee_id,
    'component_code',inserted.component_code,
    'calculation_method',inserted.calculation_method,
    'amount',inserted.amount,
    'rate',inserted.rate,
    'percentage',inserted.percentage,
    'currency',inserted.currency,
    'class_type',inserted.class_type,
    'branch_id',inserted.branch_id,
    'effective_from',inserted.effective_from,
    'effective_to',inserted.effective_to
  );
end;
$fn$;

create function public.end_staff_compensation_component(
  p_component uuid,
  p_effective_to date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  before_row public.staff_compensation_components%rowtype;
  after_row public.staff_compensation_components%rowtype;
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(),false)
     or not coalesce(public.has_role('SUPER_ADMIN'),false)
  then
    raise exception 'STAFF_COMPENSATION_UNAUTHORIZED';
  end if;

  if p_component is null then
    raise exception 'STAFF_COMPENSATION_COMPONENT_ID_REQUIRED';
  end if;

  if p_effective_to is null or not isfinite(p_effective_to) then
    raise exception 'STAFF_COMPENSATION_END_DATE_REQUIRED';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 2000
  then
    raise exception 'STAFF_COMPENSATION_REASON_REQUIRED';
  end if;

  select *
    into before_row
  from public.staff_compensation_components
  where id = p_component
  for update;

  if not found then
    raise exception 'STAFF_COMPENSATION_COMPONENT_NOT_FOUND';
  end if;

  if p_effective_to < before_row.effective_from then
    raise exception 'STAFF_COMPENSATION_END_BEFORE_START';
  end if;

  if before_row.effective_to is not null then
    if before_row.effective_to = p_effective_to then
      return jsonb_build_object(
        'status','ALREADY_ENDED',
        'component_id',before_row.id,
        'effective_to',before_row.effective_to
      );
    end if;

    raise exception 'STAFF_COMPENSATION_ALREADY_ENDED';
  end if;

  update public.staff_compensation_components
  set effective_to = p_effective_to
  where id = before_row.id
  returning * into after_row;

  insert into public.employee_audit(
    employee_id,
    action,
    before_data,
    after_data,
    reason,
    actor
  )
  values(
    before_row.employee_id,
    'COMPENSATION_COMPONENT_ENDED',
    to_jsonb(before_row),
    to_jsonb(after_row),
    btrim(p_reason),
    auth.uid()
  );

  return jsonb_build_object(
    'status','ENDED',
    'component_id',after_row.id,
    'employee_id',after_row.employee_id,
    'component_code',after_row.component_code,
    'effective_from',after_row.effective_from,
    'effective_to',after_row.effective_to
  );
end;
$fn$;

revoke all on function public.configure_staff_compensation_component(
  uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text
) from public, anon, authenticated, service_role;

revoke all on function public.end_staff_compensation_component(
  uuid,date,text
) from public, anon, authenticated, service_role;

grant execute on function public.configure_staff_compensation_component(
  uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text
) to authenticated;

grant execute on function public.end_staff_compensation_component(
  uuid,date,text
) to authenticated;

comment on function public.configure_staff_compensation_component(
  uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text
) is
  'Configures an effective-dated recurring Staff compensation component. SUPER_ADMIN only in V1; validates component shape, Staff/branch/Teacher eligibility, overlap, idempotency, and writes employee_audit.';

comment on function public.end_staff_compensation_component(
  uuid,date,text
) is
  'Ends an open Staff compensation component at an explicit effective date and writes employee_audit. SUPER_ADMIN only in V1.';

do $verify$
begin
  if not exists(
    select 1
    from pg_proc p
    where p.oid = to_regprocedure(
      'public.configure_staff_compensation_component(uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text)'
    )
      and p.prosecdef
      and 'search_path=pg_catalog, pg_temp'=any(p.proconfig)
  ) then
    raise exception 'STAFF_COMPENSATION_CONFIGURE_RPC_SECURITY_VERIFY_FAILED';
  end if;

  if not exists(
    select 1
    from pg_proc p
    where p.oid = to_regprocedure(
      'public.end_staff_compensation_component(uuid,date,text)'
    )
      and p.prosecdef
      and 'search_path=pg_catalog, pg_temp'=any(p.proconfig)
  ) then
    raise exception 'STAFF_COMPENSATION_END_RPC_SECURITY_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.configure_staff_compensation_component(uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.configure_staff_compensation_component(uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text)',
       'EXECUTE'
     )
  then
    raise exception 'STAFF_COMPENSATION_CONFIGURE_RPC_GRANT_VERIFY_FAILED';
  end if;
end;
$verify$;

commit;
