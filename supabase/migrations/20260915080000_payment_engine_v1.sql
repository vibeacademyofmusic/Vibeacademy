-- =========================================================
-- VIBE PAYMENT ENGINE V1
-- =========================================================
--
-- invoices            = receivable documents
-- payments            = actual money received
-- payment_allocations = how received money is applied
--
-- Debt / outstanding balance is derived later from:
-- invoice.total_amount - valid POSTED payment allocations.
-- =========================================================


-- =========================================================
-- PAYMENT NUMBER SEQUENCE
-- =========================================================

create sequence if not exists public.payment_number_seq
start with 1
increment by 1;


-- =========================================================
-- PAYMENTS
-- =========================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),

  payment_number text not null unique,

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

  payment_method text not null
    check (
      payment_method in (
        'CASH',
        'BANK_TRANSFER',
        'CARD',
        'OTHER'
      )
    ),

  paid_at timestamptz not null,

  reference text,

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

  constraint payments_void_state_check
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


create index payments_student_id_snapshot_idx
  on public.payments(student_id_snapshot);


create index payments_branch_id_snapshot_idx
  on public.payments(branch_id_snapshot);


create index payments_status_idx
  on public.payments(status);


create index payments_paid_at_idx
  on public.payments(paid_at);


create trigger trg_payments_updated_at
before update on public.payments
for each row
execute function public.set_updated_at();


-- =========================================================
-- PAYMENT ALLOCATIONS
-- =========================================================

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),

  payment_id uuid not null
    references public.payments(id)
    on delete restrict,

  invoice_id uuid not null
    references public.invoices(id)
    on delete restrict,

  amount numeric(14,2) not null
    check (
      amount > 0
    ),

  created_by uuid default auth.uid()
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  constraint payment_allocations_payment_invoice_unique
    unique (
      payment_id,
      invoice_id
    )
);


create index payment_allocations_payment_id_idx
  on public.payment_allocations(payment_id);


create index payment_allocations_invoice_id_idx
  on public.payment_allocations(invoice_id);


-- =========================================================
-- PAYMENT CORE HISTORY PROTECTION
-- =========================================================

create or replace function
public.guard_payment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_number <>
      old.payment_number
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
    or new.payment_method <>
      old.payment_method
    or new.paid_at <>
      old.paid_at
    or new.created_by is distinct from
      old.created_by
    or new.created_at <>
      old.created_at
  then
    raise exception
      'Payment financial snapshots are immutable';
  end if;


  if old.status = 'VOIDED' then
    raise exception
      'Voided payments are immutable';
  end if;


  if new.status is distinct from
    old.status
  then
    if not (
      old.status = 'POSTED'
      and new.status = 'VOIDED'
    ) then
      raise exception
        'Invalid payment status transition from % to %',
        old.status,
        new.status;
    end if;
  end if;


  return new;
end;
$$;


create trigger trg_guard_payment_update
before update on public.payments
for each row
execute function public.guard_payment_update();


-- =========================================================
-- ALLOCATIONS ARE IMMUTABLE
-- =========================================================

create or replace function
public.guard_payment_allocation_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in (
    'UPDATE',
    'DELETE'
  ) then
    raise exception
      'Payment allocations are immutable';
  end if;


  return new;
end;
$$;


create trigger trg_guard_payment_allocation_change
before update or delete
on public.payment_allocations
for each row
execute function public.guard_payment_allocation_change();


-- =========================================================
-- CREATE PAYMENT
-- =========================================================

create or replace function
public.create_payment(
  p_student_id uuid,
  p_branch_id uuid,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_paid_at timestamptz default now(),
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch public.branches%rowtype;

  v_payment_id uuid :=
    gen_random_uuid();

  v_payment_number text;

  v_currency text;

  v_method text;
begin
  if not public.has_role(
    'SUPER_ADMIN'
  ) then
    raise exception
      'SUPER_ADMIN role required';
  end if;


  if p_student_id is null then
    raise exception
      'Student id is required';
  end if;


  if not exists (
    select 1
    from public.students
    where id = p_student_id
  ) then
    raise exception
      'Student not found';
  end if;


  if p_branch_id is null then
    raise exception
      'Branch id is required';
  end if;


  select *
  into v_branch
  from public.branches
  where id = p_branch_id;


  if not found then
    raise exception
      'Branch not found';
  end if;


  if p_amount is null
    or p_amount <= 0
  then
    raise exception
      'Payment amount must be greater than zero';
  end if;


  v_currency :=
    upper(
      btrim(
        coalesce(
          p_currency,
          ''
        )
      )
    );


  if v_currency !~
    '^[A-Z]{3}$'
  then
    raise exception
      'Payment currency must be a three-letter ISO code';
  end if;


  v_method :=
    upper(
      btrim(
        coalesce(
          p_payment_method,
          ''
        )
      )
    );


  if v_method not in (
    'CASH',
    'BANK_TRANSFER',
    'CARD',
    'OTHER'
  ) then
    raise exception
      'Invalid payment method';
  end if;


  if p_paid_at is null then
    raise exception
      'Payment date is required';
  end if;


  v_payment_number :=
    'PAY-'
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
        'public.payment_number_seq'
      )::text,
      6,
      '0'
    );


  insert into public.payments (
    id,
    payment_number,
    student_id_snapshot,
    branch_id_snapshot,
    branch_code_snapshot,
    branch_name_snapshot,
    amount,
    currency,
    payment_method,
    paid_at,
    reference,
    notes,
    status
  )
  values (
    v_payment_id,
    v_payment_number,
    p_student_id,
    p_branch_id,
    v_branch.code,
    v_branch.name,
    p_amount,
    v_currency,
    v_method,
    p_paid_at,
    nullif(
      btrim(
        coalesce(
          p_reference,
          ''
        )
      ),
      ''
    ),
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


  return v_payment_id;
end;
$$;


-- =========================================================
-- ALLOCATE PAYMENT TO INVOICE
-- =========================================================

create or replace function
public.allocate_payment_to_invoice(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;

  v_invoice public.invoices%rowtype;

  v_payment_allocated numeric(14,2);

  v_invoice_allocated numeric(14,2);

  v_allocation_id uuid :=
    gen_random_uuid();
begin
  if not public.has_role(
    'SUPER_ADMIN'
  ) then
    raise exception
      'SUPER_ADMIN role required';
  end if;


  if p_payment_id is null
    or p_invoice_id is null
  then
    raise exception
      'Payment id and invoice id are required';
  end if;


  if p_amount is null
    or p_amount <= 0
  then
    raise exception
      'Allocation amount must be greater than zero';
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
      'Only posted payments can be allocated';
  end if;


  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
  for update;


  if not found then
    raise exception
      'Invoice not found';
  end if;


  if v_invoice.status <>
    'ISSUED'
  then
    raise exception
      'Payments can only be allocated to issued invoices';
  end if;


  if v_payment.student_id_snapshot <>
    v_invoice.student_id_snapshot
  then
    raise exception
      'Payment and invoice must belong to the same student';
  end if;


  if v_payment.currency <>
    v_invoice.currency
  then
    raise exception
      'Payment and invoice currencies must match';
  end if;


  if exists (
    select 1
    from public.payment_allocations
    where payment_id =
      p_payment_id
      and invoice_id =
        p_invoice_id
  ) then
    raise exception
      'This payment is already allocated to this invoice';
  end if;


  select coalesce(
    sum(allocation.amount),
    0
  )
  into v_payment_allocated
  from public.payment_allocations
    as allocation
  where allocation.payment_id =
    p_payment_id;


  if v_payment_allocated
      + p_amount
      > v_payment.amount
  then
    raise exception
      'Allocation exceeds the remaining payment amount';
  end if;


  select coalesce(
    sum(allocation.amount),
    0
  )
  into v_invoice_allocated
  from public.payment_allocations
    as allocation
  join public.payments
    as payment
    on payment.id =
      allocation.payment_id
  where allocation.invoice_id =
    p_invoice_id
    and payment.status =
      'POSTED';


  if v_invoice_allocated
      + p_amount
      > v_invoice.total_amount
  then
    raise exception
      'Allocation exceeds the remaining invoice balance';
  end if;


  insert into public.payment_allocations (
    id,
    payment_id,
    invoice_id,
    amount
  )
  values (
    v_allocation_id,
    p_payment_id,
    p_invoice_id,
    p_amount
  );


  return v_allocation_id;
end;
$$;


-- =========================================================
-- VOID PAYMENT
-- =========================================================

create or replace function
public.void_payment(
  p_payment_id uuid,
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
  ) then
    raise exception
      'SUPER_ADMIN role required';
  end if;


  if p_payment_id is null then
    raise exception
      'Payment id is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Payment void reason is required';
  end if;


  select payment.status
  into v_status
  from public.payments
    as payment
  where payment.id =
    p_payment_id
  for update;


  if not found then
    raise exception
      'Payment not found';
  end if;


  if v_status <> 'POSTED' then
    raise exception
      'Only posted payments can be voided';
  end if;


  update public.payments
  set
    status = 'VOIDED',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason =
      btrim(p_reason)
  where id =
    p_payment_id;
end;
$$;


-- =========================================================
-- PROTECT INVOICE CANCELLATION AFTER PAYMENT
-- =========================================================

create or replace function
public.guard_invoice_cancellation_with_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from
      new.status
    and new.status =
      'CANCELLED'
    and exists (
      select 1
      from public.payment_allocations
        as allocation
      join public.payments
        as payment
        on payment.id =
          allocation.payment_id
      where allocation.invoice_id =
        old.id
        and payment.status =
          'POSTED'
    )
  then
    raise exception
      'Cannot cancel an invoice with posted payment allocations';
  end if;


  return new;
end;
$$;


create trigger trg_guard_invoice_cancellation_with_payments
before update of status
on public.invoices
for each row
execute function public.guard_invoice_cancellation_with_payments();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.payments
enable row level security;


alter table public.payment_allocations
enable row level security;


create policy "super_admin_select_payments"
on public.payments
for select
to authenticated
using (
  public.has_role(
    'SUPER_ADMIN'
  )
);


create policy "super_admin_select_payment_allocations"
on public.payment_allocations
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
on public.payments
from public;


revoke all
on public.payment_allocations
from public;


grant select
on public.payments
to authenticated;


grant select
on public.payment_allocations
to authenticated;


-- =========================================================
-- FUNCTION PRIVILEGES
-- =========================================================

revoke all on function
  public.create_payment(
    uuid,
    uuid,
    numeric,
    text,
    text,
    timestamptz,
    text,
    text
  )
from public;


revoke all on function
  public.allocate_payment_to_invoice(
    uuid,
    uuid,
    numeric
  )
from public;


revoke all on function
  public.void_payment(
    uuid,
    text
  )
from public;


grant execute on function
  public.create_payment(
    uuid,
    uuid,
    numeric,
    text,
    text,
    timestamptz,
    text,
    text
  )
to authenticated, service_role;


grant execute on function
  public.allocate_payment_to_invoice(
    uuid,
    uuid,
    numeric
  )
to authenticated, service_role;


grant execute on function
  public.void_payment(
    uuid,
    text
  )
to authenticated, service_role;
