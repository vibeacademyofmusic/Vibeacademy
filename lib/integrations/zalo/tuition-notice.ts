import { tuitionLiveTemplateButtons, tuitionReplacementButtons } from './tuition-reply'

export const TUITION_TEMPLATE_KEY = 'ZALO_TUITION_REMINDER'
export const TUITION_PROVIDER_TEMPLATE_ID = '645192'
// Retired reminder template. Old sends keep it; their callbacks still resolve through the send snapshot.
export const TUITION_LEGACY_TEMPLATE_IDS = ['643118'] as const
export const TUITION_REGISTRATION_TEMPLATE_ID = '640377'

export type TuitionReminderRegistry = {
  status?: string | null
  enabled?: boolean | null
  provider_template_id?: string | null
  parameter_schema?: unknown
}

const VERIFIED_REMINDER_PARAMETERS = new Set(['student_name', 'student_code', 'days_left', 'period', 'amount', 'due_date'])

export function tuitionReminderTemplateId(template: TuitionReminderRegistry | null | undefined) {
  const id = template?.provider_template_id?.trim() ?? ''
  if (template?.status !== 'APPROVED' || !/^[0-9]{1,20}$/.test(id) || id === TUITION_REGISTRATION_TEMPLATE_ID) return null
  return id
}

export function tuitionReminderSchema(template: TuitionReminderRegistry | null | undefined) {
  if (!Array.isArray(template?.parameter_schema)) return []
  return template.parameter_schema.filter((item): item is string => typeof item === 'string')
}
export const TUITION_TEMPLATE_TITLE = 'VIBE - Xác nhận tiếp tục học V2'
export const TUITION_MESSAGE_PRICE_VND = 400
export const TUITION_MESSAGE_PRICE_UID_VND = 280

export const TUITION_PARAMETER_LIMITS = {
  student_name: 30,
  student_code: 30,
  days_left: 20,
  period: 30,
  amount: 20,
  due_date: 20,
} as const

export type NoticeRecipient = {
  id: string
  name: string
  phone: string | null
  canViewFinance: boolean
  isPrimary: boolean
  active: boolean
}

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
  packageAmount: number | null
  currency: string
  recipients: NoticeRecipient[]
  selectedRecipientId?: string | null
  consentParentIds: string[]
  templateReady: boolean
  scheduledDispatchEnabled: boolean
  manualSendEnabled?: boolean
}

export type TuitionNotice = {
  blockers: string[]
  deliveryBlockers: string[]
  attemptAllowed: boolean
  recipient: NoticeRecipient | null
  candidates: { id: string; name: string }[]
  parameters: Record<string, string> | null
  preview: string
  replacementPreview: string
  ctaUrl: null
  priceVnd: number
}

export function tuitionSendBeginMessage(errorText: string) {
  const text = errorText.toLowerCase()
  if (text.includes('super_admin')) return 'Bạn không có quyền gửi nhắc học phí qua Zalo. Chưa gửi.'
  if (text.includes('already prepared')) return 'Đã có lần gửi đang mở hoặc đã được Zalo tiếp nhận cho nhắc này. Không gửi trùng.'
  if (text.includes('consent required')) return 'Người nhận chưa có sự đồng ý nhận thông báo học phí qua Zalo. Chưa gửi.'
  if (text.includes('window has not started')) return 'Chưa đến khoảng nhắc theo ngày Việt Nam. Chưa gửi.'
  if (text.includes('recipient not found')) return 'Người nhận không còn quyền xem học phí. Chưa gửi.'
  if (text.includes('branch mismatch')) return 'Kỳ học phí không khớp chi nhánh của ghi danh. Chưa gửi.'
  if (text.includes('reminder not found')) return 'Nhắc học phí không còn ở trạng thái chờ. Chưa gửi.'
  return 'Không tạo được lần gửi. Chưa gửi — chưa thể phản hồi.'
}

export function zaloAttemptLabel(status: string | null | undefined) {
  if (status === 'SENT' || status === 'DELIVERED') return 'Đã gửi'
  if (status === 'FAILED') return 'Gửi thất bại'
  return 'Chưa gửi'
}

export function noticeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-')
  const date = new Date(`${value}T00:00:00Z`)
  if (date.toISOString().slice(0, 10) !== value) return null
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

function packageAmountText(amount: number | null, currency: string) {
  if (currency !== 'VND' || amount == null || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return null
  const text = String(amount)
  return text.length <= TUITION_PARAMETER_LIMITS.amount ? text : null
}

// 645192 declares due_date and days_left as NUMBER, so the date is sent as digits (ddMMyyyy).
export function noticeDateDigits(value: string) {
  const text = noticeDate(value)
  return text ? text.replaceAll('/', '') : null
}

export function noticeDaysLeft(periodEnd: string, today: string) {
  if (!noticeDate(periodEnd) || !noticeDate(today)) return null
  const days = Math.round((Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  return days >= 0 ? String(days) : '0'
}

function vietnamToday() {
  return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
}

export function tuitionTemplateParameters(input: Pick<TuitionNoticeInput, 'periodStart' | 'periodEnd' | 'windowEnd' | 'studentName' | 'studentCode' | 'packageAmount' | 'currency'> & { today?: string; customerName?: string }) {
  const errors: string[] = []
  const studentName = input.studentName.trim()
  const studentCode = input.studentCode.trim()
  const start = noticeDate(input.periodStart)
  const end = noticeDate(input.periodEnd)
  const due = noticeDateDigits(input.windowEnd)
  const daysLeft = noticeDaysLeft(input.periodEnd, input.today ?? vietnamToday())
  const period = start && end ? `${start}-${end}` : ''
  const amount = packageAmountText(input.packageAmount, input.currency)
  const parameters = {
    student_name: studentName,
    student_code: studentCode,
    days_left: daysLeft ?? '',
    period,
    amount: amount ?? '',
    due_date: due ?? '',
  }
  if (!studentName) errors.push('Thiếu tên học viên.')
  if (!studentCode) errors.push('Thiếu mã học viên.')
  if (!period) errors.push('Thiếu kỳ học.')
  if (!amount) errors.push('Chưa có học phí gói bằng VND để điền vào mẫu. Không dùng số nợ và không tạo khoản thu chỉ để gửi.')
  if (!due) errors.push('Thiếu hạn cuối của khoảng nhắc đã lưu.')
  if (!daysLeft) errors.push('Không tính được số ngày còn lại của kỳ học.')
  for (const [key, value] of Object.entries(parameters)) {
    const limit = TUITION_PARAMETER_LIMITS[key as keyof typeof TUITION_PARAMETER_LIMITS]
    if (value.length > limit) errors.push(`${key} dài hơn ${limit} ký tự mà mẫu đã cấu hình cho phép.`)
    if (value.includes('<') || value.includes('>')) errors.push(`${key} chứa ký tự không hợp lệ.`)
  }
  if (parameters.due_date && !/^\d{8}$/.test(parameters.due_date)) errors.push('due_date không đúng định dạng số của mẫu.')
  if (parameters.days_left && !/^\d{1,5}$/.test(parameters.days_left)) errors.push('days_left không phải số nguyên của mẫu.')
  if (parameters.amount && !/^[1-9]\d{0,19}$/.test(parameters.amount)) errors.push('amount không phải số nguyên dương mà mẫu yêu cầu.')
  return { parameters: errors.length ? null : parameters, errors }
}

export function previewConfiguredTuitionReminder(
  template: TuitionReminderRegistry | null | undefined,
  input: Parameters<typeof tuitionTemplateParameters>[0],
) {
  const templateId = tuitionReminderTemplateId(template)
  const schema = tuitionReminderSchema(template)
  if (!templateId) return { ok: false as const, code: 'TEMPLATE_NOT_CONFIGURED' as const, templateId: null, parameters: null, unverified: [] as string[] }
  const unverified = schema.filter(key => !VERIFIED_REMINDER_PARAMETERS.has(key))
  if (!schema.length || unverified.length) {
    return { ok: false as const, code: 'SCHEMA_UNVERIFIED' as const, templateId, parameters: null, unverified }
  }
  const built = tuitionTemplateParameters(input)
  if (!built.parameters) return { ok: false as const, code: 'PAYLOAD_INCOMPLETE' as const, templateId, parameters: null, unverified: built.errors }
  const parameters = Object.fromEntries(schema.map(key => [key, built.parameters?.[key as keyof typeof built.parameters] ?? '']))
  return { ok: true as const, code: 'PREVIEW' as const, templateId, parameters, unverified: [] as string[] }
}

export function renderTuitionPreview(parameters: Record<string, string> | null, input: Pick<TuitionNoticeInput, 'studentName' | 'studentCode' | 'periodStart' | 'periodEnd' | 'windowEnd' | 'packageAmount' | 'currency'>, customerName: string) {
  const fallback = tuitionTemplateParameters({ ...input, customerName })
  const values = parameters ?? fallback.parameters ?? {
    student_name: input.studentName.trim() || '…',
    days_left: '…',
    student_code: input.studentCode.trim() || '…',
    period: [noticeDate(input.periodStart), noticeDate(input.periodEnd)].filter(Boolean).join('-') || '…',
    amount: packageAmountText(input.packageAmount, input.currency) ?? '…',
    due_date: noticeDateDigits(input.windowEnd) ?? '…',
  }
  return [
    TUITION_TEMPLATE_TITLE,
    `Kính gửi Quý Phụ huynh - Nhạc sinh, Vibe Academy thông báo kỳ học ${values.period} của học viên ${values.student_name}, mã học viên ${values.student_code}, còn ${values.days_left} ngày nữa sẽ kết thúc.
Học phí gia hạn gói 3 tháng là ${values.amount} đồng. Hạn thanh toán: ${values.due_date}. Chọn Tiếp tục học hoặc Liên hệ để Vibe ghi nhận và lên kế hoạch.`,
    ...tuitionLiveTemplateButtons().map(label => `Nút phản hồi: ${label}`),
    'Không có đường dẫn. Hai nút nằm trong tin Zalo và không mở trang chứa thông tin học viên.',
  ].join('\n')
}

export function renderTuitionReplacementPreview(parameters: Record<string, string> | null, input: Pick<TuitionNoticeInput, 'studentName' | 'studentCode' | 'periodStart' | 'periodEnd' | 'windowEnd' | 'packageAmount' | 'currency'>, customerName: string) {
  const live = renderTuitionPreview(parameters, input, customerName).split('\n')
  const body = live.filter(line => !line.startsWith('Nút phản hồi:') && line !== live.at(-1))
  return [
    ...body,
    ...tuitionReplacementButtons().map(label => `Nút phản hồi: ${label}`),
    'Không có đường dẫn. Mẫu này chưa được duyệt và chưa được dùng để gửi.',
  ].join('\n')
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
  if (input.eventCode !== 'RENEWAL_V1') blockers.push('Mẫu nhắc gia hạn chỉ thông báo học phí gói cần gia hạn. Không điền số nợ hoặc số dư hóa đơn vào mẫu này.')
  if (chosen && !input.consentParentIds.includes(chosen.id)) blockers.push('Người nhận này chưa có sự đồng ý nhận thông báo học phí qua Zalo. Sự đồng ý lúc đăng ký không được dùng cho mẫu này.')
  if (chosen && !chosen.phone?.replace(/\D/g, '')) blockers.push('Người nhận chưa có số điện thoại để Zalo phát tin.')
  const built = chosen ? tuitionTemplateParameters({ ...input, customerName: chosen.name }) : { parameters: null, errors: [] }
  blockers.push(...built.errors)

  const deliveryBlockers: string[] = []
  if (!input.templateReady) deliveryBlockers.push('Mẫu ZALO_TUITION_REMINDER chưa có mã Zalo đã duyệt trong cấu hình.')
  if (input.scheduledDispatchEnabled) deliveryBlockers.push('Lịch gửi thật đang bật. Chưa được phép gửi tự động.')
  else if (input.manualSendEnabled) deliveryBlockers.push('Gửi theo lịch đang tắt. Gửi thật thủ công đã bật. Chưa gửi tồn đọng và không có gửi hàng loạt.')
  else deliveryBlockers.push('Gửi theo lịch đang tắt. Zalo thật đang tắt cho đến khi chủ hệ thống cho phép đúng người nhận và đúng nội dung này.')

  const ready = blockers.length === 0 && built.parameters !== null
  return {
    blockers: [...new Set(blockers)],
    deliveryBlockers: ready ? [...new Set(deliveryBlockers)] : [],
    attemptAllowed: ready,
    recipient: chosen,
    candidates: finance.map(row => ({ id: row.id, name: row.name.trim() })),
    parameters: ready ? built.parameters : null,
    preview: renderTuitionPreview(ready ? built.parameters : null, input, chosen?.name ?? ''),
    replacementPreview: renderTuitionReplacementPreview(ready ? built.parameters : null, input, chosen?.name ?? ''),
    ctaUrl: null,
    priceVnd: TUITION_MESSAGE_PRICE_VND,
  }
}
