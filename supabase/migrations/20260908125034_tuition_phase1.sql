-- =========================================================
-- VIBE ACADEMY
-- Tuition Phase 1
--
-- Tuition Plan
--   ↓
-- Enrollment Tuition
--   ↓
-- Renewal / Invoice / Payment / Finance (later phases)
--
-- IMPORTANT BUSINESS RULE:
-- enrollment.enrolled_at = administrative registration date
-- enrollment.started_at  = actual study start + tuition start
--
-- Tuition MUST NEVER start from enrolled_at.
-- =========================================================


create extension if not exists btree_gist;


-- =========================================================
-- TUITION PLANS
--
-- Defines the commercial duration of a study package.
-- Pricing is intentionally NOT stored here yet because
-- tuition may vary by course / branch / future pricing rules.
--
-- The actual agreed tuition amount is snapshotted into
-- enrollment_tuition.
-- =========================================================

create table public.tuition_plans (
  id uuid primary key default gen_random_uuid(),

  code text not null,
  name text not null,

  duration_months integer not null
    check (duration_months > 0 and duration_months <= 60),

  description text,

  status text not null default 'ACTIVE'
    check (
      status in (
        'ACTIVE',
        'INACTIVE'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tuition_plans_code_key
    unique (code)
);

create index tuition_plans_status_idx
  on public.tuition_plans(status);


-- =========================================================
-- HELPER
--
-- Example:
-- 2026-09-01 + 3 months - 1 day = 2026-11-30
-- =========================================================

create or replace function public.calculate_tuition_base_end(
  p_starts_on date,
  p_duration_months integer
)
returns date
language sql
immutable
strict
as $$
  select (
    p_starts_on
    + make_interval(months => p_duration_months)
    - interval '1 day'
  )::date;
$$;


-- =========================================================
-- ENROLLMENT TUITION
--
-- One row represents one tuition term purchased for one
-- class enrollment.
--
-- starts_on:
--   financial / entitlement start
--
-- base_ends_on:
--   original end before pause extensions
--
-- effective_ends_on:
--   real entitlement end after future pause extensions
--
-- amount:
--   tuition price snapshot agreed for this term.
--
-- Plan information is also snapshotted so historical
-- tuition remains correct even if the plan changes later.
-- =========================================================

create table public.enrollment_tuition (
  id uuid primary key default gen_random_uuid(),

  enrollment_id uuid not null
    references public.enrollments(id)
    on delete restrict,

  tuition_plan_id uuid not null
    references public.tuition_plans(id)
    on delete restrict,

  starts_on date not null,

  base_ends_on date not null,
  effective_ends_on date not null,

  plan_code_snapshot text not null,
  plan_name_snapshot text not null,

  duration_months_snapshot integer not null
    check (
      duration_months_snapshot > 0
      and duration_months_snapshot <= 60
    ),

  amount numeric(14,2) not null
    check (amount >= 0),

  currency text not null default 'VND'
    check (
      currency ~ '^[A-Z]{3}$'
    ),

  status text not null default 'ACTIVE'
    check (
      status in (
        'SCHEDULED',
        'ACTIVE',
        'COMPLETED',
        'CANCELLED'
      )
    ),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint enrollment_tuition_dates_check
    check (
      base_ends_on >= starts_on
      and effective_ends_on >= base_ends_on
    )
);

create index enrollment_tuition_enrollment_id_idx
  on public.enrollment_tuition(enrollment_id);

create index enrollment_tuition_plan_id_idx
  on public.enrollment_tuition(tuition_plan_id);

create index enrollment_tuition_status_idx
  on public.enrollment_tuition(status);

create index enrollment_tuition_effective_ends_on_idx
  on public.enrollment_tuition(effective_ends_on);


-- =========================================================
-- NO OVERLAPPING TUITION TERMS
--
-- Cancelled terms do not participate in overlap checking.
-- This prepares the structure for future renewals.
-- =========================================================

alter table public.enrollment_tuition
add constraint enrollment_tuition_no_overlap
exclude using gist (
  enrollment_id with =,
  daterange(
    starts_on,
    effective_ends_on,
    '[]'
  ) with &&
)
where (status <> 'CANCELLED');


-- =========================================================
-- INSERT PREPARATION / BUSINESS RULES
-- =========================================================

create or replace function public.prepare_enrollment_tuition()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_enrollment_started_at date;

  v_plan_code text;
  v_plan_name text;
  v_duration_months integer;

  v_existing_terms bigint;
begin
  -- -------------------------------------------------------
  -- Enrollment must exist and must have actually started.
  -- -------------------------------------------------------

  select
    e.started_at
  into
    v_enrollment_started_at
  from public.enrollments e
  where e.id = new.enrollment_id;

  if not found then
    raise exception
      'Enrollment does not exist';
  end if;

  if v_enrollment_started_at is null then
    raise exception
      'An enrollment must have a study start date before tuition can begin';
  end if;


  -- -------------------------------------------------------
  -- Load Tuition Plan.
  -- -------------------------------------------------------

  select
    tp.code,
    tp.name,
    tp.duration_months
  into
    v_plan_code,
    v_plan_name,
    v_duration_months
  from public.tuition_plans tp
  where tp.id = new.tuition_plan_id
    and tp.status = 'ACTIVE';

  if not found then
    raise exception
      'Tuition plan does not exist or is inactive';
  end if;


  -- -------------------------------------------------------
  -- First tuition term MUST begin exactly on started_at.
  --
  -- Future renewal terms may begin later.
  -- Cancelled terms are ignored when determining whether
  -- this is the first real tuition term.
  -- -------------------------------------------------------

  select count(*)
  into v_existing_terms
  from public.enrollment_tuition et
  where et.enrollment_id = new.enrollment_id
    and et.status <> 'CANCELLED';

  if v_existing_terms = 0
     and new.starts_on <> v_enrollment_started_at then
    raise exception
      'The first tuition term must start on the enrollment study start date';
  end if;


  -- Tuition can never begin before actual study start.

  if new.starts_on < v_enrollment_started_at then
    raise exception
      'Tuition cannot start before the enrollment study start date';
  end if;


  -- -------------------------------------------------------
  -- Snapshot the plan.
  -- -------------------------------------------------------

  new.plan_code_snapshot := v_plan_code;
  new.plan_name_snapshot := v_plan_name;
  new.duration_months_snapshot := v_duration_months;


  -- -------------------------------------------------------
  -- Calculate original contractual end.
  -- -------------------------------------------------------

  new.base_ends_on :=
    public.calculate_tuition_base_end(
      new.starts_on,
      v_duration_months
    );


  -- -------------------------------------------------------
  -- At creation, effective end equals base end.
  --
  -- Later the Enrollment Pause engine may extend
  -- effective_ends_on without changing base_ends_on.
  -- -------------------------------------------------------

  new.effective_ends_on := new.base_ends_on;

  return new;
end;
$$;

create trigger trg_prepare_enrollment_tuition
before insert on public.enrollment_tuition
for each row
execute function public.prepare_enrollment_tuition();


-- =========================================================
-- PROTECT HISTORICAL TERM STRUCTURE
--
-- Core identity/date snapshot cannot be rewritten.
-- Future pause logic may extend effective_ends_on.
-- =========================================================

create or replace function public.guard_enrollment_tuition_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.enrollment_id <> old.enrollment_id
     or new.tuition_plan_id <> old.tuition_plan_id
     or new.starts_on <> old.starts_on
     or new.base_ends_on <> old.base_ends_on
     or new.plan_code_snapshot <> old.plan_code_snapshot
     or new.plan_name_snapshot <> old.plan_name_snapshot
     or new.duration_months_snapshot <> old.duration_months_snapshot then

    raise exception
      'Core tuition term fields are immutable';
  end if;

  if new.effective_ends_on < old.base_ends_on then
    raise exception
      'Effective tuition end cannot be earlier than the base tuition end';
  end if;

  return new;
end;
$$;

create trigger trg_guard_enrollment_tuition_update
before update on public.enrollment_tuition
for each row
execute function public.guard_enrollment_tuition_update();


-- =========================================================
-- FINANCIAL HISTORY MUST NOT BE DELETED.
-- Cancel the term instead.
-- =========================================================

create or replace function public.prevent_enrollment_tuition_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception
    'Tuition terms cannot be deleted; cancel the term instead';
end;
$$;

create trigger trg_prevent_enrollment_tuition_delete
before delete on public.enrollment_tuition
for each row
execute function public.prevent_enrollment_tuition_delete();


-- =========================================================
-- UPDATED_AT
-- =========================================================

create trigger trg_tuition_plans_updated_at
before update on public.tuition_plans
for each row
execute function public.set_updated_at();

create trigger trg_enrollment_tuition_updated_at
before update on public.enrollment_tuition
for each row
execute function public.set_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- Phase 1: SUPER_ADMIN only.
--
-- Accountant / Parent permissions will be added in their
-- respective modules.
-- =========================================================

alter table public.tuition_plans
  enable row level security;

alter table public.enrollment_tuition
  enable row level security;


create policy "super_admin_select_tuition_plans"
on public.tuition_plans
for select
to authenticated
using (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_insert_tuition_plans"
on public.tuition_plans
for insert
to authenticated
with check (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_update_tuition_plans"
on public.tuition_plans
for update
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);


create policy "super_admin_select_enrollment_tuition"
on public.enrollment_tuition
for select
to authenticated
using (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_insert_enrollment_tuition"
on public.enrollment_tuition
for insert
to authenticated
with check (
  public.has_role('SUPER_ADMIN')
);

create policy "super_admin_update_enrollment_tuition"
on public.enrollment_tuition
for update
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);


-- =========================================================
-- TABLE PRIVILEGES
-- =========================================================

grant select, insert, update
on public.tuition_plans
to authenticated;

grant select, insert, update
on public.enrollment_tuition
to authenticated;


-- =========================================================
-- INITIAL VIBE TUITION PLANS
--
-- These rows define duration only.
-- Actual tuition price is recorded on enrollment_tuition.
-- =========================================================

insert into public.tuition_plans (
  id,
  code,
  name,
  duration_months,
  description
)
values
  (
    'a1000000-0000-0000-0000-000000000003',
    'VIBE_3_MONTHS',
    'VIBE 3 MONTHS',
    3,
    'Vibe Academy three-month tuition plan'
  ),
  (
    'a1000000-0000-0000-0000-000000000012',
    'VIBE_12_MONTHS',
    'VIBE 12 MONTHS',
    12,
    'Vibe Academy twelve-month tuition plan'
  );