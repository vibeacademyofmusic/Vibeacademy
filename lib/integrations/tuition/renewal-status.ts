import {
  TUITION_CONFIRMATION_TEMPLATE_KEY,
  TUITION_PAYMENT_TEMPLATE_KEY,
  tuitionPaymentTemplateConfigured,
  tuitionPaymentTemplateReady,
  TUITION_PAYMENT_REQUEST,
} from './payment-zbs'

export { TUITION_PAYMENT_TEMPLATE_KEY, TUITION_CONFIRMATION_TEMPLATE_KEY }

const processingLabels: Record<string, string> = {
  CHECKOUT_PENDING: 'Chờ tạo thanh toán',
  AWAITING_TEMPLATE: 'Chờ mẫu ZBS thanh toán',
  AWAITING_ZBS: 'Chờ gửi ZBS',
  AWAITING_PAYMENT: 'Chờ thanh toán',
  DEPOSIT_PAID: 'Đã nhận cọc 50%',
  PAID: 'Gia hạn hoàn tất',
  ERROR: 'Lỗi cần xử lý',
}

export function renewalProcessingLabel(state: string | null | undefined, hasCustomerReply: boolean) {
  if (!state) return hasCustomerReply ? 'Cần chăm sóc' : 'Chưa xử lý'
  return processingLabels[state] ?? 'Lỗi cần xử lý'
}

export function renewalPaymentLabel(state: string | null | undefined) {
  if (state === 'DEPOSIT_PAID') return 'Đã nhận cọc 50%'
  if (state === 'PAID') return 'Đã thanh toán'
  return 'Chờ thanh toán'
}

export function paymentTemplateReady(template: {
  template_key?: string | null
  status?: string | null
  enabled?: boolean | null
  provider_template_id?: string | null
  parameter_schema?: unknown
  payload_schema?: unknown
} | null) {
  return tuitionPaymentTemplateReady({ ...template, template_key: template?.template_key ?? TUITION_PAYMENT_TEMPLATE_KEY }, TUITION_PAYMENT_REQUEST)
}

export function paymentTemplateGate(template: {
  template_key?: string | null
  status?: string | null
  enabled?: boolean | null
  provider_template_id?: string | null
  parameter_schema?: unknown
  payload_schema?: unknown
} | null) {
  const configured = { ...template, template_key: template?.template_key ?? TUITION_PAYMENT_TEMPLATE_KEY }
  const templateId = configured.provider_template_id?.trim() || null
  if (!tuitionPaymentTemplateConfigured(configured, TUITION_PAYMENT_REQUEST)) {
    return { ready: false, sendingEnabled: false, code: 'ZBS_TEMPLATE_REQUIRED' as const, templateId }
  }
  if (configured.enabled === true) return { ready: true, sendingEnabled: true, code: 'ELIGIBLE' as const, templateId }
  return { ready: true, sendingEnabled: false, code: 'ZBS_SEND_DISABLED' as const, templateId }
}

export function paymentNoticeReason(code: string | null | undefined, templateId: string | null | undefined) {
  if (code === 'ELIGIBLE') return `Mẫu ZALO_TUITION_PAYMENT ${templateId || ''} đã bật. Hồ sơ giữ lại sẽ gửi khi nhân viên bấm gửi lại. Bật mẫu không tự gửi.`
  if (code === 'ZBS_SEND_DISABLED') return `Mẫu ZALO_TUITION_PAYMENT ${templateId || ''} đã cấu hình. Gửi đang tắt. Chưa gửi tin và chưa ghi đã thanh toán.`
  if (code === 'ZBS_TEMPLATE_REQUIRED') return 'Mẫu yêu cầu thanh toán chưa có mã Zalo đã duyệt. Chưa gửi.'
  return 'Chưa gửi yêu cầu thanh toán. Chưa ghi đã thanh toán.'
}

export function persistedPaymentNoticeStatus(dispatch: { state: string; code: string }) {
  if (dispatch.state === 'HELD' || dispatch.state === 'ELIGIBLE') return 'HELD'
  if (dispatch.code === 'ZBS_TEMPLATE_REQUIRED') return 'AWAITING_TEMPLATE'
  return 'FAILED'
}

export function storedZbsStatusLabel(status: string | null | undefined) {
  if (status === 'HELD') return 'Đã lưu: gửi đang tắt'
  if (status === 'AWAITING_TEMPLATE') return 'Đã lưu: chờ mẫu'
  if (status === 'SENT') return 'Đã lưu: đã gửi'
  if (status === 'FAILED') return 'Đã lưu: lỗi'
  if (!status || status === 'NONE') return 'Đã lưu: chưa có'
  return `Đã lưu: ${status}`
}

export const PAYMENT_TEMPLATE_REQUEST = [
  'Mẫu ZBS mới: TUITION_PAYMENT_REQUEST, khóa ZALO_TUITION_PAYMENT.',
  'Tham số chữ: customer_name, payment_status, student_name, invoice_code, tuition_package, package_amount, payment_type, amount_due, payment_deadline.',
  'payment_status của tin yêu cầu là đúng chữ Chờ thanh toán.',
  'package_amount và amount_due là số nguyên VND, không thêm dấu hoặc chữ tiền.',
  'payment_deadline theo dd/MM/yyyy.',
  'Nút Thanh toán học phí dùng tham số payment_link_id và mở https://pay.payos.vn/web/<payment_link_id>.',
  'Không gửi nguyên checkoutUrl vào payment_link_id và không dùng mẫu 643118 hoặc 640377.',
  'Mẫu xác nhận riêng TUITION_PAYMENT_CONFIRMATION phải nói đúng Đã nhận cọc 50% hoặc Đã thanh toán.',
].join(' ')
