import { adminClient, uuidPattern, type Params } from '../operations'
import type { FinancialManagementReport } from './model'

export type FinanceBranchOption = { id: string; name: string; code: string }

function currentVietnamMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function firstOfMonth(value: string | Date | null | undefined) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-01`
  }
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(value)) {
    return `${value.slice(0, 7)}-01`
  }
  return null
}

export async function loadFinancialManagementReport(input: {
  month?: string | Date | null
  branchId?: string | null
  currency?: string | null
}) {
  const db = await adminClient()
  const month = firstOfMonth(input.month)
  if (!month) {
    return { report: null as FinancialManagementReport | null, error: 'Tháng báo cáo không hợp lệ.' }
  }
  const currency = (input.currency ?? 'VND').trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { report: null as FinancialManagementReport | null, error: 'Loại tiền tệ không hợp lệ.' }
  }
  const result = await db.rpc('get_financial_management_report', {
    p_month: month,
    p_branch: input.branchId ?? null,
    p_currency: currency,
  })
  if (result.error || result.data == null || typeof result.data !== 'object') {
    return { report: null as FinancialManagementReport | null, error: 'Không tải được báo cáo tài chính quản trị.' }
  }
  return { report: result.data as FinancialManagementReport, error: null }
}

export async function loadFinanceControlTower(params: Params) {
  const db = await adminClient()
  const month = firstOfMonth(params.month) ?? `${currentVietnamMonth()}-01`
  const currency = /^[A-Z]{3}$/.test((params.currency ?? 'VND').trim().toUpperCase())
    ? (params.currency ?? 'VND').trim().toUpperCase()
    : 'VND'
  const requestedBranch = uuidPattern.test(params.branch ?? '') ? params.branch! : null
  const compare = params.compare !== '0'
  const [superAdmin, branchesResult] = await Promise.all([
    db.rpc('is_global_super_admin'),
    db.from('branches').select('id, name, code').order('name'),
  ])
  const canConsolidate = superAdmin.data === true
  const branches = Array.isArray(branchesResult.data) ? branchesResult.data as FinanceBranchOption[] : []
  const branchId = canConsolidate ? requestedBranch : (requestedBranch ?? branches[0]?.id ?? null)
  const loaded = await loadFinancialManagementReport({ month, branchId, currency })
  return {
    month: month.slice(0, 7),
    currency,
    branchId,
    compare,
    canConsolidate,
    branches,
    report: loaded.report,
    error: loaded.error,
  }
}
