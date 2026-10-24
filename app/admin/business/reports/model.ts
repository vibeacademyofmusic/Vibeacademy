export function cohortRate(part: number, whole: number) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return part / whole
}

export function costPer(budget: number | null, count: number) {
  if (budget == null || !Number.isFinite(budget) || budget <= 0 || count <= 0) return null
  return budget / count
}

export function formatRate(rate: number | null) {
  if (rate == null) return 'Chưa đủ dữ liệu'
  return `${Math.round(rate * 1000) / 10}%`
}

export function formatCost(cost: number | null) {
  if (cost == null) return 'Chưa có dữ liệu chi phí'
  return new Intl.NumberFormat('vi-VN').format(Math.round(cost))
}

export const cohortLabels: Record<string, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  qualified: 'Đủ điều kiện',
  trial_booked: 'Đã hẹn học thử',
  trial_completed: 'Đã học thử',
  proposal: 'Đã gửi đề xuất',
  negotiating: 'Đang thương lượng',
  won: 'Thành công',
  lost: 'Không tiếp tục',
  hours_to_first_contact: 'Giờ trung bình đến lần liên hệ đầu',
  days_to_close: 'Ngày trung bình đến khi chốt',
}

export const activityLabels: Record<string, string> = {
  contacted: 'Lần chuyển sang đã liên hệ',
  qualified: 'Lần chuyển sang đủ điều kiện',
  trial_booked: 'Lần đặt học thử',
  trial_completed: 'Lần hoàn thành học thử',
  proposal: 'Lần gửi đề xuất',
  negotiating: 'Lần thương lượng',
  won: 'Lần chốt thành công',
  lost: 'Lần chốt thất bại',
}
