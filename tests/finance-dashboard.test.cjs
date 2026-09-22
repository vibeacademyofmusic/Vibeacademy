/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS harness loads the actual TypeScript server components. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { renderToStaticMarkup } = require('react-dom/server')
const { resolveModule } = require('./helpers/resolve-module.cjs')
function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const compiledModule = { exports: {} }
  const localRequire = name => {
    if (name in mocks) return mocks[name]
    if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) }
    if (name.startsWith('.') || name.startsWith('@/')) return load(resolveModule(file, name), mocks)
    return require(name)
  }
  new Function('require', 'module', 'exports', output)(localRequire, compiledModule, compiledModule.exports)
  return compiledModule.exports
}
const base = path.resolve('app/admin/finance')
const helpers = load(path.join(base, 'data.ts'), { '@/lib/supabase/server': {} })
function client(fixtures = {}, fail = '') {
  const calls = []
  return { calls, auth: { getClaims: async () => ({ data: { claims: { sub: 'user' } }, error: null }) }, rpc(name, args) {
    calls.push({ rpc: name, args, fields: '' })
    if (name === 'has_role' || name === 'is_global_super_admin') return Promise.resolve({ data: true, error: null })
    if (fail === name) return Promise.resolve({ data: null, error: { message: 'SECRET internal SQL' } })
    return Promise.resolve({ data: fixtures[name] ?? null, error: null })
  }, from(table) {
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
  const Page = load(path.join(base, 'page.tsx'), {
    '@/lib/supabase/server': { createClient: async () => db },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }) } },
    'next/link': { default: ({ children, href }) => require('react').createElement('a', { href }, children) },
  }).default
  return renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }))
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
test('unavailable management report shows the safe error and no write controls', async () => {
  const html = await render(client())
  assert.match(html, /Không tải được báo cáo tài chính quản trị/)
  assert.doesNotMatch(html, /<form|<button|SECRET|internal SQL/)
})
test('query failures are isolated and do not expose internals', async () => {
  const html = await render(client({}, 'get_financial_management_report'))
  assert.match(html, /Không tải được báo cáo tài chính quản trị/)
  assert.doesNotMatch(html, /SECRET|internal SQL/)
})
test('overview loads the canonical report and selects only branch identity fields', async () => {
  const db = client()
  await render(db)
  assert.ok(db.calls.some(call => call.rpc === 'get_financial_management_report'))
  assert.ok(!db.calls.some(call => call.table === 'branch_monthly_cash_summary' || call.table === 'finance_cash_ledger' || call.table === 'invoices' || call.table === 'payments'))
  const branches = db.calls.find(call => call.table === 'branches')
  assert.equal(branches.fields, 'id, name, code')
  for (const call of db.calls) assert.ok(!String(call.fields).includes('*'))
})
