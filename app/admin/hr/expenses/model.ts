export const expenseStates: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ kiểm tra',
  RETURNED: 'Trả về bổ sung',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
}

export const categorySuggestions = ['Vé xe', 'Ăn uống', 'Xăng xe', 'Lưu trú', 'Đi lại', 'Phí gửi xe', 'Phí cầu đường', 'Phí hành lý', 'Phí hội nghị', 'Khác']

export type ExpenseClaim = {
  id: string
  employee_id: string
  branch_id: string
  trip_id: string | null
  claim_model: 'LEGACY_TRIP_SUMMARY' | 'ITEMIZED_V2'
  title: string
  requested_month: string
  currency: string
  status: string
  version: number
  created_by: string
  approved_amount: string | null
}

export type ExpenseItem = { id: string; expense_date: string; category_name: string; note: string; amount: string }
export type LegacyLine = { id: string; allowance: string; transport: string; lodging: string; total_amount: string; note: string; trip_snapshot: { trip?: { starts_on?: string; ends_on?: string } } }
export type ClaimListItem = Pick<ExpenseClaim, 'id' | 'employee_id' | 'trip_id' | 'created_by' | 'title' | 'status' | 'requested_month' | 'currency' | 'approved_amount' | 'claim_model'> & { employee_code: string; full_name: string; total_amount: string; payroll_posting_state: 'POSTED' | 'NOT_POSTED' }
export type ExpenseTrip = { id: string; starts_on: string; ends_on: string; reason: string; destination_unit: string }
export type CategoryBreakdown = { category_name: string; amount: string }

export type ClaimDetail = {
  claim: ExpenseClaim
  trip: ExpenseTrip | null
  items: ExpenseItem[]
  lines: LegacyLine[]
  category_breakdown: CategoryBreakdown[]
  total_amount: string
  payroll_posting: { status: 'NOT_POSTED' | 'ACTIVE'; action_id?: string; period_id?: string; created_at?: string }
  payment_status: 'NO_AUTHORITATIVE_PAYMENT_EVIDENCE'
}

export type CreateContext = { employee: { id: string; employee_code: string; full_name: string }; branch: { id: string; name: string }; trips: ExpenseTrip[] }
