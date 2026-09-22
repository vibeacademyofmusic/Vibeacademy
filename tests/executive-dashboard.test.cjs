/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const now = new Date('2026-09-22T03:00:00.000Z')
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

function metric(value) {
  return { code: 'TEST', value, status: 'AVAILABLE', reason: null, source_codes: [], as_of_type: 'PERIOD', known_source_count: 1, unresolved_source_count: 0 }
}

function report() {
  return {
    currency: 'VND',
    cash_flow: { tuition_cash_in: metric(1500000) },
    receivables: { current_tuition_receivable: metric(200000), opening_receivable_current: metric(300000) },
    pnl: { operating_expense: metric(50000) },
    previous_period: { changes: { tuition_cash_in: { amount: 100000, pct: null } } },
  }
}

function fixtures() {
  return {
    branches: [{ id: 'branch-a', name: 'Cần Thơ', status: 'ACTIVE' }],
    students: [
      { id: 'student-active', status: 'ACTIVE', admission_date: '2026-09-10' },
      { id: 'student-graduated', status: 'GRADUATED', admission_date: '2026-08-01' },
    ],
    session_actual_teachers: [
      { session_id: 'session-today', branch_id: 'branch-a', status: 'SCHEDULED', occurrence_type: 'MAKEUP', teacher_id: null, occurrence_date: today },
      { session_id: 'session-old', branch_id: 'branch-a', status: 'COMPLETED', occurrence_type: 'REGULAR', teacher_id: 'teacher-a', occurrence_date: '2026-09-21' },
    ],
    attendance_records: [
      { id: 'mark-today', status: 'PRESENT', session_occurrence_id: 'session-today' },
      { id: 'mark-old', status: 'ABSENT', session_occurrence_id: 'session-old' },
      { id: 'mark-unknown', status: 'UNMARKED', session_occurrence_id: 'session-today' },
    ],
    enrollment_pauses: [{ id: 'pause-1', enrollment_id: 'enrollment-1', status: 'ACTIVE', starts_on: '2026-09-01', ends_on: '2026-09-30' }],
    tuition_reminders: [{ id: 'reminder-1', status: 'PENDING' }],
    student_retention_alerts: [{ id: 'alert-1', branch_id: 'branch-a', status: 'NEW' }],
    learning_reports: [{ id: 'report-1', status: 'READY_FOR_REVIEW' }],
    learning_assessment_attempts: [{ id: 'attempt-1', state: 'PENDING_REVIEW' }],
    lesson_feedback: [{ id: 'feedback-1', is_low_rating: true, resolution_status: 'NEEDS_REVIEW' }],
    payroll_periods: [{ id: 'period-1', status: 'REVIEW' }],
    learning_access_grants: [
      { id: 'grant-live', revoked_at: null, valid_from: '2026-01-01T00:00:00.000Z', valid_until: '2026-12-01T00:00:00.000Z' },
      { id: 'grant-ended', revoked_at: null, valid_from: '2026-01-01T00:00:00.000Z', valid_until: '2026-09-01T00:00:00.000Z' },
    ],
    employee_attendance_current: [{ id: 'staff-1', work_date: today, status: 'LATE' }],
    employee_attendance_requests: [{ id: 'request-open' }, { id: 'request-done' }],
    employee_attendance_reviews: [{ id: 'review-1', request_id: 'request-done' }],
    invoice_receivables: [{ invoice_id: 'invoice-1', branch_id_snapshot: 'branch-a', currency: 'VND', outstanding_balance: 400000, is_overdue: true }],
  }
}

function loadDashboard(options = {}) {
  const calls = []
  const rows = options.rows ?? fixtures()
  const failing = new Set(options.failing ?? [])
  const db = {
    auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ rpc: name, args })
      if (name === 'has_role') return { data: true, error: null }
      if (name === 'get_financial_management_report') return { data: options.report === undefined ? report() : options.report, error: options.reportError ?? null }
      if (name === 'crm_business_snapshot') return { data: options.crm ?? [
        { metric: 'follow_up_overdue', value: 2 },
        { metric: 'follow_up_today', value: 1 },
        { metric: 'uncontacted', value: 4 },
        { metric: 'trial_today', value: 0 },
      ], error: options.crmError ?? null }
      return { data: null, error: null }
    },
    from(table) {
      const call = { table, filters: [], eqs: [] }
      calls.push(call)
      const api = {
        select(fields, selectOptions) { call.fields = fields; call.head = selectOptions?.head === true; return api },
        eq(key, value) { call.eqs.push([key, value]); call.filters.push(row => row[key] === value); return api },
        gte(key, value) { call.filters.push(row => row[key] >= value); return api },
        lte(key, value) { call.filters.push(row => row[key] <= value); return api },
        gt(key, value) { call.filters.push(row => row[key] > value); return api },
        in(key, values) { call.filters.push(row => values.includes(row[key])); return api },
        is(key, value) { call.filters.push(row => row[key] === value); return api },
        order() { return api },
        range(from, to) { call.range = [from, to]; return api },
        then(resolve, reject) {
          if (failing.has(table)) return Promise.resolve({ data: null, count: null, error: { message: 'query failed' } }).then(resolve, reject)
          let data = (rows[table] ?? []).filter(row => call.filters.every(filter => filter(row)))
          const count = data.length
          if (call.range) data = data.slice(call.range[0], call.range[1] + 1)
          return Promise.resolve({ data: call.head ? null : data, count, error: null }).then(resolve, reject)
        },
      }
      return api
    },
  }
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => db },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }) } },
    'next/cache': { revalidatePath() {} },
    'next/link': { default: ({ children, href }) => React.createElement('a', { href }, children) },
  }
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const compiled = { exports: {} }
    const source = fs.readFileSync(file, 'utf8')
    if (file.endsWith('.css')) {
      cache.set(file, { default: new Proxy({}, { get: (_, key) => String(key) }) })
      return cache.get(file)
    }
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText
    const req = name => {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name.startsWith('.') || name.startsWith('@/')) {
        const base = path.resolve(path.dirname(file), name)
        if (fs.existsSync(base + '.ts')) return load(base + '.ts')
        if (fs.existsSync(base + '.tsx')) return load(base + '.tsx')
        if (fs.existsSync(path.join(base, 'index.tsx'))) return load(path.join(base, 'index.tsx'))
      }
      return require(name)
    }
    new Function('require', 'module', 'exports', output)(req, compiled, compiled.exports)
    cache.set(file, compiled.exports)
    return compiled.exports
  }
  return { calls, load, dashboard: load(path.resolve('app/admin/_lib/dashboard-data.ts')), page: load(path.resolve('app/admin/page.tsx')) }
}

test('dashboard source stays on the user client and omits forbidden KPIs', () => {
  const source = fs.readFileSync('app/admin/_lib/dashboard-data.ts', 'utf8') + fs.readFileSync('app/admin/page.tsx', 'utf8')
  assert.doesNotMatch(source, /service_role|SERVICE_ROLE|createServiceClient|supabaseAdmin/)
  assert.doesNotMatch(source, /net_integrated|net_cash|Net cash|Dòng tiền/)
  assert.doesNotMatch(source, /UNMARKED|attendance rate|tỷ lệ chuyên cần/i)
  assert.match(source, /businessDate/)
  assert.match(source, /get_financial_management_report|loadFinancialManagementReport/)
  assert.match(fs.readFileSync('app/admin/layout.tsx', 'utf8'), /has_role/)
  assert.match(fs.readFileSync('app/admin/layout.tsx', 'utf8'), /crm_shell_may_enter/)
})

test('loader uses the Vietnam date, posted-tuition report, and separate receivables', async () => {
  const harness = loadDashboard()
  const data = await harness.dashboard.loadExecutiveDashboard(now)
  const lessonCall = harness.calls.find(call => call.table === 'session_actual_teachers')
  assert.ok(lessonCall.eqs.some(([key, value]) => key === 'occurrence_date' && value === today))
  const financeCall = harness.calls.find(call => call.rpc === 'get_financial_management_report')
  assert.equal(financeCall.args.p_branch, null)
  assert.equal(financeCall.args.p_currency, 'VND')
  assert.equal(financeCall.args.p_month, '2026-09-01')
  assert.equal(data.lessons.total, 1)
  assert.equal(data.lessons.scheduled, 1)
  assert.equal(data.lessons.makeup, 1)
  assert.equal(data.lessons.unassigned, 1)
  assert.equal(data.attendance.present, 1)
  assert.equal(data.attendance.absent, 0)
  assert.equal(data.attendance.late, 0)
  assert.equal(data.attendance.excused, 0)
  assert.equal(data.students.active, 1)
  assert.equal(data.students.graduated, 1)
  assert.equal(data.students.admittedThisMonth, 1)
  assert.equal(data.students.pausedEnrollmentsToday, 1)
  assert.equal(data.finance.collected.text, '1.500.000 VND')
  assert.equal(data.finance.invoiceReceivables.text, '200.000 VND')
  assert.equal(data.finance.openingReceivables.text, '300.000 VND')
  assert.equal(data.finance.overdueReceivables.text, '400.000 VND')
  assert.equal(data.finance.recordedOperatingExpenses.text, '50.000 VND')
  assert.equal(data.finance.collectedChange, 'Chênh so với tháng trước: 100.000 VND')
  assert.equal(data.activeGrants, 1)
  assert.equal(data.staff.pendingRequests, 1)
  assert.equal(data.links.attendance, `/admin/attendance?date=${today}`)
  const html = renderToStaticMarkup(await harness.page.default())
  assert.match(html, /Bảng điều hành VIBE/)
  assert.match(html, /Toàn học viện/)
  assert.match(html, /Học phí đã thu tháng này/)
  assert.match(html, /Tiền học phí đã thu/)
  assert.match(html, /Công nợ hóa đơn đang mở/)
  assert.match(html, /Công nợ mở sổ còn lại/)
  assert.match(html, /Hồ sơ tốt nghiệp/)
  assert.match(html, /Ghi danh đang bảo lưu hôm nay/)
  assert.doesNotMatch(html, /UNMARKED|Dòng tiền|Net cash|Doanh thu ghi nhận/)
  assert.match(html, /\/admin\/finance\/receivables\?receivable=OVERDUE/)
  assert.match(html, /\/admin\/business\/crm\?queue=overdue/)
  assert.match(html, /\/admin\/elearning\/assessments/)
  assert.match(html, /\/admin\/hr\/teaching/)
})

test('zero queues and a failed optional query still render', async () => {
  const empty = loadDashboard({ rows: { branches: [{ id: 'branch-a', name: 'Cần Thơ', status: 'ACTIVE' }] }, crm: [
    { metric: 'follow_up_overdue', value: 0 },
    { metric: 'follow_up_today', value: 0 },
    { metric: 'uncontacted', value: 0 },
    { metric: 'trial_today', value: 0 },
  ], report: { ...report(), cash_flow: { tuition_cash_in: metric(0) }, receivables: { current_tuition_receivable: metric(0), opening_receivable_current: metric(0) }, pnl: { operating_expense: metric(0) }, previous_period: { changes: { tuition_cash_in: { amount: 0, pct: null } } } } })
  const zeros = await empty.dashboard.loadExecutiveDashboard(now)
  const zeroHtml = renderToStaticMarkup(await empty.page.default())
  assert.equal(zeros.needsAction, 0)
  assert.equal(zeros.lessons.total, 0)
  assert.equal(zeros.attendance.present, 0)
  assert.match(zeroHtml, /Không có việc cần xử lý/)
  assert.match(zeroHtml, /Không có hàng đợi đang chờ/)
  assert.match(zeroHtml, />0</)

  const failed = loadDashboard({ failing: ['students'] })
  const partial = await failed.dashboard.loadExecutiveDashboard(now)
  const failedHtml = renderToStaticMarkup(await failed.page.default())
  assert.equal(partial.students.active, null)
  assert.match(failedHtml, /Bảng điều hành VIBE/)
  assert.match(failedHtml, /Không tải được/)
  assert.equal(partial.finance.collected.text, '1.500.000 VND')
})

test('mixed-currency overdue receivables are not shown as zero', async () => {
  const harness = loadDashboard({
    rows: {
      ...fixtures(),
      invoice_receivables: [
        { invoice_id: 'invoice-vnd', branch_id_snapshot: 'branch-a', currency: 'VND', outstanding_balance: 400000, is_overdue: true },
        { invoice_id: 'invoice-usd', branch_id_snapshot: 'branch-a', currency: 'USD', outstanding_balance: 25, is_overdue: true },
      ],
    },
  })
  const data = await harness.dashboard.loadExecutiveDashboard(now)
  const html = renderToStaticMarkup(await harness.page.default())
  assert.equal(data.finance.overdueReceivables.amount, null)
  assert.equal(data.finance.overdueReceivables.text, 'Có nhiều loại tiền, không quy đổi')
  assert.equal(data.finance.overdueInvoiceCount, 2)
  assert.match(html, /Có nhiều loại tiền, không quy đổi/)
  assert.doesNotMatch(html, /Công nợ hóa đơn quá hạn<\/dt><dd>0/)
})
