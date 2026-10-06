import 'server-only'
import { zaloAccessHeaders } from './app-secret-proof'
import { DEFINITIVE_PHONE_REJECTIONS } from './errors'
import { normalizeVnPhone } from './phone'
import { zaloPilotOutboundBlocked } from './pilot-outbound'
import { TUITION_PARAMETER_LIMITS, TUITION_PROVIDER_TEMPLATE_ID } from './tuition-notice'

export const TUITION_TEST_STUDENT_CODE = 'TEST-ZALO-HP'
export const TUITION_TEST_PHONE_SUFFIX = '918'
export const TUITION_TEST_ARM = 'TEST-ZALO-HP'
export const TUITION_TEST_TEMPLATE_URL = `https://business.openapi.zalo.me/template/info/v2?template_id=${TUITION_PROVIDER_TEMPLATE_ID}`
export const TUITION_TEST_SEND_URL = 'https://business.openapi.zalo.me/message/template'

export const TUITION_TEST_PARAMETERS = {
  customer_name: 'Phụ huynh Zalo thử',
  period: '29/07/2026-28/10/2026',
  student_name: 'TEST Zalo học phí',
  amount: '5500000',
  due_date: '28/10/2026',
  student_code: TUITION_TEST_STUDENT_CODE,
} as const

export type TuitionTestInput = {
  studentCode: string
  phone: string
  templateId: string
  trackingId: string
  eventCode: string | null
  parameters: Record<string, string>
}

export type TuitionTestResult =
  | { state: 'BLOCKED' | 'TEMPLATE_NOT_ENABLED' | 'ZALO_OUTBOUND_NOT_CONFIGURED' | 'ZALO_TOKEN_INVALID' | 'ZALO_PROOF_INVALID' | 'AMBIGUOUS' }
  | { state: 'PROVIDER_REJECTED'; providerError: number }
  | { state: 'ACCEPTED'; messageId: string; delivered: false; providerError: 0; httpStatus: number }

type Credential = { app_id?: string; oa_id?: string; access_token: string | null; expires_at: string | null; state: string }
type Transport = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }) => Promise<{ status?: number; json: () => Promise<unknown> }>

export function tuitionTestArmed(env: NodeJS.ProcessEnv) {
  return env.ZALO_TUITION_TEST_SEND === TUITION_TEST_ARM
}

export function tuitionTestMatches(input: TuitionTestInput) {
  const phone = normalizeVnPhone(input.phone)
  if (input.studentCode !== TUITION_TEST_STUDENT_CODE || input.templateId !== TUITION_PROVIDER_TEMPLATE_ID || input.eventCode !== 'RENEWAL_V1') return false
  if (!phone || !phone.endsWith(TUITION_TEST_PHONE_SUFFIX) || !/^[A-Za-z0-9]{1,48}$/.test(input.trackingId)) return false
  const keys = Object.keys(TUITION_TEST_PARAMETERS)
  if (Object.keys(input.parameters).length !== keys.length) return false
  return keys.every(key => input.parameters[key] === TUITION_TEST_PARAMETERS[key as keyof typeof TUITION_TEST_PARAMETERS])
}

const MANUAL_PARAMETER_KEYS = ['customer_name', 'period', 'student_name', 'amount', 'due_date', 'student_code'] as const

export function tuitionManualMatches(input: TuitionTestInput) {
  const phone = normalizeVnPhone(input.phone)
  if (!/^[0-9]{1,20}$/.test(input.templateId) || input.templateId === '640377' || input.eventCode !== 'RENEWAL_V1') return false
  if (!phone || !/^[A-Za-z0-9]{1,48}$/.test(input.trackingId)) return false
  const keys = Object.keys(input.parameters)
  if (keys.length !== MANUAL_PARAMETER_KEYS.length || MANUAL_PARAMETER_KEYS.some(key => !Object.prototype.hasOwnProperty.call(input.parameters, key))) return false
  for (const key of MANUAL_PARAMETER_KEYS) {
    const value = input.parameters[key]
    if (!value || value !== value.trim() || value.length > TUITION_PARAMETER_LIMITS[key] || value.includes('<') || value.includes('>')) return false
  }
  return /^\d{2}\/\d{2}\/\d{4}-\d{2}\/\d{2}\/\d{4}$/.test(input.parameters.period)
    && /^\d{2}\/\d{2}\/\d{4}$/.test(input.parameters.due_date)
    && /^[1-9]\d{0,19}$/.test(input.parameters.amount)
}

function tokenExpired(body: { error?: number }) {
  return body.error === -124
}

async function deliverTuitionTemplate(
  input: TuitionTestInput,
  parameters: Record<string, string>,
  env: NodeJS.ProcessEnv,
  deps: { readCredential?: () => Promise<Credential | null>; refreshCredential?: () => Promise<Credential | null>; transport?: Transport },
  refreshEnv: NodeJS.ProcessEnv,
): Promise<TuitionTestResult> {
  const readCredential = deps.readCredential ?? (async () => {
    const { readCredential: read, getZaloCredential } = await import('./oauth')
    const { zaloServiceClient } = await import('./service')
    const admin = zaloServiceClient()
    const current = await read(admin, env)
    const fresh = current?.state === 'READY' && current.access_token && current.expires_at && Date.parse(current.expires_at) > Date.now() + 15 * 60 * 1000
    if (fresh) return current
    return getZaloCredential(admin, refreshEnv)
  })
  const transport = deps.transport ?? (async (url, init) => {
    const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    return { status: response.status, json: () => response.json() }
  })
  const credential = await readCredential()
  if (!credential?.access_token || !env.ZALO_APP_SECRET?.trim()) return { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' }
  let accessToken = credential.access_token
  const headersFor = (token: string) => ({ ...zaloAccessHeaders(token, env.ZALO_APP_SECRET!.trim()), accept: 'application/json' })
  let info: { status?: number; body: { error?: number; data?: { status?: string; templateId?: number } } }
  try {
    const response = await transport(`https://business.openapi.zalo.me/template/info/v2?template_id=${input.templateId}`, { method: 'GET', headers: headersFor(accessToken) })
    info = { status: response.status, body: await response.json() as typeof info.body }
  } catch {
    return { state: 'AMBIGUOUS' }
  }
  if (!info.body || typeof info.body.error !== 'number') return { state: 'AMBIGUOUS' }
  if (info.body.error === -1241) return { state: 'ZALO_PROOF_INVALID' }
  if (tokenExpired(info.body)) {
    const refresh = deps.refreshCredential ?? (deps.readCredential ? null : async () => {
      const { getZaloCredential } = await import('./oauth')
      const { zaloServiceClient } = await import('./service')
      return getZaloCredential(zaloServiceClient(), refreshEnv)
    })
    if (!refresh) return { state: 'ZALO_TOKEN_INVALID' }
    const refreshed = await refresh()
    if (!refreshed?.access_token) return { state: 'ZALO_TOKEN_INVALID' }
    if (credential.app_id && (refreshed.app_id !== credential.app_id || refreshed.oa_id !== credential.oa_id)) return { state: 'BLOCKED' }
    accessToken = refreshed.access_token
    try {
      const response = await transport(`https://business.openapi.zalo.me/template/info/v2?template_id=${input.templateId}`, { method: 'GET', headers: headersFor(accessToken) })
      info = { status: response.status, body: await response.json() as typeof info.body }
    } catch {
      return { state: 'AMBIGUOUS' }
    }
  }
  if (info.body.error === -1241) return { state: 'ZALO_PROOF_INVALID' }
  if (info.body.error === -124) return { state: 'ZALO_TOKEN_INVALID' }
  if (info.body.error !== 0 || info.body.data?.status !== 'ENABLE' || Number(info.body.data?.templateId) !== Number(input.templateId)) return { state: 'TEMPLATE_NOT_ENABLED' }
  // Persist the identity of the credential actually used before making a send.
  // Injected transports are isolated test harnesses; real sends require this snapshot.
  if (!deps.readCredential) {
    const { zaloServiceClient } = await import('./service')
    const captured = await zaloServiceClient().rpc('snapshot_tuition_zalo_send_context', {
      p_tracking_id: input.trackingId,
      p_app_id: credential.app_id,
      p_oa_id: credential.oa_id,
      p_template_id: input.templateId,
    })
    if (captured.error || captured.data !== 'captured') return { state: 'BLOCKED' }
  }
  console.info(JSON.stringify({ component: 'tuition_zalo_send', phase: 'provider_request',
    trackingId: input.trackingId, appId: credential.app_id ?? null, oaId: credential.oa_id ?? null,
    templateId: input.templateId, at: new Date().toISOString() }))
  const phone = normalizeVnPhone(input.phone)
  let httpStatus: number | undefined
  let body: { error?: number; data?: { msg_id?: string } }
  try {
    const response = await transport(TUITION_TEST_SEND_URL, {
      method: 'POST',
      headers: { ...headersFor(accessToken), 'content-type': 'application/json' },
      body: JSON.stringify({
        phone,
        template_id: input.templateId,
        template_data: parameters,
        tracking_id: input.trackingId,
      }),
    })
    httpStatus = response.status
    body = await response.json() as typeof body
  } catch {
    return { state: 'AMBIGUOUS' }
  }
  console.info(JSON.stringify({ component: 'tuition_zalo_send', phase: 'provider_result',
    trackingId: input.trackingId, templateId: input.templateId, httpStatus,
    providerError: typeof body?.error === 'number' ? body.error : null,
    messageId: typeof body?.data?.msg_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.data.msg_id) ? body.data.msg_id : null,
    at: new Date().toISOString() }))
  if (httpStatus !== undefined && httpStatus >= 500) return { state: 'AMBIGUOUS' }
  if (!body || typeof body.error !== 'number' || !Number.isSafeInteger(body.error)) return { state: 'AMBIGUOUS' }
  if (body.error === 0 && httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300 && typeof body.data?.msg_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.data.msg_id)) {
    return { state: 'ACCEPTED', messageId: body.data.msg_id, delivered: false, providerError: 0, httpStatus }
  }
  if (body.error === -124) return { state: 'ZALO_TOKEN_INVALID' }
  if (body.error === -1241) return { state: 'ZALO_PROOF_INVALID' }
  if (!DEFINITIVE_PHONE_REJECTIONS.has(body.error)) return { state: 'AMBIGUOUS' }
  return { state: 'PROVIDER_REJECTED', providerError: body.error }
}

export async function sendAuthorizedTuitionTest(
  input: TuitionTestInput,
  env: NodeJS.ProcessEnv = process.env,
  deps: { readCredential?: () => Promise<Credential | null>; refreshCredential?: () => Promise<Credential | null>; transport?: Transport } = {},
): Promise<TuitionTestResult> {
  if (!tuitionTestArmed(env) || !tuitionTestMatches(input)) return { state: 'BLOCKED' }
  return deliverTuitionTemplate(input, { ...TUITION_TEST_PARAMETERS }, env, deps, { ...env, ZALO_PILOT_OUTBOUND: 'enabled' })
}

export async function sendManualTuitionZalo(
  input: TuitionTestInput,
  env: NodeJS.ProcessEnv = process.env,
  deps: { readCredential?: () => Promise<Credential | null>; refreshCredential?: () => Promise<Credential | null>; transport?: Transport } = {},
): Promise<TuitionTestResult> {
  if (zaloPilotOutboundBlocked(env) || !tuitionManualMatches(input)) return { state: 'BLOCKED' }
  return deliverTuitionTemplate(input, { ...input.parameters }, env, deps, env)
}
