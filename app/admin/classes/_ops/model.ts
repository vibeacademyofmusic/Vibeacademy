export type OpsView = 'overview' | 'classes' | 'schedule' | 'rooms' | 'attendance'

export const opsViews: { id: OpsView; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'classes', label: 'Ca dạy' },
  { id: 'schedule', label: 'Lịch học' },
  { id: 'rooms', label: 'Phòng học' },
  { id: 'attendance', label: 'Điểm danh' },
]

export const compatibilityLabels: Record<string, string> = {
  IN_SCOPE: 'Trong phạm vi',
  OUTSIDE_SCOPE: 'Ngoài phạm vi',
  WRONG_PROGRAM: 'Sai chương trình',
  ACADEMIC_PROGRAM_MISSING: 'Thiếu chương trình Academic',
  CURRENT_LEVEL_MISSING: 'Thiếu trình độ hiện tại',
  CLASS_SCOPE_UNCONFIGURED: 'Chưa cấu hình phạm vi',
}

export function parseOpsView(value?: string): OpsView {
  return opsViews.some(v => v.id === value) ? (value as OpsView) : 'overview'
}

export function formatLevelScope(fromName?: string | null, toName?: string | null) {
  if (!fromName || !toName) return 'Chưa cấu hình phạm vi'
  return `${fromName} → ${toName}`
}

export function compatibilityTone(code: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' {
  if (code === 'IN_SCOPE') return 'success'
  if (code === 'OUTSIDE_SCOPE' || code === 'CLASS_SCOPE_UNCONFIGURED') return 'warning'
  if (code === 'WRONG_PROGRAM' || code === 'ACADEMIC_PROGRAM_MISSING' || code === 'CURRENT_LEVEL_MISSING') return 'error'
  return 'neutral'
}

export const classStatusLabel: Record<string, string> = {
  DRAFT: 'Nháp',
  ACTIVE: 'Đang hoạt động',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

export const dayLabels: Record<number, string> = {
  1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN',
}
