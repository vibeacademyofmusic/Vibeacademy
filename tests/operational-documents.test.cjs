/* eslint-disable @typescript-eslint/no-require-imports -- Execute real TS server modules with isolated local mocks. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript'), React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { harness, id, fixture, redirected } = require('./helpers/finance-operations.cjs')
const { resolveModule } = require('./helpers/resolve-module.cjs')
function modules(h) {
  const cache = new Map()
  const mocks = {
    '@/lib/supabase/server': { createClient: async () => h.db },
    'next/navigation': { redirect: url => { throw Object.assign(new Error('redirect'), { url }) }, notFound: () => { throw new Error('NOT_FOUND') } },
    'next/cache': { revalidatePath: p => h.invalidated.push(p) },
    'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
  }
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file)
    const m = { exports: {} }
    const req = name => {
      if (name in mocks) return mocks[name]
      if (name.endsWith('.css')) return { default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name.startsWith('.') || name.startsWith('@/')) return load(resolveModule(file, name, ['ts', 'tsx']))
      return require(name)
    }
    new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText)(req, m, m.exports)
    cache.set(file, m.exports)
    return m.exports
  }
  return load
}
const documentPath = 'app/documents/finance/[kind]/[id]/page.tsx'
async function document(h, kind, docId) { return renderToStaticMarkup(await modules(h)(documentPath).default({ params: Promise.resolve({ kind, id: docId }) })) }
const payroll = { id: id(20), branch_id: id(3), teacher_name: 'Synthetic employee', currency: 'VND', gross_amount: 900, pay_type: 'MONTHLY' }
const slip = { payroll, employee_code: 'VIBE-HQ-TEST', period: { starts_on: '2026-08-01', ends_on: '2026-08-31', status: 'FINALIZED', approved_by: id(2), approved_at: '2026-09-01T00:00:00Z', finalized_at: null }, lines: [{ id: id(22), kind: 'MONTHLY_BASE', earned_on: '2026-08-01', rate: 2000, amount: 1000, hours: 0, required_minutes: 840, payable_minutes: 420 }], adjustments: [{ id: id(23), kind: 'DEDUCTION', amount: -100, reason: 'Reviewed' }] }
test('Payslip totals preserve signed adjustments and reconcile net', () => {
  assert.deepEqual(modules(harness())('app/documents/payslips/data.ts').payslipTotals(slip), { earnings: 1000, deductions: 100, net: 900 })
})
test('Approved snapshot renders rate, ratio, identity and totals without reading live compensation', async () => {
  const h = harness(); h.db.rpc = async (name) => { assert.equal(name, 'payroll_payslip'); return { data: slip, error: null } }
  const html = renderToStaticMarkup(await modules(h)('app/documents/payslips/[id]/page.tsx').default({ params: Promise.resolve({ id: id(20) }) }))
  for (const expected of ['VIBE-HQ-TEST', '2.000 VND', '1.000 VND', '900 VND', 'DEDUCTION', 'MONTHLY_BASE']) assert.ok(html.includes(expected), expected)
  assert.equal(h.calls.length, 0)
})
test('Denied payslip projection does not render salary', async () => {
  const h = harness(); h.db.rpc = async () => ({ data: null, error: null })
  await assert.rejects(modules(h)('app/documents/payslips/[id]/page.tsx').default({ params: Promise.resolve({ id: id(20) }) }), /NOT_FOUND/)
})
test('Payslip mismatch refuses display', async () => {
  const h = harness(); h.db.rpc = async () => ({ data: { ...slip, payroll: { ...payroll, gross_amount: 901 } }, error: null })
  const html = renderToStaticMarkup(await modules(h)('app/documents/payslips/[id]/page.tsx').default({ params: Promise.resolve({ id: id(20) }) }))
  assert.match(html, /Không tải được/); assert.ok(!html.includes('Phiếu lương'))
})
test('Invoice uses engine total, locked discount and current receivable', async () => {
  const data = fixture(); data.invoices = [{ id: id(2), invoice_number: 'INV-TEST', enrollment_tuition_id: id(9), student_id_snapshot: id(1), currency: 'VND', total_amount: 1000000, subtotal: 1000000, status: 'ISSUED' }]
  data.enrollment_tuition = [{ id: id(9), list_price: 1200000, discount_amount: 200000, plan_name_snapshot: 'Piano' }]
  const html = await document(harness(data), 'invoices', id(2))
  for (const amount of ['1.200.000 VND', '200.000 VND', '1.000.000 VND', '800.000 VND']) assert.ok(html.includes(amount))
})
test('Void receipt preserves original payment amount and reference', async () => {
  const data = fixture(); Object.assign(data.payments[0], { status: 'VOIDED', voided_at: '2026-09-16T00:00:00Z', void_reason: 'Checked' })
  const html = await document(harness(data), 'payments', id(4))
  assert.match(html, /500.000 VND/); assert.match(html, /VOIDED/); assert.match(html, /PAY-TEST/)
})
test('Refund displays existing maker checker and approved amount', async () => {
  const data = fixture(); data.refunds = [{ id: id(10), refund_number: 'REF-01', payment_id: id(4), student_id_snapshot: id(1), currency: 'VND', amount: 50000, refunded_at: '2026-09-16T00:00:00Z', status: 'POSTED', reason: 'Approved refund' }]
  data.financial_approval_requests = [{ result_id: id(10), operation: 'REFUND', status: 'POSTED', maker_user_id: id(30), approver_user_id: id(31), created_at: '2026-09-15T00:00:00Z', approved_at: '2026-09-16T00:00:00Z' }]
  const html = await document(harness(data), 'refunds', id(10)); for (const text of ['50.000 VND', id(30), id(31), 'REF-01']) assert.ok(html.includes(text))
})
test('Credit statement uses canonical allocation refund and remaining values', async () => {
  const data = fixture(); data.customer_credit_balances = [{ id: id(11), student_id: id(1), currency: 'VND', amount: 1000000, applied_amount: 300000, refunded_amount: 200000, remaining_credit: 500000, created_at: '2026-09-15T00:00:00Z' }]
  const html = await document(harness(data), 'credits', id(11)); for (const value of ['1.000.000 VND', '300.000 VND', '200.000 VND', '500.000 VND']) assert.ok(html.includes(value))
})
test('Finance document denies unrelated account before reading documents', async () => {
  const h = harness({}, null, false)
  await assert.rejects(document(h, 'invoices', id(2)), e => e.url?.includes('Unauthorized'))
  assert.ok(!h.calls.some(c => c.table === 'invoices'))
})
test('Finance document denies anonymous user', async () => {
  await assert.rejects(document(harness({}, null, true, false), 'payments', id(4)), e => e.url === '/login')
})
test('Missing or RLS-hidden document returns not found', async () => {
  await assert.rejects(document(harness(), 'invoices', id(2)), /NOT_FOUND/)
})
test('Compensation action sends reason and effective dates to canonical wrapper', async () => {
  const h = harness(), action = modules(h)('app/admin/employees/[id]/compensation/actions.ts').configureCompensation
  await redirected(action, { employee: id(1), branch: id(3), type: 'MONTHLY', rate: '10000000', currency: 'VND', from: '2026-10-01', to: '2026-10-31', reason: 'Owner reference' })
  const call = h.calls.find(c => c.rpc === 'configure_employee_compensation')
  assert.equal(call.args.p_rate, '10000000'); assert.equal(call.args.p_reason, 'Owner reference'); assert.equal(call.args.p_to, '2026-10-31')
})
test('Invalid compensation form never calls mutating RPC', async () => {
  const h = harness(), action = modules(h)('app/admin/employees/[id]/compensation/actions.ts').configureCompensation
  const url = await redirected(action, { employee: id(1), branch: id(3), type: 'MONTHLY', rate: '-1', currency: 'VND', from: '2026-10-01' })
  assert.ok(url.searchParams.get('error')); assert.ok(!h.calls.some(c => c.rpc === 'configure_employee_compensation'))
})
test('Print routes have standalone shell, A4 CSS and hidden actions', () => {
  const css = fs.readFileSync('app/documents/print.css', 'utf8'), layout = fs.readFileSync('app/documents/layout.tsx', 'utf8')
  assert.match(css, /size: A4/); assert.match(css, /document-actions.*nextjs-portal/); assert.ok(!layout.includes('Sidebar'))
})

function invoiceFixture() {
 const data=fixture()
 data.invoices=[{id:id(2),invoice_number:'INV-DYNAMIC-42',enrollment_tuition_id:id(9),student_id_snapshot:id(1),branch_id_snapshot:id(3),branch_name_snapshot:'Real branch fixture',currency:'VND',subtotal:1000000,total_amount:1000000,status:'ISSUED',issued_on:'2026-09-01',due_on:'2026-09-30',notes:'Supplied invoice note'}]
 data.invoice_items=[{id:id(30),invoice_id:id(2),description:'Dynamic tuition line',quantity:1,unit_amount:1000000,line_total:1000000}]
 data.enrollment_tuition=[{id:id(9),list_price:1200000,discount_amount:200000,plan_name_snapshot:'Dynamic program',starts_on:'2026-09-01',effective_ends_on:'2026-09-30'}]
 Object.assign(data.branches[0],{address:'Supplied branch address',phone:'Provided branch phone'})
 return data
}
test('official invoice uses English headings and dynamic document data',async()=>{
 const html=await document(harness(invoiceFixture()),'invoices',id(2))
 for(const text of ['VIBE ACADEMY OF MUSIC &amp; CINEMA','>INVOICE<','INVOICE NO.','ISSUE DATE','DUE DATE','BRANCH','STUDENT','PROGRAM','BILLING PERIOD','STATUS','PAYMENT STATUS','AMOUNT PAID','BALANCE DUE','DESCRIPTION','QUANTITY','UNIT PRICE','AMOUNT','SUBTOTAL','DISCOUNT','TOTAL','NOTES','AUTHORIZED SIGNATURE','INV-DYNAMIC-42','Dynamic tuition line','Dynamic program','Supplied branch address','Provided branch phone']) assert.ok(html.includes(text),text)
 assert.doesNotMatch(html,/>Hóa đơn học phí<|Ngày phát hành:|Hạn trả:/)
 assert.match(html,/PARTIALLY_PAID/)
})
test('missing contact and discount data are not invented',async()=>{
 const data=invoiceFixture();data.branches=[];data.enrollment_tuition=[]
 const html=await document(harness(data),'invoices',id(2))
 assert.match(html,/Discount breakdown is unavailable/);assert.doesNotMatch(html,/Provided branch phone|Supplied branch address|vibeacademy\./)
 assert.match(html,/1.000.000 VND/)
})
test('invoice template supports supplied asset URL and never invents a logo',()=>{
 const Template=modules(harness())('app/documents/_components/InvoiceTemplate.tsx').default
 const props={invoice:{number:'Fixture',status:'ISSUED',issuedOn:'',dueOn:'',branch:'',student:'',currency:'VND',subtotal:10,total:10,notes:''},balance:{invoice_status:'ISSUED',allocated_amount:0,outstanding_balance:10},items:[]}
 const withLogo=renderToStaticMarkup(React.createElement(Template,{...props,logoSrc:'/fixture-approved-logo.svg'}))
 assert.match(withLogo,/src="\/fixture-approved-logo.svg"/);assert.match(withLogo,/alt="VIBE logo"/)
 const withoutLogo=renderToStaticMarkup(React.createElement(Template,props))
 assert.doesNotMatch(withoutLogo,/<img/);assert.match(withoutLogo,/Chưa có logo VIBE chính thức/)
})


test('official invoice renders the supplied real public logo', async () => {
  const asset = fs.readFileSync('public/vibe-logo.png')
  assert.equal(asset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const html = await document(harness(invoiceFixture()), 'invoices', id(2))
  assert.match(html, /src="\/vibe-logo.png"/)
  assert.match(html, /alt="VIBE logo"/)
  assert.doesNotMatch(html, /Chưa có logo VIBE chính thức/)
})
