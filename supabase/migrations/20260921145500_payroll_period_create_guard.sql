-- VIBE Academy
-- Payroll Period Create Guard
--
-- Contract:
--   no period -> create DRAFT
--   DRAFT/GENERATED/REVIEW -> return existing period
--   APPROVED/FINALIZED -> reject creation/resume
--
-- One branch + month remains one authoritative payroll period.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception
      'VIBE_PAYROLL_PERIOD_GUARD_REQUIRES_POSTGRES';
  end if;

  if to_regclass('public.payroll_periods') is null
     or to_regprocedure(
          'public.create_payroll_period(uuid,date)'
        ) is null
     or to_regprocedure(
          'public.has_role(text)'
        ) is null
  then
    raise exception
      'VIBE_PAYROLL_PERIOD_GUARD_PREREQUISITE_MISSING';
  end if;
end;
$preflight$;

create or replace function public.create_payroll_period(
  p_branch uuid,
  p_month date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  result uuid;
  existing_status text;
begin
  if not coalesce(
    public.has_role('SUPER_ADMIN'),
    false
  ) then
    raise exception 'Unauthorized';
  end if;

  if p_branch is null
     or p_month is null
     or not isfinite(p_month)
     or extract(day from p_month) <> 1
  then
    raise exception
      'PAYROLL_PERIOD_INVALID_INPUT';
  end if;

  /*
   * Resolve an existing authoritative period first.
   */
  select
    p.id,
    p.status
  into
    result,
    existing_status
  from public.payroll_periods p
  where p.branch_id = p_branch
    and p.starts_on = p_month
  for update;

  if found then
    if existing_status in (
      'APPROVED',
      'FINALIZED'
    ) then
      raise exception
        'PAYROLL_PERIOD_ALREADY_CLOSED';
    end if;

    /*
     * DRAFT / GENERATED / REVIEW:
     * resume the existing working period.
     */
    return result;
  end if;

  /*
   * No existing period: create one.
   */
  insert into public.payroll_periods (
    branch_id,
    starts_on,
    ends_on
  )
  values (
    p_branch,
    p_month,
    (
      p_month +
      interval '1 month - 1 day'
    )::date
  )
  on conflict (
    branch_id,
    starts_on
  )
  do nothing
  returning id
  into result;

  /*
   * Concurrency protection:
   * another request may have created it
   * between SELECT and INSERT.
   */
  if result is null then
    select
      p.id,
      p.status
    into
      result,
      existing_status
    from public.payroll_periods p
    where p.branch_id = p_branch
      and p.starts_on = p_month
    for update;

    if result is null then
      raise exception
        'PAYROLL_PERIOD_CREATE_RACE_RELOAD';
    end if;

    if existing_status in (
      'APPROVED',
      'FINALIZED'
    ) then
      raise exception
        'PAYROLL_PERIOD_ALREADY_CLOSED';
    end if;
  end if;

  return result;
end;
$fn$;

revoke all
on function public.create_payroll_period(uuid,date)
from public, anon, authenticated, service_role;

grant execute
on function public.create_payroll_period(uuid,date)
to authenticated;

comment on function
  public.create_payroll_period(uuid,date)
is
  'Creates one payroll period per branch/month. Existing working periods are resumed; APPROVED/FINALIZED periods are immutable and rejected.';

do $verify$
begin
  if not exists (
    select 1
    from pg_proc p
    where p.oid =
      to_regprocedure(
        'public.create_payroll_period(uuid,date)'
      )
      and p.prosecdef
      and
        'search_path=pg_catalog, pg_temp'
        = any(p.proconfig)
  ) then
    raise exception
      'PAYROLL_PERIOD_GUARD_SECURITY_VERIFY_FAILED';
  end if;

  if has_function_privilege(
    'anon',
    'public.create_payroll_period(uuid,date)',
    'EXECUTE'
  ) then
    raise exception
      'PAYROLL_PERIOD_GUARD_ANON_VERIFY_FAILED';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.create_payroll_period(uuid,date)',
    'EXECUTE'
  ) then
    raise exception
      'PAYROLL_PERIOD_GUARD_AUTH_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst, 'reload schema';

commit;
