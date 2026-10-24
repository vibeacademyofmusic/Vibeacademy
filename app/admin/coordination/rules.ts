const datePattern = /^\d{4}-\d{2}-\d{2}$/

export const dayOptions = [
  [1, 'Thứ 2'],
  [2, 'Thứ 3'],
  [3, 'Thứ 4'],
  [4, 'Thứ 5'],
  [5, 'Thứ 6'],
  [6, 'Thứ 7'],
  [7, 'Chủ nhật'],
] as const

export function proposedParticipationDate(desired: string | null | undefined, today: string) {
  if (desired && datePattern.test(desired) && desired >= today) return desired
  return today
}

export function coordinationReturn(value: string | null | undefined) {
  if (!value || !value.startsWith('/admin/students?') || value.includes('//') || value.includes('\\') || /[\r\n]/.test(value)) return null
  const params = new URLSearchParams(value.slice('/admin/students?'.length))
  if (params.get('tab') !== 'coordination') return null
  return `/admin/students?${params.toString()}`
}

export function withCoordinationState(path: string, patch: Record<string, string | undefined>) {
  const url = new URL(path, 'http://local')
  for (const [key, value] of Object.entries(patch)) {
    if (!value) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  return `${url.pathname}${url.search}`
}

export function placementStaffMessage(error: string) {
  if (error.includes('PLACEMENT_INVALID')) return 'Chọn ít nhất một ca và ngày tham gia hợp lệ.'
  if (error.includes('PLACEMENT_START_PAST')) return 'Ngày mong muốn đã qua. Hãy chọn ngày tham gia từ hôm nay; buổi đầu tiên được tính theo lịch ca.'
  if (error.includes('PLACEMENT_STALE')) return 'Hồ sơ đã thay đổi. Hãy kiểm tra lại thông tin mới trước khi xếp ca.'
  if (error.includes('PLACEMENT_REQUEST_REUSED')) return 'Yêu cầu đã được dùng cho thao tác khác. Hãy tải lại hồ sơ.'
  if (error.includes('PLACEMENT_SCHEDULE_UNKNOWN')) return 'Chưa đủ dữ liệu lịch, phòng hoặc phân công giáo viên để kiểm tra xung đột.'
  if (error.includes('PLACEMENT_STUDENT_CONFLICT')) return 'Học viên đã có lịch học trùng thời gian.'
  if (error.includes('PLACEMENT_TEACHER_CONFLICT')) return 'Giáo viên chính đã có hai ca dạy trùng thời gian. Hãy chọn ca khác hoặc đổi lịch.'
  if (error.includes('PLACEMENT_ROOM_CONFLICT')) return 'Phòng học đã có lịch trùng thời gian.'
  if (error.includes('PLACEMENT_UNAUTHORIZED')) return 'Bạn không có quyền xác nhận học viên vào ca dạy tại chi nhánh này.'
  if (error.includes('PLACEMENT_PROGRAM_DENIED')) return 'Ca dạy không cùng chương trình với hồ sơ đăng ký.'
  if (error.includes('PLACEMENT_LEVEL_DENIED')) return 'Ca dạy không nhận trình độ hiện tại của học viên.'
  if (error.includes('PLACEMENT_SCOPE_MISSING')) return 'Ca dạy chưa có phạm vi trình độ. Hãy cấu hình phạm vi trước khi xếp.'
  if (error.includes('PLACEMENT_NOT_READY')) return 'Ca dạy còn bản nháp. Hãy hoàn tất cấu hình và kích hoạt trước khi xếp.'
  if (error.includes('PLACEMENT_TEACHER_REQUIRED')) return 'Ca dạy chưa có giáo viên chính hợp lệ.'
  if (error.includes('PLACEMENT_SCHEDULE_REQUIRED')) return 'Ca dạy chưa có lịch định kỳ.'
  if (error.includes('PLACEMENT_CLASS_FULL')) return 'Ca vừa hết chỗ. Danh sách ca đã được làm mới, hãy chọn ca khác.'
  if (error.includes('PLACEMENT_CLASS_DENIED')) return 'Ca dạy không thuộc chi nhánh hoặc không còn nhận học viên.'
  if (error.includes('PLACEMENT_ALREADY_ENROLLED')) return 'Học viên đã có ghi danh ở ca dạy này.'
  if (error.includes('PLACEMENT_TRANSITION_DENIED')) return 'Hồ sơ này không còn ở trạng thái có thể vào ca dạy.'
  if (error.includes('PLACEMENT_START_DENIED')) return 'Ngày tham gia nằm ngoài thời gian của ca dạy.'
  if (error.includes('PLACEMENT_ALREADY_STARTED')) return 'Đã bắt đầu học — cần quy trình đổi ca dạy.'
  if (error.includes('PLACEMENT_HISTORY_LOCKED')) return 'Hồ sơ đã có dữ liệu học tập, chưa thể sửa ca dạy tại đây.'
  if (error.includes('PLACEMENT_REASON_REQUIRED')) return 'Cần nhập lý do từ 1 đến 2000 ký tự.'
  if (error.includes('PLACEMENT_UNCHANGED')) return 'Ca dạy và ngày bắt đầu chưa thay đổi.'
  if (error.includes('PLACEMENT_AVAILABILITY')) return 'Ca dạy nằm ngoài khung giờ ràng buộc của học viên.'
  if (error.includes('PAYMENT_NOT_READY')) return 'Hồ sơ chưa đủ điều kiện thanh toán để xác nhận vào ca.'
  if (error.includes('DATA_MISSING')) return 'Thiếu chương trình hoặc trình độ nên chưa đánh giá được ca dạy.'
  return null
}

export function blockerLabel(code: string | null | undefined) {
  if (code === 'PAYMENT_NOT_READY') return 'Chưa đủ điều kiện thanh toán'
  if (code === 'DATA_MISSING') return 'Thiếu chương trình hoặc trình độ'
  if (code === 'SCOPE_MISSING') return 'Ca cùng chương trình chưa có phạm vi trình độ'
  if (code === 'NO_READY_SHIFT') return 'Chưa có ca đã cấu hình'
  if (code === 'READY') return 'Có ca cần xác nhận chỗ và lịch'
  return 'Chưa tải được tình trạng'
}

export function reasonLabel(code: string | null | undefined) {
  return placementStaffMessage(code || '') || 'Ca này chưa xếp được.'
}

export function fitLabel(fit: string | null | undefined) {
  if (fit === 'MATCH') return 'Khớp khung giờ đã chọn'
  if (fit === 'PARTIAL') return 'Khớp một phần khung giờ đã chọn'
  if (fit === 'NONE') return 'Ngoài khung giờ đã chọn'
  return 'Chưa có khung giờ ràng buộc — ghi chú lịch chỉ để tham khảo'
}

export function formatSession(value: string | null | undefined) {
  if (!value) return 'Chưa có buổi trong 3 tuần sau ngày tham gia'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Chưa xác định buổi đầu tiên'
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function suggestionLink(code: string | null | undefined, classId: string | null, context: { branch?: string; program?: string; level?: string }) {
  if (code === 'CREATE_SHIFT' || code === 'ADD_SCHEDULE' || code === 'ACTIVATE' || code === 'ASSIGN_TEACHER' || code === 'CONFIGURE_SCOPE' || code === 'REVIEW_SCHEDULE') {
    if (classId && code !== 'CREATE_SHIFT') return { href: `/admin/classes/${classId}`, label: 'Hoàn tất ca này' }
    const query = new URLSearchParams({ tab: 'coordination', view: 'shifts' })
    if (context.branch) query.set('branch', context.branch)
    if (context.program) query.set('program', context.program)
    if (context.level) query.set('level', context.level)
    return { href: `/admin/students?${query}`, label: 'Tạo ca từ nhu cầu học viên' }
  }
  if (code === 'ADJUST_AVAILABILITY') return { href: '#availability', label: 'Điều chỉnh khung giờ' }
  if (code === 'PAYMENT') return { href: '/admin/business/registrations', label: 'Mở hồ sơ đăng ký' }
  return null
}
