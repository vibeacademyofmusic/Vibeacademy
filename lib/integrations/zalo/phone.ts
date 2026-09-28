import { DEFINITIVE_PHONE_REJECTIONS, phoneErrorCode } from './errors'
import { zaloAccessHeaders } from './app-secret-proof'
import { ZALO_TEMPLATE_ID, ZALO_TEMPLATE_PARAMETERS, ZALO_REGISTRATION_PAYMENT_STATUS, type ZaloTransport } from './readiness'

export const ZALO_PHONE_TEMPLATE_URL = 'https://business.openapi.zalo.me/message/template'
const APPROVED_PAYMENT_STATUSES = new Set<string>(Object.values(ZALO_REGISTRATION_PAYMENT_STATUS))


export function normalizeVnPhone(value: string) {
  if (!/^\+?[0-9 () .-]+$/.test(value)) return null
  const digits = value.replace(/\D/g, '')
  if (/^84\d{9}$/.test(digits)) return digits
  if (/^0\d{9}$/.test(digits)) return `84${digits.slice(1)}`
  return null
}

export function maskVnPhone(phone: string) {
  return phone.length >= 7 ? `${phone.slice(0, 4)}…${phone.slice(-3)}` : null
}

export type PhoneTemplateRequest = {
  jobId: string
  phone: string
  templateId: string
  parameters: Record<string, string>
  trackingId: string
  registrationCompleted: boolean
  allowlisted: boolean
}

export type PhoneSendResult = { httpStatus?: number; providerError?: number; errorCode?: string } & (
  | { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' | 'RECIPIENT_INELIGIBLE' | 'ZALO_TOKEN_INVALID' | 'ZALO_PROOF_INVALID' | 'PROVIDER_REJECTED' | 'AMBIGUOUS' }
  | { state: 'ACCEPTED'; messageId: string; delivered: false; duplicate: boolean }
)

export function phoneRequestBlocker(message: PhoneTemplateRequest, env: NodeJS.ProcessEnv) {
  if (!message.allowlisted || !message.registrationCompleted || message.templateId !== ZALO_TEMPLATE_ID || !normalizeVnPhone(message.phone) || !/^[A-Za-z0-9]{1,48}$/.test(message.trackingId)
    || ZALO_TEMPLATE_PARAMETERS.some(key => !message.parameters[key]) || !APPROVED_PAYMENT_STATUSES.has(message.parameters.payment_status)) return 'RECIPIENT_INELIGIBLE'
  if (!env.ZALO_OA_ACCESS_TOKEN?.trim() || !env.ZALO_APP_SECRET?.trim()) return 'ZALO_OUTBOUND_NOT_CONFIGURED'
  return null
}

export async function sendZaloPhoneTemplate(
  message: PhoneTemplateRequest,
  env: NodeJS.ProcessEnv,
  transport?: ZaloTransport,
): Promise<PhoneSendResult> {
  const phone = normalizeVnPhone(message.phone)
  const parameters = Object.fromEntries(ZALO_TEMPLATE_PARAMETERS.map(key => [key, message.parameters[key] ?? '']))
  const blocker = phoneRequestBlocker(message, env)
  if (blocker) return { state: blocker }
  if (!transport) return { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' }
  const token = env.ZALO_OA_ACCESS_TOKEN!.trim()
  const appSecret = env.ZALO_APP_SECRET!.trim()
  let httpStatus: number | undefined
  let body: { error?: number; data?: { msg_id?: string } }
  try {
    const response = await transport(ZALO_PHONE_TEMPLATE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...zaloAccessHeaders(token, appSecret) },
      body: JSON.stringify({ phone, template_id: message.templateId, template_data: parameters, tracking_id: message.trackingId }),
    })
    httpStatus = response.status
    body = await response.json() as typeof body
  } catch {
    return { state: 'AMBIGUOUS', httpStatus }
  }
  if (!body || typeof body !== 'object' || typeof body.error !== 'number' || !Number.isSafeInteger(body.error)) return { state: 'AMBIGUOUS', httpStatus }
  if (body.error === 0 && (httpStatus === undefined || (httpStatus >= 200 && httpStatus < 300)) && typeof body.data?.msg_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.data.msg_id)) {
    return { state: 'ACCEPTED', messageId: body.data.msg_id, delivered: false, duplicate: false, httpStatus, providerError: 0 }
  }
  if (!DEFINITIVE_PHONE_REJECTIONS.has(body.error)) return { state: 'AMBIGUOUS', httpStatus, providerError: body.error }
  const errorCode = phoneErrorCode(body.error)
  return { state: body.error === -124 ? 'ZALO_TOKEN_INVALID' : body.error === -1241 ? 'ZALO_PROOF_INVALID' : 'PROVIDER_REJECTED', providerError: body.error, httpStatus, errorCode }
}
