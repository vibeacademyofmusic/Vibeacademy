-- =========================================================
-- VIBE FINANCE ENGINE V1
-- =========================================================
--
-- Finance is DERIVED from the immutable financial ledger:
--
-- invoices = receivables / billed amount
-- payments = money received
-- refunds  = money returned
-- debt     = current outstanding receivable
--
-- This phase intentionally separates:
--
-- 1. Cash basis
--    POSTED payments - POSTED refunds
--
-- 2. Receivable basis
--    ISSUED invoices and current debt
--
-- Revenue Forecast is deferred to the next phase.
-- =========================================================


-- =========================================================
-- CASH LEDGER
-- =========================================================

create or replace view public.finance_cash_ledger
with (
  security_invoker = true
)
as

select
  payment.id
    as transaction_id,

  payment.payment_number
    as transaction_number,

  'PAYMENT'::text
    as transaction_type,

  payment.student_id_snapshot
    as student_id,

  payment.branch_id_snapshot
    as branch_id,

  payment.branch_code_snapshot
    as branch_code,

  payment.branch_name_snapshot
    as branch_name,

  payment.currency,

  payment.paid_at
    as occurred_at,

  (
    timezone(
      'Asia/Ho_Chi_Minh',
      payment.paid_at
    )
  )::date
    as occurred_on,

  date_trunc(
    'month',
    timezone(
      'Asia/Ho_Chi_Minh',
      payment.paid_at
    )
  )::date
    as month_start,

  payment.amount
    as cash_in,

  0::numeric(14,2)
    as cash_out,

  payment.amount
    as net_cash,

  payment.payment_method,

  payment.reference,

  payment.notes

from public.payments
as payment

where payment.status =
  'POSTED'


union all


select
  refund.id
    as transaction_id,

  refund.refund_number
    as transaction_number,

  'REFUND'::text
    as transaction_type,

  refund.student_id_snapshot
    as student_id,

  refund.branch_id_snapshot
    as branch_id,

  refund.branch_code_snapshot
    as branch_code,

  refund.branch_name_snapshot
    as branch_name,

  refund.currency,

  refund.refunded_at
    as occurred_at,

  (
    timezone(
      'Asia/Ho_Chi_Minh',
      refund.refunded_at
    )
  )::date
    as occurred_on,

  date_trunc(
    'month',
    timezone(
      'Asia/Ho_Chi_Minh',
      refund.refunded_at
    )
  )::date
    as month_start,

  0::numeric(14,2)
    as cash_in,

  refund.amount
    as cash_out,

  (
    0 - refund.amount
  )::numeric(14,2)
    as net_cash,

  null::text
    as payment_method,

  null::text
    as reference,

  refund.notes

from public.refunds
as refund

where refund.status =
  'POSTED';


-- =========================================================
-- BRANCH DAILY CASH SUMMARY
-- =========================================================

create or replace view public.branch_daily_cash_summary
with (
  security_invoker = true
)
as

select
  ledger.branch_id,

  ledger.branch_code,

  ledger.branch_name,

  ledger.currency,

  ledger.occurred_on,

  count(*) filter (
    where ledger.transaction_type =
      'PAYMENT'
  ) as payment_count,

  count(*) filter (
    where ledger.transaction_type =
      'REFUND'
  ) as refund_count,

  coalesce(
    sum(
      ledger.cash_in
    ),
    0
  )::numeric(14,2)
    as cash_in,

  coalesce(
    sum(
      ledger.cash_out
    ),
    0
  )::numeric(14,2)
    as cash_out,

  coalesce(
    sum(
      ledger.net_cash
    ),
    0
  )::numeric(14,2)
    as net_cash

from public.finance_cash_ledger
as ledger

group by
  ledger.branch_id,
  ledger.branch_code,
  ledger.branch_name,
  ledger.currency,
  ledger.occurred_on;


-- =========================================================
-- BRANCH MONTHLY CASH SUMMARY
-- =========================================================

create or replace view public.branch_monthly_cash_summary
with (
  security_invoker = true
)
as

select
  ledger.branch_id,

  ledger.branch_code,

  ledger.branch_name,

  ledger.currency,

  ledger.month_start,

  count(*) filter (
    where ledger.transaction_type =
      'PAYMENT'
  ) as payment_count,

  count(*) filter (
    where ledger.transaction_type =
      'REFUND'
  ) as refund_count,

  coalesce(
    sum(
      ledger.cash_in
    ),
    0
  )::numeric(14,2)
    as cash_in,

  coalesce(
    sum(
      ledger.cash_out
    ),
    0
  )::numeric(14,2)
    as cash_out,

  coalesce(
    sum(
      ledger.net_cash
    ),
    0
  )::numeric(14,2)
    as net_cash

from public.finance_cash_ledger
as ledger

group by
  ledger.branch_id,
  ledger.branch_code,
  ledger.branch_name,
  ledger.currency,
  ledger.month_start;


-- =========================================================
-- CURRENT BRANCH FINANCE SNAPSHOT
-- =========================================================
--
-- This is a CURRENT snapshot, not a historical month-close.
--
-- billed_amount:
--   total ISSUED invoices
--
-- applied_payment_amount:
--   payment allocations net of POSTED refund allocations
--
-- outstanding_amount:
--   current debt
--
-- overdue_amount:
--   current overdue debt
--
-- cash_received:
--   all POSTED payment transactions
--
-- cash_refunded:
--   all POSTED refund transactions
--
-- net_cash:
--   actual received cash minus actual refunded cash
-- =========================================================

create or replace view public.branch_finance_summary
with (
  security_invoker = true
)
as

with receivables as (
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
      as billed_amount,

    coalesce(
      sum(
        receivable.allocated_amount
      ) filter (
        where receivable.invoice_status =
          'ISSUED'
      ),
      0
    )::numeric(14,2)
      as applied_payment_amount,

    coalesce(
      sum(
        receivable.outstanding_balance
      ) filter (
        where receivable.invoice_status =
          'ISSUED'
      ),
      0
    )::numeric(14,2)
      as outstanding_amount,

    coalesce(
      sum(
        receivable.outstanding_balance
      ) filter (
        where receivable.receivable_status =
          'OVERDUE'
      ),
      0
    )::numeric(14,2)
      as overdue_amount

  from public.invoice_receivables
  as receivable

  group by
    receivable.branch_id_snapshot,
    receivable.branch_code_snapshot,
    receivable.branch_name_snapshot,
    receivable.currency
),

cash as (
  select
    ledger.branch_id,

    ledger.branch_code,

    ledger.branch_name,

    ledger.currency,

    coalesce(
      sum(
        ledger.cash_in
      ),
      0
    )::numeric(14,2)
      as cash_received,

    coalesce(
      sum(
        ledger.cash_out
      ),
      0
    )::numeric(14,2)
      as cash_refunded,

    coalesce(
      sum(
        ledger.net_cash
      ),
      0
    )::numeric(14,2)
      as net_cash

  from public.finance_cash_ledger
  as ledger

  group by
    ledger.branch_id,
    ledger.branch_code,
    ledger.branch_name,
    ledger.currency
)

select
  coalesce(
    receivables.branch_id,
    cash.branch_id
  ) as branch_id,

  coalesce(
    receivables.branch_code,
    cash.branch_code
  ) as branch_code,

  coalesce(
    receivables.branch_name,
    cash.branch_name
  ) as branch_name,

  coalesce(
    receivables.currency,
    cash.currency
  ) as currency,

  coalesce(
    receivables.issued_invoice_count,
    0
  ) as issued_invoice_count,

  coalesce(
    receivables.overdue_invoice_count,
    0
  ) as overdue_invoice_count,

  coalesce(
    receivables.billed_amount,
    0
  )::numeric(14,2)
    as billed_amount,

  coalesce(
    receivables.applied_payment_amount,
    0
  )::numeric(14,2)
    as applied_payment_amount,

  coalesce(
    receivables.outstanding_amount,
    0
  )::numeric(14,2)
    as outstanding_amount,

  coalesce(
    receivables.overdue_amount,
    0
  )::numeric(14,2)
    as overdue_amount,

  coalesce(
    cash.cash_received,
    0
  )::numeric(14,2)
    as cash_received,

  coalesce(
    cash.cash_refunded,
    0
  )::numeric(14,2)
    as cash_refunded,

  coalesce(
    cash.net_cash,
    0
  )::numeric(14,2)
    as net_cash

from receivables

full outer join cash
  on cash.branch_id =
    receivables.branch_id

  and cash.currency =
    receivables.currency;


-- =========================================================
-- PRIVILEGES
-- =========================================================

revoke all
on public.finance_cash_ledger
from public;


revoke all
on public.branch_daily_cash_summary
from public;


revoke all
on public.branch_monthly_cash_summary
from public;


revoke all
on public.branch_finance_summary
from public;


grant select
on public.finance_cash_ledger
to authenticated;


grant select
on public.branch_daily_cash_summary
to authenticated;


grant select
on public.branch_monthly_cash_summary
to authenticated;


grant select
on public.branch_finance_summary
to authenticated;
