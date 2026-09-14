-- =========================================================
-- VIBE REFUND ENGINE V1
-- =========================================================
--
-- payments            = money received
-- payment_allocations = money applied to invoices
-- refunds             = money returned to customer
-- refund_allocations  = refunded amount mapped back to
--                       original payment allocations
--
-- Refunds never rewrite historical payments or invoices.
-- =========================================================


-- =========================================================
-- REFUND NUMBER SEQUENCE
-- =========================================================

create sequence if not exists public.refund_number_seq
start with 1
increment by 1;


-- =========================================================
-- REFUNDS
-- =========================================================

create table public.refunds (
  id uuid primary key default gen_random_uuid(),

  refund_number text not null unique,

  payment_id uuid not null
    references public.payments(id)
    on delete restrict,

  student_id_snapshot uuid not null
    references public.students(id)
    on delete restrict,

  branch_id_snapshot uuid not null
    references public.branches(id)
    on delete restrict,

  branch_code_snapshot text not null,

  branch_name_snapshot text not null,

  amount numeric(14,2) not null
    check (
      amount > 0
    ),

  currency text not null
    check (
      currency ~ '^[A-Z]{3}$'
    ),

  refunded_at timestamptz not null,

  reason text not null
    check (
      btrim(reason) <> ''
    ),

  notes text,

  status text not null default 'POSTED'
    check (
      status in (
        'POSTED',
        'VOIDED'
      )
    ),

  voided_at timestamptz,

  voided_by uuid
    references auth.users(id)
    on delete set null,

  void_reason text,

  created_by uuid default auth.uid()
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint refunds_void_state_check
    check (
      (
        status = 'POSTED'
        and voided_at is null
        and voided_by is null
        and void_reason is null
      )
      or
      (
        status = 'VOIDED'
        and voided_at is not null
        and void_reason is not null
        and btrim(void_reason) <> ''
      )
    )
);


create index refunds_payment_id_idx
  on public.refunds(payment_id);


create index refunds_student_id_snapshot_idx
  on public.refunds(student_id_snapshot);


create index refunds_branch_id_snapshot_idx
  on public.refunds(branch_id_snapshot);


create index refunds_status_idx
  on public.refunds(status);


create index refunds_refunded_at_idx
  on public.refunds(refunded_at);


create trigger trg_refunds_updated_at
before update on public.refunds
for each row
execute function public.set_updated_at();


-- =========================================================
-- REFUND ALLOCATIONS
-- =========================================================

create table public.refund_allocations (
  id uuid primary key default gen_random_uuid(),

  refund_id uuid not null
    references public.refunds(id)
    on delete restrict,

  payment_allocation_id uuid not null
    references public.payment_allocations(id)
    on delete restrict,

  amount numeric(14,2) not null
    check (
      amount > 0
    ),

  created_by uuid default auth.uid()
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  constraint refund_allocations_refund_payment_allocation_unique
    unique (
      refund_id,
      payment_allocation_id
    )
);


create index refund_allocations_refund_id_idx
  on public.refund_allocations(refund_id);


create index refund_allocations_payment_allocation_id_idx
  on public.refund_allocations(payment_allocation_id);


-- =========================================================
-- REFUND HISTORY PROTECTION
-- =========================================================

create or replace function
public.guard_refund_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.refund_number <>
      old.refund_number
    or new.payment_id <>
      old.payment_id
    or new.student_id_snapshot <>
      old.student_id_snapshot
    or new.branch_id_snapshot <>
      old.branch_id_snapshot
    or new.branch_code_snapshot <>
      old.branch_code_snapshot
    or new.branch_name_snapshot <>
      old.branch_name_snapshot
    or new.amount <>
      old.amount
    or new.currency <>
      old.currency
    or new.refunded_at <>
      old.refunded_at
    or new.reason <>
      old.reason
    or new.created_by is distinct from
      old.created_by
    or new.created_at <>
      old.created_at
  then
    raise exception
      'Refund financial snapshots are immutable';
  end if;


  if old.status = 'VOIDED' then
    raise exception
      'Voided refunds are immutable';
  end if;


  if new.status is distinct from
    old.status
  then
    if not (
      old.status = 'POSTED'
      and new.status = 'VOIDED'
    )
    then
      raise exception
        'Invalid refund status transition from % to %',
        old.status,
        new.status;
    end if;
  end if;


  return new;
end;
$$;


create trigger trg_guard_refund_update
before update on public.refunds
for each row
execute function public.guard_refund_update();


-- =========================================================
-- REFUND ALLOCATIONS ARE IMMUTABLE
-- =========================================================

create or replace function
public.guard_refund_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in (
    'UPDATE',
    'DELETE'
  )
  then
    raise exception
      'Refund allocations are immutable';
  end if;


  return new;
end;
$$;


create trigger trg_guard_refund_allocation_change
before update or delete
on public.refund_allocations
for each row
execute function public.guard_refund_allocation_change();


-- =========================================================
-- CREATE REFUND
-- =========================================================

create or replace function
public.create_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_refunded_at timestamptz,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;

  v_existing_refunds numeric(14,2);

  v_refund_id uuid :=
    gen_random_uuid();

  v_refund_number text;
begin
  if not public.has_role(
    'SUPER_ADMIN'
  )
  then
    raise exception
      'SUPER_ADMIN role required';
  end if;


  if p_payment_id is null then
    raise exception
      'Payment id is required';
  end if;


  if p_amount is null
    or p_amount <= 0
  then
    raise exception
      'Refund amount must be greater than zero';
  end if;


  if p_refunded_at is null then
    raise exception
      'Refund date is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Refund reason is required';
  end if;


  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;


  if not found then
    raise exception
      'Payment not found';
  end if;


  if v_payment.status <>
    'POSTED'
  then
    raise exception
      'Only posted payments can be refunded';
  end if;


  select coalesce(
    sum(refund.amount),
    0
  )
  into v_existing_refunds
  from public.refunds
    as refund
  where refund.payment_id =
    p_payment_id
    and refund.status =
      'POSTED';


  if v_existing_refunds
      + p_amount
      > v_payment.amount
  then
    raise exception
      'Refund exceeds the remaining refundable payment amount';
  end if;


  v_refund_number :=
    'REF-'
    || to_char(
      timezone(
        'Asia/Ho_Chi_Minh',
        now()
      ),
      'YYYY'
    )
    || '-'
    || lpad(
      nextval(
        'public.refund_number_seq'
      )::text,
      6,
      '0'
    );


  insert into public.refunds (
    id,
    refund_number,
    payment_id,
    student_id_snapshot,
    branch_id_snapshot,
    branch_code_snapshot,
    branch_name_snapshot,
    amount,
    currency,
    refunded_at,
    reason,
    notes,
    status
  )
  values (
    v_refund_id,
    v_refund_number,
    v_payment.id,
    v_payment.student_id_snapshot,
    v_payment.branch_id_snapshot,
    v_payment.branch_code_snapshot,
    v_payment.branch_name_snapshot,
    p_amount,
    v_payment.currency,
    p_refunded_at,
    btrim(p_reason),
    nullif(
      btrim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    ),
    'POSTED'
  );


  return v_refund_id;
end;
$$;


-- =========================================================
-- ALLOCATE REFUND BACK TO PAYMENT ALLOCATION
-- =========================================================

create or replace function
public.allocate_refund_to_payment_allocation(
  p_refund_id uuid,
  p_payment_allocation_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refund public.refunds%rowtype;

  v_payment_allocation public.payment_allocations%rowtype;

  v_refund_allocated numeric(14,2);

  v_payment_allocation_refunded numeric(14,2);

  v_refund_allocation_id uuid :=
    gen_random_uuid();
begin
  if not public.has_role(
    'SUPER_ADMIN'
  )
  then
    raise exception
      'SUPER_ADMIN role required';
  end if;


  if p_refund_id is null
    or p_payment_allocation_id is null
  then
    raise exception
      'Refund id and payment allocation id are required';
  end if;


  if p_amount is null
    or p_amount <= 0
  then
    raise exception
      'Refund allocation amount must be greater than zero';
  end if;


  select *
  into v_refund
  from public.refunds
  where id = p_refund_id
  for update;


  if not found then
    raise exception
      'Refund not found';
  end if;


  if v_refund.status <>
    'POSTED'
  then
    raise exception
      'Only posted refunds can be allocated';
  end if;


  select *
  into v_payment_allocation
  from public.payment_allocations
  where id =
    p_payment_allocation_id;


  if not found then
    raise exception
      'Payment allocation not found';
  end if;


  if v_payment_allocation.payment_id <>
    v_refund.payment_id
  then
    raise exception
      'Refund must be allocated against its original payment';
  end if;


  if exists (
    select 1
    from public.refund_allocations
    where refund_id =
      p_refund_id
      and payment_allocation_id =
        p_payment_allocation_id
  )
  then
    raise exception
      'This refund is already allocated to this payment allocation';
  end if;


  select coalesce(
    sum(allocation.amount),
    0
  )
  into v_refund_allocated
  from public.refund_allocations
    as allocation
  where allocation.refund_id =
    p_refund_id;


  if v_refund_allocated
      + p_amount
      > v_refund.amount
  then
    raise exception
      'Refund allocation exceeds the refund amount';
  end if;


  select coalesce(
    sum(refund_allocation.amount),
    0
  )
  into v_payment_allocation_refunded
  from public.refund_allocations
    as refund_allocation

  join public.refunds
    as refund
    on refund.id =
      refund_allocation.refund_id

  where refund_allocation.payment_allocation_id =
    p_payment_allocation_id

    and refund.status =
      'POSTED';


  if v_payment_allocation_refunded
      + p_amount
      > v_payment_allocation.amount
  then
    raise exception
      'Refund exceeds the original payment allocation amount';
  end if;


  insert into public.refund_allocations (
    id,
    refund_id,
    payment_allocation_id,
    amount
  )
  values (
    v_refund_allocation_id,
    p_refund_id,
    p_payment_allocation_id,
    p_amount
  );


  return v_refund_allocation_id;
end;
$$;


-- =========================================================
-- VOID REFUND
-- =========================================================

create or replace function
public.void_refund(
  p_refund_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.has_role(
    'SUPER_ADMIN'
  )
  then
    raise exception
      'SUPER_ADMIN role required';
  end if;


  if p_refund_id is null then
    raise exception
      'Refund id is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Refund void reason is required';
  end if;


  select refund.status
  into v_status
  from public.refunds
    as refund
  where refund.id =
    p_refund_id
  for update;


  if not found then
    raise exception
      'Refund not found';
  end if;


  if v_status <> 'POSTED' then
    raise exception
      'Only posted refunds can be voided';
  end if;


  update public.refunds
  set
    status = 'VOIDED',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason =
      btrim(p_reason)
  where id =
    p_refund_id;
end;
$$;


-- =========================================================
-- REPLACE RECEIVABLE VIEW WITH REFUND-AWARE BALANCE
-- =========================================================
--
-- IMPORTANT:
-- Existing invoice_receivables columns keep their original
-- names and order so CREATE OR REPLACE VIEW is valid.
--
-- New audit columns are appended at the end:
-- gross_allocated_amount
-- refunded_amount
-- =========================================================

create or replace view public.invoice_receivables
with (
  security_invoker = true
)
as
select
  invoice.id as invoice_id,

  invoice.invoice_number,

  invoice.enrollment_tuition_id,

  invoice.enrollment_id_snapshot,

  invoice.student_id_snapshot,

  invoice.branch_id_snapshot,

  invoice.branch_code_snapshot,

  invoice.branch_name_snapshot,

  invoice.currency,

  invoice.total_amount,

  invoice.status as invoice_status,

  invoice.issued_on,

  invoice.due_on,

  greatest(
    coalesce(
      payment_totals.gross_allocated_amount,
      0
    )
    -
    coalesce(
      refund_totals.refunded_amount,
      0
    ),
    0
  )::numeric(14,2)
    as allocated_amount,

  greatest(
    invoice.total_amount
      -
      greatest(
        coalesce(
          payment_totals.gross_allocated_amount,
          0
        )
        -
        coalesce(
          refund_totals.refunded_amount,
          0
        ),
        0
      ),
    0
  )::numeric(14,2)
    as outstanding_balance,

  case
    when invoice.status = 'DRAFT'
      then 'DRAFT'

    when invoice.status = 'CANCELLED'
      then 'CANCELLED'

    when greatest(
      invoice.total_amount
        -
        greatest(
          coalesce(
            payment_totals.gross_allocated_amount,
            0
          )
          -
          coalesce(
            refund_totals.refunded_amount,
            0
          ),
          0
        ),
      0
    ) = 0
      then 'PAID'

    when invoice.due_on <
      (
        timezone(
          'Asia/Ho_Chi_Minh',
          now()
        )
      )::date
      then 'OVERDUE'

    when greatest(
      coalesce(
        payment_totals.gross_allocated_amount,
        0
      )
      -
      coalesce(
        refund_totals.refunded_amount,
        0
      ),
      0
    ) > 0
      then 'PARTIALLY_PAID'

    else 'UNPAID'
  end as receivable_status,

  case
    when invoice.status = 'ISSUED'
      and greatest(
        invoice.total_amount
          -
          greatest(
            coalesce(
              payment_totals.gross_allocated_amount,
              0
            )
            -
            coalesce(
              refund_totals.refunded_amount,
              0
            ),
            0
          ),
        0
      ) > 0
      and invoice.due_on <
        (
          timezone(
            'Asia/Ho_Chi_Minh',
            now()
          )
        )::date
      then true

    else false
  end as is_overdue,

  case
    when invoice.status = 'ISSUED'
      and greatest(
        invoice.total_amount
          -
          greatest(
            coalesce(
              payment_totals.gross_allocated_amount,
              0
            )
            -
            coalesce(
              refund_totals.refunded_amount,
              0
            ),
            0
          ),
        0
      ) > 0
      and invoice.due_on <
        (
          timezone(
            'Asia/Ho_Chi_Minh',
            now()
          )
        )::date
      then
        (
          (
            timezone(
              'Asia/Ho_Chi_Minh',
              now()
            )
          )::date
          - invoice.due_on
        )

    else 0
  end as days_overdue,

  invoice.created_at,

  invoice.updated_at,

  coalesce(
    payment_totals.gross_allocated_amount,
    0
  )::numeric(14,2)
    as gross_allocated_amount,

  coalesce(
    refund_totals.refunded_amount,
    0
  )::numeric(14,2)
    as refunded_amount

from public.invoices
as invoice

left join lateral (
  select
    coalesce(
      sum(
        allocation.amount
      ),
      0
    )::numeric(14,2)
      as gross_allocated_amount

  from public.payment_allocations
    as allocation

  join public.payments
    as payment
    on payment.id =
      allocation.payment_id

  where allocation.invoice_id =
    invoice.id

    and payment.status =
      'POSTED'
)
as payment_totals
on true

left join lateral (
  select
    coalesce(
      sum(
        refund_allocation.amount
      ),
      0
    )::numeric(14,2)
      as refunded_amount

  from public.refund_allocations
    as refund_allocation

  join public.refunds
    as refund
    on refund.id =
      refund_allocation.refund_id

  join public.payment_allocations
    as allocation
    on allocation.id =
      refund_allocation.payment_allocation_id

  join public.payments
    as payment
    on payment.id =
      allocation.payment_id

  where allocation.invoice_id =
    invoice.id

    and payment.status =
      'POSTED'

    and refund.status =
      'POSTED'
)
as refund_totals
on true;


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.refunds
enable row level security;


alter table public.refund_allocations
enable row level security;


create policy "super_admin_select_refunds"
on public.refunds
for select
to authenticated
using (
  public.has_role(
    'SUPER_ADMIN'
  )
);


create policy "super_admin_select_refund_allocations"
on public.refund_allocations
for select
to authenticated
using (
  public.has_role(
    'SUPER_ADMIN'
  )
);


-- =========================================================
-- TABLE PRIVILEGES
-- =========================================================

revoke all
on public.refunds
from public;


revoke all
on public.refund_allocations
from public;


grant select
on public.refunds
to authenticated;


grant select
on public.refund_allocations
to authenticated;


-- =========================================================
-- FUNCTION PRIVILEGES
-- =========================================================

revoke all on function
  public.create_refund(
    uuid,
    numeric,
    timestamptz,
    text,
    text
  )
from public;


revoke all on function
  public.allocate_refund_to_payment_allocation(
    uuid,
    uuid,
    numeric
  )
from public;


revoke all on function
  public.void_refund(
    uuid,
    text
  )
from public;


grant execute on function
  public.create_refund(
    uuid,
    numeric,
    timestamptz,
    text,
    text
  )
to authenticated, service_role;


grant execute on function
  public.allocate_refund_to_payment_allocation(
    uuid,
    uuid,
    numeric
  )
to authenticated, service_role;


grant execute on function
  public.void_refund(
    uuid,
    text
  )
to authenticated, service_role;
