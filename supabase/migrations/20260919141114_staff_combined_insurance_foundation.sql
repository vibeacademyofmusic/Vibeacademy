-- VIBE Academy - BHXH+BHLĐ / database foundation only.
-- New configurable component: SOCIAL_LABOR_INSURANCE.
-- IMPORTANT: This migration does NOT merge employee records, choose an amount,
-- correct dates, regenerate payroll, or change any saved payroll totals.
-- Existing individual-insurance configurations remain unchanged until a
-- separate, explicitly confirmed, audited conversion transaction is run.
-- Based on the Staff Foundation/RPC and Payroll V2 schemas supplied by the user.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
set local search_path = pg_catalog, public, extensions, pg_temp;

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_INSURANCE_MIGRATION_REQUIRES_POSTGRES';
  end if;

  if to_regclass('public.payroll_component_catalog') is null
     or to_regclass('public.staff_compensation_components') is null
     or to_regclass('public.payroll_component_lines_v2') is null
     or to_regprocedure(
       'public.configure_staff_compensation_component(uuid,text,uuid,numeric,numeric,numeric,text,text,text,date,date,text)'
     ) is null
  then
    raise exception 'VIBE_INSURANCE_PREREQUISITE_MISSING';
  end if;

  if exists (
    select 1 from public.payroll_component_catalog
    where code = 'SOCIAL_LABOR_INSURANCE'
  ) then
    raise exception 'VIBE_COMBINED_INSURANCE_ALREADY_EXISTS_CHECK_MIGRATION_HISTORY';
  end if;

  if (
    select count(*) from public.payroll_component_catalog
    where code in ('SOCIAL_INSURANCE', 'LABOR_INSURANCE')
      and category = 'DEDUCTION'
      and default_calculation_method = 'FIXED_AMOUNT'
  ) <> 2 then
    raise exception 'VIBE_INSURANCE_LEGACY_CATALOG_MISMATCH';
  end if;

  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    raise exception 'VIBE_EXTENSIONS_SCHEMA_MISSING';
  end if;
end;
$preflight$;

-- Standard PostgreSQL extension for UUID equality in GiST exclusions.
-- If it already exists elsewhere, do NOT relocate it: detect its namespace below.
create extension if not exists btree_gist with schema extensions;

-- DDL requires a brief exclusive lock. On lock timeout the transaction fails;
-- do not bypass the timeout or reset the database to force it through.
lock table public.staff_compensation_components in access exclusive mode;

do $scope_check$
begin
  -- The existing public configure RPC requires a branch. Do not interpret
  -- old branch-less insurance rows as a global policy without an explicit review.
  if exists (
    select 1 from public.staff_compensation_components
    where component_code in ('SOCIAL_INSURANCE', 'LABOR_INSURANCE')
      and status = 'ACTIVE'
      and branch_id is null
  ) then
    raise exception 'VIBE_ACTIVE_INSURANCE_WITHOUT_BRANCH_REQUIRES_REVIEW';
  end if;
end;
$scope_check$;

insert into public.payroll_component_catalog (
  code, name, category, default_calculation_method,
  recurring_configurable, description, status
)
values (
  'SOCIAL_LABOR_INSURANCE',
  'BHXH+BHLĐ',
  'DEDUCTION',
  'FIXED_AMOUNT',
  true,
  'Khoản khấu trừ gộp do người có quyền cấu hình cho từng Staff. Không có số tiền mặc định; không dùng đồng thời với hai khoản bảo hiểm riêng trong cùng phạm vi hiệu lực.',
  'ACTIVE'
);

-- A NULL end date remains valid: the saved policy continues until changed.
-- No amount or effective date is embedded in the catalog.
alter table public.staff_compensation_components
  add constraint staff_insurance_active_branch_required
  check (
    status <> 'ACTIVE'
    or component_code not in (
      'SOCIAL_INSURANCE', 'LABOR_INSURANCE', 'SOCIAL_LABOR_INSURANCE'
    )
    or branch_id is not null
  ),
  add constraint staff_combined_insurance_fixed_method
  check (
    component_code <> 'SOCIAL_LABOR_INSURANCE'
    or calculation_method = 'FIXED_AMOUNT'
  );

-- Pairwise exclusions retain the legacy SOCIAL + LABOR pair, but prevent:
--   SOCIAL + COMBINED, LABOR + COMBINED, and overlapping COMBINED + COMBINED.
-- They also reject overlapping active duplicates of each individual code.
-- Scope = same employee + same branch + overlapping inclusive effective dates.
-- PostgreSQL enforces these constraints on inserts, updates and concurrent writes.
do $exclusions$
declare
  extension_schema text;
begin
  select n.nspname into strict extension_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'btree_gist';

  execute format($ddl$
    alter table public.staff_compensation_components
      add constraint staff_insurance_social_combined_no_overlap
      exclude using gist (
        employee_id %1$I.gist_uuid_ops with =,
        branch_id %1$I.gist_uuid_ops with =,
        (pg_catalog.daterange(effective_from, effective_to, '[]')) with &&
      )
      where (
        status = 'ACTIVE'
        and component_code in ('SOCIAL_INSURANCE', 'SOCIAL_LABOR_INSURANCE')
      )
  $ddl$, extension_schema);

  execute format($ddl$
    alter table public.staff_compensation_components
      add constraint staff_insurance_labor_combined_no_overlap
      exclude using gist (
        employee_id %1$I.gist_uuid_ops with =,
        branch_id %1$I.gist_uuid_ops with =,
        (pg_catalog.daterange(effective_from, effective_to, '[]')) with &&
      )
      where (
        status = 'ACTIVE'
        and component_code in ('LABOR_INSURANCE', 'SOCIAL_LABOR_INSURANCE')
      )
  $ddl$, extension_schema);
end;
$exclusions$;

-- Stop NEW recurring configuration through the existing guarded RPC.
-- Keep catalog status and existing employee records unchanged at this stage.
-- The existing configure RPC already rejects recurring_configurable = false.
-- This is deliberately different from deactivating the employee's configuration.
update public.payroll_component_catalog
set recurring_configurable = false
where code in ('SOCIAL_INSURANCE', 'LABOR_INSURANCE');

do $verify$
begin
  if not exists (
    select 1 from public.payroll_component_catalog
    where code = 'SOCIAL_LABOR_INSURANCE'
      and name = 'BHXH+BHLĐ'
      and category = 'DEDUCTION'
      and default_calculation_method = 'FIXED_AMOUNT'
      and status = 'ACTIVE'
      and recurring_configurable
  ) then
    raise exception 'VIBE_COMBINED_INSURANCE_CATALOG_VERIFY_FAILED';
  end if;

  if exists (
    select 1 from public.payroll_component_catalog
    where code in ('SOCIAL_INSURANCE', 'LABOR_INSURANCE')
      and recurring_configurable
  ) then
    raise exception 'VIBE_LEGACY_INSURANCE_CONFIGURABLE_VERIFY_FAILED';
  end if;

  if (
    select count(*) from pg_constraint
    where conrelid = 'public.staff_compensation_components'::regclass
      and conname in (
        'staff_insurance_social_combined_no_overlap',
        'staff_insurance_labor_combined_no_overlap'
      )
      and contype = 'x'
      and convalidated
  ) <> 2 then
    raise exception 'VIBE_INSURANCE_EXCLUSIONS_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';
commit;
