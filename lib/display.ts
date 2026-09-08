/** Vietnamese labels for stored codes. Keep database and form values unchanged. */
const labels: Record<string, string> = {
  ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động', ARCHIVED: 'Đã lưu trữ',
  ON_LEAVE: 'Đang nghỉ phép', PAUSED: 'Đang bảo lưu', WITHDRAWN: 'Đã rút khỏi lớp',
  DRAFT: 'Bản nháp', SCHEDULED: 'Đã lên lịch', COMPLETED: 'Đã hoàn thành', CANCELLED: 'Đã hủy',
  REGULAR: 'Học thường', MAKEUP: 'Học bù',
  PRESENT: 'Có mặt', LATE: 'Đi muộn', ABSENT: 'Vắng không phép', EXCUSED: 'Vắng có phép',
  AVAILABLE: 'Khả dụng', RESERVED: 'Đã đặt', USED: 'Đã sử dụng', VOID: 'Đã vô hiệu', VOIDED: 'Đã vô hiệu',
  EXPIRED: 'Đã hết hạn', SUPER_ADMIN: 'Quản trị viên cấp cao', PRIMARY: 'Giáo viên chính', ASSISTANT: 'Trợ giảng',
  ONE_ON_ONE: 'Cá nhân (1 kèm 1)', GROUP: 'Lớp nhóm',
  FOUNDATION: 'Nền tảng', GRADE: 'Bậc học', DIPLOMA: 'Văn bằng', OTHER: 'Khác',
  ALL_REQUIRED_SUBJECTS: 'Hoàn thành tất cả môn bắt buộc',
  ALL_REQUIRED_COMPONENTS: 'Hoàn thành tất cả học phần bắt buộc',
  DIRECT_ASSESSMENT: 'Đánh giá trực tiếp', MANUAL: 'Xác nhận thủ công',
  NOT_STARTED: 'Chưa bắt đầu', IN_PROGRESS: 'Đang học', PASS: 'Đạt', NOT_PASSED: 'Chưa đạt', EXEMPT: 'Được miễn',
}

export function displayLabel(value: string | null | undefined): string {
  return value ? labels[value] ?? value : '—'
}
