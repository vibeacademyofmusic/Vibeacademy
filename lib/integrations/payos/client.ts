import { createHmac, timingSafeEqual } from 'node:crypto'

const PAYOS_API = 'https://api-merchant.payos.vn/v2/payment-requests'

export const PAYOS_WEBHOOK_SAMPLE = {
  orderCode: 123,
  amount: 3000,
  description: 'VQRIO123',
  accountNumber: '12345678',
  reference: 'TF230204212323',
  transactionDateTime: '2023-02-04 18:25:00',
  currency: 'VND',
  paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
  code: '00',
  desc: 'Thành công',
} as const

export function payosCreateSignature(input: {
  amount: number
  cancelUrl: string
  description: string
  orderCode: number
  returnUrl: string
}, checksumKey: string): string {
  const raw = `amount=${input.amount}&cancelUrl=${input.cancelUrl}&description=${input.description}&orderCode=${input.orderCode}&returnUrl=${input.returnUrl}`
  return createHmac('sha256', checksumKey).update(raw).digest('hex')
}

export function payosDataSignature(data: Record<string, unknown>, checksumKey: string): string {
  const raw = Object.keys(data).sort().filter(key => data[key] !== undefined).map(key => {
    let value = data[key]
    if (Array.isArray(value)) {
      value = JSON.stringify(value.map(item => item && typeof item === 'object'
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item))
    }
    return `${key}=${value == null || value === 'null' || value === 'undefined' ? '' : String(value)}`
  }).join('&')
  return createHmac('sha256', checksumKey).update(raw).digest('hex')
}

export function payosSignatureMatches(data: Record<string, unknown>, signature: string, checksumKey: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = Buffer.from(payosDataSignature(data, checksumKey), 'hex')
  const received = Buffer.from(signature, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function isPayosWebhookSample(data: Record<string, unknown>): boolean {
  return data.orderCode === PAYOS_WEBHOOK_SAMPLE.orderCode
    && data.amount === PAYOS_WEBHOOK_SAMPLE.amount
    && data.description === PAYOS_WEBHOOK_SAMPLE.description
    && data.paymentLinkId === PAYOS_WEBHOOK_SAMPLE.paymentLinkId
    && data.reference === PAYOS_WEBHOOK_SAMPLE.reference
}

export type PayosCheckout = {
  orderCode: number
  amount: number
  paymentLinkId: string
  checkoutUrl: string
  qrCode: string
}

export function payosConfigurationGaps(env: NodeJS.ProcessEnv = process.env): string[] {
  const gaps: string[] = []
  if (!env.PAYOS_CLIENT_ID) gaps.push('PAYOS_CLIENT_ID')
  if (!env.PAYOS_API_KEY) gaps.push('PAYOS_API_KEY')
  if (!env.PAYOS_CHECKSUM_KEY) gaps.push('PAYOS_CHECKSUM_KEY')
  try {
    const origin = new URL(env.PAYOS_PUBLIC_ORIGIN ?? '')
    if (origin.protocol !== 'https:' || origin.username || origin.password) gaps.push('PAYOS_PUBLIC_ORIGIN')
  } catch { gaps.push('PAYOS_PUBLIC_ORIGIN') }
  return gaps
}

export function payosConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return payosConfigurationGaps(env).length === 0
}

export function payosReturnUrls(path: string, env: NodeJS.ProcessEnv = process.env) {
  const origin = new URL(env.NEXT_PUBLIC_APP_URL || env.PAYOS_PUBLIC_ORIGIN || '')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) || origin.username || origin.password) {
    throw new Error('PAYOS_RETURN_URL_INVALID')
  }
  if (!/^\/admin\/business\/registrations\/[0-9a-f-]+$/i.test(path)) throw new Error('PAYOS_RETURN_URL_INVALID')
  return { returnUrl: `${origin.origin}${path}`, cancelUrl: `${origin.origin}${path}?payos=cancel` }
}

export function payosCheckoutError(error: unknown): string {
  const code = error instanceof Error && /^PAYOS_[A-Z0-9_]+$/.test(error.message) ? error.message : 'PAYOS_NETWORK_ERROR'
  return `Chưa tạo được link payOS (${code}). Đơn đang được giữ để kiểm tra và thử lại, chưa ghi nhận thanh toán.`
}

export async function createPayosPaymentLink(input: {
  orderCode: number
  amount: number
  description: string
  returnUrl: string
  cancelUrl: string
}, env: NodeJS.ProcessEnv = process.env): Promise<PayosCheckout> {
  const clientId = env.PAYOS_CLIENT_ID
  const apiKey = env.PAYOS_API_KEY
  const checksumKey = env.PAYOS_CHECKSUM_KEY
  if (!clientId || !apiKey || !checksumKey) throw new Error('PAYOS_NOT_CONFIGURED')
  if (!Number.isSafeInteger(input.orderCode) || input.orderCode <= 0 || !Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('PAYOS_INPUT_INVALID')
  const signature = payosCreateSignature({ ...input }, checksumKey)
  const response = await fetch(PAYOS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-client-id': clientId, 'x-api-key': apiKey },
    body: JSON.stringify({ ...input, signature }),
    signal: AbortSignal.timeout(35_000),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`PAYOS_HTTP_${response.status}`)
  const body = await response.json() as { code?: string; desc?: string; signature?: string; data?: Record<string, unknown> }
  if (body.code !== '00') {
    console.info(JSON.stringify({
      component: 'payos_create_result',
      orderCode: input.orderCode,
      amount: input.amount,
      httpStatus: response.status,
      code: typeof body.code === 'string' ? body.code : null,
      desc: typeof body.desc === 'string' ? body.desc.slice(0, 160) : null,
    }))
    throw new Error(`PAYOS_API_${/^[0-9]+$/.test(body.code ?? '') ? body.code : 'REJECTED'}`)
  }
  const data = body.data ?? {}
  if (!body.signature || !payosSignatureMatches(data, body.signature, checksumKey)) throw new Error('PAYOS_SIGNATURE_REJECTED')
  if (body.code !== '00' || data.orderCode !== input.orderCode || Number(data.amount) !== input.amount
      || data.currency !== 'VND' || data.status !== 'PENDING'
      || typeof data.paymentLinkId !== 'string' || !data.paymentLinkId || typeof data.checkoutUrl !== 'string'
      || !data.checkoutUrl.startsWith('https://pay.payos.vn/')) {
    throw new Error('PAYOS_CHECKOUT_MISMATCH')
  }
  return {
    orderCode: input.orderCode,
    amount: input.amount,
    paymentLinkId: data.paymentLinkId,
    checkoutUrl: data.checkoutUrl,
    qrCode: typeof data.qrCode === 'string' ? data.qrCode : '',
  }
}

export type PayosPaymentStatus = {
  status: string
  amount: number
  orderCode: number
  paymentLinkId: string
  reference: string
  transactionAmount: number
}

export async function readPayosPayment(orderCode: number, env: NodeJS.ProcessEnv = process.env): Promise<PayosPaymentStatus | null> {
  const clientId = env.PAYOS_CLIENT_ID
  const apiKey = env.PAYOS_API_KEY
  const checksumKey = env.PAYOS_CHECKSUM_KEY
  if (!clientId || !apiKey || !checksumKey || !Number.isSafeInteger(orderCode) || orderCode <= 0) return null
  const response = await fetch(`${PAYOS_API}/${orderCode}`, {
    headers: { 'x-client-id': clientId, 'x-api-key': apiKey },
    signal: AbortSignal.timeout(35_000),
    cache: 'no-store',
  })
  if (!response.ok) return null
  const body = await response.json() as { code?: string; signature?: string; data?: Record<string, unknown> }
  const data = body.data ?? {}
  if (body.code !== '00' || !body.signature || !payosSignatureMatches(data, body.signature, checksumKey) || Number(data.orderCode) !== orderCode) return null
  const transactions = Array.isArray(data.transactions) ? data.transactions : []
  // Multi-transfer orders require webhook reconciliation, never infer one receipt from a total.
  if (transactions.length !== 1) return null
  const transaction = transactions.find(item => item && typeof item === 'object' && typeof (item as { reference?: unknown }).reference === 'string') as { reference?: string; amount?: number } | undefined
  const paymentLinkId = typeof data.paymentLinkId === 'string' ? data.paymentLinkId : typeof data.id === 'string' ? data.id : ''
  if (body.code !== '00' || data.status !== 'PAID' || !paymentLinkId || !transaction?.reference
      || !Number.isSafeInteger(data.amount) || Number(data.amount) <= 0
      || !Number.isSafeInteger(transaction.amount) || transaction.amount !== data.amount) return null
  return {
    status: 'PAID',
    amount: Number(data.amount),
    orderCode: Number(data.orderCode),
    paymentLinkId,
    reference: transaction.reference,
    transactionAmount: Number(transaction.amount),
  }
}

// Reconcile reserved orders after a timeout or a failed local persistence step.
// A failed lookup never authorizes another create request.
export async function readPayosPendingCheckout(input: { orderCode: number; amount: number }, env: NodeJS.ProcessEnv = process.env): Promise<PayosCheckout> {
  if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY) throw new Error('PAYOS_NOT_CONFIGURED')
  const response = await fetch(`${PAYOS_API}/${input.orderCode}`, {
    headers: { 'x-client-id': env.PAYOS_CLIENT_ID, 'x-api-key': env.PAYOS_API_KEY },
    signal: AbortSignal.timeout(35_000), cache: 'no-store',
  })
  if (!response.ok) throw new Error(`PAYOS_HTTP_${response.status}`)
  const body = await response.json() as { code?: string; desc?: string; signature?: string; data?: Record<string, unknown> }
  if (body.code !== '00') {
    console.info(JSON.stringify({
      component: 'payos_lookup_result',
      orderCode: input.orderCode,
      amount: input.amount,
      httpStatus: response.status,
      code: typeof body.code === 'string' ? body.code : null,
      desc: typeof body.desc === 'string' ? body.desc.slice(0, 160) : null,
    }))
    throw new Error(`PAYOS_LOOKUP_${/^[0-9]+$/.test(body.code ?? '') ? body.code : 'REJECTED'}`)
  }
  const data = body.data ?? {}
  if (!body.signature || !payosSignatureMatches(data, body.signature, env.PAYOS_CHECKSUM_KEY)) throw new Error('PAYOS_SIGNATURE_REJECTED')
  const id = typeof data.id === 'string' ? data.id : data.paymentLinkId
  if (data.orderCode !== input.orderCode || data.amount !== input.amount || data.status !== 'PENDING'
      || data.amountPaid !== 0 || data.amountRemaining !== input.amount
      || !Array.isArray(data.transactions) || data.transactions.length !== 0
      || typeof id !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(id)) throw new Error('PAYOS_RECONCILIATION_REQUIRED')
  return { ...input, paymentLinkId: id, checkoutUrl: `https://pay.payos.vn/web/${id}`, qrCode: '' }
}
