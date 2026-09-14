-- =========================================================
-- VIBE REVENUE FORECAST ENGINE V1
-- =========================================================
--
-- Forecast is derived from current operational facts.
--
-- Renewal Pipeline:
-- ACTIVE tuition terms ending in the current or next month.
-- Projected renewal value uses the current tuition amount.
--
-- Expected Cash Due:
-- Current outstanding balance of ISSUED invoices whose
-- due date falls in the forecast month.
--
-- This is intentionally conservative:
-- no growth rate, probability model, or manual optimism.
-- =========================================================


-- =========================================================
-- FORECAST MONTHS
-- =========================================================

create or replace view public.revenue_forecast_months
with (
  security_invoker = true
)
as
select
  date_trunc(
    'month',
    timezone(
      'Asia/Ho_Chi_Minh',
      now()
    )
  )::date
    as month_start

union all

select
  (
    date_trunc(
      'month',
      timezone(
        'Asia/Ho_Chi_Minh',
        now()
      )
    )
    + interval '1 month'
  )::date
    as month_start;


-- =========================================================
-- BRANCH MONTHLY REVENUE FORECAST
-- =========================================================

create or replace view public.branch_monthly_revenue_forecast
with (
  security_invoker = true
)
as

with months as (
  select month_start
  from public.revenue_forecast_months
),

renewals as (
  select
    tuition.branch_id_snapshot
      as branch_id,

    tuition.branch_code_snapshot
      as branch_code,

    tuition.branch_name_snapshot
      as branch_name,

    tuition.currency,

    date_trunc(
      'month',
      tuition.effective_ends_on
    )::date
      as month_start,

    count(*)
      as expiring_tuition_count,

    count(
      distinct enrollment.student_id
    )
      as expiring_student_count,

    coalesce(
      sum(
        tuition.amount
      ),
      0
    )::numeric(14,2)
      as projected_renewal_amount

  from public.enrollment_tuition
    as tuition

  join public.enrollments
    as enrollment
    on enrollment.id =
      tuition.enrollment_id

  where tuition.status =
    'ACTIVE'

  group by
    tuition.branch_id_snapshot,
    tuition.branch_code_snapshot,
    tuition.branch_name_snapshot,
    tuition.currency,
    date_trunc(
      'month',
      tuition.effective_ends_on
    )::date
),

receivables as (
  select
    receivable.branch_id_snapshot
      as branch_id,

    receivable.branch_code_snapshot
      as branch_code,

    receivable.branch_name_snapshot
      as branch_name,

    receivable.currency,

    date_trunc(
      'month',
      receivable.due_on
    )::date
      as month_start,

    count(*) filter (
      where receivable.invoice_status =
        'ISSUED'
    )
      as invoices_due_count,

    coalesce(
      sum(
        receivable.outstanding_balance
      ) filter (
        where receivable.invoice_status =
          'ISSUED'
      ),
      0
    )::numeric(14,2)
      as expected_cash_due

  from public.invoice_receivables
    as receivable

  where receivable.due_on is not null

  group by
    receivable.branch_id_snapshot,
    receivable.branch_code_snapshot,
    receivable.branch_name_snapshot,
    receivable.currency,
    date_trunc(
      'month',
      receivable.due_on
    )::date
),

branch_currency as (
  select
    tuition.branch_id_snapshot
      as branch_id,

    tuition.branch_code_snapshot
      as branch_code,

    tuition.branch_name_snapshot
      as branch_name,

    tuition.currency

  from public.enrollment_tuition
    as tuition

  union

  select
    receivable.branch_id_snapshot,
    receivable.branch_code_snapshot,
    receivable.branch_name_snapshot,
    receivable.currency

  from public.invoice_receivables
    as receivable
)

select
  branch_currency.branch_id,

  branch_currency.branch_code,

  branch_currency.branch_name,

  branch_currency.currency,

  months.month_start,

  case
    when months.month_start =
      date_trunc(
        'month',
        timezone(
          'Asia/Ho_Chi_Minh',
          now()
        )
      )::date
    then 'CURRENT_MONTH'

    else 'NEXT_MONTH'
  end as forecast_period,

  coalesce(
    renewals.expiring_tuition_count,
    0
  ) as expiring_tuition_count,

  coalesce(
    renewals.expiring_student_count,
    0
  ) as expiring_student_count,

  coalesce(
    renewals.projected_renewal_amount,
    0
  )::numeric(14,2)
    as projected_renewal_amount,

  coalesce(
    receivables.invoices_due_count,
    0
  ) as invoices_due_count,

  coalesce(
    receivables.expected_cash_due,
    0
  )::numeric(14,2)
    as expected_cash_due,

  (
    coalesce(
      renewals.projected_renewal_amount,
      0
    )
    +
    coalesce(
      receivables.expected_cash_due,
      0
    )
  )::numeric(14,2)
    as gross_forecast_opportunity

from branch_currency

cross join months

left join renewals
  on renewals.branch_id =
    branch_currency.branch_id

  and renewals.currency =
    branch_currency.currency

  and renewals.month_start =
    months.month_start

left join receivables
  on receivables.branch_id =
    branch_currency.branch_id

  and receivables.currency =
    branch_currency.currency

  and receivables.month_start =
    months.month_start;


-- =========================================================
-- SYSTEM MONTHLY REVENUE FORECAST
-- =========================================================

create or replace view public.system_monthly_revenue_forecast
with (
  security_invoker = true
)
as
select
  forecast.currency,

  forecast.month_start,

  forecast.forecast_period,

  sum(
    forecast.expiring_tuition_count
  )::bigint
    as expiring_tuition_count,

  sum(
    forecast.expiring_student_count
  )::bigint
    as expiring_student_count,

  sum(
    forecast.projected_renewal_amount
  )::numeric(14,2)
    as projected_renewal_amount,

  sum(
    forecast.invoices_due_count
  )::bigint
    as invoices_due_count,

  sum(
    forecast.expected_cash_due
  )::numeric(14,2)
    as expected_cash_due,

  sum(
    forecast.gross_forecast_opportunity
  )::numeric(14,2)
    as gross_forecast_opportunity

from public.branch_monthly_revenue_forecast
  as forecast

group by
  forecast.currency,
  forecast.month_start,
  forecast.forecast_period;


-- =========================================================
-- PRIVILEGES
-- =========================================================

revoke all
on public.revenue_forecast_months
from public;

revoke all
on public.branch_monthly_revenue_forecast
from public;

revoke all
on public.system_monthly_revenue_forecast
from public;

grant select
on public.revenue_forecast_months
to authenticated;

grant select
on public.branch_monthly_revenue_forecast
to authenticated;

grant select
on public.system_monthly_revenue_forecast
to authenticated;
