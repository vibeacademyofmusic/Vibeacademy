const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const loaded = { exports: {} }
  new Function('exports', 'require', 'module', code)(loaded.exports, require, loaded)
  return loaded.exports
}

const payment = load(path.join(__dirname, '../lib/integrations/tuition/payment-zbs.ts'))
const parameters = [...payment.TUITION_PAYMENT_BODY_PARAMETERS, payment.TUITION_PAYMENT_CTA_PARAMETER]
const registry = {
  template_key: 'ZALO_TUITION_PAYMENT',
  status: 'APPROVED',
  enabled: false,
  provider_template_id: '645028',
  parameter_schema: parameters,
  payload_schema: { purpose: 'TUITION_PAYMENT_REQUEST', cta: 'payment_link_id' },
}
const fixture = {
  customerName: 'Phụ huynh thử',
  studentName: 'Học viên thử',
  invoiceCode: 'INV-SYNTHETIC-645',
  packageName: '3 tháng',
  packageAmount: 5500000,
  paymentType: 'Đặt cọc 50%',
  amountDue: 2750000,
  deadline: '2026-11-15',
  paymentLinkId: 'synthetic01',
  checkoutUrl: 'https://pay.payos.vn/web/synthetic01',
}

test('the payment service resolves 645028 from the registry and keeps package price distinct from the amount due', () => {
  const prepared = payment.prepareTuitionPaymentRequest({ template: registry, input: fixture, linkInvoiceCode: fixture.invoiceCode })
  assert.equal(prepared.templateId, '645028')
  assert.equal(prepared.code, 'ZBS_SEND_DISABLED')
  assert.equal(prepared.sent, false)
  assert.equal(prepared.paid, false)
  assert.equal(prepared.parameters.package_amount, '5500000')
  assert.equal(prepared.parameters.amount_due, '2750000')
  assert.equal(prepared.parameters.payment_deadline, '15/11/2026')
  assert.equal(prepared.parameters.payment_status, 'Chờ thanh toán')
  assert.deepEqual(Object.keys(prepared.parameters).sort(), [...parameters].sort())
  assert.equal(payment.tuitionPaymentDispatch(registry, payment.buildTuitionPaymentRequest(fixture)).templateId, '645028')
  assert.equal(payment.tuitionPaymentTemplateConfigured({ ...registry, provider_template_id: '643118' }, payment.TUITION_PAYMENT_REQUEST), false)
  assert.equal(payment.tuitionPaymentTemplateConfigured({ ...registry, template_key: 'ZALO_TUITION_REMINDER', provider_template_id: '643118' }, payment.TUITION_PAYMENT_REQUEST), false)
})

test('missing required payment data is rejected and the sample deadline is not a default', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/integrations/tuition/payment-zbs.ts'), 'utf8')
  assert.equal(source.includes('2026-11-15'), false)
  const missingDeadline = payment.prepareTuitionPaymentRequest({
    template: registry,
    input: { ...fixture, deadline: '' },
    linkInvoiceCode: fixture.invoiceCode,
  })
  assert.equal(missingDeadline.code, 'MISSING_REQUIRED')
  assert.ok(missingDeadline.missing.includes('payment_deadline'))
  assert.equal(missingDeadline.parameters, null)
  const missingDue = payment.prepareTuitionPaymentRequest({
    template: registry,
    input: { ...fixture, amountDue: 0 },
    linkInvoiceCode: fixture.invoiceCode,
  })
  assert.ok(missingDue.missing.includes('amount_due'))
  assert.equal(missingDue.paid, false)
})

test('a repeated or unknown payment attempt is not sent again', () => {
  const first = payment.prepareTuitionPaymentRequest({ template: registry, input: fixture, linkInvoiceCode: fixture.invoiceCode })
  const held = { key: 'case-synthetic', outcome: 'HELD', invoiceCode: fixture.invoiceCode, paymentLinkId: fixture.paymentLinkId }
  const duplicate = payment.prepareTuitionPaymentRequest({ template: registry, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: held })
  assert.equal(first.code, 'ZBS_SEND_DISABLED')
  assert.equal(duplicate.code, 'DUPLICATE_HELD')
  assert.equal(duplicate.sent, false)
  assert.deepEqual(duplicate.parameters, first.parameters)
  const unknown = payment.prepareTuitionPaymentRequest({
    template: registry,
    input: fixture,
    linkInvoiceCode: fixture.invoiceCode,
    attempt: { ...held, outcome: 'UNKNOWN' },
  })
  assert.equal(unknown.code, 'UNKNOWN_NOT_RETRIED')
  assert.equal(unknown.parameters, null)
  assert.equal(unknown.sent, false)
})

test('a payment link for another invoice is rejected and neither a notice nor a continuation marks tuition paid', () => {
  const foreign = payment.prepareTuitionPaymentRequest({ template: registry, input: fixture, linkInvoiceCode: 'INV-OTHER' })
  assert.equal(foreign.code, 'LINK_INVOICE_MISMATCH')
  assert.equal(foreign.paid, false)
  assert.equal(foreign.sent, false)
  const sent = payment.prepareTuitionPaymentRequest({
    template: registry,
    input: fixture,
    linkInvoiceCode: fixture.invoiceCode,
    attempt: { key: 'case-synthetic', outcome: 'SENT', invoiceCode: fixture.invoiceCode, paymentLinkId: fixture.paymentLinkId },
  })
  assert.equal(sent.code, 'ALREADY_RECORDED')
  assert.equal(sent.paid, false)
  const reply = payment.prepareTuitionPaymentRequest({
    template: registry,
    input: fixture,
    linkInvoiceCode: fixture.invoiceCode,
    continuationReply: 'Tiếp tục học',
  })
  assert.equal(reply.code, 'CONTINUATION_IGNORED')
  assert.equal(reply.paid, false)
  assert.equal(reply.sent, false)
})

test('a held payment stays eligible and an authorized retry sends once through a fake provider', async () => {
  const provider = { calls: 0, async send() { this.calls += 1; return 'ACCEPTED' } }
  const disabled = payment.prepareTuitionPaymentRequest({ template: registry, input: fixture, linkInvoiceCode: fixture.invoiceCode })
  assert.equal(disabled.code, 'ZBS_SEND_DISABLED')
  assert.equal(payment.tuitionPaymentDispatch(registry, payment.buildTuitionPaymentRequest(fixture)).state, 'HELD')
  assert.equal(provider.calls, 0)
  const held = { key: 'case-synthetic', outcome: 'HELD', invoiceCode: fixture.invoiceCode, paymentLinkId: fixture.paymentLinkId }
  const repeat = payment.prepareTuitionPaymentRequest({ template: registry, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: held })
  assert.equal(repeat.code, 'DUPLICATE_HELD')
  assert.equal(provider.calls, 0)
  const enabled = { ...registry, enabled: true }
  const eligible = payment.prepareTuitionPaymentRequest({ template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: held })
  assert.equal(eligible.code, 'ELIGIBLE')
  assert.equal(eligible.sent, false)
  assert.equal(provider.calls, 0)
  const ledger = payment.createTuitionPaymentLedger()
  const unauthorized = await payment.dispatchAuthorizedTuitionPayment({
    template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: held, authorized: false, provider, ledger,
  })
  assert.equal(unauthorized.code, 'UNAUTHORIZED')
  assert.equal(provider.calls, 0)
  const sent = await payment.dispatchAuthorizedTuitionPayment({
    template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: held, authorized: true, provider, ledger,
  })
  assert.equal(sent.code, 'ACCEPTED')
  assert.equal(sent.paid, false)
  assert.equal(provider.calls, 1)
  const again = await payment.dispatchAuthorizedTuitionPayment({
    template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: held, authorized: true, provider, ledger,
  })
  assert.equal(again.code, 'ALREADY_ACCEPTED')
  assert.equal(provider.calls, 1)
  const recorded = payment.prepareTuitionPaymentRequest({
    template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: { ...held, outcome: 'SENT' },
  })
  assert.equal(recorded.code, 'ALREADY_RECORDED')
  assert.equal(provider.calls, 1)
})

test('concurrent authorized retries invoke the fake provider once, and an unknown result is not resent', async () => {
  let started = 0
  let release
  const gate = new Promise(resolve => { release = resolve })
  const provider = {
    calls: 0,
    async send() {
      this.calls += 1
      started += 1
      await gate
      return 'ACCEPTED'
    },
  }
  const enabled = { ...registry, enabled: true }
  const held = { key: 'case-concurrent', outcome: 'HELD', invoiceCode: fixture.invoiceCode, paymentLinkId: fixture.paymentLinkId }
  const ledger = payment.createTuitionPaymentLedger()
  const attempt = { template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: held, authorized: true, provider, ledger }
  const first = payment.dispatchAuthorizedTuitionPayment(attempt)
  const second = payment.dispatchAuthorizedTuitionPayment(attempt)
  while (started < 1) await new Promise(resolve => setTimeout(resolve, 0))
  release()
  const results = await Promise.all([first, second])
  assert.deepEqual(results.map(result => result.code).sort(), ['ACCEPTED', 'NOT_CLAIMED'])
  assert.equal(provider.calls, 1)
  const unknownProvider = { calls: 0, async send() { this.calls += 1; return 'UNKNOWN' } }
  const unknownLedger = payment.createTuitionPaymentLedger()
  const unknown = await payment.dispatchAuthorizedTuitionPayment({
    template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: { ...held, key: 'case-unknown' }, authorized: true, provider: unknownProvider, ledger: unknownLedger,
  })
  assert.equal(unknown.code, 'ACCEPTANCE_UNKNOWN')
  assert.equal(unknown.sent, false)
  assert.equal(unknownProvider.calls, 1)
  const blind = await payment.dispatchAuthorizedTuitionPayment({
    template: enabled, input: fixture, linkInvoiceCode: fixture.invoiceCode, attempt: { ...held, key: 'case-unknown', outcome: 'UNKNOWN' }, authorized: true, provider: unknownProvider, ledger: unknownLedger,
  })
  assert.equal(blind.code, 'UNKNOWN_NOT_RETRIED')
  assert.equal(unknownProvider.calls, 1)
})

test('versioned SQL keeps the verified template split and does not enable sending', () => {
  const bind = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261006191000_bind_tuition_payment_template_645028.sql'), 'utf8')
  const registrySql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261006190000_tuition_reminder_template_registry.sql'), 'utf8')
  assert.match(bind, /ZALO_TUITION_PAYMENT/)
  assert.match(bind, /645028/)
  assert.match(bind, /enabled = false/)
  assert.equal(bind.includes('640377'), true)
  assert.match(bind, /không|not changed|640377/)
  assert.equal(registrySql.includes("provider_template_id = '645028'"), false)
  assert.match(registrySql, /ZALO_TUITION_REMINDER/)
})
