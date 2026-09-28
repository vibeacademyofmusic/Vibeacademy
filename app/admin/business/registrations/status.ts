import { placementLabel } from '../crm/model'
import { businessDate } from '@/app/admin/_lib/business-date'
const labels: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Đã nộp',
  VERIFIED: 'Đã xác minh',
  PAYMENT_PENDING: 'Thanh toán',
  PAID: 'Xác nhận thanh toán',
  COMPLETED: 'Chờ vào ca dạy',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Từ chối',
  EXPIRED: 'Hết hạn',
}

export function registrationProgressLabel(status: string, placementStatus?: string | null, startDate?: string | null) {
  if (status === 'COMPLETED' && placementStatus) return placementLabel(placementStatus, startDate, businessDate())
  return labels[status] ?? 'Chưa rõ trạng thái'
}

export function notificationProgressLabel(status: string | null | undefined) {
  if (status === 'QUEUED' || status === 'PENDING' || status === 'RETRYING') return 'Đang chờ gửi'
  if (status === 'PROCESSING') return 'Đang gửi'
  if (status === 'ACCEPTANCE_UNKNOWN') return 'Chờ đối soát với nhà cung cấp'
  if (status === 'SENT') return 'Nhà cung cấp đã chấp nhận, chưa xác nhận tới máy'
  if (status === 'DELIVERED') return 'Đã xác nhận tới máy'
  if (status === 'FAILED' || status === 'CANCELLED') return 'Gửi không thành công'
  if (status === 'SKIPPED_NO_CHANNEL' || !status) return 'Chưa đủ điều kiện gửi'
  return 'Gửi không thành công'
}

const registrationEvents: Record<string, string> = {
  CREATED: 'Tạo hồ sơ',
  SUBMITTED: 'Nộp hồ sơ',
  VERIFIED: 'Xác minh hồ sơ',
  PAYMENT_PENDING: 'Chuyển sang thanh toán',
  PAID: 'Ghi nhận thanh toán đã xác thực',
  COMPLETED: 'Hoàn tất đăng ký',
  REGISTRATION_COMPLETED: 'Hoàn tất đăng ký',
  PLACEMENT_OPENED: 'Mở chờ xếp lớp',
  ENROLLMENT_CREATED: 'Tạo ghi danh',
  CANCELLED: 'Hủy hồ sơ',
}

export function registrationEventLabel(eventType: string) {
  return registrationEvents[eventType] ?? 'Cập nhật hồ sơ'
}

export function staffFacingError(code: string | undefined) {
  if (!code) return null
  if (code === 'REGISTRATION_STALE') return 'Hồ sơ đã được cập nhật. Vui lòng kiểm tra thông tin mới trước khi tiếp tục.'
  if (/^[A-Z0-9_]+$/.test(code)) return 'Thao tác chưa hoàn tất. Kiểm tra lại thông tin trên hồ sơ trước khi tiếp tục.'
  return code
}

export function vnd(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('vi-VN')} ₫`
}
