/** Server-side, authenticated reads only. Keep all RPC writes in the existing actions. */
import type { DB } from '../../finance/query'
import { uuidPattern, pageNumber, type Params } from '../../finance/operations'
import { payrollFields } from '../data'
import { projectRow, summarize, type Head, type Pay, type Config, type Line, type PeriodAction, type Catalog, type EmployeeName, type LegacyLine, type LegacyAdjustment, type Event, type Workspace } from './model'

export const headFields = 'id,branch_id,starts_on,ends_on,status,version,generated_by,approved_by,finalized_by,generated_at'
const configFields = 'id,employee_id,branch_id,component_code,calculation_method,amount,rate,currency,class_type,effective_from,effective_to,status'
const lineFields = 'id,payroll_id,employee_id,component_config_id,component_code,category,calculation_method,source_type,source_session_id,earned_on,quantity,unit_rate,amount,currency,source_snapshot'
const actionFields = 'id,period_id,employee_id,component_code,category,source_type,source_expense_claim_id,amount,currency,reason,status,created_at,approved_at'
const states = ['DRAFT', 'GENERATED', 'REVIEW', 'APPROVED', 'FINALIZED']
export type ReadResult<T> = { data: T[] | null; error: unknown; count: number | null }

/** Uses exact count and advances by actual response size (including server row caps). */
export async function readComplete<T extends { id: string }>(page: (from: number, to: number) => PromiseLike<ReadResult<T>>, maximum = 50000): Promise<T[]> {
  const output: T[] = [], ids = new Set<string>()
  let expected: number | null = null
  for (let offset = 0; ; ) {
    const result = await page(offset, offset + 499)
    if (result.error || !Array.isArray(result.data) || result.count == null || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error('PAYROLL_SOURCE_READ_INCOMPLETE')
    if (result.count > maximum) throw new Error('PAYROLL_SOURCE_REQUIRES_NARROWER_SCOPE')
    if (expected !== null && result.count !== expected) throw new Error('PAYROLL_SOURCE_CHANGED_DURING_READ')
    expected = result.count
    for (const row of result.data) {
      if (!row.id || ids.has(row.id)) throw new Error('PAYROLL_SOURCE_DUPLICATE_PAGE')
      ids.add(row.id); output.push(row)
    }
    offset += result.data.length
    if (offset > expected) throw new Error('PAYROLL_SOURCE_COUNT_MISMATCH')
    if (offset === expected) return output
    if (!result.data.length) throw new Error('PAYROLL_SOURCE_TRUNCATED')
  }
}
async function byIds<T extends { id: string }>(ids: string[], run: (batch: string[], from: number, to: number) => PromiseLike<ReadResult<T>>): Promise<T[]> {
  const unique = [...new Set(ids)], output: T[] = []
  for (let i = 0; i < unique.length; i += 80) {
    const batch = unique.slice(i, i + 80)
    output.push(...await readComplete((from, to) => run(batch, from, to)))
  }
  return output
}
export async function branchOptions(db: DB): Promise<{ id: string; name: string }[]> {
  return readComplete((from, to) => db.from('branches').select('id,name', { count: 'exact' }).order('name').order('id').range(from, to).returns<{ id: string; name: string }[]>())
}
export async function readHead(db: DB, id: string): Promise<Head | null> {
  if (!uuidPattern.test(id)) return null
  const result = await db.from('payroll_periods').select(headFields).eq('id', id).maybeSingle<Head>()
  if (result.error) throw new Error('PAYROLL_HEAD_UNAVAILABLE')
  return result.data
}
export type IndexRow = { head: Head; branch: string; count: number; currencyTotals: { currency: string; earnings: string | null; deductions: string | null; reimbursements: string | null; net: string | null }[] }
export type IndexData = { rows: IndexRow[]; branches: { id: string; name: string }[]; page: number; more: boolean; count: number }
export async function loadIndex(db: DB, p: Params): Promise<IndexData> {
  const page = pageNumber(p.page)
  let query = db.from('payroll_periods').select(headFields, { count: 'exact' })
  if (uuidPattern.test(p.branch || '')) query = query.eq('branch_id', p.branch!)
  if (states.includes(p.status || '')) query = query.eq('status', p.status!)
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month || '')) query = query.eq('starts_on', p.month + '-01')
  const [result, branches] = await Promise.all([query.order('starts_on', { ascending: false }).order('id').range((page - 1) * 25, page * 25 - 1).returns<Head[]>(), branchOptions(db)])
  if (result.error || !result.data || result.count == null) throw new Error('PAYROLL_INDEX_UNAVAILABLE')
  if (result.data.length < Math.min(25, Math.max(0, result.count - (page - 1) * 25))) throw new Error('PAYROLL_INDEX_TRUNCATED')
  // These totals deliberately do not use the legacy-only breakdown in payroll_period_summary.
  const payrolls = await byIds<Pay>(result.data.map(h => h.id), (batch, from, to) => db.from('teacher_payrolls').select(payrollFields, { count: 'exact' }).in('period_id', batch).order('id').range(from, to).returns<Pay[]>())
  return { branches, page, count: result.count, more: page * 25 < result.count, rows: result.data.map(head => {
    const records = payrolls.filter(p => p.period_id === head.id)
    return { head, branch: branches.find(b => b.id === head.branch_id)?.name || 'Chi nhánh chưa đọc được tên', count: records.length, currencyTotals: [...new Set(records.map(r => r.currency))].sort().map(currency => {
      const group = records.filter(r => r.currency === currency)
      const projected = group.map(pay => projectRow(pay, head, [], [], [], [], [], false))
      const summary = summarize(projected)
      return { currency, earnings: summary.earnings, deductions: summary.deductions, reimbursements: summary.reimbursements, net: summary.net }
    }) }
  }) }
}
export async function loadWorkspace(db: DB, id: string): Promise<Workspace | null> {
  const head = await readHead(db, id)
  if (!head) return null
  const [payrolls, bs] = await Promise.all([
    readComplete<Pay>((from, to) => db.from('teacher_payrolls').select(payrollFields, { count: 'exact' }).eq('period_id', id).order('teacher_name').order('id').range(from, to).returns<Pay[]>()),
    branchOptions(db),
  ])
  let configs: Config[] = [], lines: Line[] = [], actions: PeriodAction[] = [], names: EmployeeName[] = [], catalog: Catalog[] = [], events: Event[] = []
  let legacyLines: LegacyLine[] = [], legacyAdjustments: LegacyAdjustment[] = []
  let evidenceError = false, eventsError = false
  // A failed evidence read never erases already-loaded header totals or pretends to be empty.
  try {
    const loaded = await Promise.all([
      readComplete<Config>((from, to) => db.from('staff_compensation_components').select(configFields, { count: 'exact' }).eq('branch_id', head.branch_id).eq('status', 'ACTIVE').lte('effective_from', head.ends_on).or(`effective_to.is.null,effective_to.gte.${head.starts_on}`).order('id').range(from, to).returns<Config[]>()),
      byIds<Line>(payrolls.filter(p => p.calculation_version?.startsWith('PAYROLL_V2')).map(p => p.id), (batch, from, to) => db.from('payroll_component_lines_v2').select(lineFields, { count: 'exact' }).in('payroll_id', batch).order('id').range(from, to).returns<Line[]>()),
      readComplete<PeriodAction>((from, to) => db.from('payroll_period_actions_v2').select(actionFields, { count: 'exact' }).eq('period_id', id).order('created_at').order('id').range(from, to).returns<PeriodAction[]>()),
    ])
    ;[configs, lines, actions] = loaded
    ;[legacyLines, legacyAdjustments] = await Promise.all([
      byIds<LegacyLine>(payrolls.filter(p => !p.calculation_version?.startsWith('PAYROLL_V2')).map(p => p.id), (batch, from, to) => db.from('payroll_earning_lines').select('id,payroll_id,session_id,earned_on,earning_type,duration_hours,rate,amount', { count: 'exact' }).in('payroll_id', batch).order('id').range(from, to).returns<LegacyLine[]>()),
      byIds<LegacyAdjustment>(payrolls.map(p => p.id), (batch, from, to) => db.from('payroll_adjustments').select('id,payroll_id,kind,amount,reason,created_by,approved_by', { count: 'exact' }).in('payroll_id', batch).order('id').range(from, to).returns<LegacyAdjustment[]>()),
    ])
    names = await byIds<EmployeeName>([...payrolls.map(p => p.employee_id).filter((id): id is string => Boolean(id)), ...configs.map(c => c.employee_id)], (batch, from, to) => db.from('employee_directory').select('id,employee_code,full_name', { count: 'exact' }).in('id', batch).order('id').range(from, to).returns<EmployeeName[]>())
    // Labels have a local fallback; failure here must not fabricate money or block reads.
    const c = await db.from('payroll_component_catalog').select('code,name').order('code').limit(1000).returns<Catalog[]>()
    if (!c.error && c.data) catalog = c.data
  } catch {
    evidenceError = true; configs = []; lines = []; actions = []; names = []; legacyLines = []; legacyAdjustments = []
  }
  try {
    const e = await db.from('payroll_events').select('id,status,note,actor_id,created_at,event_type,override_reason').eq('period_id', id).order('created_at', { ascending: false }).order('id').limit(50).returns<Event[]>()
    if (e.error || !e.data) throw new Error('EVENTS_UNAVAILABLE')
    events = e.data
  } catch { eventsError = true }
  const fresh = await readHead(db, id)
  if (!fresh || fresh.version !== head.version || fresh.status !== head.status) throw new Error('PAYROLL_CHANGED_DURING_READ')
  const rows = payrolls.map(p => projectRow(p, head, configs, lines, actions, names, catalog, !evidenceError, legacyLines, legacyAdjustments))
  const existing = new Set(payrolls.map(p => p.employee_id).filter(Boolean))
  const missingPay = [...new Set(configs.map(c => c.employee_id))].filter(eid => !existing.has(eid)).map(employeeId => {
    const name = names.find(n => n.id === employeeId)
    return { employeeId, name: name?.full_name || 'Nhân viên chưa có bản tính', employeeCode: name?.employee_code || '', message: ['APPROVED','FINALIZED'].includes(head.status) ? 'Nhân viên có nguồn lương thuộc kỳ này nhưng không có bản tính trong kỳ đã duyệt/chốt. Không mở lại kỳ nguồn; hãy tạo hồ sơ truy lĩnh.' : 'Có cấu hình giao kỳ nhưng chưa có bản tính. Cần kiểm tra điều kiện nhân sự và tính lương; không tự coi là đã được trả.' }
  })
  return { head, branchName: bs.find(b => b.id === head.branch_id)?.name || 'Chi nhánh chưa đọc được tên', rows, missingPay, events, evidenceError, eventsError, readAt: new Date().toISOString(), currencyOptions: [...new Set(rows.map(r => r.currency))].sort() }
}
