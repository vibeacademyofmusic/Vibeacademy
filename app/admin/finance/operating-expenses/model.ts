export const operatingExpenseStates: Record<string, string> = {
  DRAFT: 'Bản nháp',
  RECORDED: 'Đã ghi nhận chi phí',
  CANCELLED: 'Đã hủy',
}

export const operatingExpenseCategories: Record<string, string> = {
  RENT: 'Thuê nhà / mặt bằng',
  ELECTRICITY: 'Điện',
  WATER: 'Nước',
  INTERNET: 'Internet / Wifi',
  FIXED_PHONE: 'Điện thoại cố định',
  SECURITY: 'Bảo vệ',
  CLEANING: 'Vệ sinh',
  SOFTWARE: 'Phần mềm / dịch vụ định kỳ',
  MAINTENANCE: 'Bảo trì',
  OTHER: 'Khác',
}

export type MoneyValue = string | number | null
export type OperatingExpenseStatus = keyof typeof operatingExpenseStates
export type OperatingExpenseCategory = keyof typeof operatingExpenseCategories

export type OperatingExpenseBranch = { id: string; name: string; code: string }
export type OperatingExpenseTemplate = {
  id: string
  branch_id: string
  branch_name: string
  category: OperatingExpenseCategory
  custom_category_name: string | null
  name: string
  vendor: string | null
  amount_mode: 'FIXED' | 'VARIABLE'
  expected_amount: MoneyValue
  currency: string
  effective_from: string
  effective_to: string | null
  status: 'ACTIVE' | 'RETIRED'
  version: number
}

export type OperatingExpenseListRow = {
  id: string
  template_id: string
  branch_id: string
  branch_name: string
  expense_month: string
  category: OperatingExpenseCategory
  custom_category_name: string | null
  name: string
  vendor: string | null
  expected_amount: MoneyValue
  actual_amount: MoneyValue
  variance_amount: MoneyValue
  currency: string
  status: OperatingExpenseStatus
  version: number
  expense_date: string | null
  due_date: string | null
}

export type OperatingExpenseRecord = OperatingExpenseListRow & {
  reference: string | null
  note: string | null
  recorded_at: string | null
  recorded_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
}

export type OperatingExpenseDetail = {
  record: OperatingExpenseRecord
  branch: OperatingExpenseBranch
  template: { id: string; name: string; status: string; amount_mode: 'FIXED' | 'VARIABLE'; expected_amount: MoneyValue; vendor: string | null; version: number }
  expected_amount: MoneyValue
  actual_amount: MoneyValue
  variance_amount: MoneyValue
  payment_status: 'NO_OUTGOING_PAYMENT_LEDGER'
}

export type OperatingExpenseContext = {
  branches: OperatingExpenseBranch[]
  templates: OperatingExpenseTemplate[]
  categories: OperatingExpenseCategory[]
  payment_status: 'NO_OUTGOING_PAYMENT_LEDGER'
}

export function categoryLabel(category: string, custom?: string | null) {
  if (category === 'OTHER' && custom) return `${operatingExpenseCategories.OTHER}: ${custom}`
  return operatingExpenseCategories[category] ?? category
}

export function monthText(value: string) {
  const [year, month] = value.slice(0, 7).split('-')
  return `${month}/${year}`
}
