/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS tests. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, fixture, render, base, fs, path, renderToStaticMarkup } = require('./helpers/finance-operations.cjs')
test('refund creation and allocation explicitly preserve original payment/allocation IDs', async () => {
  const h = harness(); const actions = h.load('refunds/actions.ts')
  await redirected(actions.createRefund, { payment_id: id(1), amount: 25, refunded_at: '2026-09-15T08:00', reason: 'Hoàn học phí', confirm: 'yes' })
  assert.equal(h.calls[1].rpc, 'create_refund'); assert.equal(h.calls[1].args.p_payment_id, id(1))
  await redirected(actions.allocateRefund, { refund_id: id(99), payment_allocation_id: id(5), amount: 10 })
  assert.equal(h.calls.at(-1).rpc, 'allocate_refund_to_payment_allocation'); assert.equal(h.calls.at(-1).args.p_payment_allocation_id, id(5))
})

test('over-refund is reported safely and never reported as success', async () => {
  const h = harness({}, { message: 'Refund exceeds the remaining refundable payment amount' })
  const url = await redirected(h.load('refunds/actions.ts').createRefund, { payment_id: id(1), amount: 1000, refunded_at: '2026-09-15T08:00', reason: 'Hoàn', confirm: 'yes' })
  assert.match(url.searchParams.get('error'), /vượt phần có thể hoàn/); assert.equal(url.searchParams.has('success'), false)
})

test('void refund requires confirmation and reason', async () => {
  const h = harness(); const action = h.load('refunds/actions.ts').voidRefund
  await redirected(action, { refund_id: id(1), confirm: 'yes' }); assert.equal(h.calls.length, 1)
  await redirected(action, { refund_id: id(1), reason: 'Sai phiếu', confirm: 'yes' }); assert.equal(h.calls.at(-1).rpc, 'void_refund')
})

test('refund UI exposes original invoice allocation and explicit void warning', async () => {
  const data = fixture(); data.refunds = [{ id: id(6), refund_number: 'REFUND-TEST', payment_id: id(4), student_id_snapshot: id(1), branch_name_snapshot: 'Chi nhánh thử nghiệm', currency: 'VND', amount: 50000, refunded_at: '2026-09-15T00:00:00Z', reason: 'Kiểm thử', status: 'POSTED', payments: { payment_number: 'PAY-TEST' } }]
  const html = await render(harness(data), 'refunds', { selected: id(6) })
  assert.match(html, /INV-TEST/); assert.match(html, /payment_allocation_id/); assert.match(html, /hoàn tác ảnh hưởng/); assert.match(html, /450\.000/)
})

test('finance navigation exposes all implemented routes without prefetch', () => {
  const html = renderToStaticMarkup(harness().load('layout.tsx').default({ children: null }))
  for (const route of ['', '/invoices', '/payments', '/receivables', '/refunds']) assert.ok(html.includes('/admin/finance' + route))
  for (const route of ['invoices', 'payments', 'receivables', 'refunds']) assert.ok(fs.existsSync(path.join(base, route, 'page.tsx')))
  assert.match(fs.readFileSync(path.join(base, 'layout.tsx'), 'utf8'), /prefetch=\{false\}/)
})
