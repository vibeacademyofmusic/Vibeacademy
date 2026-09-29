import { ZALO_PILOT_OUTBOUND_DISABLED, zaloPilotOutboundBlocked } from './pilot-outbound'

// Disabled Zalo outbound adapter. Never opens a network call and never reports SENT.

export const ZALO_OUTBOUND_STATE = 'ZALO_OUTBOUND_NOT_CONFIGURED' as const

export const ZALO_PAYMENT_TEMPLATE_KEY = 'ZALO_PAYMENT_RECEIVED'
export const ZALO_PAYMENT_EVENT_TYPE = 'TUITION_PAYMENT_RECEIVED'

export type ZaloTemplateMessage = {
  providerUserId: string
  templateId: string
  parameters: Record<string, string>
  idempotencyKey: string
}

export type ZaloTemplateResult = { state: typeof ZALO_OUTBOUND_STATE | typeof ZALO_PILOT_OUTBOUND_DISABLED }

export function zaloTemplateIsSendable(template: {
  provider_template_id: string | null
  status: string
  enabled: boolean
} | null | undefined) {
  return Boolean(
    template
    && template.enabled === true
    && template.status === 'APPROVED'
    && template.provider_template_id?.trim()
  )
}

export async function sendZaloTemplateMessage(_message: ZaloTemplateMessage): Promise<ZaloTemplateResult> {
  if (zaloPilotOutboundBlocked()) return { state: ZALO_PILOT_OUTBOUND_DISABLED }
  return { state: ZALO_OUTBOUND_STATE }
}

export const ZALO_TEMPLATE_LABELS: Record<string, string> = {
  ZALO_REGISTRATION_CONFIRMED: 'Xác nhận đăng ký',
  ZALO_PAYMENT_CONFIRMED: 'Xác nhận thanh toán',
  ZALO_CLASS_ASSIGNED: 'Xác nhận xếp lớp',
  ZALO_LEARNING_REPORT_PUBLISHED: 'Báo cáo học tập',
  ZALO_TUITION_REMINDER: 'Nhắc học phí',
  ZALO_COURSE_EXPIRING: 'Sắp hết khóa',
}
