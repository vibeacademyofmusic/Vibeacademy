/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS tests. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, redirected, fixture, render } = require('./helpers/finance-operations.cjs')
test('invoice create uses exact RPC arguments, selects DRAFT result and revalidates all finance routes', async () => {
  const h = harness(); const url = await redirected(h.load('invoices/actions.ts').createInvoice, { enrollment_tuition_id: id(2) })
  assert.equal(url.searchParams.get('selected'), id(99))
  assert.deepEqual(h.calls[1], { rpc: 'create_tuition_invoice', args: { p_enrollment_tuition_id: id(2), p_notes: null } })
  assert.equal(h.invalidated.length, 5)
})

test('invoice issue rejects reversed dates and impossible calendar dates before mutation', async () => {
  for (const values of [{ issued_on: '2026-09-20', due_on: '2026-09-19' }, { issued_on: '2026-02-30', due_on: '2026-03-01' }]) {
    const h = harness(); const url = await redirected(h.load('invoices/actions.ts').issueInvoice, { invoice_id: id(2), confirm: 'yes', ...values })
    assert.ok(url.searchParams.has('error')); assert.equal(h.calls.length, 1)
  }
})

test('invoice issue passes dates and confirmation to existing workflow', async () => {
  const h = harness(); await redirected(h.load('invoices/actions.ts').issueInvoice, { invoice_id: id(2), confirm: 'yes', issued_on: '2026-09-15', due_on: '2026-09-20' })
  assert.equal(h.calls[1].rpc, 'issue_invoice'); assert.equal(h.calls[1].args.p_due_on, '2026-09-20')
})

test('cancel database error is safe and preserves selection; no invalidation on failure', async () => {
  const h = harness({}, { message: 'SECRET SQL relation internal.customer' })
  const url = await redirected(h.load('invoices/actions.ts').cancelInvoice, { invoice_id: id(2), selected: id(2), reason: 'Sai hóa đơn', confirm: 'yes' })
  assert.ok(url.searchParams.has('error')); assert.doesNotMatch(url.href, /SECRET|customer/)
  assert.equal(url.searchParams.get('selected'), id(2)); assert.equal(h.invalidated.length, 0)
})

test('invoice rendering includes derived debt, refund and overdue values with batched student lookup', async () => {
  const h = harness(fixture()); const html = await render(h, 'invoices')
  for (const text of ['INV-TEST', 'Học viên thử nghiệm', 'OVERDUE', '800.000', '50.000']) assert.ok(html.includes(text), text)
  assert.equal(h.calls.filter(c => c.table === 'students').length, 1)
  assert.ok(h.calls.filter(c => c.table).every(c => !c.fields.includes('*')))
})
