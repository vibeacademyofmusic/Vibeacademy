/** Read-only projection. Never writes a payroll total or infers a payment. */
export type Amount = number | string | null | undefined
export type Head = { id: string; branch_id: string; starts_on: string; ends_on: string; status: string; version: number; generated_by: string | null; approved_by: string | null; finalized_by: string | null; generated_at: string | null }
export type Pay = { id: string; period_id: string; employee_id: string | null; teacher_id: string | null; teacher_name: string; branch_id: string; pay_type: string; currency: string; base_salary: Amount; hourly_earnings: Amount; teaching_hours: Amount; adjustment_amount: Amount; gross_amount: Amount; v2_earnings_amount: Amount; v2_reimbursement_amount: Amount; v2_deduction_amount: Amount; v2_net_amount: Amount; calculation_version: string | null }
export type Config = { id: string; employee_id: string; branch_id: string | null; component_code: string; calculation_method: string; amount: Amount; rate: Amount; currency: string | null; class_type: string | null; effective_from: string; effective_to: string | null; status: string }
export type Line = { id: string; payroll_id: string; employee_id: string; component_config_id: string; component_code: string; category: string; calculation_method: string; source_type: string; source_session_id: string | null; earned_on: string; quantity: Amount; unit_rate: Amount; amount: Amount; currency: string; source_snapshot: Record<string, unknown> | null }
export type PeriodAction = { id: string; period_id: string; employee_id: string; component_code: string; category: string; source_type: string; source_expense_claim_id: string | null; amount: Amount; currency: string; reason: string; status: string; created_at: string; approved_at: string | null }
export type EmployeeName = { id: string; employee_code: string; full_name: string | null }
export type LegacyLine = { id: string; payroll_id: string; session_id: string | null; earned_on: string; earning_type: string; duration_hours: Amount; rate: Amount; amount: Amount }
export type LegacyAdjustment = { id: string; payroll_id: string; kind: string; amount: Amount; reason: string; created_by: string; approved_by: string | null }
export type Catalog = { code: string; name: string }
export type Event = { id: string; status: string; note: string | null; actor_id: string | null; created_at: string; event_type: string | null; override_reason: string | null }
export type Finding = { code: string; message: string; severity: 'error' | 'warning' | 'info'; configId?: string }
export type SourceRow = { id: string; label: string; code: string; configured: string; calculated: string; range: string; state: string }
export type DetailLine = { id: string; label: string; code: string; category: string; date: string; quantity: string; rate: string; amount: string; source: string; sessionId: string | null }
export type DetailAction = { id: string; label: string; amount: string; reason: string; state: string; source: string; approved: string }
export type MoneyFields = { base: string | null; teaching: string | null; other: string | null; earnings: string | null; insurance: string | null; otherDeductions: string | null; deductions: string | null; reimbursements: string | null; adjustment: string | null; net: string | null }
export type RowView = MoneyFields & { id: string; recipientId: string | null; employeeId: string | null; teacherId: string | null; name: string; employeeCode: string; payType: string; currency: string; engine: string; isV2: boolean; findings: Finding[]; sources: SourceRow[]; lines: DetailLine[]; actions: DetailAction[]; hours: string; label: string; tone: 'error' | 'warning' | 'neutral'; sourceAvailable: boolean }
export type MissingPay = { employeeId: string; name: string; employeeCode: string; message: string }
export type Workspace = { head: Head; branchName: string; rows: RowView[]; missingPay: MissingPay[]; events: Event[]; evidenceError: boolean; eventsError: boolean; readAt: string; currencyOptions: string[] }

export const labels: Record<string, string> = {
  BASE_SALARY: 'Lương tháng', FIXED_PAY: 'Lương cố định (cũ)', POSITION_PAY: 'Lương vị trí', TEACHING_PER_SESSION: 'Lương theo buổi', BUSINESS_TRIP_ALLOWANCE: 'Trợ cấp công tác', SOCIAL_INSURANCE: 'Bảo hiểm xã hội (cũ)', LABOR_INSURANCE: 'Bảo hiểm lao động (cũ)', SOCIAL_LABOR_INSURANCE: 'BHXH+BHLĐ', BONUS: 'Thưởng', TRAVEL_EXPENSE: 'Công tác phí', RETROACTIVE_PAY: 'Truy lĩnh kỳ trước',
}
export const statusLabels: Record<string, string> = { DRAFT: 'Bản nháp', GENERATED: 'Đã tính', REVIEW: 'Đang kiểm tra', APPROVED: 'Đã duyệt', FINALIZED: 'Đã chốt' }
export const typeLabels: Record<string, string> = { MONTHLY: 'Lương tháng', PER_SESSION: 'Theo buổi', HOURLY: 'Theo giờ (dữ liệu cũ)', COMPONENT_V2: 'Theo thành phần' }
const INSURANCE = new Set(['SOCIAL_INSURANCE', 'LABOR_INSURANCE', 'SOCIAL_LABOR_INSURANCE'])
const ZERO = BigInt(0)
const HUNDRED = BigInt(100)

/** Decimal strings remain exact. Unsupported/unsafe numbers are unknown, not zero. */
export function cents(value: Amount): bigint | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) return null
  const s = String(value).trim()
  if (!/^-?\d{1,20}(?:\.\d{1,2})?$/.test(s)) return null
  const negative = s.startsWith('-'); const [whole, decimal = ''] = s.replace(/^-/, '').split('.')
  const n = BigInt(whole) * HUNDRED + BigInt(decimal.padEnd(2, '0'))
  return negative ? -n : n
}
export function decimal(value: bigint | null): string | null {
  if (value === null) return null
  const positive = value < ZERO ? -value : value
  return `${value < ZERO ? '-' : ''}${positive / HUNDRED}.${String(positive % HUNDRED).padStart(2, '0')}`
}
export function amount(value: Amount): string | null { return decimal(cents(value)) }
export function total(values: Amount[]): string | null {
  let result = ZERO
  for (const value of values) { const n = cents(value); if (n === null) return null; result += n }
  return decimal(result)
}
export function subtract(a: Amount, b: Amount): string | null {
  const x = cents(a), y = cents(b); return x === null || y === null ? null : decimal(x - y)
}
export function formatMoney(value: Amount, currency?: string): string {
  const n = cents(value); if (n === null) return '—'
  const abs = n < ZERO ? -n : n
  const fraction = String(abs % HUNDRED).padStart(2, '0').replace(/0+$/, '')
  const formatted = `${n < ZERO ? '−' : ''}${String(abs / HUNDRED).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${fraction ? ',' + fraction : ''}`
  return formatted + (currency ? ` ${currency}` : '')
}
export function quantity(value: Amount): string { const n = Number(value); return value == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(n) }
export function dateText(value: string | null | undefined): string { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : '—' }
export function timeText(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Chưa có thời điểm'
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
export function label(code: string, catalog: Catalog[] = []): string { return (Object.prototype.hasOwnProperty.call(labels, code) ? labels[code] : undefined) || catalog.find(c => c.code === code)?.name || code }
export function overlaps(a: Pick<Config, 'effective_from' | 'effective_to'>, b: Pick<Config, 'effective_from' | 'effective_to'>): boolean { return a.effective_from <= (b.effective_to || '9999-12-31') && b.effective_from <= (a.effective_to || '9999-12-31') }
function snapshot(line: Line): Record<string, unknown> | null { const raw = line.source_snapshot?.component_config; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null }
function equalAmount(a: unknown, b: unknown): boolean { return cents(a as Amount) !== null && cents(a as Amount) === cents(b as Amount) }
function inRange(config: Config, date: string): boolean { return config.effective_from <= date && (!config.effective_to || config.effective_to >= date) }
function isPartial(config: Config, head: Head): boolean { return config.effective_from > head.starts_on || Boolean(config.effective_to && config.effective_to < head.ends_on) }
function configuredText(config: Config): string {
  if (config.calculation_method === 'FIXED_AMOUNT') return config.currency ? formatMoney(config.amount, config.currency) : 'Thiếu tiền tệ'
  if (['PER_SESSION', 'PER_HOUR'].includes(config.calculation_method)) return config.currency ? `${formatMoney(config.rate, config.currency)} / ${config.calculation_method === 'PER_SESSION' ? 'buổi' : 'giờ'}` : 'Thiếu tiền tệ'
  return 'Phương pháp cần kiểm tra'
}
export function projectRow(pay: Pay, head: Head, allConfigs: Config[], allLines: Line[], allActions: PeriodAction[], names: EmployeeName[], catalog: Catalog[], sourceAvailable = true, legacyLines: LegacyLine[] = [], legacyAdjustments: LegacyAdjustment[] = []): RowView {
  const isV2 = Boolean(pay.calculation_version?.startsWith('PAYROLL_V2'))
  const configs = allConfigs.filter(c => c.employee_id === pay.employee_id && c.branch_id === head.branch_id && c.status === 'ACTIVE' && overlaps(c, { effective_from: head.starts_on, effective_to: head.ends_on }))
  const lines = allLines.filter(l => l.payroll_id === pay.id)
  const actions = allActions.filter(a => a.period_id === head.id && a.employee_id === pay.employee_id)
  const active = actions.filter(a => a.status === 'ACTIVE')
  const findings: Finding[] = []
  const finding = (code: string, message: string, severity: Finding['severity'], configId?: string) => { if (!findings.some(f => f.code === code && f.configId === configId && f.message === message)) findings.push({ code, message, severity, configId }) }
  const base = amount(pay.base_salary), teaching = amount(pay.hourly_earnings), adjustment = amount(pay.adjustment_amount)
  const earnings = isV2 ? amount(pay.v2_earnings_amount) : total([base, teaching])
  const deductions = isV2 ? amount(pay.v2_deduction_amount) : null
  const reimbursements = isV2 ? amount(pay.v2_reimbursement_amount) : null
  const net = amount(isV2 ? pay.v2_net_amount : pay.gross_amount)
  let other = isV2 ? subtract(earnings, total([base, teaching])) : '0.00'
  let insurance = isV2 && sourceAvailable ? total(lines.filter(l => l.category === 'DEDUCTION' && INSURANCE.has(l.component_code)).map(l => l.currency === pay.currency ? l.amount : null)) : null
  let otherDeductions = isV2 && sourceAvailable ? subtract(deductions, insurance) : null
  if ([base, teaching, earnings, net, adjustment].some(v => v === null) || (isV2 && [deductions, reimbursements].some(v => v === null))) finding('MONEY_UNKNOWN', 'Bản tính có giá trị tiền thiếu hoặc không đọc chính xác được. Không thay bằng 0.', 'error')
  if (pay.period_id !== head.id || pay.branch_id !== head.branch_id) finding('HEADER_SCOPE', 'Bản tính không khớp kỳ hoặc chi nhánh đang xem.', 'error')
  if (!/^[A-Z]{3}$/.test(pay.currency)) finding('CURRENCY', 'Bản tính thiếu tiền tệ hợp lệ. Không cộng chung với loại tiền khác.', 'error')
  if (other !== null && cents(other)! < ZERO) { other = null; finding('EARNING_SPLIT', 'Thu nhập tổng không khớp phần lương tháng và tiền dạy. Cần đối soát dữ liệu đã tính.', 'error') }
  if (otherDeductions !== null && cents(otherDeductions)! < ZERO) { insurance = null; otherDeductions = null; finding('DEDUCTION_SPLIT', 'Chi tiết bảo hiểm vượt tổng khấu trừ đã lưu. Cần đối soát.', 'error') }
  if (isV2 && !sourceAvailable) finding('SOURCE_UNAVAILABLE', 'Không tải đủ chi tiết nguồn; các tổng ở đây vẫn là số đã lưu. Chưa thể đối chiếu cấu hình.', 'error')
  if (isV2 && !pay.employee_id) finding('STAFF_MISSING', 'Bản V2 chưa gắn hồ sơ nhân viên. Cần kiểm tra liên kết.', 'error')
  if (!isV2) finding('LEGACY', 'Bản tính theo cơ chế cũ. Không suy ra BHXH+BHLĐ hoặc hoàn trả từ dữ liệu V2.', 'info')
  if (head.status === 'DRAFT' && net !== null) finding('DRAFT_OLD_RESULT', 'Kỳ đang nháp; đây là bản tính đã lưu trước đó, không phải kết quả mới.', 'warning')
  if (isV2 && sourceAvailable) {
    for (const config of configs) {
      const matching = lines.filter(l => l.component_config_id === config.id)
      if (!['FIXED_AMOUNT', 'PER_SESSION'].includes(config.calculation_method)) finding('METHOD', `${label(config.component_code, catalog)}: phương pháp hiện chưa được engine V2.1 hỗ trợ.`, 'error', config.id)
      if (config.calculation_method === 'FIXED_AMOUNT') {
        if (isPartial(config, head)) finding('PARTIAL_FIXED', `${label(config.component_code, catalog)}: hiệu lực ${dateText(config.effective_from)} → ${dateText(config.effective_to) === '—' ? 'không giới hạn' : dateText(config.effective_to)} không phủ trọn kỳ.`, 'error', config.id)
        if (!matching.length) finding('NEW_CONFIG', `${label(config.component_code, catalog)} đã có cấu hình nhưng chưa có dòng tính tương ứng.`, 'warning', config.id)
      }
      if (config.currency !== pay.currency) finding('CONFIG_CURRENCY', `${label(config.component_code, catalog)} khác tiền tệ của bản tính.`, 'error', config.id)
    }
    for (let i = 0; i < configs.length; i++) for (let j = i + 1; j < configs.length; j++) {
      const a = configs[i], b = configs[j]
      const conflict = a.component_code === b.component_code && (a.calculation_method !== 'PER_SESSION' || !a.class_type || !b.class_type || a.class_type === b.class_type)
      const insuranceConflict = INSURANCE.has(a.component_code) && INSURANCE.has(b.component_code) && [a.component_code, b.component_code].includes('SOCIAL_LABOR_INSURANCE')
      if ((conflict || insuranceConflict) && overlaps(a, b)) finding('OVERLAP', `Có cấu hình giao nhau: ${label(a.component_code, catalog)} / ${label(b.component_code, catalog)}. Không cộng hoặc chuyển đổi tự động.`, 'error', a.id)
    }
    for (const line of lines) {
      const current = configs.find(c => c.id === line.component_config_id)
      const old = snapshot(line)
      if (!current) finding('REMOVED_CONFIG', `${label(line.component_code, catalog)} đã được tính nhưng cấu hình nguồn không còn trong phạm vi đang áp dụng.`, 'warning', line.component_config_id)
      else {
        if (!old) finding('SNAPSHOT_UNKNOWN', `${label(line.component_code, catalog)} thiếu bản lưu cấu hình lúc tính; chưa thể đối chiếu đầy đủ.`, 'warning', current.id)
        const oldValue = current.calculation_method === 'FIXED_AMOUNT' ? old?.amount ?? line.unit_rate : old?.rate ?? line.unit_rate
        const value = current.calculation_method === 'FIXED_AMOUNT' ? current.amount : current.rate
        if (!equalAmount(oldValue, value) || current.currency !== line.currency || current.component_code !== line.component_code || current.calculation_method !== line.calculation_method || (old && (old.effective_from !== current.effective_from || (old.effective_to ?? null) !== current.effective_to || (old.class_type ?? null) !== current.class_type)) || (line.source_type === 'SESSION' && !inRange(current, line.earned_on))) finding('CHANGED_CONFIG', `${label(line.component_code, catalog)}: cấu hình hiện tại khác nguồn đã dùng khi tính.`, 'warning', current.id)
      }
      if (line.employee_id !== pay.employee_id) finding('LINE_EMPLOYEE', 'Dòng nguồn không khớp nhân viên của bản tính.', 'error')
      if (line.currency !== pay.currency) finding('LINE_CURRENCY', 'Chi tiết dòng tính không cùng tiền tệ với bản tổng.', 'error')
    }
    if (active.some(a => a.currency !== pay.currency)) finding('ACTION_CURRENCY', 'Khoản phát sinh khác tiền tệ với bản tổng.', 'error')
    const lineEarnings = total([...lines.filter(l => l.category === 'EARNING').map(l => l.amount), ...active.filter(a => a.category === 'EARNING').map(a => a.amount)])
    const lineReimbursements = total([...lines.filter(l => l.category === 'REIMBURSEMENT').map(l => l.amount), ...active.filter(a => a.category === 'REIMBURSEMENT').map(a => a.amount)])
    const lineDeductions = total(lines.filter(l => l.category === 'DEDUCTION').map(l => l.amount))
    const baseFromLines = total(lines.filter(l => l.component_code === 'BASE_SALARY' && l.category === 'EARNING').map(l => l.amount))
    const teachingFromLines = total(lines.filter(l => l.component_code === 'TEACHING_PER_SESSION' && l.category === 'EARNING').map(l => l.amount))
    if (!equalAmount(base, baseFromLines) || !equalAmount(teaching, teachingFromLines)) finding('BREAKDOWN_MISMATCH', 'Phân tách lương tháng hoặc tiền dạy chưa khớp các dòng nguồn. Không lấy phần chênh lệch để bù tự động.', 'error')
    if (!equalAmount(earnings, lineEarnings) || !equalAmount(reimbursements, lineReimbursements) || !equalAmount(deductions, lineDeductions) || !equalAmount(net, subtract(total([earnings, reimbursements, adjustment]), deductions))) finding('TOTAL_MISMATCH', 'Tổng đã lưu chưa khớp chi tiết nguồn đọc được. Không thay tổng bằng số tự tính trên giao diện.', 'error')
  }
  const sources: SourceRow[] = sourceAvailable && isV2 ? configs.map(c => {
    const matching = lines.filter(l => l.component_config_id === c.id)
    const own = findings.filter(f => f.configId === c.id)
    return { id: c.id, label: label(c.component_code, catalog), code: c.component_code, configured: configuredText(c), calculated: matching.length ? formatMoney(total(matching.map(l => l.amount)), pay.currency) : 'Chưa có dòng tính', range: `${dateText(c.effective_from)} → ${c.effective_to ? dateText(c.effective_to) : 'Đến khi điều chỉnh'}`, state: own.some(f => f.code === 'PARTIAL_FIXED') ? 'Chưa phủ trọn kỳ' : own.some(f => f.severity !== 'info') ? 'Cần đối chiếu' : c.calculation_method === 'PER_SESSION' && !matching.length ? 'Chưa có buổi trong bản tính' : 'Có trong bản tính' }
  }) : []
  const employee = names.find(n => n.id === pay.employee_id)
  const tone = findings.some(f => f.severity === 'error') ? 'error' : findings.some(f => f.severity === 'warning') ? 'warning' : 'neutral'
  return { id: pay.id, recipientId: pay.employee_id || pay.teacher_id, employeeId: pay.employee_id, teacherId: pay.teacher_id, name: pay.teacher_name || employee?.full_name || 'Chưa có tên', employeeCode: employee?.employee_code || '', payType: pay.pay_type, currency: pay.currency, engine: pay.calculation_version || pay.pay_type, isV2, base, teaching, other, earnings, insurance, otherDeductions, deductions, reimbursements, adjustment, net, findings, sources, sourceAvailable,
    label: tone === 'error' ? 'Cần xử lý' : tone === 'warning' ? 'Cần đối chiếu' : isV2 ? 'Có bản tính' : 'Dữ liệu cũ', tone, hours: quantity(pay.teaching_hours),
    lines: isV2 ? lines.map(l => ({ id: l.id, label: label(l.component_code, catalog), code: l.component_code, category: l.category === 'EARNING' ? 'Thu nhập' : l.category === 'DEDUCTION' ? 'Khấu trừ' : 'Hoàn trả', date: dateText(l.earned_on), quantity: quantity(l.quantity), rate: formatMoney(l.unit_rate, l.currency), amount: formatMoney(l.amount, l.currency), source: l.source_type === 'SESSION' ? 'Buổi dạy đã tính' : 'Cấu hình lúc tính', sessionId: l.source_session_id })) : legacyLines.filter(l => l.payroll_id === pay.id).map(l => ({ id: l.id, label: l.earning_type, code: l.earning_type, category: 'Thu nhập theo cơ chế cũ', date: dateText(l.earned_on), quantity: quantity(l.duration_hours) + ' giờ', rate: formatMoney(l.rate, pay.currency), amount: formatMoney(l.amount, pay.currency), source: 'Dòng V1 đã lưu', sessionId: l.session_id })),
    actions: [...actions.map(a => ({ id: a.id, label: label(a.component_code, catalog), amount: formatMoney(a.amount, a.currency), reason: a.reason, state: a.status === 'ACTIVE' ? 'Đang áp dụng' : 'Đã hủy', source: a.source_type === 'EXPENSE_CLAIM' ? 'Bảng kê đã duyệt • ' + a.source_expense_claim_id : 'Khoản phát sinh theo kỳ', approved: a.approved_at ? 'Đã duyệt cùng kỳ' : 'Chưa duyệt cùng kỳ' })), ...legacyAdjustments.filter(a => a.payroll_id === pay.id).map(a => ({ id: a.id, label: 'Điều chỉnh cũ · ' + a.kind, amount: formatMoney(a.amount, pay.currency), reason: a.reason, state: 'Dữ liệu cũ', source: 'Người lập: ' + a.created_by, approved: a.approved_by ? 'Đã duyệt' : 'Chưa duyệt' }))] }
}
export function summarize(rows: MoneyFields[]): MoneyFields {
  const keys: (keyof MoneyFields)[] = ['base', 'teaching', 'other', 'earnings', 'insurance', 'otherDeductions', 'deductions', 'reimbursements', 'adjustment', 'net']
  return Object.fromEntries(keys.map(key => [key, rows.length ? total(rows.map(row => row[key])) : null])) as MoneyFields
}
export function filterRows(rows: RowView[], query: string, type: string, currency: string): RowView[] {
  const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
  const q = normalized(query.trim().slice(0, 100))
  return rows.filter(r => (!q || normalized(r.name + ' ' + r.employeeCode).includes(q)) && (!type || r.payType === type) && (!currency || r.currency === currency))
}
