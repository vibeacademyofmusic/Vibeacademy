import { createClient } from '@supabase/supabase-js'
import { parseMomoIpn, verifyMomoIpn } from '@/lib/integrations/momo/signature'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const accessKey = process.env.MOMO_ACCESS_KEY
  const secretKey = process.env.MOMO_SECRET_KEY
  const partnerCode = process.env.MOMO_PARTNER_CODE
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!accessKey || !secretKey || !partnerCode || !supabaseUrl || !serviceKey) {
    return new Response(null, { status: 503 })
  }
  if (!request.headers.get('content-type')?.includes('application/json') ||
      Number(request.headers.get('content-length') || 0) > 16_384) {
    return new Response(null, { status: 400 })
  }
  let body: unknown
  try {
    const raw = await request.text()
    if (raw.length > 16_384) return new Response(null, { status: 413 })
    body = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }
  const ipn = parseMomoIpn(body)
  if (!ipn || ipn.partnerCode !== partnerCode || !verifyMomoIpn(ipn, accessKey, secretKey)) {
    return new Response(null, { status: 401 })
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: order, error: lookupError } = await admin.from('registration_momo_orders')
    .select('request_id, amount, partner_code').eq('order_id', ipn.orderId).maybeSingle()
  if (lookupError) return new Response(null, { status: 503 })
  if (!order || order.request_id !== ipn.requestId || order.amount !== ipn.amount ||
      order.partner_code !== partnerCode) return new Response(null, { status: 409 })
  const { error } = await admin.rpc('record_verified_momo_ipn', {
    p_order_id: ipn.orderId,
    p_partner_code: ipn.partnerCode,
    p_transaction_id: String(ipn.transId),
    p_amount: ipn.amount,
    p_result_code: ipn.resultCode,
  })
  if (error) return new Response(null, { status: 503 })
  return new Response(null, { status: 204 })
}
