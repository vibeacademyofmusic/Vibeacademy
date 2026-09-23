// Disabled Zalo sender. This module never reads tokens and never opens a network call.

export const ZALO_OUTBOUND_STATE = 'ZALO_OUTBOUND_NOT_CONFIGURED' as const

export const ZALO_TEMPLATE_LABELS: Record<string, string> = {
  ZALO_REGISTRATION_CONFIRMED: 'Xác nhận đăng ký',
  ZALO_PAYMENT_CONFIRMED: 'Xác nhận thanh toán',
  ZALO_CLASS_ASSIGNED: 'Xác nhận xếp lớp',
  ZALO_LEARNING_REPORT_PUBLISHED: 'Báo cáo học tập',
  ZALO_TUITION_REMINDER: 'Nhắc học phí',
  ZALO_COURSE_EXPIRING: 'Sắp hết khóa',
}

export type ZaloTemplateMessage = {
  providerUserId: string
  templateId: string
  parameters: Record<string, string>
  idempotencyKey: string
}

export type ZaloTemplateResult = { state: typeof ZALO_OUTBOUND_STATE }

export async function sendZaloTemplateMessage(_message: ZaloTemplateMessage): Promise<ZaloTemplateResult> {
  return { state: ZALO_OUTBOUND_STATE }
}
