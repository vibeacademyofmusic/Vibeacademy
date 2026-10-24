const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const { harness } = require('./helpers/finance-operations.cjs')

test('customer continue reply is care work and does not become a payment', () => {
  const status = harness().load('../../../lib/integrations/tuition/renewal-status.ts')
  assert.equal(status.renewalProcessingLabel(null, true), 'Cần chăm sóc')
  assert.equal(status.renewalPaymentLabel(null), 'Chờ thanh toán')
  assert.equal(status.renewalPaymentLabel('DEPOSIT_PAID'), 'Đã nhận cọc 50%')
  assert.equal(status.renewalPaymentLabel('PAID'), 'Đã thanh toán')
  assert.equal(status.renewalProcessingLabel('PAID', true), 'Gia hạn hoàn tất')
  assert.equal(status.renewalProcessingLabel('CHECKOUT_PENDING', true), 'Chờ tạo thanh toán')
  assert.equal(status.renewalProcessingLabel('AWAITING_TEMPLATE', true), 'Chờ mẫu ZBS thanh toán')
  assert.notEqual(16500000, 5500000 * 4)
  assert.notEqual(13500000, 4500000 * 4)
})

test('payment request matches the approved ZBS contract and does not reuse reminder templates', async () => {
  const status = harness().load('../../../lib/integrations/tuition/renewal-status.ts')
  const payment = harness().load('../../../lib/integrations/tuition/payment-zbs.ts')
  const parameters = [...payment.TUITION_PAYMENT_BODY_PARAMETERS, payment.TUITION_PAYMENT_CTA_PARAMETER]
  const ready = {
    template_key: payment.TUITION_PAYMENT_TEMPLATE_KEY,
    status: 'ENABLE',
    enabled: true,
    provider_template_id: '900001',
    parameter_schema: parameters,
    payload_schema: { purpose: payment.TUITION_PAYMENT_REQUEST },
  }
  assert.equal(status.paymentTemplateReady({ status: 'APPROVED', enabled: false, provider_template_id: '643118', parameter_schema: parameters, payload_schema: { purpose: payment.TUITION_PAYMENT_REQUEST } }), false)
  assert.equal(payment.tuitionPaymentTemplateReady({ ...ready, provider_template_id: '643118' }, payment.TUITION_PAYMENT_REQUEST), false)
  assert.equal(payment.tuitionPaymentTemplateReady({ ...ready, provider_template_id: '640377' }, payment.TUITION_PAYMENT_REQUEST), false)
  assert.equal(payment.tuitionPaymentTemplateReady({ ...ready, provider_template_id: null }, payment.TUITION_PAYMENT_REQUEST), false)
  assert.equal(payment.tuitionPaymentTemplateReady({ ...ready, status: 'PENDING', enabled: false }, payment.TUITION_PAYMENT_REQUEST), false)
  assert.equal(payment.tuitionPaymentTemplateReady(ready, payment.TUITION_PAYMENT_REQUEST), true)
  const request = payment.buildTuitionPaymentRequest({
    customerName: 'Phụ huynh', studentName: 'Học viên', invoiceCode: 'INV-2026-000001', packageName: '3 tháng',
    packageAmount: 5500000, paymentType: 'Đặt cọc 50%', amountDue: 2750000, deadline: '2026-11-15',
    paymentLinkId: 'tuitionlink1', checkoutUrl: 'https://pay.payos.vn/web/tuitionlink1',
  })
  assert.equal(request.ok, true)
  assert.deepEqual(Object.keys(request.body), [...payment.TUITION_PAYMENT_BODY_PARAMETERS])
  assert.equal(request.body.payment_status, 'Chờ thanh toán')
  assert.equal(request.body.package_amount, '5500000')
  assert.equal(request.body.amount_due, '2750000')
  assert.equal(request.body.payment_deadline, '15/11/2026')
  assert.deepEqual(request.cta, { payment_link_id: 'tuitionlink1' })
  assert.equal(request.checkoutUrl, 'https://pay.payos.vn/web/tuitionlink1')
  assert.notEqual(request.cta.payment_link_id, request.checkoutUrl)
  assert.equal(payment.buildTuitionPaymentRequest({ ...{
    customerName: 'Phụ huynh', studentName: 'Học viên', invoiceCode: 'INV-2026-000001', packageName: '3 tháng',
    packageAmount: 5500000, paymentType: 'Đặt cọc 50%', amountDue: 2750000, deadline: '2026-11-15',
    paymentLinkId: 'https://pay.payos.vn/web/tuitionlink1', checkoutUrl: 'https://pay.payos.vn/web/tuitionlink1',
  } }).ok, false)
  assert.equal(payment.tuitionPaymentDispatch(ready, request).state, 'ELIGIBLE')
  assert.equal(payment.tuitionPaymentDispatch(ready, request).code, 'ELIGIBLE')
  assert.equal(payment.tuitionPaymentDispatch(ready, request).sent, false)
  assert.equal(payment.tuitionPaymentDispatch(ready, request).paid, false)
  assert.equal(payment.tuitionPaymentDispatch({ ...ready, enabled: false }, request).state, 'HELD')
  assert.equal(payment.tuitionPaymentDispatch({ ...ready, enabled: false }, request).code, 'ZBS_SEND_DISABLED')
  assert.equal(payment.tuitionPaymentDispatch({ ...ready, status: 'PENDING', enabled: false }, request).code, 'ZBS_TEMPLATE_REQUIRED')
  const verified = {
    ...ready,
    status: 'APPROVED',
    enabled: false,
    provider_template_id: payment.VERIFIED_TUITION_PAYMENT_TEMPLATE_ID,
  }
  const preview = payment.previewVerifiedTuitionPayment(verified, {
    customerName: 'Phụ huynh thử', studentName: 'Học viên thử', invoiceCode: 'INV-2026-000645', packageName: '3 tháng',
    packageAmount: 5500000, paymentType: 'Thanh toán 100%', amountDue: 5500000, deadline: '2026-11-15',
    paymentLinkId: 'synthetic01', checkoutUrl: 'https://pay.payos.vn/web/synthetic01',
  })
  assert.equal(preview.ok, true)
  assert.equal(preview.sent, false)
  assert.equal(preview.templateId, '645028')
  assert.equal(preview.parameters.package_amount, '5500000')
  assert.equal(preview.parameters.amount_due, '5500000')
  assert.equal(preview.parameters.payment_deadline, '15/11/2026')
  assert.equal(preview.parameters.payment_status, 'Chờ thanh toán')
  assert.equal(preview.button.title, 'Thanh toán học phí')
  assert.equal(payment.tuitionPaymentDispatch(verified, request).state, 'HELD')
  assert.equal(payment.tuitionPaymentDispatch(verified, request).templateId, '645028')
  const gate = status.paymentTemplateGate(verified)
  assert.equal(gate.ready, true)
  assert.equal(gate.sendingEnabled, false)
  assert.equal(gate.code, 'ZBS_SEND_DISABLED')
  assert.equal(gate.templateId, '645028')
  assert.equal(status.paymentTemplateGate({ ...verified, status: 'PENDING', provider_template_id: null }).code, 'ZBS_TEMPLATE_REQUIRED')
  assert.equal(status.persistedPaymentNoticeStatus({ state: 'HELD', code: 'ZBS_SEND_DISABLED' }), 'HELD')
  assert.equal(status.persistedPaymentNoticeStatus({ state: 'ELIGIBLE', code: 'ELIGIBLE' }), 'HELD')
  assert.match(status.paymentNoticeReason('ELIGIBLE', '645028'), /không tự gửi/)
  const held = { key: 'case', outcome: 'HELD', invoiceCode: 'INV-2026-000001', paymentLinkId: 'tuitionlink1' }
  const input = { customerName: 'Phụ huynh', studentName: 'Học viên', invoiceCode: 'INV-2026-000001', packageName: '3 tháng', packageAmount: 5500000, paymentType: 'Đặt cọc 50%', amountDue: 2750000, deadline: '2026-11-15', paymentLinkId: 'tuitionlink1', checkoutUrl: 'https://pay.payos.vn/web/tuitionlink1' }
  assert.equal(payment.prepareTuitionPaymentRequest({ template: verified, input, linkInvoiceCode: 'INV-2026-000001', attempt: held }).code, 'DUPLICATE_HELD')
  assert.equal(payment.prepareTuitionPaymentRequest({ template: { ...verified, enabled: true }, input, linkInvoiceCode: 'INV-2026-000001', attempt: held }).code, 'ELIGIBLE')
  assert.equal(payment.prepareTuitionPaymentRequest({ template: { ...verified, enabled: true }, input, linkInvoiceCode: 'INV-OTHER', attempt: held }).code, 'LINK_INVOICE_MISMATCH')
  assert.equal(payment.prepareTuitionPaymentRequest({ template: { ...verified, enabled: true }, input, linkInvoiceCode: input.invoiceCode, attempt: { ...held, outcome: 'UNKNOWN' } }).code, 'UNKNOWN_NOT_RETRIED')
  assert.equal(payment.prepareTuitionPaymentRequest({ template: { ...verified, enabled: true }, input, linkInvoiceCode: input.invoiceCode, attempt: { ...held, outcome: 'SENT' } }).code, 'ALREADY_RECORDED')
  const calls = []
  const ledger = payment.createTuitionPaymentLedger()
  const provider = { send: async () => { calls.push('send'); return 'ACCEPTED' } }
  assert.equal((await payment.dispatchAuthorizedTuitionPayment({ template: { ...verified, enabled: true }, input, linkInvoiceCode: input.invoiceCode, attempt: held, authorized: false, provider, ledger })).code, 'UNAUTHORIZED')
  assert.equal(calls.length, 0)
  const sent = await payment.dispatchAuthorizedTuitionPayment({ template: { ...verified, enabled: true }, input, linkInvoiceCode: input.invoiceCode, attempt: held, authorized: true, provider, ledger })
  assert.equal(sent.code, 'ACCEPTED')
  assert.equal(sent.paid, false)
  assert.equal(calls.length, 1)
  assert.equal((await payment.dispatchAuthorizedTuitionPayment({ template: { ...verified, enabled: true }, input, linkInvoiceCode: input.invoiceCode, attempt: { ...held, outcome: 'SENT' }, authorized: true, provider, ledger })).providerCalls, 0)
  assert.equal(status.persistedPaymentNoticeStatus({ state: 'BLOCKED', code: 'ZBS_TEMPLATE_REQUIRED' }), 'AWAITING_TEMPLATE')
  assert.equal(status.storedZbsStatusLabel('HELD'), 'Đã lưu: gửi đang tắt')
  assert.equal(status.storedZbsStatusLabel('AWAITING_TEMPLATE'), 'Đã lưu: chờ mẫu')
  assert.match(status.paymentNoticeReason('ZBS_SEND_DISABLED', '645028'), /đã cấu hình/)
  assert.match(status.paymentNoticeReason('ZBS_TEMPLATE_REQUIRED', null), /chưa có mã/)
  const again = payment.tuitionPaymentDispatch(verified, request)
  assert.equal(again.code, 'ZBS_SEND_DISABLED')
  assert.equal(again.state, 'HELD')
  assert.equal(payment.previewVerifiedTuitionPayment({ ...verified, parameter_schema: ['amount', 'due_date'] }, {
    customerName: 'Phụ huynh thử', studentName: 'Học viên thử', invoiceCode: 'INV-2026-000645', packageName: '3 tháng',
    packageAmount: 5500000, paymentType: 'Thanh toán 100%', amountDue: 5500000, deadline: '2026-11-15',
    paymentLinkId: 'synthetic01', checkoutUrl: 'https://pay.payos.vn/web/synthetic01',
  }).code, 'SCHEMA_UNVERIFIED')
  assert.deepEqual(payment.buildTuitionPaymentConfirmation('Đã nhận cọc 50%').body, { payment_status: 'Đã nhận cọc 50%' })
  assert.deepEqual(payment.buildTuitionPaymentConfirmation('Đã thanh toán').body, { payment_status: 'Đã thanh toán' })
  assert.equal(payment.TUITION_PAYMENT_CONFIRMATION === payment.TUITION_PAYMENT_REQUEST, false)
  const action = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app/admin/tuition/reminders/renewal-actions.ts'), 'utf8')
  assert.doesNotMatch(action, /643118|640377/)
})

test('renewal action ignores a submitted price and reuses one checkout', () => {
  const source = readFileSync(path.join(__dirname, '../app/admin/tuition/reminders/renewal-actions.ts'), 'utf8')
  assert.match(source, /p_asserted_price: null/)
  assert.match(source, /form\.has\('list_price'\)/)
  assert.match(source, /retryTuitionPayos/)
  assert.doesNotMatch(source, /sendManualTuitionZalo|createPayosPaymentLink/)
  const route = readFileSync(path.join(__dirname, '../app/api/integrations/payos/webhook/route.ts'), 'utf8')
  const registration = route.indexOf('record_verified_payos_webhook')
  const tuition = route.indexOf('record_verified_tuition_payos_webhook')
  assert.ok(registration > 0 && tuition > registration)
})

test('a rejected ready token is refreshed once before the payment template is posted', async () => {
  const send = harness().load('../../../lib/integrations/tuition/payment-send.ts')
  const calls = []
  let infoCalls = 0
  let renewals = 0
  const parameters = {
    customer_name: 'Phụ huynh', payment_status: 'Chờ thanh toán', student_name: 'Học viên', invoice_code: 'INV-2026-000347',
    tuition_package: '3 tháng', package_amount: '5500000', payment_type: 'Đặt cọc 50%', amount_due: '2750000',
    payment_deadline: '31/10/2026', payment_link_id: 'abc12345',
  }
  const result = await send.sendTuitionPaymentTemplate({
    phone: '0901234567', templateId: '645028', trackingId: 'track1234', parameters,
  }, { ZALO_PILOT_OUTBOUND: 'enabled', ZALO_APP_SECRET: 'secret' }, {
    readCredential: async () => ({ access_token: 'stored', state: 'READY', expires_at: new Date(Date.now() + 3600000).toISOString() }),
    renewCredential: async () => { renewals += 1; return { access_token: 'renewed' } },
    transport: async (url, init) => {
      calls.push(init.method)
      if (init.method === 'GET') {
        infoCalls += 1
        return { status: 200, json: async () => infoCalls === 1 ? { error: -124 } : { error: 0, data: { status: 'ENABLE', templateId: 645028 } } }
      }
      assert.equal(JSON.parse(init.body).template_id, '645028')
      return { status: 200, json: async () => ({ error: 0, data: { msg_id: 'msg123456' } }) }
    },
  })
  assert.equal(result.outcome, 'ACCEPTED')
  assert.equal(result.reason, 'ACCEPTED')
  assert.equal(renewals, 1)
  assert.deepEqual(calls, ['GET', 'GET', 'POST'])
})

test('tuition payOS return stays on the reminder page', () => {
  const payos = harness().load('../../../lib/integrations/tuition/renewal-payos.ts')
  const urls = payos.payosTuitionReturnUrls({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
  assert.equal(urls.returnUrl, 'http://localhost:3000/admin/tuition/reminders')
  assert.throws(() => payos.payosTuitionReturnUrls({ NEXT_PUBLIC_APP_URL: 'http://user:pass@localhost:3000' }), /PAYOS_RETURN_URL_INVALID/)
})
