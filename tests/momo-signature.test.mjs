import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { parseMomoIpn, signMomoCreate, verifyMomoIpn } from '../lib/integrations/momo/signature.ts'

test('create request uses the documented MoMo field order', () => {
  const request = { accessKey: 'access', secretKey: 'secret', amount: 250000,
    extraData: '', ipnUrl: 'https://example.com/ipn', orderId: 'VIBE123',
    orderInfo: 'Deposit', partnerCode: 'PARTNER', redirectUrl: 'https://example.com/return',
    requestId: 'REQ123', requestType: 'captureWallet' }
  const raw = 'accessKey=access&amount=250000&extraData=&ipnUrl=https://example.com/ipn&orderId=VIBE123&orderInfo=Deposit&partnerCode=PARTNER&redirectUrl=https://example.com/return&requestId=REQ123&requestType=captureWallet'
  assert.equal(signMomoCreate(request), createHmac('sha256', 'secret').update(raw).digest('hex'))
})

test('IPN requires a valid HMAC and rejects changed amount or nonnumeric payload', () => {
  const ipn = { amount: 250000, extraData: '', message: 'Successful.', orderId: 'VIBE123',
    orderInfo: 'Deposit', orderType: 'momo_wallet', partnerCode: 'PARTNER', payType: 'qr',
    requestId: 'REQ123', responseTime: 1721720663942, resultCode: 0, transId: 4088878653 }
  const raw = 'accessKey=access&amount=250000&extraData=&message=Successful.&orderId=VIBE123&orderInfo=Deposit&orderType=momo_wallet&partnerCode=PARTNER&payType=qr&requestId=REQ123&responseTime=1721720663942&resultCode=0&transId=4088878653'
  const signed = { ...ipn, signature: createHmac('sha256', 'secret').update(raw).digest('hex') }
  assert.equal(verifyMomoIpn(signed, 'access', 'secret'), true)
  assert.equal(verifyMomoIpn({ ...signed, amount: 249999 }, 'access', 'secret'), false)
  assert.equal(parseMomoIpn({ ...signed, amount: '250000' }), null)
  assert.equal(parseMomoIpn({ ...signed, signature: 'bad' }), null)
})
