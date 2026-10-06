const labels: Record<string, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Đã nộp',
  VERIFIED: 'Đã xác minh',
  PAYMENT_PENDING: 'Chờ cọc',
  PAID: 'Đã nhận đủ cọc',
  COMPLETED: 'Chờ xếp lớp',
  CANCELLED: 'Đã hủy',
  REJECTED: 'Từ chối',
  EXPIRED: 'Hết hạn',
}

export function registrationProgressLabel(status: string, placementStatus?: string | null) {
  if (status === 'COMPLETED' && placementStatus && !['UNASSIGNED', 'MATCHING'].includes(placementStatus)) {
    return 'Đã xếp lớp'
  }
  return labels[status] ?? status
}

export function notificationProgressLabel(status: string | null | undefined) {
  if (status === 'SKIPPED_NO_CHANNEL') return 'NOT_ELIGIBLE'
  if (status === 'QUEUED' || status === 'PENDING' || status === 'RETRYING') return 'QUEUED'
  if (status === 'PROCESSING') return 'SUBMITTED'
  if (status === 'SENT') return 'ACCEPTED'
  if (status === 'DELIVERED') return 'DELIVERED'
  if (status === 'FAILED' || status === 'CANCELLED') return 'FAILED'
  return status ? 'FAILED' : 'NOT_ELIGIBLE'
}

export function vnd(value: number | string | null | undefined) {
  return `${Number(value ?? 0).toLocaleString('vi-VN')} ₫`
}
