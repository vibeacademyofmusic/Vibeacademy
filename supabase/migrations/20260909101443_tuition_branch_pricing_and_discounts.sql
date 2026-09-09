-- =========================================================
-- VIBE ACADEMY
-- Tuition Branch Pricing & Discounts
--
-- Extends Tuition Phase 1 with:
-- 1. Tuition price by branch
-- 2. Default/fallback tuition price
-- 3. Discount snapshots
-- 4. Branch snapshots
-- 5. Automatic final tuition calculation
--
-- IMPORTANT:
-- Existing tuition terms preserve their historical amount.
-- New tuition terms resolve price automatically from branch.
-- =========================================================


-- =========================================================
-- TUITION PLAN BRANCH PRICES
--
-- branch_id IS NULL:
--   default / fallback price
--
-- branch_id IS NOT NULL:
--   branch-specific override
--
-- Example:
--
-- VIBE 3 MONTHS
-- Default       = 4,500,000
-- V01 Can Tho   = 5,500,000
--
-- VIBE 12 MONTHS
-- Default       = 13,500,000
-- V01 Can Tho   = 16,500,000
-- =========================================================

create table public.tuition_plan_branch_prices (
  id uuid primary key default gen_random_uuid(),

  tuition_plan_id uuid not null
    references public.tuition_plans(id)
    on delete restrict,

  branch_id uuid
    references public.branches(id)
    on delete restrict,

  list_price numeric(14,2) not null
    check (list_price >= 0),

  currency text not null default 'VND'
    check (
      currency ~ '^[A-Z]{3}$'
    ),

  status text not null default 'ACTIVE'
    check (
      status in (
        'ACTIVE',
        'INACTIVE'
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create index tuition_plan_branch_prices_plan_idx
  on public.tuition_plan_branch_prices(
    tuition_plan_id
  );


create index tuition_plan_branch_prices_branch_idx
  on public.tuition_plan_branch_prices(
    branch_id
  );


create index tuition_plan_branch_prices_status_idx
  on public.tuition_plan_branch_prices(
    status
  );


-- Only one default price per Tuition Plan.

create unique index
  tuition_plan_branch_prices_default_unique_idx
on public.tuition_plan_branch_prices(
  tuition_plan_id
)
where branch_id is null;


-- Only one override per Tuition Plan + Branch.

create unique index
  tuition_plan_branch_prices_branch_unique_idx
on public.tuition_plan_branch_prices(
  tuition_plan_id,
  branch_id
)
where branch_id is not null;


-- =========================================================
-- UPDATED_AT
-- =========================================================

create trigger trg_tuition_plan_branch_prices_updated_at
before update on public.tuition_plan_branch_prices
for each row
execute function public.set_updated_at();


-- =========================================================
-- INITIAL PRICE MASTER
-- =========================================================


-- ---------------------------------------------------------
-- Default / fallback prices
--
-- 3 months  = 4,500,000 VND
-- 12 months = 13,500,000 VND
-- ---------------------------------------------------------

insert into public.tuition_plan_branch_prices (
  tuition_plan_id,
  branch_id,
  list_price,
  currency,
  status
)
select
  tp.id,
  null,
  case
    when tp.code = 'VIBE_3_MONTHS'
      then 4500000
    when tp.code = 'VIBE_12_MONTHS'
      then 13500000
  end,
  'VND',
  'ACTIVE'
from public.tuition_plans tp
where tp.code in (
  'VIBE_3_MONTHS',
  'VIBE_12_MONTHS'
)
on conflict (tuition_plan_id)
where branch_id is null
do update set
  list_price = excluded.list_price,
  currency = excluded.currency,
  status = excluded.status,
  updated_at = now();


-- ---------------------------------------------------------
-- V01 must represent Vibe Academy Can Tho.
--
-- We intentionally resolve the branch by business code
-- instead of hardcoding a UUID because local / production
-- UUIDs may differ.
-- ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from public.branches
    where code = 'V01'
  ) then
    raise exception
      'Branch V01 was not found. Cannot create Can Tho tuition pricing.';
  end if;
end;
$$;


-- ---------------------------------------------------------
-- Vibe Academy Can Tho prices
--
-- 3 months  = 5,500,000 VND
-- 12 months = 16,500,000 VND
-- ---------------------------------------------------------

insert into public.tuition_plan_branch_prices (
  tuition_plan_id,
  branch_id,
  list_price,
  currency,
  status
)
select
  tp.id,
  b.id,
  case
    when tp.code = 'VIBE_3_MONTHS'
      then 5500000
    when tp.code = 'VIBE_12_MONTHS'
      then 16500000
  end,
  'VND',
  'ACTIVE'
from public.tuition_plans tp
cross join public.branches b
where tp.code in (
  'VIBE_3_MONTHS',
  'VIBE_12_MONTHS'
)
and b.code = 'V01'
on conflict (
  tuition_plan_id,
  branch_id
)
where branch_id is not null
do update set
  list_price = excluded.list_price,
  currency = excluded.currency,
  status = excluded.status,
  updated_at = now();


-- =========================================================
-- EXTEND ENROLLMENT TUITION
--
-- Historical tuition terms need immutable snapshots of:
--
-- Branch
-- List price
-- Discount
-- Final amount
-- =========================================================

alter table public.enrollment_tuition
add column list_price numeric(14,2);


alter table public.enrollment_tuition
add column discount_type text
not null default 'NONE';


alter table public.enrollment_tuition
add column discount_value numeric(14,2)
not null default 0;


alter table public.enrollment_tuition
add column discount_amount numeric(14,2)
not null default 0;


alter table public.enrollment_tuition
add column discount_name text;


alter table public.enrollment_tuition
add column branch_id_snapshot uuid;


alter table public.enrollment_tuition
add column branch_code_snapshot text;


alter table public.enrollment_tuition
add column branch_name_snapshot text;


-- =========================================================
-- BACKFILL HISTORICAL TERMS
--
-- Existing Phase 1 terms already contain an agreed amount.
--
-- We preserve that amount as:
--
-- list_price = previous amount
-- discount = NONE
-- amount = unchanged
-- =========================================================

update public.enrollment_tuition et
set
  list_price = et.amount,
  discount_type = 'NONE',
  discount_value = 0,
  discount_amount = 0,
  discount_name = null,

  branch_id_snapshot = b.id,
  branch_code_snapshot = b.code,
  branch_name_snapshot = b.name
from public.enrollments e
join public.classes c
  on c.id = e.class_id
join public.branches b
  on b.id = c.branch_id
where e.id = et.enrollment_id;


-- ---------------------------------------------------------
-- Protect against incomplete historical data.
-- ---------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.enrollment_tuition
    where
      list_price is null
      or branch_id_snapshot is null
      or branch_code_snapshot is null
      or branch_name_snapshot is null
  ) then
    raise exception
      'Could not backfill tuition branch/price snapshots for all historical terms';
  end if;
end;
$$;


alter table public.enrollment_tuition
alter column list_price
set not null;


alter table public.enrollment_tuition
alter column branch_id_snapshot
set not null;


alter table public.enrollment_tuition
alter column branch_code_snapshot
set not null;


alter table public.enrollment_tuition
alter column branch_name_snapshot
set not null;


-- =========================================================
-- DISCOUNT CONSTRAINTS
-- =========================================================

alter table public.enrollment_tuition
add constraint enrollment_tuition_list_price_check
check (
  list_price >= 0
);


alter table public.enrollment_tuition
add constraint enrollment_tuition_discount_type_check
check (
  discount_type in (
    'NONE',
    'PERCENT',
    'FIXED'
  )
);


alter table public.enrollment_tuition
add constraint enrollment_tuition_discount_value_check
check (
  discount_value >= 0
);


alter table public.enrollment_tuition
add constraint enrollment_tuition_discount_amount_check
check (
  discount_amount >= 0
  and discount_amount <= list_price
);


alter table public.enrollment_tuition
add constraint enrollment_tuition_discount_rules_check
check (
  (
    discount_type = 'NONE'
    and discount_value = 0
    and discount_amount = 0
    and discount_name is null
  )

  or

  (
    discount_type = 'PERCENT'
    and discount_value >= 0
    and discount_value <= 100
    and discount_name is not null
    and btrim(discount_name) <> ''
  )

  or

  (
    discount_type = 'FIXED'
    and discount_value >= 0
    and discount_value <= list_price
    and discount_amount = discount_value
    and discount_name is not null
    and btrim(discount_name) <> ''
  )
);


alter table public.enrollment_tuition
add constraint enrollment_tuition_amount_calculation_check
check (
  amount =
    list_price - discount_amount
);


-- =========================================================
-- DISCOUNT HELPER
-- =========================================================

create or replace function
public.calculate_tuition_discount_amount(
  p_list_price numeric,
  p_discount_type text,
  p_discount_value numeric
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_type text;
  v_value numeric;
begin

  if p_list_price is null
     or p_list_price < 0 then
    raise exception
      'Invalid tuition list price';
  end if;


  v_type :=
    upper(
      coalesce(
        nullif(
          btrim(p_discount_type),
          ''
        ),
        'NONE'
      )
    );


  v_value :=
    coalesce(
      p_discount_value,
      0
    );


  if v_value < 0 then
    raise exception
      'Discount value cannot be negative';
  end if;


  if v_type = 'NONE' then
    return 0;
  end if;


  if v_type = 'PERCENT' then

    if v_value > 100 then
      raise exception
        'Percentage discount cannot exceed 100';
    end if;

    return round(
      p_list_price
      * v_value
      / 100,
      2
    );

  end if;


  if v_type = 'FIXED' then

    if v_value > p_list_price then
      raise exception
        'Fixed discount cannot exceed tuition list price';
    end if;

    return round(
      v_value,
      2
    );

  end if;


  raise exception
    'Invalid tuition discount type: %',
    v_type;

end;
$$;


-- =========================================================
-- REPLACE TUITION INSERT PREPARATION
--
-- Price is now resolved automatically:
--
-- Class
--   ↓
-- Branch
--   ↓
-- Branch-specific Tuition Price
--   ↓
-- Default Tuition Price if no override
--   ↓
-- Discount
--   ↓
-- Final Amount
-- =========================================================

create or replace function
public.prepare_enrollment_tuition()
returns trigger
language plpgsql
set search_path = public
as $$
declare

  v_enrollment_started_at date;

  v_branch_id uuid;
  v_branch_code text;
  v_branch_name text;

  v_plan_code text;
  v_plan_name text;
  v_duration_months integer;

  v_list_price numeric(14,2);
  v_currency text;

  v_existing_terms bigint;

  v_discount_type text;
  v_discount_value numeric(14,2);

begin

  -- -------------------------------------------------------
  -- Load Enrollment + Class + Branch.
  -- -------------------------------------------------------

  select
    e.started_at,
    c.branch_id,
    b.code,
    b.name

  into
    v_enrollment_started_at,
    v_branch_id,
    v_branch_code,
    v_branch_name

  from public.enrollments e

  join public.classes c
    on c.id = e.class_id

  join public.branches b
    on b.id = c.branch_id

  where e.id = new.enrollment_id;


  if not found then
    raise exception
      'Enrollment, class, or branch does not exist';
  end if;


  if v_enrollment_started_at is null then
    raise exception
      'An enrollment must have a study start date before tuition can begin';
  end if;


  -- -------------------------------------------------------
  -- Load active Tuition Plan.
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
  -- Resolve price.
  --
  -- Priority:
  -- 1. Exact branch override
  -- 2. Default price (branch_id NULL)
  -- -------------------------------------------------------

  select
    p.list_price,
    p.currency

  into
    v_list_price,
    v_currency

  from public.tuition_plan_branch_prices p

  where p.tuition_plan_id =
          new.tuition_plan_id

    and p.status = 'ACTIVE'

    and (
      p.branch_id = v_branch_id
      or p.branch_id is null
    )

  order by
    case
      when p.branch_id = v_branch_id
        then 0
      else 1
    end

  limit 1;


  if not found then
    raise exception
      'No active tuition price exists for plan % at branch %',
      v_plan_code,
      v_branch_code;
  end if;


  -- -------------------------------------------------------
  -- First tuition term MUST begin on actual started_at.
  -- -------------------------------------------------------

  select count(*)

  into v_existing_terms

  from public.enrollment_tuition et

  where et.enrollment_id =
          new.enrollment_id

    and et.status <> 'CANCELLED';


  if v_existing_terms = 0
     and new.starts_on <>
         v_enrollment_started_at then

    raise exception
      'The first tuition term must start on the enrollment study start date';

  end if;


  if new.starts_on <
     v_enrollment_started_at then

    raise exception
      'Tuition cannot start before the enrollment study start date';

  end if;


  -- -------------------------------------------------------
  -- Normalize discount input.
  -- -------------------------------------------------------

  v_discount_type :=
    upper(
      coalesce(
        nullif(
          btrim(
            new.discount_type
          ),
          ''
        ),
        'NONE'
      )
    );


  v_discount_value :=
    coalesce(
      new.discount_value,
      0
    );


  if v_discount_type = 'NONE' then

    v_discount_value := 0;
    new.discount_name := null;

  elsif v_discount_type in (
    'PERCENT',
    'FIXED'
  ) then

    if new.discount_name is null
       or btrim(
         new.discount_name
       ) = '' then

      raise exception
        'Discount name is required when a discount is applied';

    end if;


    new.discount_name :=
      btrim(
        new.discount_name
      );

  else

    raise exception
      'Invalid tuition discount type: %',
      v_discount_type;

  end if;


  -- -------------------------------------------------------
  -- Snapshot Plan.
  -- -------------------------------------------------------

  new.plan_code_snapshot :=
    v_plan_code;

  new.plan_name_snapshot :=
    v_plan_name;

  new.duration_months_snapshot :=
    v_duration_months;


  -- -------------------------------------------------------
  -- Snapshot Branch.
  -- -------------------------------------------------------

  new.branch_id_snapshot :=
    v_branch_id;

  new.branch_code_snapshot :=
    v_branch_code;

  new.branch_name_snapshot :=
    v_branch_name;


  -- -------------------------------------------------------
  -- Snapshot Price.
  -- -------------------------------------------------------

  new.list_price :=
    v_list_price;

  new.currency :=
    v_currency;


  -- -------------------------------------------------------
  -- Calculate Discount.
  -- -------------------------------------------------------

  new.discount_type :=
    v_discount_type;

  new.discount_value :=
    v_discount_value;


  new.discount_amount :=
    public.calculate_tuition_discount_amount(
      v_list_price,
      v_discount_type,
      v_discount_value
    );


  -- -------------------------------------------------------
  -- Calculate Final Amount.
  -- -------------------------------------------------------

  new.amount :=
    round(
      v_list_price
      - new.discount_amount,
      2
    );


  -- -------------------------------------------------------
  -- Calculate contractual end.
  -- -------------------------------------------------------

  new.base_ends_on :=
    public.calculate_tuition_base_end(
      new.starts_on,
      v_duration_months
    );


  -- -------------------------------------------------------
  -- At creation:
  --
  -- effective end = original base end.
  --
  -- Enrollment Pause will extend this in a later step.
  -- -------------------------------------------------------

  new.effective_ends_on :=
    new.base_ends_on;


  return new;

end;
$$;


-- =========================================================
-- REPLACE UPDATE GUARD
--
-- Historical snapshots cannot change:
--
-- Enrollment
-- Plan
-- Branch
-- List Price
-- Currency
-- Original dates
--
-- Discount may be adjusted.
-- Effective end may later be extended by Pause Engine.
-- =========================================================

create or replace function
public.guard_enrollment_tuition_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_discount_type text;
  v_discount_value numeric(14,2);
begin

  -- -------------------------------------------------------
  -- Immutable historical identity / snapshots.
  -- -------------------------------------------------------

  if new.enrollment_id <>
       old.enrollment_id

     or new.tuition_plan_id <>
        old.tuition_plan_id

     or new.starts_on <>
        old.starts_on

     or new.base_ends_on <>
        old.base_ends_on

     or new.plan_code_snapshot <>
        old.plan_code_snapshot

     or new.plan_name_snapshot <>
        old.plan_name_snapshot

     or new.duration_months_snapshot <>
        old.duration_months_snapshot

     or new.branch_id_snapshot <>
        old.branch_id_snapshot

     or new.branch_code_snapshot <>
        old.branch_code_snapshot

     or new.branch_name_snapshot <>
        old.branch_name_snapshot

     or new.list_price <>
        old.list_price

     or new.currency <>
        old.currency then

    raise exception
      'Core tuition term snapshots are immutable';

  end if;


  -- -------------------------------------------------------
  -- Pause engine may extend effective_ends_on,
  -- but it may never shrink below base_ends_on.
  -- -------------------------------------------------------

  if new.effective_ends_on <
     old.base_ends_on then

    raise exception
      'Effective tuition end cannot be earlier than the base tuition end';

  end if;


  -- -------------------------------------------------------
  -- Normalize discount update.
  -- -------------------------------------------------------

  v_discount_type :=
    upper(
      coalesce(
        nullif(
          btrim(
            new.discount_type
          ),
          ''
        ),
        'NONE'
      )
    );


  v_discount_value :=
    coalesce(
      new.discount_value,
      0
    );


  if v_discount_type = 'NONE' then

    v_discount_value := 0;
    new.discount_name := null;

  elsif v_discount_type in (
    'PERCENT',
    'FIXED'
  ) then

    if new.discount_name is null
       or btrim(
         new.discount_name
       ) = '' then

      raise exception
        'Discount name is required when a discount is applied';

    end if;


    new.discount_name :=
      btrim(
        new.discount_name
      );

  else

    raise exception
      'Invalid tuition discount type: %',
      v_discount_type;

  end if;


  new.discount_type :=
    v_discount_type;

  new.discount_value :=
    v_discount_value;


  new.discount_amount :=
    public.calculate_tuition_discount_amount(
      old.list_price,
      v_discount_type,
      v_discount_value
    );


  new.amount :=
    round(
      old.list_price
      - new.discount_amount,
      2
    );


  return new;

end;
$$;


-- =========================================================
-- ROW LEVEL SECURITY
--
-- Phase 1:
-- SUPER_ADMIN manages tuition price master.
-- =========================================================

alter table public.tuition_plan_branch_prices
enable row level security;


create policy
"super_admin_select_tuition_plan_branch_prices"
on public.tuition_plan_branch_prices
for select
to authenticated
using (
  public.has_role('SUPER_ADMIN')
);


create policy
"super_admin_insert_tuition_plan_branch_prices"
on public.tuition_plan_branch_prices
for insert
to authenticated
with check (
  public.has_role('SUPER_ADMIN')
);


create policy
"super_admin_update_tuition_plan_branch_prices"
on public.tuition_plan_branch_prices
for update
to authenticated
using (
  public.has_role('SUPER_ADMIN')
)
with check (
  public.has_role('SUPER_ADMIN')
);


-- =========================================================
-- PRIVILEGES
-- =========================================================

grant select, insert, update
on public.tuition_plan_branch_prices
to authenticated;


-- =========================================================
-- END
-- =========================================================