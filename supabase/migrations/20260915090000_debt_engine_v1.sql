-- =========================================================
-- VIBE DEBT / RECEIVABLE ENGINE V1
-- =========================================================
--
-- Debt is DERIVED, never manually stored.
--
-- Source of truth:
--   invoices.total_amount
--   payment_allocations.amount
--   payments.status
--
-- Only allocations belonging to POSTED payments reduce debt.
-- VOIDED payments automatically stop contributing.
-- =========================================================


-- =========================================================
-- INVOICE RECEIVABLES
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

  coalesce(
    payment_totals.allocated_amount,
    0
  )::numeric(14,2)
    as allocated_amount,

  greatest(
    invoice.total_amount
      - coalesce(
          payment_totals.allocated_amount,
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
        - coalesce(
            payment_totals.allocated_amount,
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

    when coalesce(
      payment_totals.allocated_amount,
      0
    ) > 0
      then 'PARTIALLY_PAID'

    else 'UNPAID'
  end as receivable_status,

  case
    when invoice.status = 'ISSUED'
      and greatest(
        invoice.total_amount
          - coalesce(
              payment_totals.allocated_amount,
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
          - coalesce(
              payment_totals.allocated_amount,
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

  invoice.updated_at

from public.invoices
as invoice

left join lateral (
  select
    coalesce(
      sum(allocation.amount),
      0
    )::numeric(14,2)
      as allocated_amount

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
on true;


-- =========================================================
-- STUDENT RECEIVABLE SUMMARY
-- =========================================================

create or replace view public.student_receivable_summary
with (
  security_invoker = true
)
as
select
  receivable.student_id_snapshot
    as student_id,

  receivable.currency,

  count(*) filter (
    where receivable.invoice_status =
      'ISSUED'
  ) as issued_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'UNPAID'
  ) as unpaid_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'PARTIALLY_PAID'
  ) as partially_paid_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'OVERDUE'
  ) as overdue_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'PAID'
  ) as paid_invoice_count,

  coalesce(
    sum(
      receivable.total_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_invoiced,

  coalesce(
    sum(
      receivable.allocated_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_paid,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_outstanding,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.receivable_status =
        'OVERDUE'
    ),
    0
  )::numeric(14,2)
    as total_overdue

from public.invoice_receivables
as receivable

group by
  receivable.student_id_snapshot,
  receivable.currency;


-- =========================================================
-- BRANCH RECEIVABLE SUMMARY
-- =========================================================

create or replace view public.branch_receivable_summary
with (
  security_invoker = true
)
as
select
  receivable.branch_id_snapshot
    as branch_id,

  receivable.branch_code_snapshot
    as branch_code,

  receivable.branch_name_snapshot
    as branch_name,

  receivable.currency,

  count(*) filter (
    where receivable.invoice_status =
      'ISSUED'
  ) as issued_invoice_count,

  count(*) filter (
    where receivable.receivable_status =
      'OVERDUE'
  ) as overdue_invoice_count,

  coalesce(
    sum(
      receivable.total_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_invoiced,

  coalesce(
    sum(
      receivable.allocated_amount
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_paid,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.invoice_status =
        'ISSUED'
    ),
    0
  )::numeric(14,2)
    as total_outstanding,

  coalesce(
    sum(
      receivable.outstanding_balance
    ) filter (
      where receivable.receivable_status =
        'OVERDUE'
    ),
    0
  )::numeric(14,2)
    as total_overdue

from public.invoice_receivables
as receivable

group by
  receivable.branch_id_snapshot,
  receivable.branch_code_snapshot,
  receivable.branch_name_snapshot,
  receivable.currency;


-- =========================================================
-- PRIVILEGES
-- =========================================================

revoke all
on public.invoice_receivables
from public;


revoke all
on public.student_receivable_summary
from public;


revoke all
on public.branch_receivable_summary
from public;


grant select
on public.invoice_receivables
to authenticated;


grant select
on public.student_receivable_summary
to authenticated;


grant select
on public.branch_receivable_summary
to authenticated;
