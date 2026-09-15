import type { createClient } from '@/lib/supabase/server'
type Client = Awaited<ReturnType<typeof createClient>>
type SourceError = { code?: string } | null
export function attendanceLoadMessage(sources: Record<string, SourceError>) {
  const failures = Object.entries(sources).filter(([, error]) => error)
  if (!failures.length) return null
  if (failures.some(([, error]) => ['42P01', '42703', 'PGRST204', 'PGRST205', 'PGRST202'].includes(error?.code ?? ''))) {
    return 'Dữ liệu điểm danh chưa sẵn sàng vì database chưa được cập nhật đầy đủ. Quản trị viên cần kiểm tra bản cập nhật database trước khi tiếp tục.'
  }
  return 'Không thể tải dữ liệu buổi học và điểm danh. Vui lòng thử lại hoặc liên hệ quản trị viên.'
}
// Never query the full attendance history; failed/empty session queries do not trigger attendance reads.
export async function loadVisibleAttendance(db: Client, ids: string[]) {
  if (!ids.length) return { data: [], error: null }
  return db.from('attendance_records').select('session_occurrence_id,status').in('session_occurrence_id', ids)
}
