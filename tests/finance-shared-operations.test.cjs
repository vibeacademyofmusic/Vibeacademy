/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS tests. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, id, fixture } = require('./helpers/finance-operations.cjs')
test('list pagination bounds rows and queries server-side filters', async () => {
  const data = fixture(); data.invoice_receivables = Array.from({ length: 30 }, (_, i) => ({ ...data.invoice_receivables[0], invoice_id: id(100 + i) }))
  const h = harness(data); const result = await h.load('query.ts').invoiceList(h.db, { page: '1', status: 'ISSUED', currency: 'VND' })
  assert.equal(result.data.length, 25); assert.equal(result.more, true)
  assert.deepEqual(h.calls.find(c => c.table === 'invoice_receivables').range, [0, 25])
  assert.equal((await h.load('query.ts').invoiceList(h.db, { page: '2' })).data.length, 5)
})
