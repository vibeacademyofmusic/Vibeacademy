-- VIBE Academy — Payroll V2 Period Actions V1
-- Additive extension to Payroll V2.
--
-- Adds period-specific items that must NOT live in recurring Staff compensation:
--   BONUS          -> manual period earning
--   TRAVEL_EXPENSE -> reimbursement posted from an APPROVED Expense Claim
--
-- Recurring deductions such as SOCIAL_INSURANCE / LABOR_INSURANCE remain in
-- staff_compensation_components and are already consumed by Payroll V2 Generator.
--
-- Key rules:
--   * Period action != recurring compensation.
--   * APPROVED expense claim != paid. Posting only includes it in payroll.
--   * One approved expense claim may be active in only one payroll period action.
--   * Period actions survive DRAFT regeneration because they belong to
--     (period_id, employee_id), not a transient payroll header.
--   * Maker of an active V2 period action cannot approve/finalize the same payroll
--     without the existing SUPER_ADMIN emergency override.
--   * No direct writes by API roles.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'VIBE_PAYROLL_V2_PERIOD_ACTIONS_REQUIRES_POSTGRES';
  end if;

  if to_regclass('public.payroll_periods') is null
     or to_regclass('public.teacher_payrolls') is null
     or to_regclass('public.payroll_component_lines_v2') is null
     or to_regclass('public.payroll_component_catalog') is null
     or to_regclass('public.payroll_events') is null
     or to_regclass('public.payroll_adjustments') is null
     or to_regclass('public.employee_expense_claims') is null
     or to_regclass('public.employee_expense_claim_lines') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_permission(text,uuid)') is null
     or to_regprocedure('public.has_role_permission(text,text,uuid)') is null
     or to_regprocedure('public.is_global_super_admin()') is null
     or to_regprocedure('public.can_read_employee_payroll(uuid,uuid)') is null
     or to_regprocedure('public.can_read_own_payroll(uuid,uuid)') is null
     or to_regprocedure('public.payroll_approval_snapshot(uuid)') is null
     or to_regprocedure('public.generate_staff_payroll_v2(uuid)') is null
     or to_regprocedure('public.transition_payroll_with_override(uuid,integer,text,text,text,text)') is null
     or to_regprocedure('vibe_expense_private.snapshot(uuid)') is null
  then
    raise exception 'VIBE_PAYROLL_V2_PERIOD_ACTIONS_PREREQUISITE_MISSING';
  end if;

  if to_regclass('public.payroll_period_actions_v2') is not null
     or to_regprocedure('public.add_payroll_v2_bonus(uuid,integer,uuid,numeric,text,text,uuid)') is not null
     or to_regprocedure('public.post_expense_claim_to_payroll_v2(uuid,integer,uuid,text,uuid)') is not null
     or to_regprocedure('public.cancel_payroll_v2_period_action(uuid,integer,text)') is not null
  then
    raise exception 'VIBE_PAYROLL_V2_PERIOD_ACTIONS_ALREADY_EXISTS';
  end if;

  if not exists(
    select 1
    from public.payroll_component_catalog
    where code='BONUS'
      and category='EARNING'
      and status='ACTIVE'
  ) then
    raise exception 'VIBE_PAYROLL_V2_BONUS_CATALOG_REQUIRED';
  end if;

  if not exists(
    select 1
    from public.payroll_component_catalog
    where code='TRAVEL_EXPENSE'
      and category='REIMBURSEMENT'
      and status='ACTIVE'
  ) then
    raise exception 'VIBE_PAYROLL_V2_TRAVEL_EXPENSE_CATALOG_REQUIRED';
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1) Period-specific V2 actions.
-- ---------------------------------------------------------------------------
create table public.payroll_period_actions_v2 (
  id uuid primary key default gen_random_uuid(),

  period_id uuid not null
    references public.payroll_periods(id) on delete restrict,

  employee_id uuid not null
    references public.employees(id) on delete restrict,

  component_code text not null
    references public.payroll_component_catalog(code),

  category text not null
    check (category in ('EARNING','REIMBURSEMENT')),

  source_type text not null
    check (source_type in ('MANUAL_BONUS','EXPENSE_CLAIM')),

  source_expense_claim_id uuid
    references public.employee_expense_claims(id) on delete restrict,

  amount numeric(16,2) not null
    check (
      amount > 0
      and amount <= 999999999999.99
      and amount <> 'NaN'::numeric
    ),

  currency text not null
    check (currency ~ '^[A-Z]{3}$'),

  reason text not null
    check (char_length(btrim(reason)) between 1 and 2000),

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','CANCELLED')),

  request_key uuid not null,
  request_payload jsonb not null,
  source_snapshot jsonb,

  created_by uuid not null
    references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),

  cancelled_by uuid
    references auth.users(id),
  cancelled_at timestamptz,
  cancel_reason text
    check (
      cancel_reason is null
      or char_length(btrim(cancel_reason)) between 1 and 2000
    ),

  approved_by uuid
    references auth.users(id),
  approved_at timestamptz,

  constraint payroll_period_actions_v2_source_shape check (
    (
      source_type='MANUAL_BONUS'
      and component_code='BONUS'
      and category='EARNING'
      and source_expense_claim_id is null
    )
    or
    (
      source_type='EXPENSE_CLAIM'
      and component_code='TRAVEL_EXPENSE'
      and category='REIMBURSEMENT'
      and source_expense_claim_id is not null
      and source_snapshot is not null
    )
  ),

  constraint payroll_period_actions_v2_cancel_state check (
    (
      status='ACTIVE'
      and cancelled_by is null
      and cancelled_at is null
      and cancel_reason is null
    )
    or
    (
      status='CANCELLED'
      and cancelled_by is not null
      and cancelled_at is not null
      and cancel_reason is not null
    )
  ),

  constraint payroll_period_actions_v2_approval_pair check (
    (approved_by is null and approved_at is null)
    or
    (approved_by is not null and approved_at is not null)
  ),

  unique(created_by,request_key)
);

create index payroll_period_actions_v2_period_employee
  on public.payroll_period_actions_v2(
    period_id,
    employee_id,
    status,
    component_code
  );

create index payroll_period_actions_v2_claim
  on public.payroll_period_actions_v2(source_expense_claim_id)
  where source_expense_claim_id is not null;

create unique index payroll_period_actions_v2_one_active_claim
  on public.payroll_period_actions_v2(source_expense_claim_id)
  where source_expense_claim_id is not null
    and status='ACTIVE';

-- ---------------------------------------------------------------------------
-- 2) Guard action history.
-- Direct writes are revoked, but this also protects privileged/internal mistakes.
-- ---------------------------------------------------------------------------
create function public.guard_payroll_period_action_v2()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  period_state text;
begin
  if tg_op='DELETE' then
    raise exception 'PAYROLL_V2_PERIOD_ACTION_DELETE_FORBIDDEN';
  end if;

  select p.status
    into period_state
  from public.payroll_periods p
  where p.id=old.period_id;

  if period_state in ('APPROVED','FINALIZED') then
    raise exception 'PAYROLL_V2_APPROVED_PERIOD_ACTION_IMMUTABLE';
  end if;

  if new.period_id is distinct from old.period_id
     or new.employee_id is distinct from old.employee_id
     or new.component_code is distinct from old.component_code
     or new.category is distinct from old.category
     or new.source_type is distinct from old.source_type
     or new.source_expense_claim_id is distinct from old.source_expense_claim_id
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.reason is distinct from old.reason
     or new.request_key is distinct from old.request_key
     or new.request_payload is distinct from old.request_payload
     or new.source_snapshot is distinct from old.source_snapshot
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'PAYROLL_V2_PERIOD_ACTION_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$fn$;

create trigger payroll_period_actions_v2_guard
before update or delete on public.payroll_period_actions_v2
for each row execute function public.guard_payroll_period_action_v2();

-- ---------------------------------------------------------------------------
-- 3) Read policy. All writes remain RPC-only.
-- ---------------------------------------------------------------------------
alter table public.payroll_period_actions_v2 enable row level security;

create policy payroll_period_actions_v2_read
on public.payroll_period_actions_v2
for select
to authenticated
using (
  exists (
    select 1
    from public.payroll_periods pp
    left join public.teacher_payrolls tp
      on tp.period_id=pp.id
     and tp.employee_id=payroll_period_actions_v2.employee_id
    where pp.id=payroll_period_actions_v2.period_id
      and (
        coalesce(public.is_global_super_admin(),false)
        or coalesce(
          public.has_role_permission(
            'FINANCE',
            'payroll.view',
            pp.branch_id
          ),
          false
        )
        or (
          pp.status in ('APPROVED','FINALIZED')
          and tp.id is not null
          and (
            coalesce(
              public.can_read_employee_payroll(
                payroll_period_actions_v2.employee_id,
                pp.branch_id
              ),
              false
            )
            or coalesce(
              public.can_read_own_payroll(
                tp.teacher_id,
                pp.branch_id
              ),
              false
            )
          )
        )
      )
  )
);

revoke all on public.payroll_period_actions_v2
from public,anon,authenticated,service_role;

grant select on public.payroll_period_actions_v2
to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Make V2 payroll header totals authoritative from:
--      generated component lines
--    + active period actions
--    + legacy adjustment_amount (compatibility until old UI is retired)
-- ---------------------------------------------------------------------------
create or replace function public.sync_teacher_payroll_v2_totals()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  line_earnings numeric(16,2) := 0;
  line_reimbursements numeric(16,2) := 0;
  line_deductions numeric(16,2) := 0;
  action_earnings numeric(16,2) := 0;
  action_reimbursements numeric(16,2) := 0;
begin
  if new.calculation_version like 'PAYROLL_V2%' then
    select
      coalesce(sum(l.amount) filter(where l.category='EARNING'),0),
      coalesce(sum(l.amount) filter(where l.category='REIMBURSEMENT'),0),
      coalesce(sum(l.amount) filter(where l.category='DEDUCTION'),0)
    into
      line_earnings,
      line_reimbursements,
      line_deductions
    from public.payroll_component_lines_v2 l
    where l.payroll_id=new.id;

    select
      coalesce(sum(a.amount) filter(where a.category='EARNING'),0),
      coalesce(sum(a.amount) filter(where a.category='REIMBURSEMENT'),0)
    into
      action_earnings,
      action_reimbursements
    from public.payroll_period_actions_v2 a
    where a.period_id=new.period_id
      and a.employee_id=new.employee_id
      and a.status='ACTIVE';

    new.v2_earnings_amount :=
      line_earnings + action_earnings;

    new.v2_reimbursement_amount :=
      line_reimbursements + action_reimbursements;

    new.v2_deduction_amount :=
      line_deductions;

    new.v2_net_amount :=
      new.v2_earnings_amount
      + new.v2_reimbursement_amount
      - new.v2_deduction_amount
      + coalesce(new.adjustment_amount,0);

    -- Compatibility for current summary UI.
    new.gross_amount := new.v2_net_amount;
  end if;

  return new;
end;
$fn$;

create function public.refresh_staff_payroll_v2_totals(
  p_period uuid,
  p_employee uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.teacher_payrolls t
  set calculation_version=t.calculation_version
  where t.period_id=p_period
    and t.employee_id=p_employee
    and t.calculation_version like 'PAYROLL_V2%';

  if not found then
    raise exception 'PAYROLL_V2_HEADER_REQUIRED';
  end if;
end;
$fn$;

revoke all on function public.refresh_staff_payroll_v2_totals(uuid,uuid)
from public,anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- 5) Approval snapshot includes period actions.
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
          where t.period_id=p.id
        ),
        '[]'::jsonb
      ),

    'component_lines_v2',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(l)
            order by l.payroll_id,l.earned_on,l.id
          )
          from public.payroll_component_lines_v2 l
          join public.teacher_payrolls t
            on t.id=l.payroll_id
          where t.period_id=p.id
        ),
        '[]'::jsonb
      ),

    'period_actions_v2',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(a)
            order by a.created_at,a.id
          )
          from public.payroll_period_actions_v2 a
          where a.period_id=p.id
        ),
        '[]'::jsonb
      ),

    'adjustments',
      coalesce(
        (
          select jsonb_agg(to_jsonb(a) order by a.id)
          from public.payroll_adjustments a
          join public.teacher_payrolls t
            on t.id=a.payroll_id
          where t.period_id=p.id
        ),
        '[]'::jsonb
      )
  )
  from public.payroll_periods p
  where p.id=p_period
$fn$;

-- ---------------------------------------------------------------------------
-- 6) Manual bonus.
-- ---------------------------------------------------------------------------
create function public.add_payroll_v2_bonus(
  p_period uuid,
  p_version integer,
  p_employee uuid,
  p_amount numeric,
  p_currency text,
  p_reason text,
  p_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  period_row public.payroll_periods%rowtype;
  payroll_row public.teacher_payrolls%rowtype;
  prior public.payroll_period_actions_v2%rowtype;
  inserted public.payroll_period_actions_v2%rowtype;
  payload jsonb;
  before_state jsonb;
  after_state jsonb;
  normalized_currency text;
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(),false)
  then
    raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED';
  end if;

  select p.*
    into period_row
  from public.payroll_periods p
  where p.id=p_period
    and public.has_permission('payroll.prepare',p.branch_id)
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.prepare',
        p.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED';
  end if;

  normalized_currency :=
    upper(btrim(coalesce(p_currency,'')));

  if p_key is null then
    raise exception 'PAYROLL_V2_ACTION_KEY_REQUIRED';
  end if;

  if p_amount is null
     or p_amount <= 0
     or p_amount > 999999999999.99
     or p_amount <> round(p_amount,2)
     or p_amount='NaN'::numeric
  then
    raise exception 'PAYROLL_V2_BONUS_INVALID_AMOUNT';
  end if;

  if normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'PAYROLL_V2_ACTION_INVALID_CURRENCY';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 2000
  then
    raise exception 'PAYROLL_V2_ACTION_REASON_REQUIRED';
  end if;

  payload:=jsonb_build_object(
    'action','ADD_BONUS',
    'period_id',p_period,
    'period_version',p_version,
    'employee_id',p_employee,
    'amount',p_amount,
    'currency',normalized_currency,
    'reason',btrim(p_reason)
  );

  select *
    into prior
  from public.payroll_period_actions_v2 a
  where a.created_by=auth.uid()
    and a.request_key=p_key;

  if found then
    if prior.request_payload is distinct from payload then
      raise exception 'PAYROLL_V2_ACTION_KEY_ALREADY_USED';
    end if;

    return jsonb_build_object(
      'status',
        case
          when prior.status='ACTIVE' then 'ALREADY_ADDED'
          else 'ALREADY_CANCELLED'
        end,
      'action_id',prior.id,
      'period_id',prior.period_id,
      'employee_id',prior.employee_id,
      'component_code',prior.component_code,
      'amount',prior.amount,
      'currency',prior.currency
    );
  end if;

  if period_row.version is distinct from p_version then
    raise exception 'PAYROLL_V2_PERIOD_CHANGED_RELOAD';
  end if;

  if period_row.status not in ('GENERATED','REVIEW') then
    raise exception 'PAYROLL_V2_ACTION_REQUIRES_GENERATED_OR_REVIEW';
  end if;

  select t.*
    into payroll_row
  from public.teacher_payrolls t
  where t.period_id=period_row.id
    and t.employee_id=p_employee
    and t.calculation_version like 'PAYROLL_V2%'
  for update;

  if not found then
    raise exception 'PAYROLL_V2_HEADER_REQUIRED';
  end if;

  if payroll_row.currency is distinct from normalized_currency then
    raise exception 'PAYROLL_V2_ACTION_CURRENCY_MISMATCH';
  end if;

  before_state:=public.payroll_approval_snapshot(period_row.id);

  insert into public.payroll_period_actions_v2(
    period_id,
    employee_id,
    component_code,
    category,
    source_type,
    source_expense_claim_id,
    amount,
    currency,
    reason,
    request_key,
    request_payload,
    source_snapshot,
    created_by
  )
  values(
    period_row.id,
    p_employee,
    'BONUS',
    'EARNING',
    'MANUAL_BONUS',
    null,
    p_amount,
    normalized_currency,
    btrim(p_reason),
    p_key,
    payload,
    jsonb_build_object(
      'calculation_version','PAYROLL_V2_PERIOD_ACTIONS_V1',
      'entered_manually',true
    ),
    auth.uid()
  )
  returning * into inserted;

  perform public.refresh_staff_payroll_v2_totals(
    period_row.id,
    p_employee
  );

  update public.payroll_periods
  set version=version+1
  where id=period_row.id;

  after_state:=public.payroll_approval_snapshot(period_row.id);

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
    period_row.id,
    period_row.status,
    btrim(p_reason),
    auth.uid(),
    'V2_PERIOD_ACTION',
    before_state,
    after_state
  );

  return jsonb_build_object(
    'status','ADDED',
    'action_id',inserted.id,
    'period_id',inserted.period_id,
    'employee_id',inserted.employee_id,
    'component_code',inserted.component_code,
    'amount',inserted.amount,
    'currency',inserted.currency
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7) Post an APPROVED Expense Claim into Payroll as TRAVEL_EXPENSE.
-- This is inclusion in payroll, NOT proof of payment.
-- ---------------------------------------------------------------------------
create function public.post_expense_claim_to_payroll_v2(
  p_period uuid,
  p_version integer,
  p_claim uuid,
  p_reason text,
  p_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  period_row public.payroll_periods%rowtype;
  payroll_row public.teacher_payrolls%rowtype;
  claim_row public.employee_expense_claims%rowtype;
  prior public.payroll_period_actions_v2%rowtype;
  inserted public.payroll_period_actions_v2%rowtype;
  payload jsonb;
  claim_snapshot jsonb;
  before_state jsonb;
  after_state jsonb;
  line_count integer;
  line_total numeric(16,2);
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(),false)
  then
    raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED';
  end if;

  select p.*
    into period_row
  from public.payroll_periods p
  where p.id=p_period
    and public.has_permission('payroll.prepare',p.branch_id)
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.prepare',
        p.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED';
  end if;

  if p_key is null then
    raise exception 'PAYROLL_V2_ACTION_KEY_REQUIRED';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 2000
  then
    raise exception 'PAYROLL_V2_ACTION_REASON_REQUIRED';
  end if;

  payload:=jsonb_build_object(
    'action','POST_EXPENSE_CLAIM',
    'period_id',p_period,
    'period_version',p_version,
    'claim_id',p_claim,
    'reason',btrim(p_reason)
  );

  select *
    into prior
  from public.payroll_period_actions_v2 a
  where a.created_by=auth.uid()
    and a.request_key=p_key;

  if found then
    if prior.request_payload is distinct from payload then
      raise exception 'PAYROLL_V2_ACTION_KEY_ALREADY_USED';
    end if;

    return jsonb_build_object(
      'status',
        case
          when prior.status='ACTIVE' then 'ALREADY_POSTED'
          else 'ALREADY_CANCELLED'
        end,
      'action_id',prior.id,
      'claim_id',prior.source_expense_claim_id,
      'amount',prior.amount,
      'currency',prior.currency
    );
  end if;

  if period_row.version is distinct from p_version then
    raise exception 'PAYROLL_V2_PERIOD_CHANGED_RELOAD';
  end if;

  if period_row.status not in ('GENERATED','REVIEW') then
    raise exception 'PAYROLL_V2_ACTION_REQUIRES_GENERATED_OR_REVIEW';
  end if;

  select c.*
    into claim_row
  from public.employee_expense_claims c
  where c.id=p_claim
  for update;

  if not found then
    raise exception 'PAYROLL_V2_EXPENSE_CLAIM_UNAVAILABLE';
  end if;

  if claim_row.status<>'APPROVED'
     or claim_row.approved_amount is null
     or claim_row.approved_amount<=0
  then
    raise exception 'PAYROLL_V2_EXPENSE_CLAIM_NOT_APPROVED';
  end if;

  if claim_row.branch_id is distinct from period_row.branch_id
     or claim_row.requested_month is distinct from period_row.starts_on
  then
    raise exception 'PAYROLL_V2_EXPENSE_CLAIM_PERIOD_MISMATCH';
  end if;

  select
    count(*)::integer,
    coalesce(sum(l.total_amount),0)
  into
    line_count,
    line_total
  from public.employee_expense_claim_lines l
  where l.claim_id=claim_row.id
    and l.reservation_active;

  if line_count=0
     or line_total is distinct from claim_row.approved_amount
  then
    raise exception 'PAYROLL_V2_EXPENSE_CLAIM_LINES_INVALID';
  end if;

  if exists(
    select 1
    from public.employee_expense_claim_lines l
    join public.payroll_adjustments a
      on a.trip_id=l.trip_id
     and a.kind='TRAVEL_ALLOWANCE'
    where l.claim_id=claim_row.id
  ) then
    raise exception 'PAYROLL_V2_EXPENSE_CLAIM_LEGACY_CONFLICT';
  end if;

  if exists(
    select 1
    from public.payroll_period_actions_v2 a
    where a.source_expense_claim_id=claim_row.id
      and a.status='ACTIVE'
  ) then
    raise exception 'PAYROLL_V2_EXPENSE_CLAIM_ALREADY_POSTED';
  end if;

  select t.*
    into payroll_row
  from public.teacher_payrolls t
  where t.period_id=period_row.id
    and t.employee_id=claim_row.employee_id
    and t.calculation_version like 'PAYROLL_V2%'
  for update;

  if not found then
    raise exception 'PAYROLL_V2_EXPENSE_CLAIM_PAYROLL_HEADER_REQUIRED';
  end if;

  if payroll_row.currency is distinct from claim_row.currency then
    raise exception 'PAYROLL_V2_ACTION_CURRENCY_MISMATCH';
  end if;

  claim_snapshot:=vibe_expense_private.snapshot(claim_row.id);
  before_state:=public.payroll_approval_snapshot(period_row.id);

  insert into public.payroll_period_actions_v2(
    period_id,
    employee_id,
    component_code,
    category,
    source_type,
    source_expense_claim_id,
    amount,
    currency,
    reason,
    request_key,
    request_payload,
    source_snapshot,
    created_by
  )
  values(
    period_row.id,
    claim_row.employee_id,
    'TRAVEL_EXPENSE',
    'REIMBURSEMENT',
    'EXPENSE_CLAIM',
    claim_row.id,
    claim_row.approved_amount,
    claim_row.currency,
    btrim(p_reason),
    p_key,
    payload,
    jsonb_build_object(
      'integration_version','PAYROLL_V2_PERIOD_ACTIONS_V1',
      'expense_claim',claim_snapshot
    ),
    auth.uid()
  )
  returning * into inserted;

  perform public.refresh_staff_payroll_v2_totals(
    period_row.id,
    claim_row.employee_id
  );

  update public.payroll_periods
  set version=version+1
  where id=period_row.id;

  after_state:=public.payroll_approval_snapshot(period_row.id);

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
    period_row.id,
    period_row.status,
    btrim(p_reason),
    auth.uid(),
    'V2_PERIOD_ACTION',
    before_state,
    after_state
  );

  return jsonb_build_object(
    'status','POSTED',
    'action_id',inserted.id,
    'period_id',inserted.period_id,
    'employee_id',inserted.employee_id,
    'claim_id',inserted.source_expense_claim_id,
    'component_code',inserted.component_code,
    'amount',inserted.amount,
    'currency',inserted.currency,
    'payment_status','NOT_PAID_BY_THIS_ACTION'
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8) Cancel a period action before payroll approval.
-- History remains; totals are recalculated.
-- ---------------------------------------------------------------------------
create function public.cancel_payroll_v2_period_action(
  p_action uuid,
  p_version integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  action_row public.payroll_period_actions_v2%rowtype;
  period_row public.payroll_periods%rowtype;
  before_state jsonb;
  after_state jsonb;
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(),false)
  then
    raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED';
  end if;

  select a.*
    into action_row
  from public.payroll_period_actions_v2 a
  where a.id=p_action
  for update;

  if not found then
    raise exception 'PAYROLL_V2_ACTION_UNAVAILABLE';
  end if;

  select p.*
    into period_row
  from public.payroll_periods p
  where p.id=action_row.period_id
    and public.has_permission('payroll.prepare',p.branch_id)
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.prepare',
        p.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'PAYROLL_V2_ACTION_UNAUTHORIZED';
  end if;

  if action_row.status='CANCELLED' then
    return jsonb_build_object(
      'status','ALREADY_CANCELLED',
      'action_id',action_row.id,
      'period_id',action_row.period_id,
      'employee_id',action_row.employee_id
    );
  end if;

  if period_row.version is distinct from p_version then
    raise exception 'PAYROLL_V2_PERIOD_CHANGED_RELOAD';
  end if;

  if period_row.status not in ('GENERATED','REVIEW') then
    raise exception 'PAYROLL_V2_ACTION_CANCEL_REQUIRES_GENERATED_OR_REVIEW';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason)) not between 1 and 2000
  then
    raise exception 'PAYROLL_V2_ACTION_REASON_REQUIRED';
  end if;

  before_state:=public.payroll_approval_snapshot(period_row.id);

  update public.payroll_period_actions_v2
  set
    status='CANCELLED',
    cancelled_by=auth.uid(),
    cancelled_at=clock_timestamp(),
    cancel_reason=btrim(p_reason)
  where id=action_row.id;

  perform public.refresh_staff_payroll_v2_totals(
    period_row.id,
    action_row.employee_id
  );

  update public.payroll_periods
  set version=version+1
  where id=period_row.id;

  after_state:=public.payroll_approval_snapshot(period_row.id);

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
    period_row.id,
    period_row.status,
    btrim(p_reason),
    auth.uid(),
    'V2_PERIOD_ACTION_CANCELLED',
    before_state,
    after_state
  );

  return jsonb_build_object(
    'status','CANCELLED',
    'action_id',action_row.id,
    'period_id',action_row.period_id,
    'employee_id',action_row.employee_id
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9) Extend maker-checker transition to V2 period actions.
-- ---------------------------------------------------------------------------
create or replace function public.transition_payroll_with_override(
  p_period uuid,
  p_version integer,
  p_status text,
  p_note text,
  p_override_type text,
  p_override_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  p public.payroll_periods;
  before_state jsonb;
  after_state jsonb;
  emergency boolean;
  action_permission text;
begin
  action_permission:=
    case p_status
      when 'APPROVED' then 'payroll.approve'
      when 'FINALIZED' then 'payroll.finalize'
      else 'payroll.prepare'
    end;

  -- Authorize scope before locking or revealing the record version.
  select *
    into p
  from public.payroll_periods target
  where target.id=p_period
    and public.has_permission(action_permission,target.branch_id)
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        action_permission,
        target.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'Unauthorized';
  end if;

  if p.version is distinct from p_version then
    raise exception 'Payroll changed; reload';
  end if;

  emergency:=
    p_override_type is not null
    or p_override_reason is not null;

  if emergency then
    if p_status not in ('APPROVED','FINALIZED')
       or not public.has_permission(action_permission,p.branch_id)
       or not public.is_global_super_admin()
       or p_override_type is distinct from 'MAKER_CHECKER_EMERGENCY'
       or p_override_reason is null
       or char_length(btrim(p_override_reason)) not between 1 and 2000
    then
      raise exception 'Valid SUPER_ADMIN emergency override reason and type required';
    end if;

  elsif p_status in ('APPROVED','FINALIZED')
    and (
      p.generated_by is null
      or p.generated_by=auth.uid()
      or exists(
        select 1
        from public.payroll_adjustments a
        join public.teacher_payrolls t
          on t.id=a.payroll_id
        where t.period_id=p.id
          and a.created_by=auth.uid()
      )
      or exists(
        select 1
        from public.payroll_period_actions_v2 a
        where a.period_id=p.id
          and a.status='ACTIVE'
          and a.created_by=auth.uid()
      )
    )
  then
    raise exception 'Payroll maker cannot approve or finalize';
  end if;

  before_state:=public.payroll_approval_snapshot(p.id);

  if p_note is null
     or char_length(btrim(p_note)) not between 1 and 2000
  then
    raise exception 'Audit note required';
  end if;

  if p_status is null
     or not (
       (p.status='GENERATED' and p_status in ('DRAFT','REVIEW'))
       or
       (p.status='REVIEW' and p_status in ('DRAFT','APPROVED'))
       or
       (p.status='APPROVED' and p_status='FINALIZED')
     )
  then
    raise exception 'Invalid payroll transition';
  end if;

  if p_status='DRAFT'
     and exists(
       select 1
       from public.payroll_adjustments a
       join public.teacher_payrolls t
         on t.id=a.payroll_id
       where t.period_id=p.id
     )
  then
    raise exception 'Payroll with adjustments cannot return to draft';
  end if;

  if p_status='APPROVED'
     and not exists(
       select 1
       from public.teacher_payrolls
       where period_id=p.id
     )
  then
    raise exception 'Empty payroll cannot be approved';
  end if;

  if p_status='APPROVED' then
    update public.payroll_adjustments a
    set
      approved_by=auth.uid(),
      approved_at=now()
    from public.teacher_payrolls t
    where t.id=a.payroll_id
      and t.period_id=p.id;

    update public.payroll_period_actions_v2
    set
      approved_by=auth.uid(),
      approved_at=now()
    where period_id=p.id
      and status='ACTIVE';
  end if;

  update public.payroll_periods
  set
    status=p_status,
    version=version+1,
    approved_by=
      case
        when p_status='APPROVED' then auth.uid()
        else approved_by
      end,
    approved_at=
      case
        when p_status='APPROVED' then now()
        else approved_at
      end,
    finalized_by=
      case
        when p_status='FINALIZED' then auth.uid()
        else finalized_by
      end,
    finalized_at=
      case
        when p_status='FINALIZED' then now()
        else finalized_at
      end
  where id=p.id;

  after_state:=public.payroll_approval_snapshot(p.id);

  insert into public.payroll_events(
    period_id,
    status,
    note,
    actor_id,
    event_type,
    override_type,
    override_reason,
    before_snapshot,
    after_snapshot
  )
  values(
    p.id,
    p_status,
    btrim(p_note),
    auth.uid(),
    case
      when emergency then 'EMERGENCY_OVERRIDE'
      else 'STATUS_TRANSITION'
    end,
    case when emergency then p_override_type end,
    case when emergency then btrim(p_override_reason) end,
    before_state,
    after_state
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 10) Grants for public action RPCs.
-- ---------------------------------------------------------------------------
revoke all on function public.add_payroll_v2_bonus(
  uuid,integer,uuid,numeric,text,text,uuid
) from public,anon,authenticated,service_role;

revoke all on function public.post_expense_claim_to_payroll_v2(
  uuid,integer,uuid,text,uuid
) from public,anon,authenticated,service_role;

revoke all on function public.cancel_payroll_v2_period_action(
  uuid,integer,text
) from public,anon,authenticated,service_role;

grant execute on function public.add_payroll_v2_bonus(
  uuid,integer,uuid,numeric,text,text,uuid
) to authenticated;

grant execute on function public.post_expense_claim_to_payroll_v2(
  uuid,integer,uuid,text,uuid
) to authenticated;

grant execute on function public.cancel_payroll_v2_period_action(
  uuid,integer,text
) to authenticated;

comment on table public.payroll_period_actions_v2 is
  'Period-specific Payroll V2 actions. BONUS is manual period earning; TRAVEL_EXPENSE is reimbursement posted from an APPROVED expense claim. APPROVED claim/posting does not prove payment.';

comment on function public.add_payroll_v2_bonus(
  uuid,integer,uuid,numeric,text,text,uuid
) is
  'Adds a non-recurring BONUS to one Staff payroll period with optimistic period version and idempotency key.';

comment on function public.post_expense_claim_to_payroll_v2(
  uuid,integer,uuid,text,uuid
) is
  'Posts an APPROVED employee expense claim into matching Payroll V2 period as TRAVEL_EXPENSE reimbursement. Does not mark it paid.';

comment on function public.cancel_payroll_v2_period_action(
  uuid,integer,text
) is
  'Cancels an active Payroll V2 period action before approval. History remains and payroll totals are recalculated.';

-- ---------------------------------------------------------------------------
-- 11) Verification.
-- ---------------------------------------------------------------------------
do $verify$
begin
  if not exists(
    select 1
    from pg_proc p
    where p.oid=to_regprocedure(
      'public.add_payroll_v2_bonus(uuid,integer,uuid,numeric,text,text,uuid)'
    )
      and p.prosecdef
      and 'search_path=pg_catalog, pg_temp'=any(p.proconfig)
  ) then
    raise exception 'PAYROLL_V2_BONUS_RPC_SECURITY_VERIFY_FAILED';
  end if;

  if not exists(
    select 1
    from pg_proc p
    where p.oid=to_regprocedure(
      'public.post_expense_claim_to_payroll_v2(uuid,integer,uuid,text,uuid)'
    )
      and p.prosecdef
      and 'search_path=pg_catalog, pg_temp'=any(p.proconfig)
  ) then
    raise exception 'PAYROLL_V2_EXPENSE_RPC_SECURITY_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.add_payroll_v2_bonus(uuid,integer,uuid,numeric,text,text,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.add_payroll_v2_bonus(uuid,integer,uuid,numeric,text,text,uuid)',
       'EXECUTE'
     )
  then
    raise exception 'PAYROLL_V2_BONUS_RPC_GRANT_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.post_expense_claim_to_payroll_v2(uuid,integer,uuid,text,uuid)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.post_expense_claim_to_payroll_v2(uuid,integer,uuid,text,uuid)',
       'EXECUTE'
     )
  then
    raise exception 'PAYROLL_V2_EXPENSE_RPC_GRANT_VERIFY_FAILED';
  end if;

  if not exists(
    select 1
    from pg_trigger
    where tgrelid='public.payroll_period_actions_v2'::regclass
      and tgname='payroll_period_actions_v2_guard'
      and not tgisinternal
  ) then
    raise exception 'PAYROLL_V2_PERIOD_ACTION_GUARD_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst,'reload schema';

commit;
