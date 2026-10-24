import type { createClient } from '@/lib/supabase/server'
import { parseCalendarSnapshot, validCalendarDate } from './calendar-model'

type DB = Awaited<ReturnType<typeof createClient>>

export async function loadCalendar(db: Pick<DB, 'rpc'>, date: string, branch: string) {
  if (!validCalendarDate(date) || (branch && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branch))) {
    return { data: null, error: 'Ngày hoặc chi nhánh không hợp lệ. Hãy chọn lại bộ lọc.', reference: null }
  }
  try {
    const { data, error } = await db.rpc('coordination_week_dashboard', { p_date: date, p_branch: branch || null })
    if (error) throw error
    const parsed = parseCalendarSnapshot(data)
    if (date < parsed.monday || date >= new Date(Date.parse(`${parsed.monday}T12:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10) || (branch && parsed.rows.some(row => row.branch_id !== branch))) throw new Error('CALENDAR_SCOPE_MISMATCH')
    return { data: parsed, error: null, reference: null }
  } catch {
    const reference = crypto.randomUUID().slice(0, 8)
    console.error('calendar load failed', reference)
    return { data: null, error: 'Chưa tải được lịch và sĩ số. Chưa thể kết luận tuần này trống. Hãy tải lại.', reference }
  }
}
