-- =========================================================
-- VIBE INVOICE ENGINE V1
-- =========================================================
--
-- Source of truth:
-- enrollment_tuition = agreed tuition term
-- invoices           = receivable document
-- invoice_items      = immutable invoice line snapshots
--
-- Payment / allocation / debt are intentionally deferred to
-- the next finance phase.
-- =========================================================


-- =========================================================
-- INVOICE NUMBER SEQUENCE
-- =========================================================

create sequence if not exists public.invoice_number_seq
start with 1
increment by 1;


-- =========================================================
-- INVOICES
-- =========================================================

create table public.invoices (
  id uuid primary key default gen_random_uuid(),

  invoice_number text not null unique,

  enrollment_tuition_id uuid not null unique
    references public.enrollment_tuition(id)
    on delete restrict,

  enrollment_id_snapshot uuid not null
    references public.enrollments(id)
    on delete restrict,

  student_id_snapshot uuid not null
    references public.students(id)
    on delete restrict,

  branch_id_snapshot uuid not null,

  branch_code_snapshot text not null,

  branch_name_snapshot text not null,

  currency text not null
    check (
      currency ~ '^[A-Z]{3}$'
    ),

  subtotal numeric(14,2) not null
    check (
      subtotal >= 0
    ),

  total_amount numeric(14,2) not null
    check (
      total_amount >= 0
    ),

  status text not null default 'DRAFT'
    check (
      status in (
        'DRAFT',
        'ISSUED',
        'CANCELLED'
      )
    ),

  issued_on date,

  due_on date,

  notes text,

  cancelled_at timestamptz,

  cancelled_by uuid
    references auth.users(id)
    on delete set null,

  cancel_reason text,

  created_by uuid default auth.uid()
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint invoices_amount_check
    check (
      total_amount = subtotal
    ),

  constraint invoices_issue_dates_check
    check (
      (
        issued_on is null
        and due_on is null
      )
      or
      (
        issued_on is not null
        and due_on is not null
        and due_on >= issued_on
      )
    ),

  constraint invoices_status_state_check
    check (
      (
        status = 'DRAFT'
        and issued_on is null
        and due_on is null
        and cancelled_at is null
        and cancelled_by is null
        and cancel_reason is null
      )
      or
      (
        status = 'ISSUED'
        and issued_on is not null
        and due_on is not null
        and cancelled_at is null
        and cancelled_by is null
        and cancel_reason is null
      )
      or
      (
        status = 'CANCELLED'
        and cancelled_at is not null
        and cancel_reason is not null
        and btrim(cancel_reason) <> ''
      )
    )
);


create index invoices_enrollment_tuition_id_idx
  on public.invoices(enrollment_tuition_id);


create index invoices_enrollment_id_snapshot_idx
  on public.invoices(enrollment_id_snapshot);


create index invoices_student_id_snapshot_idx
  on public.invoices(student_id_snapshot);


create index invoices_branch_id_snapshot_idx
  on public.invoices(branch_id_snapshot);


create index invoices_status_idx
  on public.invoices(status);


create index invoices_due_on_idx
  on public.invoices(due_on);


create trigger trg_invoices_updated_at
before update on public.invoices
for each row
execute function public.set_updated_at();


-- =========================================================
-- INVOICE ITEMS
-- =========================================================

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid not null
    references public.invoices(id)
    on delete restrict,

  line_no integer not null
    check (
      line_no > 0
    ),

  item_type text not null
    check (
      item_type in (
        'TUITION'
      )
    ),

  description text not null
    check (
      btrim(description) <> ''
    ),

  quantity numeric(12,2) not null default 1
    check (
      quantity > 0
    ),

  unit_amount numeric(14,2) not null
    check (
      unit_amount >= 0
    ),

  line_total numeric(14,2) not null
    check (
      line_total >= 0
    ),

  created_at timestamptz not null default now(),

  constraint invoice_items_calculation_check
    check (
      line_total =
        round(
          quantity * unit_amount,
          2
        )
    ),

  constraint invoice_items_invoice_line_unique
    unique (
      invoice_id,
      line_no
    )
);


create index invoice_items_invoice_id_idx
  on public.invoice_items(invoice_id);


-- =========================================================
-- IMMUTABLE INVOICE CORE SNAPSHOTS
-- =========================================================

create or replace function
public.guard_invoice_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.invoice_number <>
      old.invoice_number
    or new.enrollment_tuition_id <>
      old.enrollment_tuition_id
    or new.enrollment_id_snapshot <>
      old.enrollment_id_snapshot
    or new.student_id_snapshot <>
      old.student_id_snapshot
    or new.branch_id_snapshot <>
      old.branch_id_snapshot
    or new.branch_code_snapshot <>
      old.branch_code_snapshot
    or new.branch_name_snapshot <>
      old.branch_name_snapshot
    or new.currency <>
      old.currency
    or new.subtotal <>
      old.subtotal
    or new.total_amount <>
      old.total_amount
  then
    raise exception
      'Invoice financial snapshots are immutable';
  end if;


  if new.status is distinct from
    old.status
  then
    if old.status = 'DRAFT'
      and new.status in (
        'ISSUED',
        'CANCELLED'
      )
    then
      null;

    elsif old.status = 'ISSUED'
      and new.status = 'CANCELLED'
    then
      null;

    else
      raise exception
        'Invalid invoice status transition from % to %',
        old.status,
        new.status;
    end if;
  end if;


  if old.status = 'ISSUED'
    and (
      new.issued_on is distinct from
        old.issued_on
      or new.due_on is distinct from
        old.due_on
    )
  then
    raise exception
      'Issued invoice dates are immutable';
  end if;


  if old.status = 'CANCELLED' then
    raise exception
      'Cancelled invoices are immutable';
  end if;


  return new;
end;
$$;


create trigger trg_guard_invoice_update
before update on public.invoices
for each row
execute function public.guard_invoice_update();


-- =========================================================
-- INVOICE ITEM HISTORY IS IMMUTABLE
-- =========================================================

create or replace function
public.guard_invoice_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_status text;
begin
  if tg_op = 'UPDATE'
    or tg_op = 'DELETE'
  then
    raise exception
      'Invoice items are immutable';
  end if;


  select invoice.status
  into v_invoice_status
  from public.invoices as invoice
  where invoice.id = new.invoice_id;


  if not found then
    raise exception
      'Invoice not found';
  end if;


  if v_invoice_status <> 'DRAFT' then
    raise exception
      'Invoice items can only be created while invoice is in DRAFT status';
  end if;


  return new;
end;
$$;


create trigger trg_guard_invoice_item_change
before insert or update or delete
on public.invoice_items
for each row
execute function public.guard_invoice_item_change();


-- =========================================================
-- CREATE DRAFT INVOICE FROM TUITION TERM
-- =========================================================

create or replace function
public.create_tuition_invoice(
  p_enrollment_tuition_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tuition public.enrollment_tuition%rowtype;

  v_student_id uuid;

  v_invoice_id uuid :=
    gen_random_uuid();

  v_invoice_number text;
begin
  if not public.has_role(
    'SUPER_ADMIN'
  ) then
    raise exception
      'SUPER_ADMIN role required';
  end if;


  if p_enrollment_tuition_id is null then
    raise exception
      'Enrollment tuition id is required';
  end if;


  select *
  into v_tuition
  from public.enrollment_tuition
  where id =
    p_enrollment_tuition_id
  for update;


  if not found then
    raise exception
      'Enrollment tuition term not found';
  end if;


  if v_tuition.status =
    'CANCELLED'
  then
    raise exception
      'Cannot create an invoice from a cancelled tuition term';
  end if;


  if exists (
    select 1
    from public.invoices
    where enrollment_tuition_id =
      p_enrollment_tuition_id
  ) then
    raise exception
      'An invoice already exists for this tuition term';
  end if;


  select enrollment.student_id
  into v_student_id
  from public.enrollments
    as enrollment
  where enrollment.id =
    v_tuition.enrollment_id;


  if not found then
    raise exception
      'Enrollment not found';
  end if;


  v_invoice_number :=
    'INV-'
    || to_char(
      current_date,
      'YYYY'
    )
    || '-'
    || lpad(
      nextval(
        'public.invoice_number_seq'
      )::text,
      6,
      '0'
    );


  insert into public.invoices (
    id,
    invoice_number,
    enrollment_tuition_id,
    enrollment_id_snapshot,
    student_id_snapshot,
    branch_id_snapshot,
    branch_code_snapshot,
    branch_name_snapshot,
    currency,
    subtotal,
    total_amount,
    status,
    notes
  )
  values (
    v_invoice_id,
    v_invoice_number,
    v_tuition.id,
    v_tuition.enrollment_id,
    v_student_id,
    v_tuition.branch_id_snapshot,
    v_tuition.branch_code_snapshot,
    v_tuition.branch_name_snapshot,
    v_tuition.currency,
    v_tuition.amount,
    v_tuition.amount,
    'DRAFT',
    nullif(
      btrim(
        coalesce(
          p_notes,
          ''
        )
      ),
      ''
    )
  );


  insert into public.invoice_items (
    invoice_id,
    line_no,
    item_type,
    description,
    quantity,
    unit_amount,
    line_total
  )
  values (
    v_invoice_id,
    1,
    'TUITION',
    v_tuition.plan_name_snapshot,
    1,
    v_tuition.amount,
    v_tuition.amount
  );


  return v_invoice_id;
end;
$$;


-- =========================================================
-- ISSUE INVOICE
-- =========================================================

create or replace function
public.issue_invoice(
  p_invoice_id uuid,
  p_issued_on date,
  p_due_on date
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


  if p_invoice_id is null
    or p_issued_on is null
    or p_due_on is null
  then
    raise exception
      'Invoice id, issued date and due date are required';
  end if;


  if p_due_on < p_issued_on then
    raise exception
      'Invoice due date cannot be earlier than issue date';
  end if;


  select invoice.status
  into v_status
  from public.invoices as invoice
  where invoice.id =
    p_invoice_id
  for update;


  if not found then
    raise exception
      'Invoice not found';
  end if;


  if v_status <> 'DRAFT' then
    raise exception
      'Only draft invoices can be issued';
  end if;


  update public.invoices
  set
    status = 'ISSUED',
    issued_on = p_issued_on,
    due_on = p_due_on
  where id =
    p_invoice_id;
end;
$$;


-- =========================================================
-- CANCEL INVOICE
-- =========================================================

create or replace function
public.cancel_invoice(
  p_invoice_id uuid,
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


  if p_invoice_id is null then
    raise exception
      'Invoice id is required';
  end if;


  if p_reason is null
    or btrim(p_reason) = ''
  then
    raise exception
      'Invoice cancellation reason is required';
  end if;


  select invoice.status
  into v_status
  from public.invoices as invoice
  where invoice.id =
    p_invoice_id
  for update;


  if not found then
    raise exception
      'Invoice not found';
  end if;


  if v_status not in (
    'DRAFT',
    'ISSUED'
  ) then
    raise exception
      'Only draft or issued invoices can be cancelled';
  end if;


  update public.invoices
  set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancel_reason =
      btrim(p_reason)
  where id =
    p_invoice_id;
end;
$$;


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.invoices
enable row level security;


alter table public.invoice_items
enable row level security;


create policy "super_admin_select_invoices"
on public.invoices
for select
to authenticated
using (
  public.has_role(
    'SUPER_ADMIN'
  )
);


create policy "super_admin_select_invoice_items"
on public.invoice_items
for select
to authenticated
using (
  public.has_role(
    'SUPER_ADMIN'
  )
);


-- =========================================================
-- PRIVILEGES
-- =========================================================

revoke all
on public.invoices
from public;


revoke all
on public.invoice_items
from public;


grant select
on public.invoices
to authenticated;


grant select
on public.invoice_items
to authenticated;


revoke all on function
  public.create_tuition_invoice(uuid, text)
from public;


revoke all on function
  public.issue_invoice(uuid, date, date)
from public;


revoke all on function
  public.cancel_invoice(uuid, text)
from public;


grant execute on function
  public.create_tuition_invoice(uuid, text)
to authenticated, service_role;


grant execute on function
  public.issue_invoice(uuid, date, date)
to authenticated, service_role;


grant execute on function
  public.cancel_invoice(uuid, text)
to authenticated, service_role;
