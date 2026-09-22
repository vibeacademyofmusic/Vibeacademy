import { NextResponse } from 'next/server'

import {
  acceptZaloWebhook,
  logZaloRegistrationProbe,
  logZaloRejection,
  readZaloWebhookEnv,
  zaloWebhookDiagnosticsEnabled,
  zaloWebhookRegistrationMode,
  type WebhookRecord,
  type WebhookRecordResult,
} from '@/lib/integrations/zalo/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Reserved for a later outbound OA call. This webhook does not read them:
// ZALO_APP_SECRET, ZALO_OA_ACCESS_TOKEN, ZALO_OA_REFRESH_TOKEN.

async function persistZaloWebhook(event: WebhookRecord): Promise<WebhookRecordResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('UNCONFIGURED')
  }

  const { createClient } = await import('@supabase/supabase-js')
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
  return {
    id: row.event_id,
    status: row.event_status,
    duplicate: row.is_duplicate === true,
  }
}

export async function POST(request: Request) {
  try {
    const diagnosticsEnabled = zaloWebhookDiagnosticsEnabled(process.env)
    const result = await acceptZaloWebhook({
      rawBody: await request.text(),
      signature: request.headers.get('x-zevent-signature'),
      headerTimestamp: request.headers.get('x-zevent-timestamp'),
      macDiagnosticsEnabled: diagnosticsEnabled,
      registrationMode: zaloWebhookRegistrationMode(process.env),
      env: readZaloWebhookEnv(process.env),
      record: persistZaloWebhook,
    })
    if (result.registrationProbe) {
      if (result.probeLog && diagnosticsEnabled) logZaloRegistrationProbe(result.probeLog)
      return new Response(null, { status: 200 })
    }
    if (result.macDiagnostic && diagnosticsEnabled) {
      console.info(JSON.stringify(result.macDiagnostic))
    } else if (result.diagnostic && diagnosticsEnabled) {
      logZaloRejection(result.diagnostic)
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
