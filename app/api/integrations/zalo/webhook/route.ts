import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  acceptZaloWebhook,
  readZaloWebhookEnv,
  type WebhookRecord,
  type WebhookRecordResult,
} from '@/lib/integrations/zalo/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reserved for a later outbound OA call. This webhook does not read them:
// ZALO_APP_SECRET, ZALO_OA_ACCESS_TOKEN, ZALO_OA_REFRESH_TOKEN.

async function persistZaloWebhook(event: WebhookRecord, serverHeader: string | null): Promise<WebhookRecordResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('UNCONFIGURED')
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.rpc('record_integration_webhook_event', {
    p_provider: event.provider,
    p_external_event_id: event.externalEventId,
    p_event_type: event.eventType,
    p_payload: event.payload,
    p_payload_digest: event.payloadDigest,
    p_supported: event.supported,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row?.event_id || !row.event_status) {
    throw new Error('RECORD_FAILED')
  }
  if (
    event.eventType === 'widget_interaction_accepted' ||
    event.eventType === 'widget_failed_to_sync_user_external_id'
  ) {
    const applied = await client.rpc('apply_zalo_interaction_event', { p_payload: event.payload })
    const linkResult = typeof applied.data === 'string' ? applied.data : 'unreadable'
    if (applied.error || !['activated', 'idempotent', 'review', 'ignored', 'missing'].includes(linkResult)) {
      throw new Error('APPLY_FAILED')
    }
    console.info(JSON.stringify({
      component: 'zalo_webhook',
      result: 'interaction_link',
      event_name: event.eventType,
      link_result: linkResult,
    }))
  }
  if (event.eventType === 'user_received_message') {
    const message = event.payload?.message
    const sender = typeof event.payload?.sender === 'object' && event.payload.sender ? (event.payload.sender as { id?: unknown }).id : null
    const recipient = typeof event.payload?.recipient === 'object' && event.payload.recipient ? (event.payload.recipient as { id?: unknown }).id : null
    const msgId = message && typeof message === 'object' ? (message as { msg_id?: unknown }).msg_id : null
    const trackingId = message && typeof message === 'object' ? (message as { tracking_id?: unknown }).tracking_id : null
    const deliveryTime = message && typeof message === 'object' ? (message as { delivery_time?: unknown }).delivery_time : null
    const oaId = readZaloWebhookEnv(process.env)?.oaId
    if (serverHeader !== 'ZNS' || sender !== oaId || typeof recipient !== 'string' || recipient === oaId || typeof msgId !== 'string' || typeof trackingId !== 'string' || typeof deliveryTime !== 'string') {
      console.info(JSON.stringify({ component: 'zalo_webhook', result: 'phone_delivery_ignored' }))
    } else {
      const applied = await client.rpc('record_zalo_phone_delivery', {
        p_message_id: msgId,
        p_tracking_id: trackingId,
        p_recipient_phone: recipient,
        p_sender_id: sender,
        p_delivery_time: deliveryTime,
      })
      console.info(JSON.stringify({
        component: 'zalo_webhook',
        result: 'phone_delivery',
        link_result: typeof applied.data === 'string' ? applied.data : 'unreadable',
      }))
    }
    const tuitionDelivery = await client.rpc('note_tuition_zalo_delivery', {
      p_tracking_id: typeof trackingId === 'string' ? trackingId : '',
      p_message_id: typeof msgId === 'string' ? msgId : '',
      p_delivery_time: typeof deliveryTime === 'string' ? deliveryTime : '',
    })
    if (tuitionDelivery.error) throw new Error('APPLY_FAILED')
    console.info(JSON.stringify({
      component: 'zalo_webhook',
      result: 'tuition_delivery',
      link_result: typeof tuitionDelivery.data === 'string' ? tuitionDelivery.data : 'unreadable',
    }))
  }
  if (event.eventType === 'user_click_response_button') {
    const oaId = readZaloWebhookEnv(process.env)?.oaId ?? ''
    const applied = await client.rpc('apply_tuition_zalo_response', {
      p_payload: event.payload,
      p_oa_id: oaId,
    })
    if (applied.error) throw new Error('APPLY_FAILED')
    console.info(JSON.stringify({
      component: 'zalo_webhook',
      result: 'tuition_reply',
      reply_result: typeof applied.data === 'string' ? applied.data : 'unreadable',
    }))
  }
  return {
    id: row.event_id,
    status: row.event_status,
    duplicate: row.is_duplicate === true,
  }
}

export async function POST(request: Request) {
  try {
    const result = await acceptZaloWebhook({
      rawBody: await request.text(),
      signature: request.headers.get('x-zevent-signature'),
      env: readZaloWebhookEnv(process.env),
      record: event => persistZaloWebhook(event, request.headers.get('x-zevent-server')),
    })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === 'UNCONFIGURED'
    return NextResponse.json(
      {
        ok: false,
        error: unconfigured ? 'ZALO_WEBHOOK_NOT_CONFIGURED' : 'WEBHOOK_NOT_RECORDED',
      },
      { status: unconfigured ? 503 : 500 },
    )
  }
}
