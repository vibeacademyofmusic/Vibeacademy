import { appendFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  acceptZaloWebhook,
  readZaloWebhookEnv,
  summarizeZaloWebhookAttempt,
  zaloWebhookAckStatus,
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
  let outcome: string | null = null
  try {
    if (event.eventType === 'user_received_message') {
      const message = event.payload.message as Record<string, unknown> | undefined
      const sender = (event.payload.sender as { id?: unknown } | undefined)?.id
      const recipient = (event.payload.recipient as { id?: unknown } | undefined)?.id
      const oa = readZaloWebhookEnv(process.env)?.oaId
      if (serverHeader === 'ZNS' && sender === oa && typeof recipient === 'string' && recipient !== oa
        && typeof message?.msg_id === 'string' && typeof message?.tracking_id === 'string' && typeof message?.delivery_time === 'string') {
        const delivery = await client.rpc('record_zalo_phone_delivery', { p_message_id: message.msg_id,
          p_tracking_id: message.tracking_id, p_recipient_phone: recipient,
          p_sender_id: sender, p_delivery_time: message.delivery_time })
        console.info(JSON.stringify({ component: 'zalo_phone_delivery', eventId: row.event_id,
          messageId: message.msg_id, trackingId: message.tracking_id,
          outcome: delivery.error ? 'APPLY_FAILED' : delivery.data }))
      }
    }
    if (['user_received_message', 'user_click_response_button'].includes(event.eventType)) {
      const applied = await client.rpc('process_tuition_zalo_webhook', {
        p_event_id: row.event_id,
        p_oa_id: readZaloWebhookEnv(process.env)?.oaId ?? '',
      })
      if (applied.error) throw new Error('APPLY_FAILED')
      outcome = typeof applied.data === 'string' ? applied.data : 'unreadable'
      if (event.eventType === 'user_click_response_button' && outcome === 'recorded') {
        // Best effort: the 5-minute maintenance run is the durable fallback.
        try {
          const { runTuitionRenewalAutomation } = await import('@/lib/integrations/tuition/auto-renewal')
          await runTuitionRenewalAutomation(client, 1)
        } catch { /* picked up by maintenance */ }
      }
    }
  } catch {
    await client.rpc('mark_zalo_webhook_processed', { p_event_id: row.event_id, p_error: 'APPLY_FAILED' })
    outcome = 'APPLY_FAILED'
  }
  const message = event.payload.message as Record<string, unknown> | undefined
  const correlationId = typeof message?.tracking_id === 'string' ? message.tracking_id : null
  const messageId = typeof event.payload.msg_id === 'string'
    ? event.payload.msg_id
    : typeof message?.msg_id === 'string' ? message.msg_id : null
  console.info(JSON.stringify({
    component: 'zalo_webhook_processing',
    eventId: row.event_id,
    eventType: event.eventType,
    trackingId: correlationId,
    messageId,
    duplicate: row.is_duplicate === true,
    outcome: outcome ?? row.event_status,
  }))
  return {
    id: row.event_id,
    status: row.event_status,
    duplicate: row.is_duplicate === true,
    outcome,
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-zevent-signature')
    const probe = summarizeZaloWebhookAttempt({
      rawBody,
      signature,
      headerNames: [...request.headers.keys()],
      userAgent: request.headers.get('user-agent'),
      env: readZaloWebhookEnv(process.env),
      appSecret: process.env.ZALO_APP_SECRET,
    })
    const line = JSON.stringify({ ...probe, at: new Date().toISOString() })
    console.info(line)
    try {
      mkdirSync('docs/verification/execution-20260930/raw', { recursive: true })
      appendFileSync('docs/verification/execution-20260930/raw/zalo-webhook-probes.jsonl', `${line}\n`)
    } catch {
      // Capture must not change the webhook response.
    }
    const result = await acceptZaloWebhook({
      rawBody,
      signature,
      env: readZaloWebhookEnv(process.env),
      record: event => persistZaloWebhook(event, request.headers.get('x-zevent-server')),
    }).catch((error): Awaited<ReturnType<typeof acceptZaloWebhook>> => {
      const unconfigured = error instanceof Error && error.message === 'UNCONFIGURED'
      return { status: unconfigured ? 503 : 500, body: { ok: false, error: unconfigured ? 'ZALO_WEBHOOK_NOT_CONFIGURED' : 'WEBHOOK_NOT_RECORDED' } }
    })
    const ackStatus = zaloWebhookAckStatus(result.status, result.body.outcome)
    if (ackStatus !== result.status) {
      result.status = ackStatus
      result.body = { ok: false, error: 'WEBHOOK_PENDING', status: result.body.outcome }
    }
    // Keep a durable, redacted receipt even for a console verification sample.
    // This is transport evidence, never a tuition reply or a provider event.
    const safeRequestId = (value: string | null) => value && /^[A-Za-z0-9_:-]{1,160}$/.test(value) ? value : null
    const receipt = {
      payloadDigest: probe.payloadDigest, eventName: probe.eventName,
      relayRequestId: safeRequestId(request.headers.get('x-vercel-id')),
      invocationId: safeRequestId(request.headers.get('x-invocation-id')),
      messageId: probe.messageId, trackingId: probe.trackingId,
      verified: result.status === 200 && probe.oaSecretMatch && probe.appIdMatches,
      httpStatus: result.status, outcome: result.body.error ?? result.body.status ?? 'ACCEPTED',
      consoleTest: result.body.status === 'VERIFICATION',
    }
    try {
      const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
      const saved = await client.rpc('record_zalo_webhook_receipt', { p_receipt: receipt })
      console.info(JSON.stringify({ component: 'zalo_webhook_receipt', ...receipt, auditSaved: !saved.error }))
    } catch {
      console.info(JSON.stringify({ component: 'zalo_webhook_receipt', ...receipt, auditSaved: false }))
    }
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
