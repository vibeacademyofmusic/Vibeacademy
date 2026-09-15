/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness for actual TypeScript server modules. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const base = path.resolve('app/admin/finance')
function load(file, mocks, cache = new Map()) {
  if (cache.has(file)) return cache.get(file)
  const compiled = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText
  const localRequire = name => {
    if (name in mocks) return mocks[name]
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(file), name)
      return load(fs.existsSync(target + '.ts') ? target + '.ts' : target + '.tsx', mocks, cache)
    }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(localRequire, compiled, compiled.exports)
  cache.set(file, compiled.exports)
  return compiled.exports
}
const id = n => `a0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
function harness(fixtures = {}, rpcError = null, role = true, signedIn = true) {
  const calls = [], invalidated = []
  const db = {
    auth: { getClaims: async () => ({ data: signedIn ? { claims: { sub: id(1) } } : null, error: null }) },
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return name === 'has_role' ? { data: role, error: null } : { data: id(99), error: rpcError } },
    from(table) {
      const call = { table, filters: [], orders: [] }; calls.push(call)
      const query = {
        select(fields) { call.fields = fields; return this },
        eq(key, value) { call.filters.push(r => r[key] === value); return this },
        neq(key, value) { call.filters.push(r => r[key] !== value); return this },
        gt(key, value) { call.filters.push(r => r[key] > value); return this },
        gte(key, value) { call.filters.push(r => r[key] >= value); return this },
        lt(key, value) { call.filters.push(r => r[key] < value); return this },
        lte(key, value) { call.filters.push(r => r[key] <= value); return this },
        not(key, op, value) { call.filters.push(r => r[key] !== value); return this },
        in(key, values) { call.filters.push(r => values.includes(r[key])); return this },
        is() { return this }, or() { return this },
        order(key, options) { call.orders.push([key, options]); return this },
        range(a, b) { call.range = [a, b]; return this }, limit(n) { call.limit = n; return this }, returns() { return this },
        then(resolve, reject) {
          let data = (fixtures[table] ?? []).filter(r => call.filters.every(f => f(r)))
          if (call.range) data = data.slice(call.range[0], call.range[1] + 1)
          if (call.limit) data = data.slice(0, call.limit)
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => db },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }) } },
    'next/cache': { revalidatePath: p => invalidated.push(p) },
    'next/link': { default: ({ children, href }) => React.createElement('a', { href }, children) },
  }
  return { db, calls, invalidated, load: name => load(path.join(base, name), mocks) }
}
function form(values) { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, String(v)); return f }
async function redirected(action, values) {
  try { await action(form(values)); assert.fail('Expected redirect') } catch (e) { assert.ok(e.url, e.stack); return new URL(e.url, 'http://localhost') }
}
const invoice = { invoice_id: id(2), invoice_number: 'INV-TEST', student_id_snapshot: id(1), branch_id_snapshot: id(3), branch_name_snapshot: 'Chi nhánh thử nghiệm', currency: 'VND', total_amount: 1000000, invoice_status: 'ISSUED', receivable_status: 'OVERDUE', issued_on: '2026-09-01', due_on: '2026-09-10', allocated_amount: 200000, gross_allocated_amount: 250000, refunded_amount: 50000, outstanding_balance: 800000, days_overdue: 5 }
const payment = { id: id(4), payment_number: 'PAY-TEST', student_id_snapshot: id(1), branch_id_snapshot: id(3), branch_name_snapshot: 'Chi nhánh thử nghiệm', currency: 'VND', amount: 500000, payment_method: 'CASH', paid_at: '2026-09-15T00:00:00Z', reference: 'REF-TEST', status: 'POSTED' }
function fixture() { return { branches: [{ id: id(3), name: 'Chi nhánh thử nghiệm' }], students: [{ id: id(1), full_name: 'Học viên thử nghiệm', student_code: 'HV01' }], invoice_receivables: [invoice], payments: [payment], payment_allocations: [{ id: id(5), payment_id: id(4), invoice_id: id(2), amount: 250000, invoices: { invoice_number: 'INV-TEST' } }] } }
async function render(h, route, params = {}) { return renderToStaticMarkup(await h.load(route + '/page.tsx').default({ searchParams: Promise.resolve(params) })) }

module.exports = { harness, id, redirected, fixture, render, base, fs, path, renderToStaticMarkup }
