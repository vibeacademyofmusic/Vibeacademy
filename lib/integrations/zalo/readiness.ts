import { zaloAccessHeaders } from './app-secret-proof'

// Gated Zalo template sender. The default path never opens a network call.

export const ZALO_TEMPLATE_ID = '640377'
export const ZALO_REGISTRATION_PAYMENT_STATUS = {
  DEPOSIT_50: 'Đã nhận cọc 50%',
  FULL: 'Đã thanh toán đủ',
} as const
export const ZALO_TEMPLATE_PARAMETERS = [
  'customer_name',
  'registration_code',
  'student_name',
  'program_name',
  'branch_name',
  'order_code',
  'payment_status',
] as const

// Official template send uses the OA access token. Refresh uses the app secret
// and refresh token. The OA secret signs inbound webhooks; it does not send.
const REQUIRED_SECRETS = [
  'ZALO_OA_ACCESS_TOKEN',
  'ZALO_OA_REFRESH_TOKEN',
  'ZALO_APP_SECRET',
  'ZALO_OA_SECRET_KEY',
] as const

export type ZaloReadiness = {
  appId: '1355275380325944240'
  oaId: '4520912928458797082'
  templateId: typeof ZALO_TEMPLATE_ID
  sendEnabled: boolean
  missingSecrets: string[]
  blocked: true
}

export function zaloOutboundReadiness(env: NodeJS.ProcessEnv = process.env): ZaloReadiness {
  return {
    appId: '1355275380325944240',
    oaId: '4520912928458797082',
    templateId: ZALO_TEMPLATE_ID,
    sendEnabled: env.ZALO_TEMPLATE_SEND_ENABLED === 'true',
    missingSecrets: REQUIRED_SECRETS.filter(key => !env[key]?.trim()),
    blocked: true,
  }
}

export type ZaloTemplateRequest = {
  jobId: string
  providerUserId: string
  templateId: string
  parameters: Record<string, string>
  idempotencyKey: string
  registrationCompleted: boolean
  allowlisted?: boolean
}

export function zaloOneJobAllows(message: ZaloTemplateRequest, env: NodeJS.ProcessEnv = process.env) {
  const jobId = env.ZALO_TEMPLATE_SEND_JOB_ID?.trim() ?? ''
  const recipient = env.ZALO_TEMPLATE_SEND_RECIPIENT_ID?.trim() ?? ''
  if (!jobId || !recipient || !message.registrationCompleted) return false
  return message.jobId === jobId && message.providerUserId === recipient
}

const ZBS_UID_TEMPLATE_URL = 'https://openapi.zalo.me/v3.0/oa/message/template'
const INVALID_TOKEN_ERRORS = new Set([-216, -220])

export type ZaloTransport = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<{ status?: number; json: () => Promise<unknown> }>

type ZaloSendResult =
  | { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' }
  | { state: 'ZALO_ONE_JOB_DENIED' }
  | { state: 'RECIPIENT_INELIGIBLE' }
  | { state: 'ZALO_TOKEN_EXPIRED' | 'ZALO_TOKEN_INVALID' | 'ZALO_PROOF_INVALID' }
  | { state: 'PROVIDER_REJECTED'; providerError: number }
  | { state: 'ACCEPTED'; messageId: string; delivered: false; duplicate: boolean }

function templateBody(message: ZaloTemplateRequest) {
  return {
    user_id: message.providerUserId,
    template_id: message.templateId,
    template_data: Object.fromEntries(ZALO_TEMPLATE_PARAMETERS.map(key => [key, message.parameters[key] ?? ''])),
  }
}

export async function sendZaloTemplateMessage(
  message: ZaloTemplateRequest & { acceptedMessageId?: string },
  env: NodeJS.ProcessEnv,
  transport?: ZaloTransport,
): Promise<ZaloSendResult> {
  const ready = zaloOutboundReadiness(env)
  const accessToken = env.ZALO_OA_ACCESS_TOKEN?.trim()
  const appSecret = env.ZALO_APP_SECRET?.trim()
  if (message.templateId !== ZALO_TEMPLATE_ID || !accessToken || !appSecret) {
    return { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' }
  }
  if (!message.allowlisted && (!ready.sendEnabled || ready.missingSecrets.length > 0 || !zaloOneJobAllows(message, env))) {
    return message.allowlisted ? { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' } : { state: !ready.sendEnabled || ready.missingSecrets.length > 0 ? 'ZALO_OUTBOUND_NOT_CONFIGURED' : 'ZALO_ONE_JOB_DENIED' }
  }
  const parameters = templateBody(message).template_data
  if (ZALO_TEMPLATE_PARAMETERS.some(key => !parameters[key]) || parameters.payment_status !== ZALO_REGISTRATION_PAYMENT_STATUS.DEPOSIT_50 || !message.idempotencyKey) {
    return { state: 'RECIPIENT_INELIGIBLE' }
  }
  if (message.acceptedMessageId) return { state: 'ACCEPTED', messageId: message.acceptedMessageId, delivered: false, duplicate: true }
  if (!transport) return { state: 'ZALO_OUTBOUND_NOT_CONFIGURED' }
  const response = await transport(ZBS_UID_TEMPLATE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...zaloAccessHeaders(accessToken, appSecret) },
    body: JSON.stringify(templateBody(message)),
  })
  const body = await response.json() as { error?: number; data?: { message_id?: string } }
  if (INVALID_TOKEN_ERRORS.has(Number(body.error))) {
    return { state: 'ZALO_TOKEN_INVALID' }
  }
  if (body.error === -242) return { state: 'ZALO_PROOF_INVALID' }
  if (body.error === 0 && body.data?.message_id) {
    return { state: 'ACCEPTED', messageId: body.data.message_id, delivered: false, duplicate: false }
  }
  return { state: 'PROVIDER_REJECTED', providerError: Number(body.error) }
}
