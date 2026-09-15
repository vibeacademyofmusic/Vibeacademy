/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS tests. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, fixture, render } = require('./helpers/finance-operations.cjs')
test('payment create uses Vietnam datetime and normalized currency/method', async () => {
  const h = harness(); await redirected(h.load('payments/actions.ts').createPayment, { student_id: id(1), branch_id: id(2), amount: '123.45', currency: 'usd', payment_method: 'card', paid_at: '2026-09-15T07:30', reference: 'ref' })
  assert.deepEqual(h.calls[1], { rpc: 'create_payment', args: { p_student_id: id(1), p_branch_id: id(2), p_amount: '123.45', p_currency: 'USD', p_payment_method: 'CARD', p_paid_at: '2026-09-15T07:30:00+07:00', p_reference: 'ref', p_notes: null } })
})

test('payment partial allocation delegates student/currency/balance authority to RPC', async () => {
  const h = harness(); await redirected(h.load('payments/actions.ts').allocatePayment, { payment_id: id(1), invoice_id: id(2), amount: '50.25' })
  assert.deepEqual(h.calls[1], { rpc: 'allocate_payment_to_invoice', args: { p_payment_id: id(1), p_invoice_id: id(2), p_amount: '50.25' } })
})

test('invalid amounts reject before RPC; wrong currency backend error is translated', async () => {
  for (const amount of ['-1', '0', 'NaN', '1e5', '1.234']) {
    const h = harness(); await redirected(h.load('payments/actions.ts').allocatePayment, { payment_id: id(1), invoice_id: id(2), amount }); assert.equal(h.calls.length, 1)
  }
  const h = harness({}, { message: 'Payment and invoice currencies must match' })
  const url = await redirected(h.load('payments/actions.ts').allocatePayment, { payment_id: id(1), invoice_id: id(2), amount: 10 })
  assert.match(url.searchParams.get('error'), /cùng loại tiền/)
})

test('void payment requires reason and confirmation; valid request calls void RPC', async () => {
  const h = harness(); const action = h.load('payments/actions.ts').voidPayment
  await redirected(action, { payment_id: id(1), reason: 'Điều chỉnh' }); assert.equal(h.calls.length, 1)
  await redirected(action, { payment_id: id(1), reason: 'Điều chỉnh', confirm: 'yes' }); assert.equal(h.calls.at(-1).rpc, 'void_payment')
})

test('payment list derives remaining and displays void warning in selected detail', async () => {
  const h = harness(fixture()); const html = await render(h, 'payments', { selected: id(4) })
  assert.match(html, /250\.000/); assert.match(html, /công nợ mở lại/); assert.match(html, /REF-TEST/)
})

test('mutations reject anonymous and non-admin users before financial RPC', async () => {
  for (const [role, signedIn] of [[true, false], [false, true]]) {
    const h = harness({}, null, role, signedIn)
    const url = await redirected(h.load('payments/actions.ts').createPayment, {})
    assert.equal(url.pathname, '/login'); assert.ok(h.calls.every(c => c.rpc === 'has_role'))
  }
})
