import 'server-only'
import { zaloAccessHeaders } from './app-secret-proof'
import { writePilotFailure } from '../../observability/pilot-failure'
import { TUITION_PROVIDER_TEMPLATE_ID } from './tuition-notice'

export const TUITION_RESPONSE_URL = 'https://business.openapi.zalo.me/response/get'
export const TUITION_RESPONSE_OVERLAP_MS = 5 * 60 * 1000
export const TUITION_RESPONSE_PAGE_CAP = 50

type Admin = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

type Gate = {
  activated: boolean
  checkpoint_ms: number | null
  overlap_ms: number
  page_limit: number
  interval_seconds: number | null
  auth_backoff_until: string | null
  earliest_send_ms: number | null
}

export type ResponseSyncState =
  | 'INACTIVE'
  | 'AUTH_BACKOFF'
  | 'LIMIT_UNVERIFIED'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'AUTH_ERROR'
  | 'API_ERROR'
  | 'SAVE_FAILED'
  | 'INCOMPLETE'
  | 'SYNCED'

export function responseAuthBackoffMs(failures: number) {
  if (failures <= 1) return 15 * 60 * 1000
  if (failures === 2) return 60 * 60 * 1000
  return 6 * 60 * 60 * 1000
}

export function responseWindow(checkpointMs: number | null, earliestSendMs: number | null, nowMs: number, overlapMs: number) {
  if (earliestSendMs == null) return null
  const from = checkpointMs == null ? earliestSendMs : Math.max(earliestSendMs, checkpointMs - overlapMs)
  if (from > nowMs) return null
  return { from, to: nowMs }
}

export function tuitionResponseGetUrl(input: { templateId: string; fromMs: number; toMs: number; offset: number; limit: number }) {
  const url = new URL(TUITION_RESPONSE_URL)
  url.searchParams.set('template_id', input.templateId)
  url.searchParams.set('from_time', String(input.fromMs))
  url.searchParams.set('to_time', String(input.toMs))
  url.searchParams.set('offset', String(input.offset))
  url.searchParams.set('limit', String(input.limit))
  return url.toString()
}

type Transport = (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<{ status?: number; json: () => Promise<unknown> }>

function canonicalResponseButton(value: string) {
  if (value === 'Tiếp Tục Học') return 'Tiếp tục học'
  if (value === 'Liên hệ' || value === 'Liên Hệ') return 'Yêu cầu khác'
  return value
}

function gateOf(value: unknown): Gate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.activated !== 'boolean') return null
  if (typeof row.overlap_ms !== 'number' || typeof row.page_limit !== 'number') return null
  return {
    activated: row.activated,
    checkpoint_ms: typeof row.checkpoint_ms === 'number' ? row.checkpoint_ms : null,
    overlap_ms: row.overlap_ms,
    page_limit: row.page_limit,
    interval_seconds: typeof row.interval_seconds === 'number' ? row.interval_seconds : null,
    auth_backoff_until: typeof row.auth_backoff_until === 'string' ? row.auth_backoff_until : null,
    earliest_send_ms: typeof row.earliest_send_ms === 'number' ? row.earliest_send_ms : null,
  }
}

function responsePage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const body = value as { error?: unknown; message?: unknown; data?: { total?: unknown; data?: unknown } }
  if (typeof body.error !== 'number' || !Number.isSafeInteger(body.error)) return null
  const message = typeof body.message === 'string' ? body.message : ''
  const total = typeof body.data?.total === 'number' && Number.isSafeInteger(body.data.total) ? body.data.total : null
  const rows = Array.isArray(body.data?.data) ? body.data.data : null
  return { error: body.error, message, total, rows }
}

function responseItem(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (typeof row.data !== 'string' || typeof row.submitDate !== 'string' || typeof row.msgId !== 'string' || typeof row.oaId !== 'string' || typeof row.trackingId !== 'string') return null
  return { data: row.data, submitDate: row.submitDate, msgId: row.msgId, oaId: row.oaId, trackingId: row.trackingId }
}

async function noteProbe(admin: Admin, http: number | null, error: number | null, message: string) {
  await admin.rpc('note_tuition_zalo_response_probe', {
    p_http: http,
    p_error: error,
    p_message: message.slice(0, 120),
  })
}

export async function reconcileTuitionZaloResponses(
  admin: Admin,
  env: NodeJS.ProcessEnv = process.env,
  request: Transport = async (url, init) => {
    const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    return { status: response.status, json: () => response.json() }
  },
  options: { now?: () => number; readAccess?: () => Promise<string | null> } = {},
): Promise<{ state: ResponseSyncState; saved?: number }> {
  const gateResult = await admin.rpc('tuition_zalo_response_sync_gate')
  const gate = gateOf(gateResult.data)
  if (gateResult.error || !gate) return { state: 'UNAVAILABLE' }
  if (!gate.activated) return { state: 'INACTIVE' }
  const now = options.now ?? Date.now
  if (gate.auth_backoff_until && Date.parse(gate.auth_backoff_until) > now()) return { state: 'AUTH_BACKOFF' }
  if (!Number.isInteger(gate.interval_seconds) || (gate.interval_seconds ?? 0) < 60) return { state: 'LIMIT_UNVERIFIED' }
  const window = responseWindow(gate.checkpoint_ms, gate.earliest_send_ms, now(), gate.overlap_ms)
  if (!window) return { state: 'SYNCED', saved: 0 }
  const appSecret = env.ZALO_APP_SECRET?.trim() ?? ''
  const appId = env.ZALO_APP_ID?.trim() ?? ''
  const oaId = env.ZALO_OA_ID?.trim() ?? ''
  const readAccess = options.readAccess ?? (async () => {
    const { readCredential } = await import('./oauth')
    const credential = await readCredential(admin as never, env)
    return credential?.access_token ?? null
  })
  const access = await readAccess()
  if (!access || !appSecret || !/^\d{8,32}$/.test(appId) || !/^\d{8,32}$/.test(oaId)) return { state: 'NOT_CONFIGURED' }
  const headers = { ...zaloAccessHeaders(access, appSecret), accept: 'application/json' }
  let offset = 0
  let saved = 0
  for (let page = 0; page < TUITION_RESPONSE_PAGE_CAP; page += 1) {
    const url = tuitionResponseGetUrl({
      templateId: TUITION_PROVIDER_TEMPLATE_ID,
      fromMs: window.from,
      toMs: window.to,
      offset,
      limit: gate.page_limit,
    })
    let httpStatus: number | undefined
    let parsed: ReturnType<typeof responsePage>
    try {
      const response = await request(url, { method: 'GET', headers })
      httpStatus = response.status
      parsed = responsePage(await response.json())
    } catch {
      return { state: 'API_ERROR', saved }
    }
    if (!parsed || httpStatus == null) return { state: 'API_ERROR', saved }
    if (parsed.error === -124 || parsed.error === -1241) {
      await noteProbe(admin, httpStatus, parsed.error, parsed.message)
      writePilotFailure({ failure: 'ZALO_RESPONSE_SYNC_AUTH', correlationId: `zalo-${parsed.error}` }, env)
      return { state: 'AUTH_ERROR', saved }
    }
    if (parsed.error !== 0 || parsed.total == null || parsed.rows == null) {
      await noteProbe(admin, httpStatus, parsed.error, parsed.message)
      return { state: 'API_ERROR', saved }
    }
    for (const raw of parsed.rows) {
      const item = responseItem(raw)
      if (!item) return { state: 'API_ERROR', saved }
      const recorded = await admin.rpc('record_tuition_zalo_api_reply', {
        p_template_id: TUITION_PROVIDER_TEMPLATE_ID,
        p_app_id: appId,
        p_oa_id: oaId,
        p_row_oa_id: item.oaId,
        p_tracking_id: item.trackingId,
        p_message_id: item.msgId,
        p_button: canonicalResponseButton(item.data),
        p_submit_ms: item.submitDate,
      })
      if (recorded.error || !['recorded', 'duplicate', 'conflict'].includes(String(recorded.data))) return { state: 'SAVE_FAILED', saved }
      saved += 1
    }
    offset += parsed.rows.length
    if (parsed.rows.length === 0 || offset >= parsed.total) {
      const committed = await admin.rpc('commit_tuition_zalo_response_window', { p_to_ms: window.to, p_complete: true })
      if (committed.error || committed.data !== 'advanced') return { state: 'SAVE_FAILED', saved }
      await noteProbe(admin, httpStatus, 0, 'Success')
      return { state: 'SYNCED', saved }
    }
  }
  return { state: 'INCOMPLETE', saved }
}

function safeProviderMessage(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9 ._-]{0,120}$/.test(value) ? value : ''
}

export async function probeTuitionResponseChannels(
  admin: Admin,
  env: NodeJS.ProcessEnv,
  window: { fromMs: number; toMs: number },
  request: (url: string, init: { method: 'GET'; headers: Record<string, string> }) => Promise<{ status?: number; json: () => Promise<unknown> }> = async (url, init) => {
    const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    return { status: response.status, json: () => response.json() }
  },
) {
  const { readCredential } = await import('./oauth')
  const credential = await readCredential(admin as never, env)
  const appSecret = env.ZALO_APP_SECRET?.trim() ?? ''
  const appId = env.ZALO_APP_ID?.trim() ?? ''
  const oaId = env.ZALO_OA_ID?.trim() ?? ''
  if (!credential?.access_token || !appSecret) return { result: 'NOT_CONFIGURED' }
  const headers = { ...zaloAccessHeaders(credential.access_token, appSecret), accept: 'application/json' }
  const call = async (url: string) => {
    const response = await request(url, { method: 'GET', headers })
    const body = await response.json() as { error?: unknown; message?: unknown; data?: Record<string, unknown> }
    return {
      httpStatus: response.status ?? null,
      error: typeof body?.error === 'number' ? body.error : null,
      message: safeProviderMessage(body?.message),
      data: body?.data && typeof body.data === 'object' ? body.data : null,
    }
  }
  const oa = await call('https://openapi.zalo.me/v2.0/oa/getoa')
  const template = await call(`https://business.openapi.zalo.me/template/info/v2?template_id=${TUITION_PROVIDER_TEMPLATE_ID}`)
  const responseUrl = tuitionResponseGetUrl({
    templateId: TUITION_PROVIDER_TEMPLATE_ID,
    fromMs: window.fromMs,
    toMs: window.toMs,
    offset: 0,
    limit: 20,
  })
  const response = await call(responseUrl)
  let saved = 0
  let saveFailed = false
  if (response.error === 0 && response.data && Array.isArray(response.data.data)) {
    for (const raw of response.data.data) {
      const item = responseItem(raw)
      if (!item) { saveFailed = true; break }
      const recorded = await admin.rpc('record_tuition_zalo_api_reply', {
        p_template_id: TUITION_PROVIDER_TEMPLATE_ID,
        p_app_id: appId,
        p_oa_id: oaId,
        p_row_oa_id: item.oaId,
        p_tracking_id: item.trackingId,
        p_message_id: item.msgId,
        p_button: canonicalResponseButton(item.data),
        p_submit_ms: item.submitDate,
      })
      if (recorded.error || !['recorded', 'duplicate', 'conflict'].includes(String(recorded.data))) { saveFailed = true; break }
      saved += 1
    }
  }
  if (response.error === 0 && !saveFailed) await noteProbe(admin, response.httpStatus, 0, 'Success')
  else if (response.error != null) await noteProbe(admin, response.httpStatus, response.error, response.message)
  if (response.error === -124 || response.error === -1241) {
    writePilotFailure({ failure: 'ZALO_RESPONSE_SYNC_AUTH', correlationId: `zalo-${response.error}` }, env)
  }
  return {
    result: response.error === 0 && !saveFailed ? 'API_OK' : 'API_ERROR',
    saved,
    compared: {
      envAppId: appId,
      credentialAppId: credential.app_id,
      appMatch: credential.app_id === appId,
      envOaId: oaId,
      credentialOaId: credential.oa_id,
      credentialState: credential.state,
      credentialVersion: credential.version,
      oaMatch: String(oa.data?.oa_id ?? '') === oaId,
    },
    oaGet: { httpStatus: oa.httpStatus, error: oa.error },
    templateInfo: { httpStatus: template.httpStatus, error: template.error, templateId: template.data?.templateId ?? template.data?.template_id ?? null },
    responseGet: {
      method: 'GET',
      urlPath: '/response/get',
      templateId: TUITION_PROVIDER_TEMPLATE_ID,
      fromTime: window.fromMs,
      toTime: window.toMs,
      offset: 0,
      limit: 20,
      httpStatus: response.httpStatus,
      error: response.error,
      message: response.message,
      proof: 'existing HMAC-SHA256 helper, header only',
    },
  }
}

export async function maintainTuitionZaloResponses(
  admin: Admin,
  env: NodeJS.ProcessEnv = process.env,
  request?: Transport,
) {
  const oa = env.ZALO_OA_ID?.trim() ?? ''
  let replayed = 0
  if (/^\d{8,32}$/.test(oa)) {
    const replay = await admin.rpc('replay_pending_tuition_zalo_clicks', { p_oa_id: oa, p_limit: 20 })
    if (!replay.error && typeof replay.data === 'number') replayed = replay.data
  }
  const sync = await reconcileTuitionZaloResponses(admin, env, request, {})
  return { replayed, state: sync.state, saved: sync.saved ?? 0 }
}
