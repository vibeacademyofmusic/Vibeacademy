import 'server-only'
import { zaloAccessHeaders } from '@/lib/integrations/zalo/app-secret-proof'
import { DEFINITIVE_PHONE_REJECTIONS } from '@/lib/integrations/zalo/errors'
import { normalizeVnPhone } from '@/lib/integrations/zalo/phone'
import { zaloPilotOutboundBlocked } from '@/lib/integrations/zalo/pilot-outbound'
import {
  FORBIDDEN_PAYMENT_TEMPLATE_IDS,
  TUITION_PAYMENT_BODY_PARAMETERS,
  TUITION_PAYMENT_CTA_PARAMETER,
  TUITION_PAYMENT_REQUEST_STATUS,
  VERIFIED_TUITION_PAYMENT_TEMPLATE_ID,
  type PaymentProviderResult,
} from './payment-zbs'

const INFO_URL = 'https://business.openapi.zalo.me/template/info/v2'
const SEND_URL = 'https://business.openapi.zalo.me/message/template'

export function tuitionPaymentParametersAccepted(templateId: string, parameters: Record<string, string>) {
  if (templateId !== VERIFIED_TUITION_PAYMENT_TEMPLATE_ID || FORBIDDEN_PAYMENT_TEMPLATE_IDS.includes(templateId as typeof FORBIDDEN_PAYMENT_TEMPLATE_IDS[number])) return false
  const keys = [...TUITION_PAYMENT_BODY_PARAMETERS, TUITION_PAYMENT_CTA_PARAMETER]
  if (Object.keys(parameters).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(parameters, key))) return false
  if (parameters.payment_status !== TUITION_PAYMENT_REQUEST_STATUS) return false
  if (!/^[1-9]\d{0,19}$/.test(parameters.package_amount) || !/^[1-9]\d{0,19}$/.test(parameters.amount_due)) return false
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(parameters.payment_deadline) || !/^[A-Za-z0-9]{8,64}$/.test(parameters.payment_link_id)) return false
  return keys.every(key => {
    const value = parameters[key]
    return Boolean(value) && value === value.trim() && !value.includes('<') && !value.includes('>')
  })
}

type Transport = (url: string, init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }) => Promise<{ status?: number; json: () => Promise<unknown> }>
type InfoBody = { error?: number; data?: { status?: string; templateId?: number } }
export type TuitionPaymentSendResult = { outcome: PaymentProviderResult; reason: 'LOCAL_CONTRACT' | 'TOKEN_INVALID' | 'TEMPLATE_REJECTED' | 'PROVIDER_REJECTED' | 'ACCEPTED' | 'UNKNOWN' }

async function renewInvalidToken(env: NodeJS.ProcessEnv) {
  const { blockCredential, getZaloCredential, readCredential } = await import('@/lib/integrations/zalo/oauth')
  const { zaloServiceClient } = await import('@/lib/integrations/zalo/service')
  const admin = zaloServiceClient()
  const current = await readCredential(admin, env)
  if (current?.state === 'READY') await blockCredential(admin, current, 'ZALO_TOKEN_INVALID', env)
  return getZaloCredential(admin, env)
}

export async function sendTuitionPaymentTemplate(args: {
  phone: string
  templateId: string
  trackingId: string
  parameters: Record<string, string>
}, env: NodeJS.ProcessEnv = process.env, deps: { transport?: Transport; readCredential?: () => Promise<{ access_token: string | null; app_id?: string; oa_id?: string; state?: string; expires_at?: string | null } | null>; renewCredential?: () => Promise<{ access_token: string | null } | null> } = {}): Promise<TuitionPaymentSendResult> {
  const phone = normalizeVnPhone(args.phone)
  if (zaloPilotOutboundBlocked(env) || !phone || !/^[A-Za-z0-9]{1,48}$/.test(args.trackingId) || !tuitionPaymentParametersAccepted(args.templateId, args.parameters) || !env.ZALO_APP_SECRET?.trim()) {
    return { outcome: 'REJECTED', reason: 'LOCAL_CONTRACT' }
  }
  const readCredential = deps.readCredential ?? (async () => {
    const { readCredential: read, getZaloCredential } = await import('@/lib/integrations/zalo/oauth')
    const { zaloServiceClient } = await import('@/lib/integrations/zalo/service')
    const admin = zaloServiceClient()
    const current = await read(admin, env)
    const fresh = current?.state === 'READY' && current.access_token && current.expires_at && Date.parse(current.expires_at) > Date.now() + 15 * 60 * 1000
    return fresh ? current : getZaloCredential(admin, env)
  })
  let credential: { access_token: string | null } | null
  try {
    credential = await readCredential()
  } catch {
    return { outcome: 'REJECTED', reason: 'TOKEN_INVALID' }
  }
  if (!credential?.access_token) return { outcome: 'REJECTED', reason: 'TOKEN_INVALID' }
  const transport = deps.transport ?? (async (url, init) => {
    const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    return { status: response.status, json: () => response.json() }
  })
  const proof = env.ZALO_APP_SECRET.trim()
  const loadInfo = async (token: string) => {
    const response = await transport(`${INFO_URL}?template_id=${args.templateId}`, { method: 'GET', headers: { ...zaloAccessHeaders(token, proof), accept: 'application/json' } })
    return await response.json() as InfoBody
  }
  let info: InfoBody
  try {
    info = await loadInfo(credential.access_token)
  } catch {
    return { outcome: 'UNKNOWN', reason: 'UNKNOWN' }
  }
  // A database expiry in the future can still be rejected. Refresh once, then continue this same send.
  if (info.error === -124) {
    try {
      const renewed = await (deps.renewCredential ?? (() => renewInvalidToken(env)))()
      if (!renewed?.access_token) return { outcome: 'REJECTED', reason: 'TOKEN_INVALID' }
      credential = { ...credential, access_token: renewed.access_token }
      info = await loadInfo(renewed.access_token)
    } catch {
      return { outcome: 'REJECTED', reason: 'TOKEN_INVALID' }
    }
  }
  if (info.error === -124) return { outcome: 'REJECTED', reason: 'TOKEN_INVALID' }
  if (info.error !== 0 || info.data?.status !== 'ENABLE' || Number(info.data?.templateId) !== Number(args.templateId)) return { outcome: 'REJECTED', reason: 'TEMPLATE_REJECTED' }
  const accessToken = credential.access_token
  if (!accessToken) return { outcome: 'REJECTED', reason: 'TOKEN_INVALID' }
  const headers = { ...zaloAccessHeaders(accessToken, proof), accept: 'application/json' }
  let httpStatus: number | undefined
  let body: { error?: number; data?: { msg_id?: string } }
  try {
    const response = await transport(SEND_URL, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ phone, template_id: args.templateId, template_data: args.parameters, tracking_id: args.trackingId }),
    })
    httpStatus = response.status
    body = await response.json() as typeof body
  } catch {
    return { outcome: 'UNKNOWN', reason: 'UNKNOWN' }
  }
  if (httpStatus !== undefined && httpStatus >= 500) return { outcome: 'UNKNOWN', reason: 'UNKNOWN' }
  if (!body || typeof body.error !== 'number') return { outcome: 'UNKNOWN', reason: 'UNKNOWN' }
  if (body.error === 0 && httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300 && typeof body.data?.msg_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.data.msg_id)) {
    return { outcome: 'ACCEPTED', reason: 'ACCEPTED' }
  }
  if (body.error === -124 || body.error === -1241) return { outcome: 'REJECTED', reason: 'TOKEN_INVALID' }
  if (DEFINITIVE_PHONE_REJECTIONS.has(body.error)) return { outcome: 'REJECTED', reason: 'PROVIDER_REJECTED' }
  return { outcome: 'UNKNOWN', reason: 'UNKNOWN' }
}
