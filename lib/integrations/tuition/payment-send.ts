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

export async function sendTuitionPaymentTemplate(args: {
  phone: string
  templateId: string
  trackingId: string
  parameters: Record<string, string>
}, env: NodeJS.ProcessEnv = process.env, deps: { transport?: Transport; readCredential?: () => Promise<{ access_token: string | null; app_id?: string; oa_id?: string; state?: string; expires_at?: string | null } | null> } = {}): Promise<PaymentProviderResult> {
  const phone = normalizeVnPhone(args.phone)
  if (zaloPilotOutboundBlocked(env) || !phone || !/^[A-Za-z0-9]{1,48}$/.test(args.trackingId) || !tuitionPaymentParametersAccepted(args.templateId, args.parameters) || !env.ZALO_APP_SECRET?.trim()) return 'REJECTED'
  const readCredential = deps.readCredential ?? (async () => {
    const { readCredential: read, getZaloCredential } = await import('@/lib/integrations/zalo/oauth')
    const { zaloServiceClient } = await import('@/lib/integrations/zalo/service')
    const admin = zaloServiceClient()
    const current = await read(admin, env)
    const fresh = current?.state === 'READY' && current.access_token && current.expires_at && Date.parse(current.expires_at) > Date.now() + 15 * 60 * 1000
    return fresh ? current : getZaloCredential(admin, env)
  })
  const credential = await readCredential()
  if (!credential?.access_token) return 'REJECTED'
  const transport = deps.transport ?? (async (url, init) => {
    const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) })
    return { status: response.status, json: () => response.json() }
  })
  const headers = { ...zaloAccessHeaders(credential.access_token, env.ZALO_APP_SECRET.trim()), accept: 'application/json' }
  let info: { error?: number; data?: { status?: string; templateId?: number } }
  try {
    const response = await transport(`${INFO_URL}?template_id=${args.templateId}`, { method: 'GET', headers })
    info = await response.json() as typeof info
  } catch {
    return 'UNKNOWN'
  }
  if (info.error !== 0 || info.data?.status !== 'ENABLE' || Number(info.data?.templateId) !== Number(args.templateId)) return 'REJECTED'
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
    return 'UNKNOWN'
  }
  if (httpStatus !== undefined && httpStatus >= 500) return 'UNKNOWN'
  if (!body || typeof body.error !== 'number') return 'UNKNOWN'
  if (body.error === 0 && httpStatus !== undefined && httpStatus >= 200 && httpStatus < 300 && typeof body.data?.msg_id === 'string') return 'ACCEPTED'
  if (DEFINITIVE_PHONE_REJECTIONS.has(body.error)) return 'REJECTED'
  return 'UNKNOWN'
}
