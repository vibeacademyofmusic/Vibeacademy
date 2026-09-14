/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS harness loads the actual TypeScript server components. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { renderToStaticMarkup } = require('react-dom/server')
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const compiledModule = { exports: {} }
  const localRequire = name => {
    if (name in mocks) return mocks[name]
    if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name + '.ts'), mocks)
    return require(name)
  }
  new Function('require', 'module', 'exports', output)(localRequire, compiledModule, compiledModule.exports)
  return compiledModule.exports
}
const base = path.resolve('app/admin/finance')
const helpers = load(path.join(base, 'data.ts'), { '@/lib/supabase/server': {} })
function client(fixtures = {}, fail = '') {
  const calls = []
  return { calls, from(table) {
    const call = { table, orders: [] }; calls.push(call)
    return {
      select(fields) { call.fields = fields; return this },
      eq(key, value) { call.filter = [key, value]; return this },
      order(key, options) { call.orders.push([key, options]); return this },
      range(from, to) { call.range = [from, to]; return this },
      limit(n) { call.limit = n; return this },
      returns() { return this },
      then(resolve, reject) {
        if (table === fail) return Promise.resolve({ data: null, error: { message: 'SECRET internal SQL' } }).then(resolve, reject)
        let data = fixtures[table] ?? []
        if (call.range) data = data.slice(call.range[0], call.range[1] + 1)
        if (call.limit) data = data.slice(0, call.limit)
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      },
    }
  } }
}
async function render(db) {
  const Page = load(path.join(base, 'page.tsx'), { '@/lib/supabase/server': { createClient: async () => db } }).default
  return renderToStaticMarkup(await Page())
}
test('Vietnam month changes seven hours before UTC month boundary, including new year', () => {
  assert.equal(helpers.vietnamMonth(new Date('2026-08-31T17:00:00Z')), '2026-09-01')
  assert.equal(helpers.vietnamMonth(new Date('2026-08-31T16:59:59Z')), '2026-08-01')
  assert.equal(helpers.vietnamMonth(new Date('2026-12-31T17:00:00Z')), '2027-01-01')
})
test('currency aggregation keeps VND and USD separate and handles numeric strings', () => {
  const rows = [{ currency: 'USD', cash_in: '20.25' }, { currency: 'VND', cash_in: 100000 }, { currency: 'USD', cash_in: 5 }]
  assert.deepEqual(helpers.currencies(rows), ['VND', 'USD'])
  assert.equal(helpers.sum(rows, 'USD', 'cash_in'), 25.25)
  assert.equal(helpers.sum(rows, 'VND', 'cash_in'), 100000)
  assert.match(helpers.money(25.25, 'USD'), /25,25/)
})
test('summary pagination includes all rows and discards incomplete results on page error', async () => {
  const rows = Array.from({ length: 1001 }, () => ({ currency: 'VND', cash_in: 1 }))
  const result = await helpers.readAll((from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }))
  assert.equal(result.length, 1001)
  assert.equal(await helpers.readAll(from => Promise.resolve(from ? { data: null, error: 'failed' } : { data: rows.slice(0, 500), error: null })), null)
  assert.equal(await helpers.readAll(() => Promise.reject(new Error('offline'))), null)
})
test('empty dashboard renders zeros and empty tables without warning or write controls', async () => {
  const html = await render(client())
  assert.match(html, /Chưa có dữ liệu/)
  assert.match(html, /0/)
  assert.doesNotMatch(html, /role="alert"|<form|<button/)
})
test('query failures are isolated, do not expose internals and do not show zero in failed section', async () => {
  const html = await render(client({}, 'branch_monthly_cash_summary'))
  assert.match(html, /role="alert"/)
  assert.match(html, /Không tải được dữ liệu phần này/)
  assert.doesNotMatch(html, /SECRET|internal SQL|Tiền thu tháng này<\/dt>/)
  assert.match(html, /Tổng công nợ<\/dt>/)
})
test('queries select only needed fields, filter monthly cash, sort forecast and cap ledger at 20', async () => {
  const db = client()
  await render(db)
  assert.equal(db.calls.length, 5)
  for (const call of db.calls) assert.ok(!call.fields.includes('*'))
  const cash = db.calls.find(c => c.table === 'branch_monthly_cash_summary')
  assert.deepEqual(cash.filter, ['month_start', helpers.vietnamMonth()])
  const ledger = db.calls.find(c => c.table === 'finance_cash_ledger')
  assert.equal(ledger.limit, 20)
  assert.deepEqual(ledger.orders[0], ['occurred_at', { ascending: false }])
  assert.ok(!ledger.fields.includes('notes') && !ledger.fields.includes('student_id'))
  const forecast = db.calls.find(c => c.table === 'branch_monthly_revenue_forecast')
  assert.deepEqual(forecast.orders.slice(0, 2).map(r => r[0]), ['month_start', 'branch_name'])
})
test('actual page renders both currencies, forecasts, refunds and Vietnam transaction time', async () => {
  const forecast = { currency: 'VND', month_start: '2026-09-01', forecast_period: 'CURRENT_MONTH', expiring_tuition_count: 2, expiring_student_count: 1, projected_renewal_amount: 400000, expected_cash_due: 100000, gross_forecast_opportunity: 500000 }
  const html = await render(client({
    branch_monthly_cash_summary: [{ currency: 'VND', cash_in: 200000, cash_out: 50000, net_cash: 150000 }, { currency: 'USD', cash_in: 20.25, cash_out: 0, net_cash: 20.25 }],
    system_monthly_revenue_forecast: [forecast, { ...forecast, forecast_period: 'NEXT_MONTH', month_start: '2026-10-01' }],
    branch_monthly_revenue_forecast: [{ ...forecast, branch_name: 'Cần Thơ' }],
    finance_cash_ledger: [{ transaction_id: 'r', transaction_number: 'RF-001', transaction_type: 'REFUND', branch_name: 'Cần Thơ', occurred_at: '2026-09-01T00:00:00Z', payment_method: null, currency: 'VND', cash_in: 0, cash_out: 50000, net_cash: -50000 }],
  }))
  assert.match(html, /150\.000/)
  assert.match(html, /20,25/)
  assert.match(html, /500\.000/)
  assert.match(html, /RF-001/)
  assert.match(html, /07:00/)
  assert.match(html, /Hoàn tiền \(REFUND\)/)
  assert.match(html, /-50\.000/)
})
