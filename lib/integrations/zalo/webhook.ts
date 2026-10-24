import { createHash, timingSafeEqual } from 'node:crypto'

// Official Account webhook contract from Zalo's event documentation:
// header X-ZEvent-Signature, mac = SHA256(appId + raw JSON body + timestamp + OA secret key).
// The OA secret key is not the application secret. This module never calls Zalo.

export const SUPPORTED_ZALO_EVENTS = new Set([
  'widget_interaction_accepted',
  'widget_failed_to_sync_user_external_id',
  'user_send_text',
  'user_send_image',
  'user_send_link',
  'user_send_audio',
  'user_send_video',
  'user_send_sticker',
  'user_send_location',
  'user_send_business_card',
  'user_send_file',
  'user_received_message',
  'user_click_response_button',
  'oa_send_anonymous_text',
  'oa_send_anonymous_image',
  'oa_send_anonymous_file',
  'oa_send_anonymous_sticker',
])

const SECRET_KEYS = new Set([
  'access_token',
  'refresh_token',
  'app_secret',
  'oa_secret',
  'secret',
])

const MAX_BODY_CHARS = 65536

export type ZaloWebhookEnv = {
  appId: string
  oaId: string
  oaSecret: string
}

export type WebhookRecord = {
  provider: 'ZALO'
  externalEventId: string | null
  eventType: string
  payload: Record<string, unknown>
  payloadDigest: string
  supported: boolean
}

export type WebhookRecordResult = {
  id: string
  status: string
  duplicate: boolean
  outcome?: string | null
}

// These outcomes mean the event is stored but not yet linked to a send.
// HTTP must stay non-success so Zalo retries. Permanent mismatches are stored
// and acknowledged, because another delivery of the same body cannot succeed.
const ZALO_WEBHOOK_RETRYABLE = new Set([
  'unknown_tracking',
  'send_not_accepted',
  'apply_failed',
  'APPLY_FAILED',
  'IGNORED',
  'unreadable',
])

export function zaloWebhookAckStatus(storedStatus: number, outcome: string | null | undefined) {
  if (storedStatus !== 200) return storedStatus
  if (outcome && ZALO_WEBHOOK_RETRYABLE.has(outcome)) return 503
  return 200
}

export type WebhookResponse = {
  status: number
  body: {
    ok: boolean
    error?: string
    duplicate?: boolean
    status?: string
    outcome?: string
  }
}

export function zaloEventMac(
  appId: string,
  rawBody: string,
  timestamp: string,
  oaSecret: string,
) {
  return createHash('sha256')
    .update(`${appId}${rawBody}${timestamp}${oaSecret}`, 'utf8')
    .digest('hex')
}

export function zaloSignatureMatches(header: string | null, macHex: string) {
  if (!header) return false
  const match = header.trim().match(/^mac\s*=\s*([0-9a-f]{64})$/i)
  if (!match) return false
  const provided = Buffer.from(match[1].toLowerCase(), 'utf8')
  const expected = Buffer.from(macHex.toLowerCase(), 'utf8')
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

export function summarizeZaloWebhookAttempt(input: {
  rawBody: string
  signature: string | null
  headerNames: string[]
  userAgent: string | null
  env: ZaloWebhookEnv | null
  appSecret?: string
}) {
  const signatureText = input.signature?.trim() ?? ''
  const macMatch = signatureText.match(/^mac\s*=\s*([0-9a-f]{64})$/i)
  let parsed: unknown = null
  let parseError = false
  if (input.rawBody) {
    try {
      parsed = JSON.parse(input.rawBody)
    } catch {
      parseError = true
    }
  }
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null
  const appId = typeof body?.app_id === 'string' ? body.app_id : null
  const timestamp = typeof body?.timestamp === 'string'
    ? body.timestamp
    : typeof body?.timestamp === 'number' && Number.isSafeInteger(body.timestamp)
      ? String(body.timestamp)
      : null
  const eventName = typeof body?.event_name === 'string' ? body.event_name : null
  const message = body?.message && typeof body.message === 'object' ? body.message as Record<string, unknown> : null
  const safeId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null
  const secretMatches = (secret: string | undefined) => Boolean(
    secret && appId && timestamp && zaloSignatureMatches(input.signature, zaloEventMac(appId, input.rawBody, timestamp, secret)),
  )
  return {
    component: 'zalo_webhook_probe',
    bodyLength: input.rawBody.length,
    parseError,
    keys: body ? Object.keys(body).sort() : [],
    eventName,
    payloadDigest: createHash('sha256').update(input.rawBody, 'utf8').digest('hex'),
    messageId: safeId(body?.msg_id ?? message?.msg_id),
    trackingId: safeId(message?.tracking_id ?? body?.tracking_id),
    appIdType: body ? typeof body.app_id : null,
    timestampType: body ? typeof body.timestamp : null,
    oaIdType: body && Object.prototype.hasOwnProperty.call(body, 'oa_id') ? typeof body.oa_id : null,
    appIdMatches: Boolean(input.env && appId === input.env.appId),
    oaIdMatches: Boolean(input.env && typeof body?.oa_id === 'string' && body.oa_id === input.env.oaId),
    senderIsOa: Boolean(input.env && partyId(body?.sender) === input.env.oaId),
    recipientIsOa: Boolean(input.env && partyId(body?.recipient) === input.env.oaId),
    headerNames: input.headerNames.map((name) => name.toLowerCase()).sort(),
    signaturePresent: signatureText.length > 0,
    signatureMacPrefix: /^mac\s*=/i.test(signatureText),
    signatureHexLength: macMatch ? macMatch[1].length : 0,
    oaSecretMatch: secretMatches(input.env?.oaSecret),
    appSecretMatch: secretMatches(input.appSecret?.trim()),
    userAgent: (input.userAgent ?? '').slice(0, 80),
  }
}

export function readZaloWebhookEnv(
  env: Record<string, string | undefined>,
): ZaloWebhookEnv | null {
  const appId = env.ZALO_APP_ID?.trim() ?? ''
  const oaId = env.ZALO_OA_ID?.trim() ?? ''
  const oaSecret = env.ZALO_OA_SECRET_KEY?.trim() ?? ''
  if (!appId || !oaId || !oaSecret) return null
  return { appId, oaId, oaSecret }
}

function partyId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = (value as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export async function acceptZaloWebhook(input: {
  rawBody: string
  signature: string | null
  env: ZaloWebhookEnv | null
  record: (event: WebhookRecord) => Promise<WebhookRecordResult>
}): Promise<WebhookResponse> {
  if (!input.env) {
    return { status: 503, body: { ok: false, error: 'ZALO_WEBHOOK_NOT_CONFIGURED' } }
  }
  if (!input.rawBody || input.rawBody.length > MAX_BODY_CHARS) {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input.rawBody)
  } catch {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }

  const body = parsed as Record<string, unknown>
  if (Object.keys(body).some((key) => SECRET_KEYS.has(key))) {
    return { status: 400, body: { ok: false, error: 'SECRET_MATERIAL_REFUSED' } }
  }

  const appId = body.app_id
  const timestamp = body.timestamp
  const eventName = body.event_name
  if (
    typeof appId !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof eventName !== 'string' ||
    !/^\d{10,16}$/.test(timestamp) ||
    !/^[A-Za-z0-9_]{1,80}$/.test(eventName)
  ) {
    return { status: 400, body: { ok: false, error: 'MALFORMED_JSON' } }
  }

  const mac = zaloEventMac(appId, input.rawBody, timestamp, input.env.oaSecret)
  const senderId = partyId(body.sender)
  const recipientId = partyId(body.recipient)
  if (!zaloSignatureMatches(input.signature, mac) || appId !== input.env.appId) {
    return { status: 401, body: { ok: false, error: 'INVALID_SIGNATURE' } }
  }
  const hasOaField = Object.prototype.hasOwnProperty.call(body, 'oa_id')
  if (hasOaField && body.oa_id !== input.env.oaId) {
    return { status: 401, body: { ok: false, error: 'INVALID_SIGNATURE' } }
  }
  const addressedToOa = hasOaField || senderId === input.env.oaId || recipientId === input.env.oaId
  // Zalo's console check signs a sample user_send_text with this OA secret.
  // The sample parties are not this OA. Acknowledge it without storing a reply.
  if (!addressedToOa) {
    const sample = body.message as Record<string, unknown> | undefined
    if (eventName === 'user_send_text' && sample?.msg_id === 'This is message id' && sample?.text === 'This is testing message') {
      return { status: 200, body: { ok: true, status: 'VERIFICATION' } }
    }
    return { status: 401, body: { ok: false, error: 'INVALID_SIGNATURE' } }
  }

  const message = body.message
  let externalEventId: string | null = null
  const rootMessageId = body.msg_id
  if (typeof rootMessageId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(rootMessageId)) {
    externalEventId = rootMessageId
  }
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const msgId = (message as { msg_id?: unknown }).msg_id
    if (!externalEventId && typeof msgId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(msgId)) {
      externalEventId = msgId
    }
  }

  const recorded = await input.record({
    provider: 'ZALO',
    externalEventId,
    eventType: eventName,
    payload: body,
    payloadDigest: createHash('sha256').update(input.rawBody, 'utf8').digest('hex'),
    supported: SUPPORTED_ZALO_EVENTS.has(eventName),
  })

  return {
    status: 200,
    body: {
      ok: true,
      duplicate: recorded.duplicate,
      status: recorded.status,
      ...(recorded.outcome ? { outcome: recorded.outcome } : {}),
    },
  }
}
