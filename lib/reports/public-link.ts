// A report link is a bearer capability, not proof of the viewer's identity.
export const REPORT_LINK_PATTERN = /^[0-9a-f]{64}$/
export const REPORT_PDF_BUCKET = 'learning-report-pdfs'
export const REPORT_TEMPLATE_KEY = 'ZALO_LEARNING_REPORT_PUBLISHED'
export const REPORT_PARAMETER_KEYS = ['customer_name', 'student_name', 'student_code', 'program_name', 'report_type', 'report_period', 'report_link_id'] as const

export function reportPdfPath(token: string) {
  if (!REPORT_LINK_PATTERN.test(token)) throw new Error('REPORT_LINK_INVALID')
  return `/r/learning/${token}/pdf`
}

export function reportPublicOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? '')
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null
    return url.origin
  } catch { return null }
}

export function reportParametersValid(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  if (Object.keys(p).length !== REPORT_PARAMETER_KEYS.length) return false
  return REPORT_PARAMETER_KEYS.every(key => typeof p[key] === 'string' && (key === 'report_link_id'
    ? REPORT_LINK_PATTERN.test(p[key] as string)
    : (p[key] as string).trim().length > 0 && Array.from(p[key] as string).length <= 30 && !/[\r\n\x00-\x1f]/.test(p[key] as string)))
}

export const reportPdfHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
}

export function reportDeliveryLabel(status: string, error: string | null) {
  if (error === 'REPORT_TEMPLATE_NOT_READY') return 'Chờ mẫu ZBS được duyệt và bật'
  if (error === 'REPORT_ACCEPTANCE_UNKNOWN') return 'Chưa xác định kết quả gửi — cần đối soát'
  if (error === 'REPORT_RECIPIENT_INELIGIBLE') return 'Chưa có phụ huynh kết nối Zalo hợp lệ'
  if (error === 'REPORT_PARAMETERS_INVALID') return 'Cần kiểm tra tên và tham số báo cáo'
  if (error === 'REPORT_SENDING_DISABLED') return 'Đang tắt gửi ZBS báo cáo'
  if (error === 'REPORT_ORIGIN_MISSING') return 'Chưa cấu hình tên miền báo cáo'
  if (error === 'REPORT_CREDENTIAL_NOT_READY') return 'Kết nối Zalo chưa sẵn sàng'
  if (error === 'PDF_NOT_READY') return 'Đang chuẩn bị PDF'
  return ({ SENT: 'Zalo đã nhận yêu cầu gửi', DELIVERED: 'Đã phát đến máy', QUEUED: 'Chờ gửi', RETRYING: 'Chờ thử lại', FAILED: 'Gửi lỗi', CANCELLED: 'Đã hủy', SKIPPED_NO_CHANNEL: 'Chưa có kết nối Zalo', PROCESSING: 'Đang xử lý' } as Record<string, string>)[status] ?? status
}
