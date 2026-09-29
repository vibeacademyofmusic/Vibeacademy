import { TUITION_REPLY_CONTINUE, TUITION_REPLY_STOP } from './tuition-reply'

export const TUITION_TEMPLATE_KEY = 'ZALO_TUITION_REMINDER'
export const TUITION_TEMPLATE_TITLE = 'THÔNG BÁO KỲ HỌC VÀ HỌC PHÍ'
export const TUITION_STATUSES = [
  'Sắp đến kỳ cập nhật',
  'Còn học phí cần thanh toán',
  'Học phí quá hạn',
] as const

export type TuitionNoticeStatus = (typeof TUITION_STATUSES)[number]

export type NoticeRecipient = {
  id: string
  name: string
  phone: string | null
  canViewFinance: boolean
  isPrimary: boolean
  active: boolean
}

export type NoticeInvoice = {
  status: string
  outstanding: number
} | null

export type TuitionNoticeInput = {
  reminderStatus: string
  eventCode: string | null
  windowStart: string
  windowEnd: string
  today: string
  periodStart: string
  periodEnd: string
  studentName: string
  studentCode: string
  branchName: string
  invoice: NoticeInvoice
  recipients: NoticeRecipient[]
  selectedRecipientId?: string | null
  templateApproved: boolean
  consentGranted: boolean
}

export type TuitionNotice = {
  status: TuitionNoticeStatus | null
  blockers: string[]
  deliveryBlockers: string[]
  attemptAllowed: boolean
  recipient: NoticeRecipient | null
  parameters: Record<string, string> | null
  preview: string
}

export function zaloAttemptLabel(status: string | null | undefined) {
  if (status === 'SENT' || status === 'DELIVERED') return 'Đã gửi'
  if (status === 'FAILED') return 'Gửi lỗi'
  return 'Chưa gửi'
}

const limits: Record<string, number> = {
  parent_name: 100,
  student_name: 100,
  student_code: 30,
  branch_name: 100,
  period_start: 10,
  period_end: 10,
  tuition_status: 40,
}

export function noticeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function maskPhone(phone: string | null | undefined) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 6) return 'Chưa có số điện thoại'
  return `${'•'.repeat(digits.length - 3)}${digits.slice(-3)}`
}

function activeFinanceRecipients(rows: NoticeRecipient[]) {
  return rows.filter(row => row.active && row.canViewFinance && row.name.trim())
}

export function evaluateTuitionNotice(input: TuitionNoticeInput): TuitionNotice {
  const blockers: string[] = []
  const finance = activeFinanceRecipients(input.recipients)
  const chosen = input.selectedRecipientId
    ? finance.find(row => row.id === input.selectedRecipientId) ?? null
    : finance.find(row => row.isPrimary) ?? (finance.length === 1 ? finance[0] : null)
  if (input.reminderStatus !== 'PENDING') blockers.push('Nhắc học phí này đã được xử lý, không gửi thêm.')
  if (input.windowStart > input.today) blockers.push('Chưa đến khoảng nhắc theo ngày Việt Nam. Xem trước không gửi sớm.')
  if (input.selectedRecipientId && !chosen) blockers.push('Phụ huynh được chọn không còn quyền xem học phí của học viên này.')
  if (!finance.length) blockers.push('Chưa có phụ huynh đang được xem học phí. Hãy gắn phụ huynh và quyền xem học phí trước.')
  else if (!chosen) blockers.push('Có nhiều phụ huynh được xem học phí nhưng chưa có người nhận mặc định. Hãy chọn một người; hệ thống không gửi cho tất cả.')
  if (!input.consentGranted) blockers.push('Chưa có sự đồng ý nhận thông báo học phí qua Zalo. Sự đồng ý lúc đăng ký không được dùng cho mẫu này.')
  const deliveryBlockers: string[] = []
  if (!input.templateApproved) {
    deliveryBlockers.push('Mẫu ZALO_TUITION_REMINDER vẫn là bản nháp, chưa có mã mẫu Zalo và chưa được duyệt.')
    deliveryBlockers.push('Zalo thật đang tắt. Lần bấm gửi này được ghi là lỗi, không tính là đã gửi.')
  }

  const issued = input.invoice?.status === 'ISSUED' && input.invoice.outstanding > 0
  let status: TuitionNoticeStatus | null = null
  if (input.eventCode === 'BALANCE_50_V1') {
    if (!issued) blockers.push('Chưa có khoản thu đã phát hành còn dư. Học phí của gói không được dùng làm số nợ.')
    else if (input.windowEnd < input.today) status = 'Học phí quá hạn'
    else if (input.windowStart <= input.today) status = 'Còn học phí cần thanh toán'
  } else if (input.windowEnd < input.today) {
    blockers.push('Khoảng nhắc gia hạn đã qua và không có trạng thái nợ phù hợp với mẫu này.')
  } else {
    status = 'Sắp đến kỳ cập nhật'
  }
  if (!status) blockers.push('Chưa có trạng thái hợp lệ để điền vào mẫu.')

  const parameters = status && chosen ? {
    parent_name: chosen.name.trim(),
    student_name: input.studentName.trim(),
    student_code: input.studentCode.trim(),
    branch_name: input.branchName.trim(),
    period_start: noticeDate(input.periodStart) ?? '',
    period_end: noticeDate(input.periodEnd) ?? '',
    tuition_status: status,
  } : null
  if (parameters) {
    for (const [key, value] of Object.entries(parameters)) {
      if (!value) blockers.push(`Thiếu ${key}.`)
      else if (value.length > limits[key]) blockers.push(`${key} dài hơn mức mẫu cho phép.`)
    }
    if ('amount_due_display' in parameters || 'due_date' in parameters) blockers.push('Mẫu không được chứa số tiền.')
  }
  const ready = blockers.length === 0 && parameters !== null
  return {
    status,
    blockers: [...new Set(blockers)],
    deliveryBlockers: ready ? [...new Set(deliveryBlockers)] : [],
    attemptAllowed: ready,
    recipient: chosen,
    parameters: ready ? parameters : null,
    preview: renderPreview(parameters, input, status),
  }
}

function renderPreview(parameters: Record<string, string> | null, input: TuitionNoticeInput, status: TuitionNoticeStatus | null) {
  const rows = [
    ['Học viên', parameters?.student_name || input.studentName],
    ['Mã học viên', parameters?.student_code || input.studentCode],
    ['Chi nhánh', parameters?.branch_name || input.branchName],
    ['Ngày bắt đầu kỳ học', parameters?.period_start || noticeDate(input.periodStart) || '—'],
    ['Ngày kết thúc kỳ học', parameters?.period_end || noticeDate(input.periodEnd) || '—'],
    ['Trạng thái', parameters?.tuition_status || status || 'Chưa đủ trạng thái'],
  ]
  return [
    TUITION_TEMPLATE_TITLE,
    'Kính gửi Quý phụ huynh và nhạc sinh, Vibe Academy gửi thông tin kỳ học và học phí của học viên như sau:',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    'Xin vui lòng phản hồi duy trì chương trình học và gia hạn học phí? Để Vibe có thể chuẩn bị lớp và kế hoạch cho quý học viên.',
    `Nút phản hồi: ${TUITION_REPLY_CONTINUE}`,
    `Nút phản hồi: ${TUITION_REPLY_STOP}`,
  ].join('\n')
}
