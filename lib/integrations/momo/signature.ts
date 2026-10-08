import { createHmac, timingSafeEqual } from 'node:crypto'

type Scalar = string | number

function hmac(secret: string, raw: string): string {
  return createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
}

export function signMomoCreate(input: {
  accessKey: string; secretKey: string; amount: number; extraData: string;
  ipnUrl: string; orderId: string; orderInfo: string; partnerCode: string;
  redirectUrl: string; requestId: string; requestType: string
}): string {
  const raw = `accessKey=${input.accessKey}&amount=${input.amount}&extraData=${input.extraData}` +
    `&ipnUrl=${input.ipnUrl}&orderId=${input.orderId}&orderInfo=${input.orderInfo}` +
    `&partnerCode=${input.partnerCode}&redirectUrl=${input.redirectUrl}` +
    `&requestId=${input.requestId}&requestType=${input.requestType}`
  return hmac(input.secretKey, raw)
}

export function verifyMomoCreateResponse(input: Record<string, unknown>, accessKey: string, secretKey: string): boolean {
  const keys = ['amount', 'message', 'orderId', 'partnerCode', 'payUrl', 'requestId', 'responseTime', 'resultCode']
  if (keys.some(key => typeof input[key] !== 'string' && typeof input[key] !== 'number') ||
      typeof input.signature !== 'string' || !/^[a-f0-9]{64}$/i.test(input.signature)) return false
  const raw = `accessKey=${accessKey}&amount=${input.amount}&message=${input.message}` +
    `&orderId=${input.orderId}&partnerCode=${input.partnerCode}&payUrl=${input.payUrl}` +
    `&requestId=${input.requestId}&responseTime=${input.responseTime}&resultCode=${input.resultCode}`
  const expected = Buffer.from(hmac(secretKey, raw), 'hex')
  const received = Buffer.from(input.signature, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export type MomoIpn = {
  amount: number; extraData: string; message: string; orderId: string;
  orderInfo: string; orderType: string; partnerCode: string; payType: string;
  requestId: string; responseTime: number; resultCode: number;
  transId: number; signature: string
}

export function parseMomoIpn(input: unknown): MomoIpn | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const textKeys = ['extraData', 'message', 'orderId', 'orderInfo', 'orderType',
    'partnerCode', 'payType', 'requestId', 'signature']
  const numberKeys = ['amount', 'responseTime', 'resultCode', 'transId']
  if (textKeys.some(key => typeof row[key] !== 'string') ||
      numberKeys.some(key => typeof row[key] !== 'number' || !Number.isSafeInteger(row[key]))) return null
  if (!Number.isSafeInteger(row.amount) || (row.amount as number) <= 0 ||
      !/^[a-f0-9]{64}$/i.test(row.signature as string)) return null
  return row as MomoIpn
}

export function verifyMomoIpn(input: MomoIpn, accessKey: string, secretKey: string): boolean {
  const values: Record<string, Scalar> = { accessKey, amount: input.amount,
    extraData: input.extraData, message: input.message, orderId: input.orderId,
    orderInfo: input.orderInfo, orderType: input.orderType, partnerCode: input.partnerCode,
    payType: input.payType, requestId: input.requestId, responseTime: input.responseTime,
    resultCode: input.resultCode, transId: input.transId }
  const raw = Object.keys(values).sort().map(key => `${key}=${values[key]}`).join('&')
  const expected = Buffer.from(hmac(secretKey, raw), 'hex')
  const received = Buffer.from(input.signature, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}
