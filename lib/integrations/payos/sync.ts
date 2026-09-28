import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { readPayosPayment } from './client'
import { dispatchPreviewRegistrationZalo } from '@/lib/integrations/zalo/preview-dispatch'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function syncPendingPayosPayment(applicationId: string, orderCode: number, paymentLinkId: string, amount: number) {
  if (!uuidPattern.test(applicationId) || !Number.isSafeInteger(orderCode)) return 'SKIPPED'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl?.startsWith('http://127.0.0.1:') && !supabaseUrl?.startsWith('http://localhost:')) return 'SKIPPED'
  const client = await createClient()
  const { data: claims, error: authError } = await client.auth.getClaims()
  if (authError || !claims?.claims) return 'SKIPPED'
  // The user-scoped query enforces branch access and binds all values to the stored order.
  const { data: order, error: orderError } = await client.from('registration_payos_orders')
    .select('order_code, amount, payment_link_id, state').eq('application_id', applicationId)
    .eq('order_code', orderCode).eq('state', 'PENDING').maybeSingle()
  if (orderError || !order || order.payment_link_id !== paymentLinkId || Number(order.amount) !== amount) return 'SKIPPED'
  let paid
  try { paid = await readPayosPayment(orderCode) } catch { return 'UNAVAILABLE' }
  if (!paid || paid.orderCode !== orderCode || paid.paymentLinkId !== paymentLinkId || paid.transactionAmount !== amount || paid.amount !== amount) {
    return 'UNPAID'
  }
  const admin = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.rpc('record_verified_payos_webhook', {
    p_order_code: orderCode,
    p_payment_link_id: paymentLinkId,
    p_reference: paid.reference,
    p_amount: paid.transactionAmount,
    p_currency: 'VND',
  })
  if (error && !error.message?.includes('ALREADY_PAID')) return 'NOT_RECORDED'
  await dispatchPreviewRegistrationZalo(admin, orderCode)
  return 'RECORDED'
}
