import { createClient } from '@supabase/supabase-js'
import { isPayosWebhookSample, payosSignatureMatches } from '@/lib/integrations/payos/client'
import { dispatchPreviewRegistrationZalo } from '@/lib/integrations/zalo/preview-dispatch'

export const runtime = 'nodejs'

function dataRecord(body: unknown): { data: Record<string, unknown>; signature: string; success: boolean; code: string } | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const data = record.data
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof record.signature !== 'string') return null
  return {
    data: data as Record<string, unknown>,
    signature: record.signature,
    success: record.success === true,
    code: typeof record.code === 'string' ? record.code : '',
  }
}

export async function POST(request: Request) {
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const webhookEnabled = process.env.PAYOS_WEBHOOK_ENABLED === 'true'
  if (!checksumKey || !supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: 'PAYOS_NOT_CONFIGURED' }, { status: 503 })
  }
  // Fail closed in every hosted environment unless PayOS callbacks are explicitly enabled.
  // This replaces the old localhost-only pilot gate so staging/production can process
  // verified callbacks without ever treating redirects, ZBS events, or checkout creation as payment.
  if (!webhookEnabled) {
    return Response.json({ ok: false, error: 'PAYOS_WEBHOOK_DISABLED' }, { status: 503 })
  }
  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > 16_384) return Response.json({ ok: false }, { status: 413 })
    body = JSON.parse(raw)
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
  const parsed = dataRecord(body)
  if (!parsed || !payosSignatureMatches(parsed.data, parsed.signature, checksumKey)) {
    return Response.json({ ok: false, error: 'PAYOS_SIGNATURE_REJECTED' }, { status: 401 })
  }
  if (isPayosWebhookSample(parsed.data)) {
    return Response.json({ ok: true, sample: true })
  }
  if (!parsed.success || parsed.code !== '00' || parsed.data.code !== '00' || parsed.data.currency !== 'VND') {
    return Response.json({ ok: true, ignored: true })
  }
  const orderCode = Number(parsed.data.orderCode)
  const amount = Number(parsed.data.amount)
  const reference = typeof parsed.data.reference === 'string' ? parsed.data.reference : ''
  const paymentLinkId = typeof parsed.data.paymentLinkId === 'string' ? parsed.data.paymentLinkId : ''
  if (!Number.isSafeInteger(orderCode) || !Number.isSafeInteger(amount) || !reference) {
    return Response.json({ ok: false, error: 'PAYOS_PAYLOAD_INVALID' }, { status: 400 })
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.rpc('record_verified_payos_webhook', {
    p_order_code: orderCode,
    p_payment_link_id: paymentLinkId,
    p_reference: reference,
    p_amount: amount,
    p_currency: 'VND',
  })
  if (!error) {
    await dispatchPreviewRegistrationZalo(admin, orderCode)
    return Response.json({ ok: true })
  }
  let message = error.message ?? ''
  if (message.includes('PAYOS_ORDER_UNKNOWN')) {
    const tuition = await admin.rpc('record_verified_tuition_payos_webhook', {
      p_order_code: orderCode,
      p_payment_link_id: paymentLinkId,
      p_reference: reference,
      p_amount: amount,
      p_currency: 'VND',
    })
    if (!tuition.error) return Response.json({ ok: true, tuition: true })
    message = tuition.error.message ?? message
  }
  console.info('payos-webhook', { orderCode, reason: message.slice(0, 80) })
  if (message.includes('PAYOS_ORDER_UNKNOWN')) return Response.json({ ok: false, error: 'PAYOS_ORDER_UNKNOWN' }, { status: 409 })
  if (message.includes('PAYOS_AMOUNT_MISMATCH') || message.includes('PAYOS_LINK_MISMATCH') || message.includes('PAYOS_REFERENCE_CONFLICT')) {
    return Response.json({ ok: false, error: 'PAYOS_MISMATCH' }, { status: 409 })
  }
  return Response.json({ ok: false, error: 'PAYOS_RETRY' }, { status: 503 })
}
