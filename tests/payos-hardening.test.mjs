import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createPayosPaymentLink, readPayosPayment, payosDataSignature, payosReturnUrls, payosCheckoutError, payosConfigurationGaps } from '../lib/integrations/payos/client.ts'
const env = { PAYOS_CLIENT_ID: 'test', PAYOS_API_KEY: 'test', PAYOS_CHECKSUM_KEY: 'test', PAYOS_PUBLIC_ORIGIN: 'https://app.example' }
const input = { orderCode: 12345, amount: 2750000, description: 'V12345', returnUrl: 'https://app.example/return', cancelUrl: 'https://app.example/cancel' }
const data = { ...input, currency: 'VND', status: 'PENDING', paymentLinkId: 'link', checkoutUrl: 'https://pay.payos.vn/web/link', qrCode: 'qr' }
const signed = data => ({ code: '00', data, signature: payosDataSignature(data, env.PAYOS_CHECKSUM_KEY) })
function mock(t, body, status = 200) { t.mock.method(globalThis, 'fetch', async () => Response.json(body, { status })) }
test('valid signed checkout is accepted', async t => { mock(t, signed(data)); assert.equal((await createPayosPaymentLink(input, env)).orderCode, input.orderCode) })
test('provider rejection is diagnosable without disclosing raw provider text', async t => {
  mock(t, { code: '231', desc: 'sensitive provider details' })
  await assert.rejects(createPayosPaymentLink(input, env), /PAYOS_API_231/)
  assert.equal(payosCheckoutError(new Error('sensitive provider details')).includes('sensitive'), false)
})
test('HTTP authentication failures preserve a safe diagnostic code', async t => { mock(t, {}, 401); await assert.rejects(createPayosPaymentLink(input, env), /PAYOS_HTTP_401/) })
test('unsigned and tampered checkout responses are rejected', async t => {
  mock(t, { ...signed(data), data: { ...data, amount: 1 } }); await assert.rejects(createPayosPaymentLink(input, env), /PAYOS_SIGNATURE_REJECTED/)
})
test('signed wrong amount is rejected', async t => { mock(t, signed({ ...data, amount: 1 })); await assert.rejects(createPayosPaymentLink(input, env), /PAYOS_CHECKOUT_MISMATCH/) })
test('signed lookalike payment domain is rejected', async t => { mock(t, signed({ ...data, checkoutUrl: 'https://pay.payos.vn.evil.example/link' })); await assert.rejects(createPayosPaymentLink(input, env), /PAYOS_CHECKOUT_MISMATCH/) })
test('invalid amount makes no network request', async t => { const fn=t.mock.method(globalThis, 'fetch', async () => { throw Error('unexpected') }); await assert.rejects(createPayosPaymentLink({ ...input, amount: NaN }, env), /PAYOS_INPUT_INVALID/); assert.equal(fn.mock.callCount(), 0) })
test('return URL uses configured application and validates protocol', () => {
  const path='/admin/business/registrations/70154e4e-bed1-49ae-ba3b-706e5b81077c'
  assert.equal(payosReturnUrls(path, env).returnUrl, env.PAYOS_PUBLIC_ORIGIN+path)
  assert.equal(payosReturnUrls(path, { ...env, NEXT_PUBLIC_APP_URL:'http://localhost:3000' }).returnUrl, 'http://localhost:3000'+path)
  assert.throws(() => payosReturnUrls(path, { ...env, NEXT_PUBLIC_APP_URL:'javascript:alert(1)' }))
  assert.deepEqual(payosConfigurationGaps({ ...env, PAYOS_PUBLIC_ORIGIN:'https://' }), ['PAYOS_PUBLIC_ORIGIN'])
})
test('array signatures follow provider canonical sorting and null handling', () => {
  const raw='a=&transactions=[{"amount":10,"reference":"ref"}]'
  assert.equal(payosDataSignature({ transactions:[{reference:'ref',amount:10}], a:'null' }, 'key'), createHmac('sha256','key').update(raw).digest('hex'))
})
const paid = { orderCode: input.orderCode, amount: input.amount, status:'PAID', id:'link', transactions:[{reference:'ref',amount:input.amount}] }
test('signed paid response requires an explicit matching transaction amount', async t => { mock(t, signed(paid)); assert.equal((await readPayosPayment(input.orderCode,env)).transactionAmount,input.amount) })
test('missing transaction amount cannot fall back to the order total', async t => { mock(t,signed({...paid,transactions:[{reference:'ref'}]})); assert.equal(await readPayosPayment(input.orderCode,env),null) })
test('multiple transactions cannot be recorded as one payment', async t => { mock(t,signed({...paid,transactions:[{reference:'ref',amount:1},{reference:'ref2',amount:input.amount-1}]})); assert.equal(await readPayosPayment(input.orderCode,env),null) })
test('wrong order cannot be reconciled', async t => { mock(t,signed({...paid,orderCode:999})); assert.equal(await readPayosPayment(input.orderCode,env),null) })
