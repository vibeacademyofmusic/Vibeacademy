import type { Payroll } from '@/app/admin/payroll/data'

export type V1Line = {
  id: string
  earned_on: string
  kind: string
  hours: number | string
  rate: number | string
  amount: number | string
  required_minutes: number | null
  payable_minutes: number | null
}

export type PayslipAdjustment = {
  id: string
  kind: string
  amount: number | string
  reason: string
}

export type V2ComponentLine = {
  id: string
  component_code: string
  category: 'EARNING' | 'REIMBURSEMENT' | 'DEDUCTION'
  calculation_method: string
  source_type: string
  source_session_id: string | null
  earned_on: string
  quantity: number | string
  unit_rate: number | string
  amount: number | string
  currency: string
}

export type V2PeriodAction = {
  id: string
  component_code: string
  category: 'EARNING' | 'REIMBURSEMENT'
  source_type: string
  source_expense_claim_id: string | null
  amount: number | string
  currency: string
  reason: string
  approved_at: string | null
}

export type V2Totals = {
  earnings: number | string
  reimbursements: number | string
  deductions: number | string
  adjustment: number | string
  net: number | string
}

export type Payslip = {
  payroll: Payroll
  employee_code: string
  engine: 'V1' | 'V2'

  period: {
    starts_on: string
    ends_on: string
    status: string
    approved_by: string | null
    approved_at: string | null
    finalized_at: string | null
  }

  // Payroll V1
  lines: V1Line[]

  // Payroll V2
  component_lines_v2: V2ComponentLine[]
  period_actions_v2: V2PeriodAction[]
  totals: V2Totals | null

  // Compatibility / historical adjustments
  adjustments: PayslipAdjustment[]
}

export const payslipComponentLabel: Record<string, string> = {
  BASE_SALARY: 'Lương tháng',
  POSITION_PAY: 'Lương vị trí',
  TEACHING_PER_SESSION: 'Lương theo buổi',
  BUSINESS_TRIP_ALLOWANCE: 'Trợ cấp công tác',

  SOCIAL_LABOR_INSURANCE: 'BHXH+BHLĐ',

  SOCIAL_INSURANCE: 'Bảo hiểm xã hội (cũ)',
  LABOR_INSURANCE: 'Bảo hiểm lao động (cũ)',

  BONUS: 'Thưởng',
  TRAVEL_EXPENSE: 'Công tác phí', RETROACTIVE_PAY: 'Truy lĩnh kỳ trước',
}

export function payslipComponentName(
  code: string
): string {
  return payslipComponentLabel[code] || code
}

/**
 * V1 compatibility only.
 *
 * Payroll V2 must use data.totals returned by payroll_payslip().
 * Do not reconstruct an authoritative V2 net amount in the UI.
 */
export function payslipTotals(data: Payslip) {
  const amounts = [
    ...data.lines,
    ...data.adjustments,
  ].map((item) =>
    Math.round(Number(item.amount) * 100)
  )

  return {
    earnings:
      amounts
        .filter((value) => value > 0)
        .reduce((a, b) => a + b, 0) / 100,

    deductions:
      amounts
        .filter((value) => value < 0)
        .reduce((a, b) => a - b, 0) / 100,

    net:
      amounts.reduce((a, b) => a + b, 0) / 100,
  }
}