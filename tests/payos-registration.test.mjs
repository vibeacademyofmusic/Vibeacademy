import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  PAYOS_WEBHOOK_SAMPLE, isPayosWebhookSample, payosConfigurationGaps, payosCreateSignature, payosDataSignature, payosSignatureMatches,
} from '../lib/integrations/payos/client.ts'

const key = 'checksum-test'

test('payment link signature uses the documented payOS field order', () => {
  const input = {
    amount: 2750000, cancelUrl: 'https://preview.example/cancel', description: 'V260925100',
    orderCode: 260925100, returnUrl: 'https://preview.example/return',
  }
  const raw = 'amount=2750000&cancelUrl=https://preview.example/cancel&description=V260925100&orderCode=260925100&returnUrl=https://preview.example/return'
  assert.equal(payosCreateSignature(input, key), createHmac('sha256', key).update(raw).digest('hex'))
})

test('webhook sample is recognized and a changed amount is not', () => {
  assert.equal(isPayosWebhookSample({ ...PAYOS_WEBHOOK_SAMPLE }), true)
  assert.equal(isPayosWebhookSample({ ...PAYOS_WEBHOOK_SAMPLE, amount: 2750000 }), false)
})

test('webhook signature rejects a tampered amount', () => {
  const data = { orderCode: 260925100, amount: 2750000, description: 'V260925100', reference: 'FT1', currency: 'VND', paymentLinkId: 'link-1' }
  const signature = payosDataSignature(data, key)
  assert.equal(payosSignatureMatches(data, signature, key), true)
  assert.equal(payosSignatureMatches({ ...data, amount: 1000 }, signature, key), false)
})

test('configuration guard names only the missing payOS variables', () => {
  const complete = { PAYOS_CLIENT_ID: 'id', PAYOS_API_KEY: 'key', PAYOS_CHECKSUM_KEY: 'sum', PAYOS_PUBLIC_ORIGIN: 'https://preview.example' }
  assert.deepEqual(payosConfigurationGaps(complete), [])
  assert.deepEqual(payosConfigurationGaps({ ...complete, PAYOS_CHECKSUM_KEY: '' }), ['PAYOS_CHECKSUM_KEY'])
  const actions = readFileSync(new URL('../app/admin/business/registrations/actions.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/admin/business/registrations/[id]/page.tsx', import.meta.url), 'utf8')
  assert.match(actions, /Thiếu \$\{gaps\.join\(', '\)\}/)
  assert.match(readFileSync(new URL('../app/admin/business/registrations/status.ts', import.meta.url), 'utf8'), /Hồ sơ đã được cập nhật/)
  assert.match(page, /query\.error === 'REGISTRATION_STALE' && \(app\.status === 'PAID' \|\| app\.status === 'COMPLETED' \|\| checkoutRecorded\)/)
})

test('webhook route accepts the payOS sample before any payment RPC', () => {
  const route = readFileSync(new URL('../app/api/integrations/payos/webhook/route.ts', import.meta.url), 'utf8')
  const sampleAt = route.indexOf('isPayosWebhookSample')
  const rpcAt = route.indexOf('record_verified_payos_webhook')
  assert.ok(sampleAt > 0 && rpcAt > sampleAt)
  assert.match(route, /sample: true/)
  assert.match(route, /PAYOS_SIGNATURE_REJECTED/)
})

test('checkout action ignores a browser amount and the page does not treat return query as paid', () => {
  const actions = readFileSync(new URL('../app/admin/business/registrations/actions.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/admin/business/registrations/[id]/page.tsx', import.meta.url), 'utf8')
    + readFileSync(new URL('../app/admin/business/registrations/[id]/PayosAwaiting.tsx', import.meta.url), 'utf8')
  const checkout = actions.slice(actions.indexOf('createRegistrationPayosCheckout'))
  assert.equal(checkout.includes('formData.get(\'amount\')'), false)
  assert.match(page, /Đang chờ payOS xác nhận/)
  assert.equal(page.includes('searchParams.success'), false)
  assert.match(page, /query\.payos === 'cancel'/)
})
