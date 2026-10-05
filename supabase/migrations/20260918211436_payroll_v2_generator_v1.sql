-- VIBE Academy — Payroll V2 Generator V1
-- Additive migration. Keeps legacy Payroll V1.1 objects for compatibility.
--
-- Core rule:
--   1 Staff -> many Compensation Components -> 1 Payroll Header / period.
--
-- V1 calculation support:
--   FIXED_AMOUNT components
--   TEACHING_PER_SESSION from actual COMPLETED sessions
--
-- Deferred to later phases:
--   approved expense-claim posting
--   event BONUS posting
--   percentage/hourly formulas
--   Payroll V2 UI / payslip rendering
--
-- Legacy compatibility:
--   public.teacher_payrolls remains the payroll header table for now.
--   New component detail is stored in public.payroll_component_lines_v2.
--   Legacy gross_amount is synchronized to the current payable total for
--   V2 headers so existing summary screens do not show zero.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_PAYROLL_V2_REQUIRES_POSTGRES_MIGRATION_ROLE';
  end if;

  if to_regclass('public.payroll_periods') is null
     or to_regclass('public.teacher_payrolls') is null
     or to_regclass('public.payroll_earning_lines') is null
     or to_regclass('public.payroll_events') is null
     or to_regclass('public.payroll_adjustments') is null
     or to_regclass('public.employees') is null
     or to_regclass('public.employee_versions') is null
     or to_regclass('public.staff_compensation_components') is null
     or to_regclass('public.payroll_component_catalog') is null
     or to_regclass('public.session_actual_teachers') is null
     or to_regclass('public.session_occurrences') is null
     or to_regclass('public.classes') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_permission(text,uuid)') is null
     or to_regprocedure('public.is_global_super_admin()') is null
     or to_regprocedure('public.has_role_permission(text,text,uuid)') is null
     or to_regprocedure('public.payroll_approval_snapshot(uuid)') is null
     or to_regprocedure('public.guard_payroll_history()') is null
  then
    raise exception 'VIBE_PAYROLL_V2_PREREQUISITE_MISSING';
  end if;

  if to_regclass('public.payroll_component_lines_v2') is not null
     or to_regprocedure('public.generate_staff_payroll_v2(uuid)') is not null
  then
    raise exception 'VIBE_PAYROLL_V2_ALREADY_EXISTS';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1) V2 summary columns on the existing payroll header.
-- ---------------------------------------------------------------------------
alter table public.teacher_payrolls
  add column v2_earnings_amount numeric(16,2) not null default 0,
  add column v2_reimbursement_amount numeric(16,2) not null default 0,
  add column v2_deduction_amount numeric(16,2) not null default 0,
  add column v2_net_amount numeric(16,2) not null default 0,
  add column calculation_version text;

alter table public.teacher_payrolls
  add constraint teacher_payrolls_v2_earnings_nonnegative
    check (v2_earnings_amount >= 0 and v2_earnings_amount <> 'NaN'::numeric),
  add constraint teacher_payrolls_v2_reimbursement_nonnegative
    check (v2_reimbursement_amount >= 0 and v2_reimbursement_amount <> 'NaN'::numeric),
  add constraint teacher_payrolls_v2_deduction_nonnegative
    check (v2_deduction_amount >= 0 and v2_deduction_amount <> 'NaN'::numeric),
  add constraint teacher_payrolls_v2_net_not_nan
    check (v2_net_amount <> 'NaN'::numeric);

-- Keep legacy gross_amount usable as "current payable total" for V2 rows.
create function public.sync_teacher_payroll_v2_totals()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.calculation_version like 'PAYROLL_V2%' then
    new.v2_net_amount :=
      coalesce(new.v2_earnings_amount,0)
      + coalesce(new.v2_reimbursement_amount,0)
      - coalesce(new.v2_deduction_amount,0)
      + coalesce(new.adjustment_amount,0);

    -- Compatibility only. New V2 UI must use the explicit V2 totals.
    new.gross_amount := new.v2_net_amount;
  end if;

  return new;
end;
$fn$;

create trigger teacher_payroll_v2_totals_sync
before insert or update on public.teacher_payrolls
for each row execute function public.sync_teacher_payroll_v2_totals();

-- ---------------------------------------------------------------------------
-- 2) V2 component lines.
-- Amounts are stored as positive magnitudes.
-- category determines whether the amount adds to or subtracts from Net Pay.
-- ---------------------------------------------------------------------------
create table public.payroll_component_lines_v2 (
  id uuid primary key default gen_random_uuid(),

  payroll_id uuid not null
    references public.teacher_payrolls(id) on delete cascade,

  employee_id uuid not null
    references public.employees(id),

  component_config_id uuid not null
    references public.staff_compensation_components(id) on delete restrict,

  component_code text not null
    references public.payroll_component_catalog(code),

  category text not null
    check (category in ('EARNING','REIMBURSEMENT','DEDUCTION')),

  calculation_method text not null
    check (calculation_method in ('FIXED_AMOUNT','PER_SESSION')),

  source_type text not null
    check (source_type in ('CONFIG','SESSION')),

  source_session_id uuid
    references public.session_occurrences(id) on delete restrict,

  earned_on date not null check (isfinite(earned_on)),

  quantity numeric(16,6) not null
    check (quantity > 0 and quantity <> 'NaN'::numeric),

  unit_rate numeric(16,2) not null
    check (unit_rate > 0 and unit_rate <> 'NaN'::numeric),

  amount numeric(16,2) not null
    check (amount > 0 and amount <> 'NaN'::numeric),

  currency text not null
    check (currency ~ '^[A-Z]{3}$'),

  source_snapshot jsonb not null,

  created_at timestamptz not null default clock_timestamp(),

  constraint payroll_component_lines_v2_source_shape check (
    (source_type = 'SESSION' and source_session_id is not null)
    or
    (source_type = 'CONFIG' and source_session_id is null)
  )
);

create index payroll_component_lines_v2_payroll
  on public.payroll_component_lines_v2(payroll_id, category, component_code);

create index payroll_component_lines_v2_employee
  on public.payroll_component_lines_v2(employee_id, earned_on);

create index payroll_component_lines_v2_session
  on public.payroll_component_lines_v2(source_session_id)
  where source_session_id is not null;

create unique index payroll_component_lines_v2_one_fixed_config
  on public.payroll_component_lines_v2(payroll_id, component_config_id)
  where source_session_id is null;

create unique index payroll_component_lines_v2_one_session_config
  on public.payroll_component_lines_v2(
    payroll_id,
    component_config_id,
    source_session_id
  )
  where source_session_id is not null;

-- Reuse the existing payroll immutability guard.
create trigger payroll_component_lines_v2_guard
before insert or update or delete on public.payroll_component_lines_v2
for each row execute function public.guard_payroll_history();

-- ---------------------------------------------------------------------------
-- 3) RLS: direct writes are blocked. Generator owns mutations.
-- ---------------------------------------------------------------------------
alter table public.payroll_component_lines_v2 enable row level security;

create policy payroll_component_lines_v2_read
on public.payroll_component_lines_v2
for select
to authenticated
using (
  exists (
    select 1
    from public.teacher_payrolls tp
    join public.payroll_periods pp
      on pp.id = tp.period_id
    where tp.id = payroll_component_lines_v2.payroll_id
      and (
        coalesce(public.is_global_super_admin(),false)
        or coalesce(
          public.has_role_permission(
            'FINANCE',
            'payroll.view',
            tp.branch_id
          ),
          false
        )
        or (
          pp.status in ('APPROVED','FINALIZED')
          and (
            coalesce(
              public.can_read_employee_payroll(
                tp.employee_id,
                tp.branch_id
              ),
              false
            )
            or coalesce(
              public.can_read_own_payroll(
                tp.teacher_id,
                tp.branch_id
              ),
              false
            )
          )
        )
      )
  )
);

revoke all on public.payroll_component_lines_v2
from public, anon, authenticated, service_role;

grant select on public.payroll_component_lines_v2
to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Approval snapshots now include V2 component lines.
-- ---------------------------------------------------------------------------
create or replace function public.payroll_approval_snapshot(p_period uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'period',
      to_jsonb(p),

    'payrolls',
      coalesce(
        (
          select jsonb_agg(to_jsonb(t) order by t.id)
          from public.teacher_payrolls t
          where t.period_id = p.id
        ),
        '[]'::jsonb
      ),

    'component_lines_v2',
      coalesce(
        (
          select jsonb_agg(to_jsonb(l) order by l.payroll_id,l.earned_on,l.id)
          from public.payroll_component_lines_v2 l
          join public.teacher_payrolls t
            on t.id = l.payroll_id
          where t.period_id = p.id
        ),
        '[]'::jsonb
      ),

    'adjustments',
      coalesce(
        (
          select jsonb_agg(to_jsonb(a) order by a.id)
          from public.payroll_adjustments a
          join public.teacher_payrolls t
            on t.id = a.payroll_id
          where t.period_id = p.id
        ),
        '[]'::jsonb
      )
  )
  from public.payroll_periods p
  where p.id = p_period
$fn$;

-- ---------------------------------------------------------------------------
-- 5) Payroll V2 Generator.
-- ---------------------------------------------------------------------------
create function public.generate_staff_payroll_v2(p_period uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  p public.payroll_periods%rowtype;

  staff_row record;
  ev record;
  cfg record;
  sess record;
  session_cfg record;

  payroll_id_value uuid;
  currency_value text;
  pay_type_value text;

  staff_count_value integer := 0;
  line_count_value integer := 0;
  completed_session_count integer := 0;

  earnings_value numeric(16,2);
  reimbursement_value numeric(16,2);
  deduction_value numeric(16,2);
  base_salary_value numeric(16,2);
  teaching_value numeric(16,2);
  teaching_hours_value numeric(16,6);
  total_net_value numeric(16,2);

  before_state jsonb;
  after_state jsonb;
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(),false)
  then
    raise exception 'PAYROLL_V2_UNAUTHORIZED';
  end if;

  -- Resolve authoritative branch from the period, then authorize.
  select target.*
    into p
  from public.payroll_periods target
  where target.id = p_period
    and public.has_permission('payroll.prepare',target.branch_id)
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.prepare',
        target.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'PAYROLL_V2_UNAUTHORIZED';
  end if;

  if p.status <> 'DRAFT' then
    raise exception 'PAYROLL_V2_REQUIRES_DRAFT';
  end if;

  if exists(
    select 1
    from public.payroll_adjustments a
    join public.teacher_payrolls t
      on t.id = a.payroll_id
    where t.period_id = p.id
  ) then
    raise exception 'PAYROLL_V2_ADJUSTMENTS_BLOCK_REGENERATION';
  end if;

  -- Serialize compensation and Staff evidence during generation.
  lock table public.staff_compensation_components in share mode;
  perform 1
  from public.employees
  order by id
  for update;

  before_state := public.payroll_approval_snapshot(p.id);

  -- DRAFT regeneration may replace previous calculated rows.
  delete from public.payroll_component_lines_v2
  where payroll_id in (
    select id
    from public.teacher_payrolls
    where period_id = p.id
  );

  delete from public.payroll_earning_lines
  where payroll_id in (
    select id
    from public.teacher_payrolls
    where period_id = p.id
  );

  delete from public.teacher_payrolls
  where period_id = p.id;

  if not exists(
    select 1
    from public.staff_compensation_components s
    where s.branch_id = p.branch_id
      and s.status = 'ACTIVE'
      and s.effective_from <= p.ends_on
      and (s.effective_to is null or s.effective_to >= p.starts_on)
  ) then
    raise exception 'PAYROLL_V2_NO_ELIGIBLE_STAFF';
  end if;

  for staff_row in
    select distinct
      e.id as employee_id,
      e.teacher_id,
      e.employee_code
    from public.employees e
    join public.staff_compensation_components s
      on s.employee_id = e.id
    where s.branch_id = p.branch_id
      and s.status = 'ACTIVE'
      and s.effective_from <= p.ends_on
      and (s.effective_to is null or s.effective_to >= p.starts_on)
    order by e.id
  loop
    -- Staff display/employment snapshot at period end.
    select
      v.full_name,
      v.employment_status,
      v.version,
      v.effective_on
      into ev
    from public.employee_versions v
    where v.employee_id = staff_row.employee_id
      and v.effective_on <= p.ends_on
    order by v.effective_on desc, v.version desc
    limit 1;

    if not found then
      raise exception 'PAYROLL_V2_EMPLOYMENT_VERSION_REQUIRED';
    end if;

    if ev.employment_status = 'TERMINATED' then
      raise exception 'PAYROLL_V2_TERMINATION_PRORATION_UNSUPPORTED';
    end if;

    if ev.employment_status not in ('ACTIVE','ON_LEAVE') then
      raise exception 'PAYROLL_V2_INVALID_EMPLOYMENT_STATUS';
    end if;

    -- V1 intentionally supports only fixed recurring amounts and per-session pay.
    if exists(
      select 1
      from public.staff_compensation_components s
      where s.employee_id = staff_row.employee_id
        and s.branch_id = p.branch_id
        and s.status = 'ACTIVE'
        and s.effective_from <= p.ends_on
        and (s.effective_to is null or s.effective_to >= p.starts_on)
        and s.calculation_method not in ('FIXED_AMOUNT','PER_SESSION')
    ) then
      raise exception 'PAYROLL_V2_CALCULATION_METHOD_UNSUPPORTED';
    end if;

    -- Fixed monthly components must cover the full payroll month in V1.
    -- Partial-month proration will be implemented separately rather than guessed.
    if exists(
      select 1
      from public.staff_compensation_components s
      where s.employee_id = staff_row.employee_id
        and s.branch_id = p.branch_id
        and s.status = 'ACTIVE'
        and s.calculation_method = 'FIXED_AMOUNT'
        and s.effective_from <= p.ends_on
        and (s.effective_to is null or s.effective_to >= p.starts_on)
        and (
          s.effective_from > p.starts_on
          or coalesce(s.effective_to,p.ends_on) < p.ends_on
        )
    ) then
      raise exception 'PAYROLL_V2_PARTIAL_FIXED_COMPONENT_UNSUPPORTED';
    end if;

    -- All monetary configs contributing to one payroll must use one currency.
    if (
      select count(distinct s.currency)
      from public.staff_compensation_components s
      where s.employee_id = staff_row.employee_id
        and s.branch_id = p.branch_id
        and s.status = 'ACTIVE'
        and s.effective_from <= p.ends_on
        and (s.effective_to is null or s.effective_to >= p.starts_on)
        and s.currency is not null
    ) > 1 then
      raise exception 'PAYROLL_V2_MULTIPLE_CURRENCIES_UNSUPPORTED';
    end if;

    select min(s.currency)
      into currency_value
    from public.staff_compensation_components s
    where s.employee_id = staff_row.employee_id
      and s.branch_id = p.branch_id
      and s.status = 'ACTIVE'
      and s.effective_from <= p.ends_on
      and (s.effective_to is null or s.effective_to >= p.starts_on)
      and s.currency is not null;

    if currency_value is null then
      raise exception 'PAYROLL_V2_CURRENCY_REQUIRED';
    end if;

    pay_type_value :=
      case
        when exists(
          select 1
          from public.staff_compensation_components s
          join public.payroll_component_catalog c
            on c.code = s.component_code
          where s.employee_id = staff_row.employee_id
            and s.branch_id = p.branch_id
            and s.status = 'ACTIVE'
            and s.effective_from <= p.ends_on
            and (s.effective_to is null or s.effective_to >= p.starts_on)
            and s.calculation_method = 'FIXED_AMOUNT'
            and c.category = 'EARNING'
        )
        then 'MONTHLY'

        when exists(
          select 1
          from public.staff_compensation_components s
          where s.employee_id = staff_row.employee_id
            and s.branch_id = p.branch_id
            and s.status = 'ACTIVE'
            and s.effective_from <= p.ends_on
            and (s.effective_to is null or s.effective_to >= p.starts_on)
            and s.calculation_method = 'PER_SESSION'
        )
        then 'PER_SESSION'

        else 'COMPONENT_V2'
      end;

    insert into public.teacher_payrolls(
      period_id,
      teacher_id,
      employee_id,
      branch_id,
      teacher_name,
      pay_type,
      currency,
      base_salary,
      teaching_hours,
      hourly_earnings,
      adjustment_amount,
      gross_amount,
      v2_earnings_amount,
      v2_reimbursement_amount,
      v2_deduction_amount,
      v2_net_amount,
      calculation_version
    )
    values(
      p.id,
      staff_row.teacher_id,
      staff_row.employee_id,
      p.branch_id,
      ev.full_name,
      pay_type_value,
      currency_value,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      'PAYROLL_V2_1'
    )
    returning id into payroll_id_value;

    staff_count_value := staff_count_value + 1;

    -- Fixed recurring components.
    for cfg in
      select
        s.*,
        c.category,
        c.name as component_name
      from public.staff_compensation_components s
      join public.payroll_component_catalog c
        on c.code = s.component_code
      where s.employee_id = staff_row.employee_id
        and s.branch_id = p.branch_id
        and s.status = 'ACTIVE'
        and s.calculation_method = 'FIXED_AMOUNT'
        and s.effective_from <= p.starts_on
        and (s.effective_to is null or s.effective_to >= p.ends_on)
      order by s.component_code, s.id
    loop
      insert into public.payroll_component_lines_v2(
        payroll_id,
        employee_id,
        component_config_id,
        component_code,
        category,
        calculation_method,
        source_type,
        source_session_id,
        earned_on,
        quantity,
        unit_rate,
        amount,
        currency,
        source_snapshot
      )
      values(
        payroll_id_value,
        staff_row.employee_id,
        cfg.id,
        cfg.component_code,
        cfg.category,
        cfg.calculation_method,
        'CONFIG',
        null,
        p.starts_on,
        1,
        cfg.amount,
        cfg.amount,
        cfg.currency,
        jsonb_build_object(
          'calculation_version','PAYROLL_V2_1',
          'component_config',to_jsonb(cfg),
          'period',jsonb_build_object(
            'id',p.id,
            'starts_on',p.starts_on,
            'ends_on',p.ends_on
          ),
          'employment',jsonb_build_object(
            'employee_id',staff_row.employee_id,
            'employee_code',staff_row.employee_code,
            'employee_version',ev.version,
            'employment_status',ev.employment_status
          )
        )
      );

      line_count_value := line_count_value + 1;
    end loop;

    -- Per-session teaching earnings are based ONLY on actual COMPLETED sessions.
    if staff_row.teacher_id is not null then
      for sess in
        select
          a.session_id,
          a.teacher_id,
          a.class_id,
          a.branch_id,
          a.occurrence_date,
          a.status,
          a.starts_at,
          a.ends_at,
          c.class_type
        from public.session_actual_teachers a
        join public.classes c
          on c.id = a.class_id
        where a.teacher_id = staff_row.teacher_id
          and a.branch_id = p.branch_id
          and a.occurrence_date between p.starts_on and p.ends_on
          and a.status = 'COMPLETED'
          and a.ends_at <= clock_timestamp()
        order by a.occurrence_date, a.session_id
      loop
        select
          s.*,
          c.category,
          c.name as component_name
          into session_cfg
        from public.staff_compensation_components s
        join public.payroll_component_catalog c
          on c.code = s.component_code
        where s.employee_id = staff_row.employee_id
          and s.branch_id = p.branch_id
          and s.component_code = 'TEACHING_PER_SESSION'
          and s.status = 'ACTIVE'
          and s.calculation_method = 'PER_SESSION'
          and s.effective_from <= sess.occurrence_date
          and (s.effective_to is null or s.effective_to >= sess.occurrence_date)
          and (s.class_type is null or s.class_type = sess.class_type)
        order by
          case when s.class_type is null then 1 else 0 end,
          s.effective_from desc,
          s.id
        limit 1;

        if found then
          insert into public.payroll_component_lines_v2(
            payroll_id,
            employee_id,
            component_config_id,
            component_code,
            category,
            calculation_method,
            source_type,
            source_session_id,
            earned_on,
            quantity,
            unit_rate,
            amount,
            currency,
            source_snapshot
          )
          values(
            payroll_id_value,
            staff_row.employee_id,
            session_cfg.id,
            session_cfg.component_code,
            session_cfg.category,
            session_cfg.calculation_method,
            'SESSION',
            sess.session_id,
            sess.occurrence_date,
            1,
            session_cfg.rate,
            session_cfg.rate,
            session_cfg.currency,
            jsonb_build_object(
              'calculation_version','PAYROLL_V2_1',
              'component_config',to_jsonb(session_cfg),
              'session',to_jsonb(sess),
              'duration_hours',
                round(
                  extract(epoch from (sess.ends_at - sess.starts_at))
                  / 3600.0,
                  6
                )
            )
          );

          line_count_value := line_count_value + 1;
          completed_session_count := completed_session_count + 1;
        end if;
      end loop;
    end if;

    select
      coalesce(sum(l.amount) filter (where l.category = 'EARNING'),0),
      coalesce(sum(l.amount) filter (where l.category = 'REIMBURSEMENT'),0),
      coalesce(sum(l.amount) filter (where l.category = 'DEDUCTION'),0),
      coalesce(sum(l.amount) filter (where l.component_code = 'BASE_SALARY'),0),
      coalesce(sum(l.amount) filter (where l.component_code = 'TEACHING_PER_SESSION'),0),
      coalesce(
        sum(
          (l.source_snapshot->>'duration_hours')::numeric
        ) filter (
          where l.component_code = 'TEACHING_PER_SESSION'
            and l.source_snapshot ? 'duration_hours'
        ),
        0
      )
      into
        earnings_value,
        reimbursement_value,
        deduction_value,
        base_salary_value,
        teaching_value,
        teaching_hours_value
    from public.payroll_component_lines_v2 l
    where l.payroll_id = payroll_id_value;

    update public.teacher_payrolls
    set
      base_salary = base_salary_value,
      teaching_hours = teaching_hours_value,
      hourly_earnings = teaching_value,
      v2_earnings_amount = earnings_value,
      v2_reimbursement_amount = reimbursement_value,
      v2_deduction_amount = deduction_value,
      calculation_version = 'PAYROLL_V2_1'
    where id = payroll_id_value;
  end loop;

  if staff_count_value = 0 then
    raise exception 'PAYROLL_V2_NO_ELIGIBLE_STAFF';
  end if;

  select coalesce(sum(t.v2_net_amount),0)
    into total_net_value
  from public.teacher_payrolls t
  where t.period_id = p.id;

  update public.payroll_periods
  set
    status = 'GENERATED',
    generated_by = auth.uid(),
    generated_at = clock_timestamp(),
    version = version + 1
  where id = p.id;

  after_state := public.payroll_approval_snapshot(p.id);

  insert into public.payroll_events(
    period_id,
    status,
    note,
    actor_id,
    event_type,
    before_snapshot,
    after_snapshot
  )
  values(
    p.id,
    'GENERATED',
    'Payroll V2.1 generated from Staff Compensation Components and actual COMPLETED teaching sessions',
    auth.uid(),
    'GENERATED',
    before_state,
    after_state
  );

  return jsonb_build_object(
    'status','GENERATED',
    'calculation_version','PAYROLL_V2_1',
    'period_id',p.id,
    'branch_id',p.branch_id,
    'staff_count',staff_count_value,
    'component_line_count',line_count_value,
    'completed_teaching_session_count',completed_session_count,
    'total_net_amount',total_net_value,
    'currency',
      case
        when (
          select count(distinct t.currency)
          from public.teacher_payrolls t
          where t.period_id = p.id
        ) = 1
        then (
          select min(t.currency)
          from public.teacher_payrolls t
          where t.period_id = p.id
        )
        else null
      end
  );
end;
$fn$;

revoke all on function public.generate_staff_payroll_v2(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.generate_staff_payroll_v2(uuid)
to authenticated;

comment on table public.payroll_component_lines_v2 is
  'Payroll V2 immutable component detail. Positive amount magnitudes; category controls Net Pay sign.';

comment on function public.generate_staff_payroll_v2(uuid) is
  'Generates one Staff payroll header per eligible employee from Staff Compensation Components. V2.1 supports FIXED_AMOUNT and actual COMPLETED TEACHING_PER_SESSION only. Refuses empty generation.';

comment on column public.teacher_payrolls.calculation_version is
  'Compatibility header marker. PAYROLL_V2_1 rows use payroll_component_lines_v2 as component source of truth.';

-- ---------------------------------------------------------------------------
-- 6) Migration verification.
-- ---------------------------------------------------------------------------
do $verify$
begin
  if not exists(
    select 1
    from pg_proc p
    where p.oid = to_regprocedure(
      'public.generate_staff_payroll_v2(uuid)'
    )
      and p.prosecdef
      and 'search_path=pg_catalog, pg_temp'=any(p.proconfig)
  ) then
    raise exception 'PAYROLL_V2_GENERATOR_SECURITY_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.generate_staff_payroll_v2(uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.generate_staff_payroll_v2(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'PAYROLL_V2_GENERATOR_GRANT_VERIFY_FAILED';
  end if;

  if not exists(
    select 1
    from pg_trigger
    where tgrelid = 'public.payroll_component_lines_v2'::regclass
      and tgname = 'payroll_component_lines_v2_guard'
      and not tgisinternal
  ) then
    raise exception 'PAYROLL_V2_LINE_GUARD_VERIFY_FAILED';
  end if;

  if not exists(
    select 1
    from pg_trigger
    where tgrelid = 'public.teacher_payrolls'::regclass
      and tgname = 'teacher_payroll_v2_totals_sync'
      and not tgisinternal
  ) then
    raise exception 'PAYROLL_V2_TOTAL_SYNC_VERIFY_FAILED';
  end if;
end;
$verify$;

commit;
