/* Read-only projection/loader tests. No database connection and no payroll mutation. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function transpile(relative, dependencies = {}) {
  const filename = path.join(root, relative)
  const source = fs.readFileSync(filename, 'utf8')
  const result = ts.transpileModule(source, { fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }, reportDiagnostics: true })
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error)
  assert.equal(errors.length, 0, errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('\n'))
  const module = { exports: {} }
  const execute = vm.runInThisContext('(function(require,module,exports){' + result.outputText + '\n})', { filename })
  execute(name => { if (name in dependencies) return dependencies[name]; throw new Error('Unexpected runtime import: ' + name) }, module, module.exports)
  return module.exports
}
const model = transpile('app/admin/payroll/_ux/model.ts')
const loader = transpile('app/admin/payroll/_ux/load.ts', {
  '../../finance/operations': { uuidPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, pageNumber: v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : 1 },
  '../data': { payrollFields: 'id,period_id,employee_id,teacher_id,currency,calculation_version,v2_net_amount' },
  './model': model,
})
const H = '11111111-1111-4111-8111-111111111111', E = '22222222-2222-4222-8222-222222222222', B = '33333333-3333-4333-8333-333333333333'
const head = { id: H, branch_id: B, starts_on: '2026-09-01', ends_on: '2026-09-30', status: 'REVIEW', version: 3, generated_by: 'maker', approved_by: null, finalized_by: null, generated_at: '2026-09-18T12:00:00Z' }
const base = { id: 'base', employee_id: E, branch_id: B, component_code: 'BASE_SALARY', calculation_method: 'FIXED_AMOUNT', amount: '1000.10', rate: null, currency: 'VND', class_type: null, effective_from: '2026-09-01', effective_to: null, status: 'ACTIVE' }
const ins = { ...base, id: 'insurance', component_code: 'SOCIAL_LABOR_INSURANCE', amount: '200.05' }
const pay = { id: 'pay-a', period_id: H, employee_id: E, teacher_id: null, teacher_name: 'Nhân viên kiểm thử', branch_id: B, pay_type: 'MONTHLY', currency: 'VND', base_salary: '1000.10', teaching_hours: '0', hourly_earnings: '0.00', adjustment_amount: '0', gross_amount: '900.10', v2_earnings_amount: '1100.15', v2_deduction_amount: '200.05', v2_reimbursement_amount: '0.00', v2_net_amount: '900.10', calculation_version: 'PAYROLL_V2_1' }
const line = c => ({ id: 'line-' + c.id, payroll_id: pay.id, employee_id: E, component_config_id: c.id, component_code: c.component_code, category: c.id === 'base' ? 'EARNING' : 'DEDUCTION', calculation_method: c.calculation_method, source_type: 'CONFIG', source_session_id: null, earned_on: '2026-09-01', quantity: '1', unit_rate: c.amount, amount: c.amount, currency: c.currency, source_snapshot: { component_config: { ...c } } })
const bonus = { id: 'bonus', period_id: H, employee_id: E, component_code: 'BONUS', category: 'EARNING', source_type: 'MANUAL_BONUS', source_expense_claim_id: null, amount: '100.05', currency: 'VND', reason: 'Khoản kiểm thử', status: 'ACTIVE', created_at: '2026-09-18T13:00:00Z', approved_at: null }
const clone = value => JSON.parse(JSON.stringify(value))
function row(options = {}) { return model.projectRow(options.pay || clone(pay), options.head || clone(head), options.configs || [clone(base), clone(ins)], options.lines || [line(base), line(ins)], options.actions || [clone(bonus)], [], [], options.available !== false, options.legacyLines || [], options.legacyAdjustments || []) }
function has(r, code) { return r.findings.some(f => f.code === code) }

for (const [name, input, expected] of [
  ['decimal .10', '0.10', '10'], ['integer', 40, '4000'], ['negative', '-1.23', '-123'], ['trailing zero', '40.00', '4000'], ['large exact string', '9999999999999999.99', '999999999999999999'],
]) test('money parse ' + name, () => assert.equal(String(model.cents(input)), expected))
for (const value of [null, undefined, '', 'NaN', Infinity, '1e4', '1,000', '1.000.000', '0.123', false, Number.MAX_SAFE_INTEGER]) test('unknown money is not zero: ' + String(value), () => assert.equal(model.cents(value), null))
test('sum decimal exact', () => assert.equal(model.total(['0.10', '0.20']), '0.30'))
test('sum unknown fails closed', () => assert.equal(model.total(['5.00', null]), null))
test('format VND decimal and negative', () => { assert.equal(model.formatMoney('1234567.80', 'VND'), '1.234.567,8 VND'); assert.equal(model.formatMoney('-2.05'), '−2,05'); assert.equal(model.formatMoney(null), '—') })
test('snapshot is not changed by projection', () => { const source = { pay: clone(pay), head: clone(head), configs: [clone(base), clone(ins)], lines: [line(base), line(ins)], actions: [clone(bonus)] }; const before = JSON.stringify(source); row(source); assert.equal(JSON.stringify(source), before) })
test('V2 net always reads stored v2 field, not legacy gross', () => { const r = row({ pay: { ...pay, gross_amount: '999999' } }); assert.equal(r.net, '900.10'); assert.equal(r.earnings, '1100.15'); assert.equal(r.insurance, '200.05') })
test('missing V2 net does not fall back to gross', () => { const r = row({ pay: { ...pay, v2_net_amount: null } }); assert.equal(r.net, null); assert.ok(has(r, 'MONEY_UNKNOWN')) })
test('unchanged sources do not falsely flag modified', () => { const r = row(); assert.equal(r.tone, 'neutral'); assert.equal(r.label, 'Có bản tính'); assert.equal(r.other, '100.05') })
test('new fixed component warns without changing net', () => { const r = row({ configs: [base, ins, { ...base, id: 'position', component_code: 'POSITION_PAY', amount: '300' }] }); assert.ok(has(r, 'NEW_CONFIG')); assert.equal(r.net, '900.10'); assert.equal(r.sources.find(s => s.id === 'position').calculated, 'Chưa có dòng tính') })
test('one-day fixed config is reported', () => assert.ok(has(row({ configs: [base, { ...ins, effective_to: '2026-09-01' }] }), 'PARTIAL_FIXED')))
test('out-of-period config excluded', () => { const r = row({ configs: [base, ins, { ...base, id: 'future', effective_from: '2026-10-01' }] }); assert.equal(r.sources.length, 2) })
test('different branch excluded', () => assert.equal(row({ configs: [base, ins, { ...base, id: 'other', branch_id: 'other' }] }).sources.length, 2))
test('same-code overlapping fixed config flagged', () => assert.ok(has(row({ configs: [base, ins, { ...base, id: 'duplicate' }] }), 'OVERLAP')))
test('combined and old insurance overlapping flagged', () => assert.ok(has(row({ configs: [base, ins, { ...ins, id: 'old-ins', component_code: 'SOCIAL_INSURANCE' }] }), 'OVERLAP')))
test('separate historical insurance codes allowed to coexist', () => { const configs = [base, { ...ins, id: 'social', component_code: 'SOCIAL_INSURANCE', amount: '100.00' }, { ...ins, id: 'labor', component_code: 'LABOR_INSURANCE', amount: '100.05' }]; const r = row({ configs, lines: configs.map(line) }); assert.ok(!has(r, 'OVERLAP')); assert.equal(r.insurance, '200.05') })
test('inactive insurance does not conflict with combined', () => assert.ok(!has(row({ configs: [base, ins, { ...ins, id: 'old', component_code: 'SOCIAL_INSURANCE', status: 'INACTIVE' }] }), 'OVERLAP')))
test('changed rate/amount is reported without rewriting stored result', () => { const r = row({ configs: [{ ...base, amount: '1200.10' }, ins] }); assert.ok(has(r, 'CHANGED_CONFIG')); assert.equal(r.base, '1000.10') })
test('changed effective date is reported', () => assert.ok(has(row({ configs: [{ ...base, effective_from: '2026-08-01' }, ins] }), 'CHANGED_CONFIG')))
test('removed config retained in calculated detail', () => { const r = row({ configs: [base] }); assert.ok(has(r, 'REMOVED_CONFIG')); assert.ok(r.lines.find(l => l.code === 'SOCIAL_LABOR_INSURANCE')) })
test('missing source snapshot does not assert matched', () => { const r = row({ lines: [{ ...line(base), source_snapshot: null }, line(ins)] }); assert.ok(has(r, 'SNAPSHOT_UNKNOWN')) })
test('source failure hides derived insurance, not stored total', () => { const r = row({ available: false, configs: [], lines: [], actions: [] }); assert.equal(r.net, '900.10'); assert.equal(r.insurance, null); assert.ok(has(r, 'SOURCE_UNAVAILABLE')) })
test('changed payable total inconsistent with source is flagged', () => assert.ok(has(row({ pay: { ...pay, v2_net_amount: '1' } }), 'TOTAL_MISMATCH')))
test('cancelled bonus never counted as active twice', () => { const r = row({ actions: [bonus, { ...bonus, id: 'cancelled', status: 'CANCELLED' }] }); assert.ok(!has(r, 'TOTAL_MISMATCH')); assert.equal(r.actions.length, 2) })
test('source currency mismatch is flagged', () => assert.ok(has(row({ lines: [line(base), { ...line(ins), currency: 'USD' }] }), 'LINE_CURRENCY')))
test('draft with old results is not labelled newly calculated', () => assert.ok(has(row({ head: { ...head, status: 'DRAFT' } }), 'DRAFT_OLD_RESULT')))
test('V1 totals and history retain legacy sources', () => { const r = row({ pay: { ...pay, calculation_version: null, v2_net_amount: '99999' }, legacyLines: [{ id: 'v1-line', payroll_id: pay.id, session_id: null, earned_on: '2026-09-01', earning_type: 'MONTHLY', duration_hours: '8', rate: '30', amount: '240' }] }); assert.equal(r.net, pay.gross_amount); assert.equal(r.insurance, null); assert.equal(r.lines[0].amount, '240 VND'); assert.ok(has(r, 'LEGACY')) })
test('empty summary is unknown, not all zero', () => assert.equal(model.summarize([]).net, null))
test('Vietnamese name search handles accents and employee codes', () => { const r = { ...row(), name: 'Đặng Ánh', employeeCode: 'VIBE-001' }; assert.equal(model.filterRows([r], 'dang anh', '', '').length, 1); assert.equal(model.filterRows([r], '001', '', '').length, 1) })
test('currency/type filters never sum unlike currency', () => { const a = row(), b = { ...a, id: 'pay-b', currency: 'USD' }; const filtered = model.filterRows([a, b], '', 'MONTHLY', 'VND'); assert.equal(filtered.length, 1); assert.equal(model.summarize(filtered).net, '900.10') })

test('readComplete handles server cap smaller than request and >1000 rows', async () => { const records = Array.from({ length: 1201 }, (_, i) => ({ id: String(i) })); let calls = 0; const data = await loader.readComplete(async from => { calls++; return { data: records.slice(from, from + 127), count: records.length, error: null } }); assert.equal(data.length, 1201); assert.equal(calls, 10) })
test('readComplete allows a genuine empty result', async () => assert.deepEqual(await loader.readComplete(async () => ({ data: [], count: 0, error: null })), []))
test('readComplete refuses missing count', async () => await assert.rejects(loader.readComplete(async () => ({ data: [], count: null, error: null })), /INCOMPLETE/))
test('readComplete refuses query failure instead of zero', async () => await assert.rejects(loader.readComplete(async () => ({ data: [], count: 0, error: new Error('failure') })), /INCOMPLETE/))
test('readComplete refuses duplicate rows', async () => await assert.rejects(loader.readComplete(async () => ({ data: [{ id: 'same' }, { id: 'same' }], count: 2, error: null })), /DUPLICATE/))
test('readComplete detects changing count during load', async () => await assert.rejects(loader.readComplete(async from => ({ data: [{ id: String(from) }], count: from === 0 ? 2 : 3, error: null })), /CHANGED/))
test('readComplete detects truncated data before expected count', async () => await assert.rejects(loader.readComplete(async from => ({ data: from ? [] : [{ id: 'a' }], count: 2, error: null })), /TRUNCATED/))
test('readComplete bounds maximum response', async () => await assert.rejects(loader.readComplete(async () => ({ data: [], count: 60000, error: null })), /NARROWER/))

class Query {
  constructor(db, table) { this.db = db; this.table = table; this.filters = []; this.orders = []; this.a = 0; this.b = Infinity; this.exact = false }
  select(fields, options) { this.exact = options?.count === 'exact'; this.db.reads.push({ table: this.table, fields }); return this }
  eq(field, value) { this.filters.push(r => r[field] === value); return this }
  lte(field, value) { this.filters.push(r => r[field] <= value); return this }
  in(field, values) { this.filters.push(r => values.includes(r[field])); return this }
  or(expression) { const date = expression.split('effective_to.gte.')[1]; if (date) this.filters.push(r => r.effective_to == null || r.effective_to >= date); else throw Error('unexpected query'); return this }
  order(field, options) { this.orders.push([field, options?.ascending !== false]); return this }
  range(a, b) { this.a = a; this.b = b; return this }
  limit(n) { this.b = n - 1; return this }
  returns() { return this }
  data() { if (this.db.fail === this.table) return { data: null, error: new Error('failed'), count: null }; const rows = (this.db.tables[this.table] || []).filter(r => this.filters.every(f => f(r))); rows.sort((a, b) => { for (const [f, asc] of this.orders) if (a[f] !== b[f]) return (a[f] < b[f] ? -1 : 1) * (asc ? 1 : -1); return 0 }); return { data: clone(rows.slice(this.a, Math.min(this.b + 1, this.a + this.db.cap))), count: this.exact ? rows.length : null, error: null } }
  maybeSingle() { const value = this.data(); this.db.headReads++; if (this.table === 'payroll_periods' && this.db.changeHead && this.db.headReads > 1 && value.data?.[0]) value.data[0].version++; return Promise.resolve({ ...value, data: value.data?.[0] || null }) }
  then(resolve, reject) { return Promise.resolve(this.data()).then(resolve, reject) }
}
function database(extra = {}) {
  return { cap: 1000, fail: null, reads: [], headReads: 0, changeHead: false, tables: { payroll_periods: [clone(head)], branches: [{ id: B, name: 'Chi nhánh kiểm thử' }], teacher_payrolls: [clone(pay)], staff_compensation_components: [clone(base), clone(ins)], payroll_component_lines_v2: [line(base), line(ins)], payroll_period_actions_v2: [clone(bonus)], employee_directory: [{ id: E, employee_code: 'TEST-001', full_name: 'Nhân viên kiểm thử' }], payroll_component_catalog: [], payroll_events: [], payroll_adjustments: [], payroll_earning_lines: [], ...extra }, from(table) { return new Query(this, table) }, rpc() { throw Error('Loader must not call RPC') }, update() { throw Error('Forbidden mutation') } }
}
test('workspace reads real projection from exact tables and keeps scope', async () => { const db = database({ teacher_payrolls: [pay, { ...pay, id: 'foreign-pay', period_id: 'foreign-period', employee_id: 'foreign-employee' }], staff_compensation_components: [base, ins, { ...base, id: 'foreign-cfg', employee_id: 'foreign-employee', branch_id: 'foreign-branch' }] }); const data = await loader.loadWorkspace(db, H); assert.equal(data.rows.length, 1); assert.equal(data.rows[0].net, '900.10'); assert.equal(data.evidenceError, false); assert.ok(!data.rows.some(r => r.id === 'foreign-pay')) })
test('workspace incomplete evidence does not replace saved totals', async () => { const db = database(); db.fail = 'payroll_component_lines_v2'; const data = await loader.loadWorkspace(db, H); assert.equal(data.evidenceError, true); assert.equal(data.rows[0].net, '900.10'); assert.equal(data.rows[0].insurance, null) })
test('workspace event failure is separate from salary data', async () => { const db = database(); db.fail = 'payroll_events'; const data = await loader.loadWorkspace(db, H); assert.equal(data.eventsError, true); assert.equal(data.evidenceError, false) })
test('workspace invalid period never queries', async () => { const db = database(); assert.equal(await loader.loadWorkspace(db, 'bad-id'), null); assert.equal(db.reads.length, 0) })
test('workspace changed version during load is rejected', async () => { const db = database(); db.changeHead = true; await assert.rejects(loader.loadWorkspace(db, H), /CHANGED_DURING_READ/) })
test('workspace flags configured person missing from payroll, not fake zero employee', async () => { const db = database({ staff_compensation_components: [base, ins, { ...base, id: 'new-cfg', employee_id: 'new-person' }] }); const data = await loader.loadWorkspace(db, H); assert.equal(data.rows.length, 1); assert.equal(data.missingPay.length, 1); assert.equal(data.missingPay[0].employeeId, 'new-person') })
test('index groups currencies separately and uses V2 net', async () => { const db = database({ teacher_payrolls: [pay, { ...pay, id: 'usd', employee_id: 'other', currency: 'USD', v2_net_amount: '50.55', gross_amount: '999.99' }] }); const data = await loader.loadIndex(db, {}); assert.equal(data.rows[0].currencyTotals.length, 2); assert.equal(data.rows[0].currencyTotals.find(c => c.currency === 'USD').net, '50.55'); assert.equal(data.rows[0].currencyTotals.find(c => c.currency === 'VND').net, '900.10') })
test('index empty draft does not invent payable zero', async () => { const db = database({ teacher_payrolls: [] }); const data = await loader.loadIndex(db, {}); assert.equal(data.rows[0].count, 0); assert.equal(data.rows[0].currencyTotals.length, 0) })
test('index missing payroll source fails whole monetary view', async () => { const db = database(); db.fail = 'teacher_payrolls'; await assert.rejects(loader.loadIndex(db, {}), /INCOMPLETE/) })

const uxFiles = fs.readdirSync(path.join(root, 'app/admin/payroll/_ux')).filter(f => /\.tsx?$/.test(f))
for (const file of uxFiles) test('TypeScript syntax: ' + file, () => { const result = ts.transpileModule(fs.readFileSync(path.join(root, 'app/admin/payroll/_ux', file), 'utf8'), { fileName: file, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }); assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0) })
test('source loader has no database write or RPC call', () => assert.doesNotMatch(fs.readFileSync(path.join(root, 'app/admin/payroll/_ux/load.ts'), 'utf8'), /\.\s*(?:insert|update|upsert|delete|rpc)\s*\(/))
test('workflow preserves current action, version, note, confirm and override contracts', () => { const source = fs.readFileSync(path.join(root, 'app/admin/payroll/_ux/Workflow.tsx'), 'utf8'); for (const token of ['action={payrollAction}',  'value="transition"', 'name="version"', 'name="note"', 'name="confirm"', 'value="yes"', 'name="override_type"', 'MAKER_CHECKER_EMERGENCY', 'name="override_reason"', 'value="finance"']) assert.ok(source.includes(token), token) })
test('finance route retains financeContext, never adminClient invocation', () => { const source = fs.readFileSync(path.join(root, 'app/finance/payroll/[period]/page.tsx'), 'utf8'); assert.ok(source.includes('await financeContext()')); assert.doesNotMatch(source, /await\s+adminClient\(/) })
test('admin routes retain authenticated adminClient', () => { for (const file of ['app/admin/payroll/page.tsx', 'app/admin/payroll/[period]/page.tsx']) assert.ok(fs.readFileSync(path.join(root, file), 'utf8').includes('await adminClient()')) })
test('production UI does not embed demo salary, person or fake success state', () => { for (const file of uxFiles) { const source = fs.readFileSync(path.join(root, 'app/admin/payroll/_ux', file), 'utf8'); assert.doesNotMatch(source, /Lê A|4\.700\.000|6\.100\.000|4100000|DEMO-01|localStorage|service_role|setNet\s*\(|setGross\s*\(/) } })
test('single scoped CSS does not modify global body or sidebar', () => { const css = fs.readFileSync(path.join(root, 'app/admin/payroll/_ux/payroll.module.css'), 'utf8'); assert.ok(css.includes('--ink:var(--vibe-ink)')); assert.ok(css.includes('--gold:var(--vibe-gold)')); assert.doesNotMatch(css, /(?:^|})\s*(?:body|:root|aside|\.sidebar)\s*\{/) })

test('base breakdown inconsistency cannot hide inside other earnings', () => assert.ok(has(row({ pay: { ...pay, base_salary: '900.10' } }), 'BREAKDOWN_MISMATCH')))
test('line for a different employee is flagged', () => assert.ok(has(row({ lines: [{ ...line(base), employee_id: 'other-person' }, line(ins)] }), 'LINE_EMPLOYEE')))
test('header for a different branch is flagged', () => assert.ok(has(row({ pay: { ...pay, branch_id: 'other-branch' } }), 'HEADER_SCOPE')))
test('component label does not inherit Object prototype values', () => assert.equal(model.label('constructor'), 'constructor'))
