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

test('payment request matches the approved ZBS contract and does not reuse reminder templates', () => {
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
  assert.equal(payment.tuitionPaymentDispatch(ready, request).state, 'HELD')
  assert.equal(payment.tuitionPaymentDispatch({ ...ready, status: 'PENDING', enabled: false }, request).code, 'ZBS_TEMPLATE_REQUIRED')
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

test('tuition payOS return stays on the reminder page', () => {
  const payos = harness().load('../../../lib/integrations/tuition/renewal-payos.ts')
  const urls = payos.payosTuitionReturnUrls({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
  assert.equal(urls.returnUrl, 'http://localhost:3000/admin/tuition/reminders')
  assert.throws(() => payos.payosTuitionReturnUrls({ NEXT_PUBLIC_APP_URL: 'http://user:pass@localhost:3000' }), /PAYOS_RETURN_URL_INVALID/)
})
