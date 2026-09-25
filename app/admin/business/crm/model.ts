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

export const interestLevelLabel: Record<string, string> = {
  REFERENCE: 'Tham khảo',
  INTERESTED: 'Quan tâm',
  POTENTIAL: 'Tiềm năng',
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
  QUALIFIED: 'Đủ điều kiện',
  TRIAL_BOOKED: 'Đặt lịch học thử',
  TRIAL_COMPLETED: 'Hoàn thành học thử',
  PROPOSAL_SENT: 'Đã gửi đề xuất',
  NEGOTIATION_UPDATED: 'Đang thương lượng',
  WON: 'Chốt thành công',
  LOST: 'Chốt thất bại',
  NOTE_ADDED: 'Ghi chú',
  FOLLOW_UP_SET: 'Hẹn theo dõi',
  CONVERSION_REVIEWED: 'Đưa vào xem xét chuyển đổi',
  CONVERTED: 'Đã gắn học viên',
  INTEREST_LEVEL_SET: 'Cập nhật mức độ quan tâm',
}

export const tabs = [
  { id: 'all', label: 'Tất cả', statuses: null as string[] | null },
  { id: 'new', label: 'Khách hàng mới', statuses: ['NEW', 'CONTACTED'] },
  { id: 'potential', label: 'Học thử', statuses: ['QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED'] },
  { id: 'opportunity', label: 'Cơ hội', statuses: ['PROPOSAL_SENT', 'NEGOTIATING'] },
  { id: 'won', label: 'Đã chốt', statuses: ['WON'] },
  { id: 'lost', label: 'Đã mất', statuses: ['LOST'] },
]

export const nextSteps: Record<string, { status: string; label: string }[]> = {
  NEW: [
    { status: 'CONTACTED', label: 'Đã liên hệ' },
    { status: 'LOST', label: 'Chốt thất bại' },
  ],
  CONTACTED: [
    { status: 'QUALIFIED', label: 'Đủ điều kiện' },
    { status: 'LOST', label: 'Chốt thất bại' },
  ],
  QUALIFIED: [
    { status: 'TRIAL_BOOKED', label: 'Đặt lịch học thử' },
    { status: 'LOST', label: 'Chốt thất bại' },
  ],
  TRIAL_BOOKED: [
    { status: 'TRIAL_COMPLETED', label: 'Hoàn thành học thử' },
    { status: 'LOST', label: 'Chốt thất bại' },
  ],
  TRIAL_COMPLETED: [
    { status: 'PROPOSAL_SENT', label: 'Đã gửi đề xuất' },
    { status: 'LOST', label: 'Chốt thất bại' },
  ],
  PROPOSAL_SENT: [
    { status: 'NEGOTIATING', label: 'Đang thương lượng' },
    { status: 'LOST', label: 'Chốt thất bại' },
  ],
  NEGOTIATING: [
    { status: 'WON', label: 'Chốt thành công' },
    { status: 'LOST', label: 'Chốt thất bại' },
  ],
}

export function tabStatuses(tab?: string) {
  return tabs.find(item => item.id === tab)?.statuses ?? null
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
