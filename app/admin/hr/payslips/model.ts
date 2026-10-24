export const paymentStatusLabels = {
  NOT_PAID: 'Chưa chi',
  PARTIALLY_PAID: 'Chi một phần',
  PAID: 'Đã chi',
} as const

export const paymentMethodLabels = {
  BANK_TRANSFER: 'Chuyển khoản',
  CASH: 'Tiền mặt',
  OTHER: 'Khác',
} as const

export type MoneyValue = number | string | null
export type PaymentStatus = keyof typeof paymentStatusLabels
export type PaymentMethod = keyof typeof paymentMethodLabels

export type PayrollListRow = {
  id: string
  period_id: string
  employee_id: string | null
  teacher_id: string | null
  branch_id: string
  teacher_name: string
  employee_code: string
  currency: string
  starts_on: string
  ends_on: string
  period_status: 'APPROVED' | 'FINALIZED'
  branch_name: string
  payable_amount: MoneyValue
  paid_amount: MoneyValue
  remaining_amount: MoneyValue
  payment_status: PaymentStatus
}

export type PayrollComponentLine = {
  id: string
  component_code: string
  category: 'EARNING' | 'REIMBURSEMENT' | 'DEDUCTION'
  source_type: string
  earned_on: string
  quantity: MoneyValue
  unit_rate: MoneyValue
  amount: MoneyValue
  currency: string
}

export type PayrollPeriodAction = {
  id: string
  component_code: string
  category: 'EARNING' | 'REIMBURSEMENT'
  source_type: string
  amount: MoneyValue
  currency: string
  reason: string
}

export type PayrollAdjustment = { id: string; kind: string; amount: MoneyValue; reason: string }
export type LegacyLine = { id: string; earned_on: string; kind: string; amount: MoneyValue }

export type DisbursementHistory = {
  id: string
  amount: MoneyValue
  currency: string
  paid_on: string
  payment_method: PaymentMethod
  reference: string | null
  note: string | null
  status: 'ACTIVE' | 'CANCELLED'
  created_by_name: string
  created_at: string
  cancelled_by_name: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

export type PayrollDisbursementDetail = {
  payroll: {
    id: string
    teacher_name: string
    currency: string
    calculation_version: string | null
  }
  employee_code: string
  engine: 'V1' | 'V2'
  period: { starts_on: string; ends_on: string; status: 'APPROVED' | 'FINALIZED' }
  branch: { id: string; name: string }
  component_lines_v2: PayrollComponentLine[]
  period_actions_v2: PayrollPeriodAction[]
  adjustments: PayrollAdjustment[]
  lines: LegacyLine[]
  financial_summary: {
    earnings: MoneyValue
    reimbursements: MoneyValue
    deductions: MoneyValue
    adjustment: MoneyValue
    net: MoneyValue
  }
  payable_amount: MoneyValue
  paid_amount: MoneyValue
  remaining_amount: MoneyValue
  payment_status: PaymentStatus
  can_record: boolean
  can_cancel: boolean
  payment_history: DisbursementHistory[]
}

export type PayrollFilterOption = { id: string; starts_on: string; ends_on: string; status: string; branch_id: string }
export type BranchOption = { id: string; name: string }
