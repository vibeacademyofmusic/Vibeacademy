import type { Amount } from '../../_lib/money'

export type MetricStatusCode =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'NEEDS_PRODUCT_POLICY'
  | 'NOT_IMPLEMENTED'

export type AsOfType = 'PERIOD' | 'LIVE' | 'SNAPSHOT'

export type MetricValue = {
  code: string
  value: Amount
  status: MetricStatusCode
  reason: string | null
  source_codes: string[]
  as_of_type: AsOfType
  known_source_count: number
  unresolved_source_count: number
}

export type OperatingExpenseCategoryRow = {
  category: string
  planned: Amount
  actual: Amount
  variance: Amount
  status: MetricStatusCode | string
}

export type OperatingExpenseBranchRow = {
  branch_id: string
  branch_name: string
  planned: Amount
  actual: Amount
  variance: Amount
  planned_status?: MetricStatusCode | string
}

export type FinancialManagementReport = {
  period: {
    month: string
    previous_month: string
    timezone: string
  }
  scope: {
    type: 'BRANCH' | 'CONSOLIDATED'
    branch_id: string | null
    branch_name: string | null
  }
  currency: string
  generated_at: string
  source_status: MetricValue[]
  pnl: {
    revenue: MetricValue
    personnel_expense: MetricValue
    travel_reimbursement_expense: MetricValue
    operating_expense: MetricValue
    other_operating_expense: MetricValue
    operating_result: MetricValue
    loan_interest_expense: MetricValue
    other_financial_expense: MetricValue
    management_result: MetricValue
    management_margin: MetricValue
  }
  operating_expense: {
    planned_amount: Amount
    planned_known_amount: Amount
    recorded_amount: Amount
    variance_amount: Amount
    planned_status: string
    unplanned_template_count: number
    record_count: number
    plan: MetricValue
    by_category: OperatingExpenseCategoryRow[]
    by_branch: OperatingExpenseBranchRow[]
  }
  cash_flow: {
    tuition_cash_in: MetricValue
    payroll_cash_out: MetricValue
    refund_cash_out: MetricValue
    opex_cash_out: MetricValue
    other_operating_in: MetricValue
    loan_drawdown: MetricValue
    loan_principal_out: MetricValue
    loan_interest_out: MetricValue
    vendor_out: MetricValue
    tax_fee_out: MetricValue
    capex_out: MetricValue
    total_in_integrated: MetricValue
    total_out_integrated: MetricValue
    net_integrated: MetricValue
    label: string
  }
  receivables: {
    current_tuition_receivable: MetricValue
    opening_receivable_current: MetricValue
    month_end_receivable: MetricValue
  }
  obligations: {
    payroll_recognized_payable: MetricValue
    payroll_disbursable_remaining: MetricValue
    payroll_paid_amount: Amount
    payroll_approved_not_disbursable_label: string
    opex_payable: MetricValue
    loan_balance: MetricValue
    integrity_warning: boolean
  }
  branches: { branch_id: string; branch_name: string; metrics: Record<string, unknown> }[]
  previous_period: {
    metrics: Record<string, unknown>
    changes: Record<string, { amount: Amount; pct: Amount }>
  }
  trend_12_months: {
    month: string
    revenue: MetricValue
    personnel_expense: MetricValue
    travel_expense: MetricValue
    operating_expense: MetricValue
    operating_result: MetricValue
    cash_in_integrated: MetricValue
    cash_out_integrated: MetricValue
    net_cash_integrated: MetricValue
  }[]
  conclusions: {
    facts: { kind: string; code: string; text: string }[]
    observations: { kind: string; code: string; text: string }[]
    warnings: { kind: string; code: string; text: string }[]
    executive: { kind: string; code: string; text: string }[]
  }
  source_refs: {
    strategy: string
    month: string
    branch_ids: string[]
    currency: string
    counts: Record<string, number>
  }
}

export function metricAmount(metric: MetricValue | null | undefined): Amount {
  if (!metric || metric.value === undefined) return null
  return metric.value
}
