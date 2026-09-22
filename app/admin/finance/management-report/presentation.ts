import { formatMoney, type Amount } from '../../_lib/money'
import { categoryLabel } from '../operating-expenses/model'
import type {
  FinancialManagementReport,
  MetricStatusCode,
  MetricValue,
} from './model'
import { metricAmount } from './model'

export const statusLabels: Record<MetricStatusCode, string> = {
  AVAILABLE: 'Đầy đủ',
  PARTIAL: 'Chưa đầy đủ',
  NEEDS_PRODUCT_POLICY: 'Cần chính sách',
  NOT_IMPLEMENTED: 'Chưa tích hợp',
}

export const sourceQualityTitles: Record<string, string> = {
  REVENUE: 'Doanh thu',
  PERSONNEL_EXPENSE: 'Chi phí nhân sự',
  TRAVEL_REIMBURSEMENT_EXPENSE: 'Công tác phí',
  OPERATING_EXPENSE: 'Chi phí vận hành',
  OPERATING_EXPENSE_PLAN: 'Kế hoạch chi phí vận hành',
  OTHER_OPERATING_EXPENSE: 'Chi phí hoạt động khác',
  OPERATING_RESULT_KNOWN_SOURCES: 'Kết quả hoạt động',
  MANAGEMENT_RESULT: 'Kết quả quản trị',
  TUITION_CASH_IN: 'Dòng tiền học phí',
  PAYROLL_CASH_OUT: 'Chi trả lương',
  REFUND_CASH_OUT: 'Hoàn học phí',
  OPEX_CASH_OUT: 'Chi phí vận hành đã thanh toán',
  LOAN_DRAWDOWN: 'Khoản vay',
  CURRENT_RECEIVABLE: 'Công nợ hiện tại',
  MONTH_END_RECEIVABLE: 'Công nợ cuối kỳ',
  OPEX_PAYABLE: 'Công nợ vận hành',
  LOAN_BALANCE: 'Dư nợ vay',
}

export type StatusTone = 'success' | 'warning' | 'info' | 'neutral' | 'error'

export function statusTone(status: string | null | undefined, integrity = false): StatusTone {
  if (integrity) return 'error'
  if (status === 'AVAILABLE') return 'success'
  if (status === 'PARTIAL') return 'warning'
  if (status === 'NEEDS_PRODUCT_POLICY') return 'info'
  return 'neutral'
}

export function statusLabel(status: string | null | undefined) {
  if (status === 'AVAILABLE') return statusLabels.AVAILABLE
  if (status === 'PARTIAL') return statusLabels.PARTIAL
  if (status === 'NEEDS_PRODUCT_POLICY') return statusLabels.NEEDS_PRODUCT_POLICY
  if (status === 'NOT_IMPLEMENTED') return statusLabels.NOT_IMPLEMENTED
  return status ?? '—'
}

export function displayMoney(value: Amount, currency: string) {
  if (value === null || value === undefined) return '—'
  return formatMoney(value, currency)
}

export function displayMetricMoney(metric: MetricValue | null | undefined, currency: string) {
  if (!metric || metric.status === 'NOT_IMPLEMENTED' || metric.value === null || metric.value === undefined) {
    return '—'
  }
  return formatMoney(metric.value, currency)
}

export function revenueTitle(status: string | null | undefined) {
  return status === 'PARTIAL' ? 'Doanh thu xác định được' : 'Doanh thu ghi nhận'
}

export function monthHeading(month: string) {
  const year = month.slice(0, 4)
  const mm = month.slice(5, 7)
  return `Tháng ${mm}/${year}`
}

export function generatedAtLabel(value: string) {
  const formatted = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value))
  const [date, time] = formatted.split(', ')
  if (time) return `Cập nhật lúc ${time} · ${date}`
  return `Cập nhật lúc ${formatted}`
}

export function scopeLabel(scope: FinancialManagementReport['scope']) {
  return scope.type === 'CONSOLIDATED' ? 'Toàn VIBE' : (scope.branch_name ?? 'Chi nhánh')
}

export function formatChangePct(pct: Amount) {
  if (pct === null || pct === undefined || pct === '') return null
  return `${String(pct).replace('.', ',')}%`
}

export function changeCaption(change: { amount: Amount; pct: Amount } | undefined, currency: string) {
  if (!change) return null
  const amountText = displayMoney(change.amount, currency)
  const pct = formatChangePct(change.pct)
  if (amountText === '—' && !pct) return 'Không có cơ sở tỷ lệ so sánh.'
  if (!pct) return `${amountText} · Không có cơ sở tỷ lệ so sánh.`
  return `${amountText} · ${pct}`
}

function sameAmount(token: string, amount: Amount) {
  const raw = String(amount)
  const strip = (value: string) => value.replace(/\.0+$/, '').replace(/\.$/, '')
  return token === raw || strip(token) === strip(raw)
}

export function formatConclusionText(text: string, amount: Amount, currency: string) {
  const formatted = displayMoney(amount, currency)
  if (formatted === '—' || amount === null || amount === undefined || amount === '') return text
  return text.replace(/-?\d+(?:\.\d+)?(?:\s+[A-Z]{3})?/g, (token) => {
    const numeric = token.match(/-?\d+(?:\.\d+)?/)?.[0]
    return numeric && sameAmount(numeric, amount) ? formatted : token
  })
}

const conclusionMetric = {
  REVENUE: (report: FinancialManagementReport) => report.pnl.revenue,
  PERSONNEL: (report: FinancialManagementReport) => report.pnl.personnel_expense,
  TRAVEL: (report: FinancialManagementReport) => report.pnl.travel_reimbursement_expense,
  OPEX: (report: FinancialManagementReport) => report.pnl.operating_expense,
  OPERATING_RESULT: (report: FinancialManagementReport) => report.pnl.operating_result,
  RESULT: (report: FinancialManagementReport) => report.pnl.operating_result,
  NET_CASH: (report: FinancialManagementReport) => report.cash_flow.net_integrated,
  CASH: (report: FinancialManagementReport) => report.cash_flow.net_integrated,
  CURRENT_RECEIVABLE: (report: FinancialManagementReport) => report.receivables.current_tuition_receivable,
  RECEIVABLE: (report: FinancialManagementReport) => report.receivables.current_tuition_receivable,
  OPEX_OVER_PLAN: (report: FinancialManagementReport) => ({
    value: report.operating_expense.variance_amount,
    status: report.operating_expense.planned_status,
  }),
  OPEX_UNDER_PLAN: (report: FinancialManagementReport) => ({
    value: report.operating_expense.variance_amount,
    status: report.operating_expense.planned_status,
  }),
} as const

export type ConclusionItem = FinancialManagementReport['conclusions']['facts'][number]

export function presentConclusion(item: ConclusionItem, report: FinancialManagementReport) {
  const lookup = conclusionMetric[item.code as keyof typeof conclusionMetric]
  const metric = lookup ? lookup(report) : null
  const amount = metric && 'value' in metric ? metric.value : null
  return {
    kind: item.kind,
    code: item.code,
    text: formatConclusionText(item.text, amount, report.currency),
    tone: item.kind === 'WARNING' ? 'warning' as StatusTone : item.kind === 'OBSERVATION' ? 'info' as StatusTone : 'neutral' as StatusTone,
  }
}

export function executiveConclusions(report: FinancialManagementReport) {
  return report.conclusions.executive.slice(0, 5).map((item) => presentConclusion(item, report))
}

export function opexCategoryLabel(category: string) {
  return categoryLabel(category)
}

export function unresolvedNote(metric: MetricValue | null | undefined) {
  if (!metric) return null
  if (metric.status === 'NOT_IMPLEMENTED') return 'Chưa tích hợp nguồn dữ liệu.'
  if (metric.status === 'NEEDS_PRODUCT_POLICY') return metric.reason
  if (metric.status === 'PARTIAL') {
    if (metric.unresolved_source_count > 0) {
      return `${metric.unresolved_source_count} hồ sơ chưa đủ điều kiện ghi nhận.`
    }
    return metric.reason
  }
  return null
}

export function branchMetric(metrics: Record<string, unknown>, section: string, key: string) {
  const block = metrics[section]
  if (!block || typeof block !== 'object') return null
  const value = (block as Record<string, unknown>)[key]
  if (!value || typeof value !== 'object') return null
  return value as MetricValue
}

export function branchRowStatus(metrics: Record<string, unknown>) {
  const watched = [
    branchMetric(metrics, 'pnl', 'revenue'),
    branchMetric(metrics, 'pnl', 'personnel_expense'),
    branchMetric(metrics, 'pnl', 'operating_expense'),
    branchMetric(metrics, 'pnl', 'operating_result'),
  ]
  if (watched.some((metric) => metric?.status === 'PARTIAL')) return 'PARTIAL'
  if (watched.some((metric) => metric?.status === 'NOT_IMPLEMENTED')) return 'NOT_IMPLEMENTED'
  return 'AVAILABLE'
}

export function trendAdapter(report: FinancialManagementReport) {
  return report.trend_12_months.map((point) => ({
    month: point.month,
    revenue: { value: metricAmount(point.revenue), status: point.revenue.status },
    personnel_expense: { value: metricAmount(point.personnel_expense), status: point.personnel_expense.status },
    travel_expense: { value: metricAmount(point.travel_expense), status: point.travel_expense.status },
    operating_expense: { value: metricAmount(point.operating_expense), status: point.operating_expense.status },
    operating_result: { value: metricAmount(point.operating_result), status: point.operating_result.status },
    cash_in_integrated: { value: metricAmount(point.cash_in_integrated), status: point.cash_in_integrated.status },
    cash_out_integrated: { value: metricAmount(point.cash_out_integrated), status: point.cash_out_integrated.status },
    net_cash_integrated: { value: metricAmount(point.net_cash_integrated), status: point.net_cash_integrated.status },
  }))
}

export function opexCategoryAdapter(report: FinancialManagementReport) {
  return report.operating_expense.by_category
}

export function opexBranchAdapter(report: FinancialManagementReport) {
  return report.operating_expense.by_branch
}

export function branchAdapter(report: FinancialManagementReport) {
  return report.branches
}

export function opexVarianceText(report: FinancialManagementReport) {
  const plan = report.operating_expense
  if (plan.planned_status !== 'AVAILABLE' || plan.variance_amount === null || plan.variance_amount === undefined) return '—'
  return displayMoney(plan.variance_amount, report.currency)
}

export function periodStamp(month: string) {
  return `${month.slice(5, 7)}/${month.slice(0, 4)}`
}

export function financialReportHref(month: string, branchId: string | null, currency: string) {
  const params = new URLSearchParams({ month, currency })
  if (branchId) params.set('branch', branchId)
  return `/documents/finance/management-report?${params.toString()}`
}

export function financialReportDocumentTitle(
  month: string,
  scope: FinancialManagementReport['scope'],
  branchCode: string | null,
) {
  const stamp = month.slice(0, 7)
  if (scope.type !== 'BRANCH' || !branchCode) return `VIBE-Financial-Management-Report-${stamp}`
  const safe = branchCode.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return safe
    ? `VIBE-Financial-Management-Report-${stamp}-${safe}`
    : `VIBE-Financial-Management-Report-${stamp}`
}

export const drillHrefs = {
  revenue: '/admin/tuition',
  personnel: '/admin/payroll',
  travel: '/admin/hr/expenses',
  operatingExpense: '/admin/finance/operating-expenses',
  cashIn: '/admin/finance/payments',
  payrollCashOut: '/admin/hr/payslips',
  receivable: '/admin/finance/receivables',
}
