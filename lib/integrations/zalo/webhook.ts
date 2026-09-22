import { createHash, timingSafeEqual } from 'node:crypto'

// Official Account webhook contract from Zalo's event documentation:
// header X-ZEvent-Signature, mac = SHA256(appId + raw JSON body + timestamp + OA secret key).
// The OA secret key is not the application secret. This module never calls Zalo.

export const SUPPORTED_ZALO_EVENTS = new Set([
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
}

export type ZaloRejectionReason =
  | 'SIGNATURE_HEADER_MISSING'
  | 'SIGNATURE_FORMAT_INVALID'
  | 'MAC_MISMATCH'
  | 'APP_ID_MISMATCH'
  | 'OA_ID_MISMATCH'

export type OaIdentitySource = 'oa_id' | 'sender' | 'recipient' | 'none'

export type ZaloRejectionDiagnostic = {
  component: 'zalo_webhook'
  result: 'rejected'
  reason: ZaloRejectionReason
  signature_present: boolean
  app_id_present: boolean
  oa_identity_source: OaIdentitySource
  event_name?: string
}

export type ZaloMacDiagnostic = {
  component: 'zalo_webhook'
  result: 'mac_diagnostic'
  signature_header_present: boolean
  zevent_timestamp_header_present: boolean
  official_current_match: boolean
  header_timestamp_match: boolean
  reserialized_match: boolean
}

// Diagnostic output contains booleans only. These candidates never authorize an event.
export function diagnoseZaloMac(input: {
  appId: string
  rawBody: string
  parsedBody: Record<string, unknown>
  bodyTimestamp: string
  headerTimestamp?: string | null
  oaSecret: string
  signature: string | null
}): ZaloMacDiagnostic {
  const matches = (body: string, timestamp: string) =>
    zaloSignatureMatches(input.signature, zaloEventMac(input.appId, body, timestamp, input.oaSecret))
  return {
    component: 'zalo_webhook',
    result: 'mac_diagnostic',
    signature_header_present: input.signature != null,
    zevent_timestamp_header_present: input.headerTimestamp != null,
    official_current_match: matches(input.rawBody, input.bodyTimestamp),
    header_timestamp_match: input.headerTimestamp != null && matches(input.rawBody, input.headerTimestamp),
    reserialized_match: matches(JSON.stringify(input.parsedBody), input.bodyTimestamp),
  }
}

export type WebhookResponse = {
  status: number
  reason?: ZaloRejectionReason
  diagnostic?: ZaloRejectionDiagnostic
  macDiagnostic?: ZaloMacDiagnostic
  body: {
    ok: boolean
    error?: string
    duplicate?: boolean
    status?: string
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

const SIGNATURE_MAC = /^mac\s*=\s*([0-9a-f]{64})$/i

export function classifyZaloSignature(
  header: string | null,
  macHex: string,
): { ok: true } | { ok: false; reason: 'SIGNATURE_HEADER_MISSING' | 'SIGNATURE_FORMAT_INVALID' | 'MAC_MISMATCH' } {
  if (header == null || header.trim() === '') {
    return { ok: false, reason: 'SIGNATURE_HEADER_MISSING' }
  }
  const match = header.trim().match(SIGNATURE_MAC)
  if (!match) return { ok: false, reason: 'SIGNATURE_FORMAT_INVALID' }
  const provided = Buffer.from(match[1].toLowerCase(), 'utf8')
  const expected = Buffer.from(macHex.toLowerCase(), 'utf8')
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'MAC_MISMATCH' }
  }
  return { ok: true }
}

export function zaloSignatureMatches(header: string | null, macHex: string) {
  return classifyZaloSignature(header, macHex).ok
}

export function zaloWebhookDiagnosticsEnabled(env: Record<string, string | undefined>) {
  return env.VERCEL_PROJECT_PRODUCTION_URL === 'vibeacademy-staging.vercel.app'
}

export function logZaloRejection(diagnostic: ZaloRejectionDiagnostic) {
  console.info(JSON.stringify(diagnostic))
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

function boundedEventId(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null
}

// Official OA events identify the account with top-level oa_id.
// Message events omit it and use sender.id or recipient.id instead.
function oaIdentitySource(body: Record<string, unknown>, oaId: string): OaIdentitySource {
  if (Object.prototype.hasOwnProperty.call(body, 'oa_id')) return 'oa_id'
  if (partyId(body.sender) === oaId) return 'sender'
  if (partyId(body.recipient) === oaId) return 'recipient'
  return 'none'
}

function oaIdentityAccepted(body: Record<string, unknown>, oaId: string) {
  if (Object.prototype.hasOwnProperty.call(body, 'oa_id')) {
    const declared = body.oa_id
    return typeof declared === 'string' && declared.length > 0 && declared === oaId
  }
  return oaIdentitySource(body, oaId) !== 'none'
}

function rejectionDiagnostic(
  reason: ZaloRejectionReason,
  body: Record<string, unknown>,
  signature: string | null,
  oaId: string,
): ZaloRejectionDiagnostic {
  const eventName = body.event_name
  return {
    component: 'zalo_webhook',
    result: 'rejected',
    reason,
    signature_present: typeof signature === 'string' && signature.trim().length > 0,
    app_id_present: typeof body.app_id === 'string' && body.app_id.length > 0,
    oa_identity_source: oaIdentitySource(body, oaId),
    ...(typeof eventName === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(eventName)
      ? { event_name: eventName }
      : {}),
  }
}

function rejectWebhook(
  reason: ZaloRejectionReason,
  body: Record<string, unknown>,
  signature: string | null,
  oaId: string,
): WebhookResponse {
  return {
    status: 401,
    reason,
    diagnostic: rejectionDiagnostic(reason, body, signature, oaId),
    body: { ok: false, error: 'INVALID_SIGNATURE' },
  }
}

function externalEventIdFrom(body: Record<string, unknown>) {
  const message = body.message
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    const nested = boundedEventId((message as { msg_id?: unknown }).msg_id)
    if (nested) return nested
  }
  return boundedEventId(body.msg_id)
}

export async function acceptZaloWebhook(input: {
  rawBody: string
  signature: string | null
  headerTimestamp?: string | null
  macDiagnosticsEnabled?: boolean
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
  const signatureCheck = classifyZaloSignature(input.signature, mac)
  if (!signatureCheck.ok) {
    const rejected = rejectWebhook(signatureCheck.reason, body, input.signature, input.env.oaId)
    if (signatureCheck.reason === 'MAC_MISMATCH' && input.macDiagnosticsEnabled === true) {
      rejected.macDiagnostic = diagnoseZaloMac({
        appId, rawBody: input.rawBody, parsedBody: body, bodyTimestamp: timestamp,
        headerTimestamp: input.headerTimestamp, oaSecret: input.env.oaSecret,
        signature: input.signature,
      })
    }
    return rejected
  }
  if (appId !== input.env.appId) {
    return rejectWebhook('APP_ID_MISMATCH', body, input.signature, input.env.oaId)
  }
  if (!oaIdentityAccepted(body, input.env.oaId)) {
    return rejectWebhook('OA_ID_MISMATCH', body, input.signature, input.env.oaId)
  }

  const externalEventId = externalEventIdFrom(body)

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
    },
  }
}
