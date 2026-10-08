export const statusLabel: Record<string, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đủ điều kiện',
  TRIAL_BOOKED: 'Đã hẹn học thử',
  TRIAL_COMPLETED: 'Đã học thử',
  PROPOSAL_SENT: 'Đã gửi đề xuất',
  NEGOTIATING: 'Đang thương lượng',
  WON: 'Thành công',
  LOST: 'Không tiếp tục',
}

export const sourceLabel: Record<string, string> = {
  MANUAL: 'Nhập tay',
  WALK_IN: 'Khách đến',
  REFERRAL: 'Giới thiệu',
  WEBSITE: 'Website',
  ZALO: 'Zalo',
  PHONE: 'Điện thoại',
  OTHER: 'Khác',
}

export const eventLabel: Record<string, string> = {
  CREATED: 'Tạo mới',
  UPDATED: 'Cập nhật',
  ASSIGNED: 'Đổi người phụ trách',
  CONTACTED: 'Đã liên hệ',
  QUALIFIED: 'Đánh dấu tiềm năng',
  TRIAL_BOOKED: 'Đặt lịch học thử',
  TRIAL_COMPLETED: 'Hoàn thành học thử',
  PROPOSAL_SENT: 'Đã gửi đề xuất',
  NEGOTIATION_UPDATED: 'Đang thương lượng',
  WON: 'Chốt thành công',
  LOST: 'Không tiếp tục',
  NOTE_ADDED: 'Ghi chú',
  FOLLOW_UP_SET: 'Hẹn theo dõi',
  CONVERSION_REVIEWED: 'Đưa vào xem xét chuyển đổi',
  CONVERTED: 'Đã gắn học viên',
}

export const contactChannels = [
  { id: 'PHONE', label: 'Điện thoại' },
  { id: 'ZALO', label: 'Zalo' },
  { id: 'SMS', label: 'SMS' },
  { id: 'EMAIL', label: 'Email' },
  { id: 'IN_PERSON', label: 'Trực tiếp' },
  { id: 'OTHER', label: 'Khác' },
]

export const openRegistrationStatuses = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'PAYMENT_PENDING', 'PAID']

export const registrationStatusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Đã nộp',
  VERIFIED: 'Đã xác minh',
  PAYMENT_PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  COMPLETED: 'Đã hoàn tất',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Từ chối',
  EXPIRED: 'Hết hạn',
}

export const registrationEventLabel: Record<string, string> = {
  CREATED: 'Hồ sơ đăng ký được tạo',
  SUBMITTED: 'Hồ sơ đăng ký được nộp',
  VERIFIED: 'Hồ sơ đăng ký được xác minh',
  PAYMENT_CONFIRMED: 'Thanh toán được xác nhận',
  IDENTITY_REVIEWED: 'Danh tính được xem xét',
  STUDENT_LINKED: 'Học viên được gắn',
  PARENT_LINKED: 'Phụ huynh được gắn',
  ENROLLMENT_CREATED: 'Ghi danh được tạo',
  REGISTRATION_COMPLETED: 'Nhập học hoàn tất',
  PLACEMENT_OPENED: 'Ca dạy được mở',
  CANCELLED: 'Hồ sơ đăng ký bị hủy',
}

export const channelStateLabel: Record<string, string> = {
  NONE: 'Chưa liên kết',
  LINKED: 'Đã liên kết',
  VERIFIED: 'Đã xác minh',
  REVOKED: 'Đã thu hồi',
}

export const tabs = [
  { id: 'all', label: 'Tất cả', mode: 'status' as const, statuses: null as string[] | null },
  { id: 'new', label: 'Khách mới', mode: 'status' as const, statuses: ['NEW', 'CONTACTED'] },
  { id: 'potential', label: 'Tiềm năng', mode: 'status' as const, statuses: ['QUALIFIED'] },
  { id: 'opportunity', label: 'Cơ hội', mode: 'status' as const, statuses: ['TRIAL_BOOKED', 'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATING'] },
  { id: 'admission', label: 'Đang nhập học', mode: 'admission' as const, statuses: null },
  { id: 'converted', label: 'Đã chuyển đổi', mode: 'converted' as const, statuses: null },
  { id: 'lost', label: 'Không tiếp tục', mode: 'status' as const, statuses: ['LOST'] },
]

export const nextSteps: Record<string, { status: string; label: string }[]> = {
  NEW: [
    { status: 'CONTACTED', label: 'Ghi nhận liên hệ' },
    { status: 'LOST', label: 'Không tiếp tục' },
  ],
  CONTACTED: [
    { status: 'QUALIFIED', label: 'Đánh dấu tiềm năng' },
    { status: 'LOST', label: 'Không tiếp tục' },
  ],
  QUALIFIED: [
    { status: 'TRIAL_BOOKED', label: 'Đặt lịch học thử' },
    { status: 'LOST', label: 'Không tiếp tục' },
  ],
  TRIAL_BOOKED: [
    { status: 'TRIAL_COMPLETED', label: 'Hoàn thành học thử' },
    { status: 'LOST', label: 'Không tiếp tục' },
  ],
  TRIAL_COMPLETED: [
    { status: 'PROPOSAL_SENT', label: 'Đã gửi đề xuất' },
    { status: 'LOST', label: 'Không tiếp tục' },
  ],
  PROPOSAL_SENT: [
    { status: 'NEGOTIATING', label: 'Đang thương lượng' },
    { status: 'LOST', label: 'Không tiếp tục' },
  ],
  NEGOTIATING: [
    { status: 'WON', label: 'Chốt thành công' },
    { status: 'LOST', label: 'Không tiếp tục' },
  ],
}

export function tabStatuses(tab?: string) {
  const item = tabs.find(entry => entry.id === tab)
  if (!item || item.mode !== 'status') return null
  return item.statuses
}

export function tabMode(tab?: string) {
  return tabs.find(entry => entry.id === tab)?.mode ?? 'status'
}

export function shownCount(failed: boolean, count: number | null | undefined) {
  if (failed || count == null) return '—'
  return String(count)
}

export function statusTone(status: string, converted: boolean) {
  if (converted || status === 'WON') return 'success' as const
  if (status === 'LOST') return 'neutral' as const
  if (status === 'NEW' || status === 'CONTACTED') return 'info' as const
  return 'warning' as const
}

export function journeyLabel(status: string, converted: boolean, registering: boolean) {
  if (converted) return 'Đã trở thành học viên'
  if (registering) return 'Đang nhập học'
  return statusLabel[status] || status
}

export function followUpState(date: string | null | undefined, today: string) {
  if (!date) return 'Chưa hẹn'
  if (date < today) return 'Quá hạn'
  if (date === today) return 'Hôm nay'
  return 'Đã hẹn'
}

export function paymentLabel(input: { status?: string | null; invoiceId?: string | null; confirmedAt?: string | null } | null) {
  if (!input?.status) return '—'
  if (input.confirmedAt || ((input.status === 'PAID' || input.status === 'COMPLETED') && input.invoiceId)) return 'Đã thanh toán / điều kiện đã đạt'
  if (input.status === 'PAYMENT_PENDING') return 'Chờ thanh toán'
  return 'Chưa có hóa đơn'
}

export function placementLabel(status?: string | null, startDate?: string | null, today?: string | null) {
  if (status === 'UNASSIGNED') return 'Chưa vào ca dạy'
  if (status === 'MATCHING') return 'Đang tìm ca phù hợp'
  if (status === 'SCHEDULED_FUTURE') return 'Đã vào ca dạy – chờ bắt đầu'
  if (status === 'SCHEDULED') {
    if (startDate && today && startDate > today) return 'Đã vào ca dạy – chờ bắt đầu'
    return 'Đã vào ca dạy'
  }
  return '—'
}

export function crmError(message: string) {
  if (message.includes('CRM_LEAD_STALE')) return 'Dữ liệu đã thay đổi. Tải lại rồi thử lại.'
  if (message.includes('CRM_LEAD_TRANSITION_DENIED')) return 'Không thể chuyển trạng thái này.'
  if (message.includes('CRM_LEAD_ALREADY_CONVERTED')) return 'Khách hàng này đã được gắn học viên.'
  if (message.includes('CRM_LEAD_MATCH_REJECTED')) return 'Học viên không khớp tên và ngày sinh.'
  if (message.includes('CRM_LEAD_REVIEW_REQUIRED')) return 'Cần ghi chú xem xét trước khi gắn học viên.'
  if (message.includes('CRM_LEAD_UNAUTHORIZED')) return 'Bạn không có quyền thực hiện thao tác này.'
  if (message.includes('CRM_LEAD_INVALID')) return 'Thiếu thông tin bắt buộc.'
  return 'Không thực hiện được thao tác.'
}

export const interestLevelLabel: Record<string, string> = { REFERENCE: 'Tham khảo', INTERESTED: 'Quan tâm', POTENTIAL: 'Tiềm năng' }
