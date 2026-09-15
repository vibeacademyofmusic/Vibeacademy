/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS tests. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { harness, fixture, render } = require('./helpers/finance-operations.cjs')
test('receivables use backend status and keep summary currencies separate', async () => {
  const data = fixture(); data.student_receivable_summary = ['VND', 'USD'].map(currency => ({ currency, total_outstanding: currency === 'VND' ? 800000 : 25.25, total_overdue: 0, overdue_invoice_count: 1, unpaid_invoice_count: 0, partially_paid_invoice_count: 0 }))
  const html = await render(harness(data), 'receivables')
  assert.match(html, /Còn công nợ/); assert.match(html, /800\.000/); assert.match(html, /25,25/); assert.match(html, /OVERDUE/); assert.match(html, /PAID/)
})
