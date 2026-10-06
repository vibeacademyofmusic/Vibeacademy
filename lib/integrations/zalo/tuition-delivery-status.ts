import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getZaloCredential } from './oauth'
import { zaloAccessHeaders } from './app-secret-proof'
import { normalizeVnPhone } from './phone'

export const ZALO_PHONE_STATUS_URL = 'https://business.openapi.zalo.me/message/status'

type DeliveryResult =
  | { state: 'DELIVERED'; deliveryTime: string | null }
  | { state: 'PENDING' }
  | { state: 'NOT_FOUND' }
  | { state: 'ALREADY_DELIVERED' }
  | { state: 'MISSING_SEND' }
  | { state: 'MISSING_PHONE' }
  | { state: 'NOT_CONFIGURED' }
  | { state: 'PROVIDER_ERROR'; error: number | null }

function statusUrl(messageId: string, phone: string) {
  const url = new URL(ZALO_PHONE_STATUS_URL)
  url.searchParams.set('message_id', messageId)
  url.searchParams.set('phone', phone)
  return url.toString()
}

function providerBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as { error?: unknown; data?: { status?: unknown; delivery_time?: unknown } }
  const error = typeof body.error === 'number' && Number.isSafeInteger(body.error) ? body.error : null
  const status = typeof body.data?.status === 'number' && Number.isSafeInteger(body.data.status) ? body.data.status : null
  const deliveryTime = typeof body.data?.delivery_time === 'string' ? body.data.delivery_time : null
  return { error, status, deliveryTime }
}

export async function reconcileTuitionZaloSendDelivery(
  admin: SupabaseClient,
  sendId: string,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Promise<DeliveryResult> {
  const sendResult = await admin.from('tuition_zalo_sends')
    .select('id,parent_id,tracking_id,provider_message_id,send_status')
    .eq('id', sendId)
    .maybeSingle()

  const send = sendResult.data as {
    id: string
    parent_id: string
    tracking_id: string
    provider_message_id: string | null
    send_status: string
  } | null

  if (sendResult.error || !send || !send.provider_message_id) return { state: 'MISSING_SEND' }
  if (send.send_status === 'DELIVERED') return { state: 'ALREADY_DELIVERED' }
  if (send.send_status !== 'SENT') return { state: 'MISSING_SEND' }

  const parent = await admin.from('parents').select('user_id').eq('id', send.parent_id).maybeSingle()
  if (parent.error || !parent.data?.user_id) return { state: 'MISSING_PHONE' }
  const profile = await admin.from('profiles').select('phone').eq('id', parent.data.user_id).maybeSingle()
  const phone = typeof profile.data?.phone === 'string' ? normalizeVnPhone(profile.data.phone) : null
  if (profile.error || !phone) return { state: 'MISSING_PHONE' }

  const appSecret = env.ZALO_APP_SECRET?.trim() ?? ''
  if (!appSecret) return { state: 'NOT_CONFIGURED' }

  let credential
  try {
    credential = await getZaloCredential(admin as never, env, request)
  } catch {
    return { state: 'NOT_CONFIGURED' }
  }
  if (!credential.access_token) return { state: 'NOT_CONFIGURED' }

  let response: Response
  try {
    response = await request(statusUrl(send.provider_message_id, phone), {
      method: 'GET',
      headers: {
        ...zaloAccessHeaders(credential.access_token, appSecret),
        accept: 'application/json',
      },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    return { state: 'PROVIDER_ERROR', error: null }
  }

  let parsed
  try { parsed = providerBody(await response.json()) } catch { parsed = null }
  if (!parsed || parsed.error == null || parsed.error !== 0 || parsed.status == null) {
    return { state: 'PROVIDER_ERROR', error: parsed?.error ?? null }
  }

  if (parsed.status === 0) return { state: 'PENDING' }
  if (parsed.status === -1) return { state: 'NOT_FOUND' }
  if (parsed.status !== 1) return { state: 'PROVIDER_ERROR', error: parsed.error }

  const deliveryTime = parsed.deliveryTime && /^\d{13}$/.test(parsed.deliveryTime)
    ? parsed.deliveryTime
    : String(Date.now())

  const applied = await admin.rpc('note_tuition_zalo_delivery', {
    p_tracking_id: send.tracking_id,
    p_message_id: send.provider_message_id,
    p_delivery_time: deliveryTime,
  })
  if (applied.error || !['DELIVERED', 'IDEMPOTENT'].includes(String(applied.data))) {
    return { state: 'PROVIDER_ERROR', error: null }
  }
  return { state: 'DELIVERED', deliveryTime: parsed.deliveryTime }
}

export async function reconcilePendingTuitionZaloDeliveries(
  admin: SupabaseClient,
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
  limit = 10,
) {
  const sends = await admin.from('tuition_zalo_sends')
    .select('id')
    .eq('send_status', 'SENT')
    .not('provider_message_id', 'is', null)
    .order('sent_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 20)))

  if (sends.error) return { state: 'UNAVAILABLE' as const, checked: 0, delivered: 0, pending: 0, missing: 0, failed: 0 }

  let delivered = 0
  let pending = 0
  let missing = 0
  let failed = 0
  for (const row of sends.data ?? []) {
    const result = await reconcileTuitionZaloSendDelivery(admin, String(row.id), env, request)
    if (result.state === 'DELIVERED' || result.state === 'ALREADY_DELIVERED') delivered += 1
    else if (result.state === 'PENDING') pending += 1
    else if (result.state === 'NOT_FOUND') missing += 1
    else failed += 1
  }

  return {
    state: 'OK' as const,
    checked: (sends.data ?? []).length,
    delivered,
    pending,
    missing,
    failed,
  }
}
