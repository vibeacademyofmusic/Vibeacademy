-- ============================================================
-- VIBE Academy — Retroactive Payroll / Truy lĩnh V1
--
-- Purpose:
-- Closed source payroll remains immutable.
--
-- Missing employee in closed period:
--   CLOSED PERIOD
--       ↓
--   RETROACTIVE CLAIM
--       ↓
--   REVIEW / APPROVAL
--       ↓
--   POST INTO A LATER OPEN PAYROLL
--
-- Posting does NOT mean payment.
-- ============================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception
      'RETROACTIVE_REQUIRES_POSTGRES';
  end if;

  if to_regclass('public.payroll_periods') is null
     or to_regclass('public.teacher_payrolls') is null
     or to_regclass('public.employees') is null
     or to_regclass('public.employee_versions') is null
     or to_regclass('public.staff_compensation_components') is null
     or to_regclass('public.payroll_component_catalog') is null
     or to_regclass('public.payroll_period_actions_v2') is null
     or to_regprocedure('public.account_is_active()') is null
     or to_regprocedure('public.has_permission(text,uuid)') is null
     or to_regprocedure('public.has_role_permission(text,text,uuid)') is null
     or to_regprocedure('public.is_global_super_admin()') is null
     or to_regprocedure('public.refresh_staff_payroll_v2_totals(uuid,uuid)') is null
     or to_regprocedure('public.payroll_approval_snapshot(uuid)') is null
  then
    raise exception
      'RETROACTIVE_PREREQUISITE_MISSING';
  end if;

  if to_regclass('public.payroll_retroactive_claims') is not null
  then
    raise exception
      'RETROACTIVE_V1_ALREADY_EXISTS';
  end if;
end;
$preflight$;

-- ============================================================
-- COMPONENT CATALOG
-- ============================================================

insert into public.payroll_component_catalog(
  code,
  name,
  category,
  default_calculation_method,
  recurring_configurable,
  description
)
values(
  'RETROACTIVE_PAY',
  'Truy lĩnh kỳ trước',
  'EARNING',
  'EVENT',
  false,
  'Khoản lương bị bỏ sót của kỳ đã duyệt/chốt, được trả trong một kỳ lương sau.'
);

-- ============================================================
-- CLAIM
-- ============================================================

create table public.payroll_retroactive_claims (
  id uuid primary key default gen_random_uuid(),

  source_period_id uuid not null
    references public.payroll_periods(id)
    on delete restrict,

  target_period_id uuid
    references public.payroll_periods(id)
    on delete restrict,

  employee_id uuid not null
    references public.employees(id)
    on delete restrict,

  branch_id uuid not null
    references public.branches(id)
    on delete restrict,

  amount numeric(16,2) not null
    check (
      amount > 0
      and amount <= 999999999999.99
      and amount <> 'NaN'::numeric
    ),

  currency text not null
    check (currency ~ '^[A-Z]{3}$'),

  reason text not null
    check (
      char_length(btrim(reason))
      between 1 and 2000
    ),

  status text not null default 'DRAFT'
    check (
      status in (
        'DRAFT',
        'REVIEW',
        'APPROVED',
        'POSTED',
        'CANCELLED'
      )
    ),

  version integer not null default 1
    check (version > 0),

  source_snapshot jsonb not null,

  created_by uuid not null
    references auth.users(id),
  created_at timestamptz not null
    default clock_timestamp(),

  submitted_by uuid
    references auth.users(id),
  submitted_at timestamptz,

  approved_by uuid
    references auth.users(id),
  approved_at timestamptz,
  approval_note text,

  override_type text,
  override_reason text,

  posted_by uuid
    references auth.users(id),
  posted_at timestamptz,

  posted_action_id uuid,

  cancelled_by uuid
    references auth.users(id),
  cancelled_at timestamptz,
  cancel_reason text
);

create unique index payroll_retroactive_one_live_claim
  on public.payroll_retroactive_claims(
    source_period_id,
    employee_id
  )
  where status <> 'CANCELLED';

create index payroll_retroactive_target
  on public.payroll_retroactive_claims(
    target_period_id,
    status
  );

alter table public.payroll_retroactive_claims
  enable row level security;

create policy payroll_retroactive_read
on public.payroll_retroactive_claims
for select
to authenticated
using (
  coalesce(public.account_is_active(), false)
  and (
    coalesce(public.is_global_super_admin(), false)
    or coalesce(
      public.has_role_permission(
        'FINANCE',
        'payroll.view',
        branch_id
      ),
      false
    )
  )
);

revoke all
on public.payroll_retroactive_claims
from public, anon, authenticated, service_role;

grant select
on public.payroll_retroactive_claims
to authenticated;

-- ============================================================
-- EXTEND PAYROLL PERIOD ACTION
-- ============================================================

alter table public.payroll_period_actions_v2
  add column source_retroactive_claim_id uuid
  references public.payroll_retroactive_claims(id)
  on delete restrict;

alter table public.payroll_period_actions_v2
  drop constraint payroll_period_actions_v2_source_type_check;

alter table public.payroll_period_actions_v2
  add constraint payroll_period_actions_v2_source_type_check
  check (
    source_type in (
      'MANUAL_BONUS',
      'EXPENSE_CLAIM',
      'RETROACTIVE_PAY'
    )
  );

alter table public.payroll_period_actions_v2
  drop constraint payroll_period_actions_v2_source_shape;

alter table public.payroll_period_actions_v2
  add constraint payroll_period_actions_v2_source_shape
  check (
    (
      source_type = 'MANUAL_BONUS'
      and component_code = 'BONUS'
      and category = 'EARNING'
      and source_expense_claim_id is null
      and source_retroactive_claim_id is null
    )
    or
    (
      source_type = 'EXPENSE_CLAIM'
      and component_code = 'TRAVEL_EXPENSE'
      and category = 'REIMBURSEMENT'
      and source_expense_claim_id is not null
      and source_retroactive_claim_id is null
      and source_snapshot is not null
    )
    or
    (
      source_type = 'RETROACTIVE_PAY'
      and component_code = 'RETROACTIVE_PAY'
      and category = 'EARNING'
      and source_expense_claim_id is null
      and source_retroactive_claim_id is not null
      and source_snapshot is not null
    )
  );

create unique index payroll_period_actions_v2_one_retroactive
  on public.payroll_period_actions_v2(
    source_retroactive_claim_id
  )
  where source_retroactive_claim_id is not null
    and status = 'ACTIVE';

-- ============================================================
-- UPDATE ACTION IMMUTABILITY GUARD
-- ============================================================

create or replace function
public.guard_payroll_period_action_v2()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  period_state text;
begin
  if tg_op = 'DELETE' then
    raise exception
      'PAYROLL_V2_PERIOD_ACTION_DELETE_FORBIDDEN';
  end if;

  select p.status
  into period_state
  from public.payroll_periods p
  where p.id = old.period_id;

  if period_state in ('APPROVED','FINALIZED') then
    raise exception
      'PAYROLL_V2_APPROVED_PERIOD_ACTION_IMMUTABLE';
  end if;

  if new.period_id is distinct from old.period_id
     or new.employee_id is distinct from old.employee_id
     or new.component_code is distinct from old.component_code
     or new.category is distinct from old.category
     or new.source_type is distinct from old.source_type
     or new.source_expense_claim_id
          is distinct from old.source_expense_claim_id
     or new.source_retroactive_claim_id
          is distinct from old.source_retroactive_claim_id
     or new.amount is distinct from old.amount
     or new.currency is distinct from old.currency
     or new.reason is distinct from old.reason
     or new.request_key is distinct from old.request_key
     or new.request_payload is distinct from old.request_payload
     or new.source_snapshot is distinct from old.source_snapshot
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception
      'PAYROLL_V2_PERIOD_ACTION_IDENTITY_IMMUTABLE';
  end if;

  return new;
end;
$fn$;

-- ============================================================
-- CREATE CLAIM
-- ============================================================

create function public.create_payroll_retroactive_claim(
  p_source_period uuid,
  p_employee uuid,
  p_amount numeric,
  p_currency text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  source_row public.payroll_periods%rowtype;
  claim_id uuid;
  snapshot jsonb;
begin
  if auth.uid() is null
     or not coalesce(public.account_is_active(), false)
  then
    raise exception 'RETROACTIVE_UNAUTHORIZED';
  end if;

  select p.*
  into source_row
  from public.payroll_periods p
  where p.id = p_source_period
    and public.has_permission(
      'payroll.prepare',
      p.branch_id
    )
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
    raise exception 'RETROACTIVE_UNAUTHORIZED';
  end if;

  if source_row.status
     not in ('APPROVED','FINALIZED')
  then
    raise exception
      'RETROACTIVE_SOURCE_MUST_BE_CLOSED';
  end if;

  if not exists (
    select 1
    from public.employees e
    where e.id = p_employee
  ) then
    raise exception
      'RETROACTIVE_EMPLOYEE_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.teacher_payrolls t
    where t.period_id = source_row.id
      and t.employee_id = p_employee
  ) then
    raise exception
      'RETROACTIVE_SOURCE_PAYROLL_ALREADY_EXISTS';
  end if;

  if not exists (
    select 1
    from public.staff_compensation_components s
    where s.employee_id = p_employee
      and s.branch_id = source_row.branch_id
      and s.status = 'ACTIVE'
      and s.effective_from <= source_row.ends_on
      and (
        s.effective_to is null
        or s.effective_to >= source_row.starts_on
      )
  ) then
    raise exception
      'RETROACTIVE_SOURCE_COMPENSATION_REQUIRED';
  end if;

  if p_amount is null
     or p_amount <= 0
     or p_amount > 999999999999.99
     or p_amount <> round(p_amount, 2)
     or p_amount = 'NaN'::numeric
  then
    raise exception
      'RETROACTIVE_INVALID_AMOUNT';
  end if;

  if p_currency is null
     or upper(btrim(p_currency))
        !~ '^[A-Z]{3}$'
  then
    raise exception
      'RETROACTIVE_INVALID_CURRENCY';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason))
        not between 1 and 2000
  then
    raise exception
      'RETROACTIVE_REASON_REQUIRED';
  end if;

  if exists (
    select 1
    from public.payroll_retroactive_claims r
    where r.source_period_id = source_row.id
      and r.employee_id = p_employee
      and r.status <> 'CANCELLED'
  ) then
    raise exception
      'RETROACTIVE_ALREADY_EXISTS';
  end if;

  select jsonb_build_object(
    'integration_version',
      'RETROACTIVE_PAY_V1',

    'source_period',
      to_jsonb(source_row),

    'employee',
      (
        select jsonb_build_object(
          'id', e.id,
          'employee_code', e.employee_code,
          'name',
            (
              select v.full_name
              from public.employee_versions v
              where v.employee_id = e.id
                and v.effective_on
                    <= source_row.ends_on
              order by
                v.effective_on desc,
                v.version desc
              limit 1
            )
        )
        from public.employees e
        where e.id = p_employee
      ),

    'compensation',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(s)
            order by
              s.component_code,
              s.effective_from,
              s.id
          )
          from public.staff_compensation_components s
          where s.employee_id = p_employee
            and s.branch_id = source_row.branch_id
            and s.status = 'ACTIVE'
            and s.effective_from
                <= source_row.ends_on
            and (
              s.effective_to is null
              or s.effective_to
                 >= source_row.starts_on
            )
        ),
        '[]'::jsonb
      )
  )
  into snapshot;

  insert into public.payroll_retroactive_claims(
    source_period_id,
    employee_id,
    branch_id,
    amount,
    currency,
    reason,
    source_snapshot,
    created_by
  )
  values(
    source_row.id,
    p_employee,
    source_row.branch_id,
    p_amount,
    upper(btrim(p_currency)),
    btrim(p_reason),
    snapshot,
    auth.uid()
  )
  returning id into claim_id;

  return claim_id;
end;
$fn$;

-- ============================================================
-- SUBMIT
-- ============================================================

create function public.submit_payroll_retroactive_claim(
  p_claim uuid,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  c public.payroll_retroactive_claims%rowtype;
begin
  select r.*
  into c
  from public.payroll_retroactive_claims r
  where r.id = p_claim
    and public.has_permission(
      'payroll.prepare',
      r.branch_id
    )
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.prepare',
        r.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'RETROACTIVE_UNAUTHORIZED';
  end if;

  if c.version is distinct from p_version then
    raise exception
      'RETROACTIVE_CHANGED_RELOAD';
  end if;

  if c.status <> 'DRAFT' then
    raise exception
      'RETROACTIVE_REQUIRES_DRAFT';
  end if;

  update public.payroll_retroactive_claims
  set
    status = 'REVIEW',
    version = version + 1,
    submitted_by = auth.uid(),
    submitted_at = clock_timestamp()
  where id = c.id;

  return jsonb_build_object(
    'status','REVIEW',
    'claim_id',c.id
  );
end;
$fn$;

-- ============================================================
-- APPROVE
-- ============================================================

create function public.approve_payroll_retroactive_claim(
  p_claim uuid,
  p_version integer,
  p_target_period uuid,
  p_note text,
  p_override_type text,
  p_override_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  c public.payroll_retroactive_claims%rowtype;
  target_row public.payroll_periods%rowtype;
  source_row public.payroll_periods%rowtype;
  emergency boolean;
begin
  select r.*
  into c
  from public.payroll_retroactive_claims r
  where r.id = p_claim
    and public.has_permission(
      'payroll.approve',
      r.branch_id
    )
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.approve',
        r.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'RETROACTIVE_UNAUTHORIZED';
  end if;

  if c.version is distinct from p_version then
    raise exception
      'RETROACTIVE_CHANGED_RELOAD';
  end if;

  if c.status <> 'REVIEW' then
    raise exception
      'RETROACTIVE_REQUIRES_REVIEW';
  end if;

  if p_note is null
     or char_length(btrim(p_note))
        not between 1 and 2000
  then
    raise exception
      'RETROACTIVE_APPROVAL_NOTE_REQUIRED';
  end if;

  select *
  into source_row
  from public.payroll_periods
  where id = c.source_period_id;

  select *
  into target_row
  from public.payroll_periods
  where id = p_target_period
  for update;

  if not found
     or target_row.branch_id
        is distinct from c.branch_id
     or target_row.starts_on
        <= source_row.starts_on
     or target_row.status
        not in ('DRAFT','GENERATED','REVIEW')
  then
    raise exception
      'RETROACTIVE_INVALID_TARGET_PERIOD';
  end if;

  emergency :=
    p_override_type is not null
    or p_override_reason is not null;

  if emergency then
    if not public.is_global_super_admin()
       or p_override_type
          is distinct from
          'MAKER_CHECKER_EMERGENCY'
       or p_override_reason is null
       or char_length(
            btrim(p_override_reason)
          ) not between 1 and 2000
    then
      raise exception
        'RETROACTIVE_INVALID_OVERRIDE';
    end if;
  end if;

  if c.created_by = auth.uid()
     and not emergency
  then
    raise exception
      'RETROACTIVE_MAKER_CANNOT_APPROVE';
  end if;

  update public.payroll_retroactive_claims
  set
    target_period_id = target_row.id,
    status = 'APPROVED',
    version = version + 1,
    approved_by = auth.uid(),
    approved_at = clock_timestamp(),
    approval_note = btrim(p_note),
    override_type =
      case when emergency
        then p_override_type
      end,
    override_reason =
      case when emergency
        then btrim(p_override_reason)
      end
  where id = c.id;

  return jsonb_build_object(
    'status','APPROVED',
    'claim_id',c.id,
    'target_period_id',target_row.id
  );
end;
$fn$;

-- ============================================================
-- POST INTO TARGET PAYROLL
-- ============================================================

create function public.post_payroll_retroactive_claim(
  p_claim uuid,
  p_version integer,
  p_period_version integer,
  p_reason text,
  p_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  c public.payroll_retroactive_claims%rowtype;
  source_row public.payroll_periods%rowtype;
  target_row public.payroll_periods%rowtype;
  pay public.teacher_payrolls%rowtype;
  inserted public.payroll_period_actions_v2%rowtype;
  before_state jsonb;
  after_state jsonb;
begin
  select r.*
  into c
  from public.payroll_retroactive_claims r
  where r.id = p_claim
  for update;

  if not found
     or c.target_period_id is null
  then
    raise exception
      'RETROACTIVE_CLAIM_UNAVAILABLE';
  end if;

  select p.*
  into target_row
  from public.payroll_periods p
  where p.id = c.target_period_id
    and public.has_permission(
      'payroll.prepare',
      p.branch_id
    )
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
    raise exception 'RETROACTIVE_UNAUTHORIZED';
  end if;

  if c.version is distinct from p_version
     or target_row.version
        is distinct from p_period_version
  then
    raise exception
      'RETROACTIVE_CHANGED_RELOAD';
  end if;

  if c.status <> 'APPROVED' then
    raise exception
      'RETROACTIVE_REQUIRES_APPROVED';
  end if;

  if target_row.status
     not in ('GENERATED','REVIEW')
  then
    raise exception
      'RETROACTIVE_TARGET_MUST_BE_GENERATED_OR_REVIEW';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason))
        not between 1 and 2000
  then
    raise exception
      'RETROACTIVE_POST_REASON_REQUIRED';
  end if;

  if p_key is null then
    raise exception
      'RETROACTIVE_REQUEST_KEY_REQUIRED';
  end if;

  select *
  into source_row
  from public.payroll_periods
  where id = c.source_period_id;

  select t.*
  into pay
  from public.teacher_payrolls t
  where t.period_id = target_row.id
    and t.employee_id = c.employee_id
    and t.calculation_version like 'PAYROLL_V2%'
  for update;

  if not found then
    raise exception
      'RETROACTIVE_TARGET_PAYROLL_HEADER_REQUIRED';
  end if;

  if pay.currency is distinct from c.currency then
    raise exception
      'RETROACTIVE_CURRENCY_MISMATCH';
  end if;

  if exists (
    select 1
    from public.payroll_period_actions_v2 a
    where a.source_retroactive_claim_id = c.id
      and a.status = 'ACTIVE'
  ) then
    raise exception
      'RETROACTIVE_ALREADY_POSTED';
  end if;

  before_state :=
    public.payroll_approval_snapshot(
      target_row.id
    );

  insert into public.payroll_period_actions_v2(
    period_id,
    employee_id,
    component_code,
    category,
    source_type,
    source_expense_claim_id,
    source_retroactive_claim_id,
    amount,
    currency,
    reason,
    request_key,
    request_payload,
    source_snapshot,
    created_by
  )
  values(
    target_row.id,
    c.employee_id,
    'RETROACTIVE_PAY',
    'EARNING',
    'RETROACTIVE_PAY',
    null,
    c.id,
    c.amount,
    c.currency,
    'Truy lĩnh kỳ ' ||
      to_char(source_row.starts_on,'MM/YYYY') ||
      ': ' ||
      c.reason,
    p_key,
    jsonb_build_object(
      'claim_id', c.id,
      'claim_version', c.version,
      'target_period_version',
        target_row.version
    ),
    jsonb_build_object(
      'integration_version',
        'RETROACTIVE_PAY_V1',
      'claim_id', c.id,
      'source_period_id',
        c.source_period_id,
      'source_month',
        to_char(
          source_row.starts_on,
          'YYYY-MM'
        ),
      'claim_snapshot',
        c.source_snapshot
    ),
    auth.uid()
  )
  returning * into inserted;

  perform public.refresh_staff_payroll_v2_totals(
    target_row.id,
    c.employee_id
  );

  update public.payroll_periods
  set version = version + 1
  where id = target_row.id;

  update public.payroll_retroactive_claims
  set
    status = 'POSTED',
    version = version + 1,
    posted_by = auth.uid(),
    posted_at = clock_timestamp(),
    posted_action_id = inserted.id
  where id = c.id;

  after_state :=
    public.payroll_approval_snapshot(
      target_row.id
    );

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
    target_row.id,
    target_row.status,
    btrim(p_reason),
    auth.uid(),
    'RETROACTIVE_PAY_POSTED',
    before_state,
    after_state
  );

  return jsonb_build_object(
    'status','POSTED',
    'claim_id',c.id,
    'action_id',inserted.id,
    'target_period_id',target_row.id,
    'employee_id',c.employee_id,
    'amount',c.amount,
    'currency',c.currency,
    'payment_status',
      'NOT_PAID_BY_THIS_ACTION'
  );
end;
$fn$;

-- ============================================================
-- CANCEL CLAIM BEFORE POSTING
-- ============================================================

create function public.cancel_payroll_retroactive_claim(
  p_claim uuid,
  p_version integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  c public.payroll_retroactive_claims%rowtype;
begin
  select r.*
  into c
  from public.payroll_retroactive_claims r
  where r.id = p_claim
    and public.has_permission(
      'payroll.prepare',
      r.branch_id
    )
    and (
      public.is_global_super_admin()
      or public.has_role_permission(
        'FINANCE',
        'payroll.prepare',
        r.branch_id
      )
    )
  for update;

  if not found then
    raise exception 'RETROACTIVE_UNAUTHORIZED';
  end if;

  if c.version is distinct from p_version then
    raise exception
      'RETROACTIVE_CHANGED_RELOAD';
  end if;

  if c.status not in (
    'DRAFT','REVIEW','APPROVED'
  ) then
    raise exception
      'RETROACTIVE_CANNOT_CANCEL';
  end if;

  if p_reason is null
     or char_length(btrim(p_reason))
        not between 1 and 2000
  then
    raise exception
      'RETROACTIVE_CANCEL_REASON_REQUIRED';
  end if;

  update public.payroll_retroactive_claims
  set
    status = 'CANCELLED',
    version = version + 1,
    cancelled_by = auth.uid(),
    cancelled_at = clock_timestamp(),
    cancel_reason = btrim(p_reason)
  where id = c.id;

  return jsonb_build_object(
    'status','CANCELLED',
    'claim_id',c.id
  );
end;
$fn$;

-- ============================================================
-- IF POSTED ACTION IS CANCELLED BEFORE PAYROLL APPROVAL,
-- RETURN CLAIM TO APPROVED
-- ============================================================

create function
public.sync_retroactive_claim_action_cancel()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if old.source_type = 'RETROACTIVE_PAY'
     and old.status = 'ACTIVE'
     and new.status = 'CANCELLED'
     and old.source_retroactive_claim_id
         is not null
  then
    update public.payroll_retroactive_claims
    set
      status = 'APPROVED',
      version = version + 1,
      posted_by = null,
      posted_at = null,
      posted_action_id = null
    where id =
      old.source_retroactive_claim_id
      and status = 'POSTED';
  end if;

  return new;
end;
$fn$;

create trigger
payroll_retroactive_action_cancel_sync
after update of status
on public.payroll_period_actions_v2
for each row
execute function
public.sync_retroactive_claim_action_cancel();

-- ============================================================
-- FOREIGN KEY TO POSTED ACTION
-- ============================================================

alter table public.payroll_retroactive_claims
  add constraint payroll_retroactive_posted_action_fk
  foreign key(posted_action_id)
  references public.payroll_period_actions_v2(id)
  on delete restrict;

-- ============================================================
-- SECURITY
-- ============================================================

revoke all
on function public.create_payroll_retroactive_claim(
  uuid,uuid,numeric,text,text
),
public.submit_payroll_retroactive_claim(
  uuid,integer
),
public.approve_payroll_retroactive_claim(
  uuid,integer,uuid,text,text,text
),
public.post_payroll_retroactive_claim(
  uuid,integer,integer,text,uuid
),
public.cancel_payroll_retroactive_claim(
  uuid,integer,text
)
from public, anon, authenticated, service_role;

grant execute
on function public.create_payroll_retroactive_claim(
  uuid,uuid,numeric,text,text
),
public.submit_payroll_retroactive_claim(
  uuid,integer
),
public.approve_payroll_retroactive_claim(
  uuid,integer,uuid,text,text,text
),
public.post_payroll_retroactive_claim(
  uuid,integer,integer,text,uuid
),
public.cancel_payroll_retroactive_claim(
  uuid,integer,text
)
to authenticated;

-- ============================================================
-- VERIFY
-- ============================================================

do $verify$
begin
  if not exists (
    select 1
    from public.payroll_component_catalog
    where code = 'RETROACTIVE_PAY'
      and category = 'EARNING'
      and status = 'ACTIVE'
  ) then
    raise exception
      'RETROACTIVE_CATALOG_VERIFY_FAILED';
  end if;

  if to_regclass(
    'public.payroll_retroactive_claims'
  ) is null then
    raise exception
      'RETROACTIVE_TABLE_VERIFY_FAILED';
  end if;

  if to_regprocedure(
    'public.post_payroll_retroactive_claim(uuid,integer,integer,text,uuid)'
  ) is null then
    raise exception
      'RETROACTIVE_POST_RPC_VERIFY_FAILED';
  end if;

  if has_function_privilege(
    'anon',
    'public.create_payroll_retroactive_claim(uuid,uuid,numeric,text,text)',
    'EXECUTE'
  ) then
    raise exception
      'RETROACTIVE_ANON_VERIFY_FAILED';
  end if;
end;
$verify$;

notify pgrst,'reload schema';

commit;
