import type { DB } from '../../finance/query'
import { pageNumber, pageSize, uuidPattern, vietnamDateTime, type Params } from '../../finance/operations'
export type Reminder = { id: string; enrollment_tuition_id: string; window_start: string; window_end: string; status: string; reason: string | null; marked_at: string | null; tuition_plan_id: string; starts_on: string; effective_ends_on: string; plan_name_snapshot: string; branch_id_snapshot: string; branch_name_snapshot: string; amount: number; currency: string; full_name: string; student_code: string; event_code?: string | null; duration_months_snapshot?: number | null; red_on?: string | null; reply_choice?: string | null; reply_submit_time?: string | null; reply_needs_review?: boolean | null; contact_note?: string | null; contact_noted_at?: string | null; contact_noted_by_name?: string | null }
export const filters = [{ id: 'upcoming', name: 'Sắp đến hạn' }, { id: 'payment', name: 'Đến hạn thanh toán' }, { id: 'due', name: 'Đã cập nhật lịch báo' }, { id: 'red', name: 'Trong hạn, cảnh báo đỏ' }, { id: 'overdue', name: 'Quá hạn' }, { id: 'sent', name: 'Đã gửi' }, { id: 'skipped', name: 'Đã bỏ qua' }, { id: 'cancelled', name: 'Đã hủy' }]
export const replyFilters = [{ id: 'pending', name: 'Chưa phản hồi' }, { id: 'yes', name: 'Tiếp tục học' }, { id: 'contact', name: 'Cần liên hệ' }, { id: 'no', name: 'Dừng học' }]
export function timing(r: Pick<Reminder, 'status' | 'window_start' | 'window_end' | 'event_code' | 'duration_months_snapshot' | 'red_on'>, today = vietnamDateTime().slice(0, 10)) {
  if (r.status !== 'PENDING') return r.status
  if (r.window_start > today) return 'Sắp đến hạn'
  if (r.window_end < today) return r.event_code === 'BALANCE_50_V1' ? 'Quá hạn thanh toán nợ' : 'Quá hạn nhắc'
  const redOn = r.red_on ?? (r.event_code !== 'BALANCE_50_V1' && r.duration_months_snapshot === 3 ? shiftDate(r.window_start, 14) : null)
  if (redOn && redOn <= today) return 'Trong hạn · cảnh báo đỏ'
  if (r.event_code === 'BALANCE_50_V1') return 'Đến hạn thanh toán'
  return r.duration_months_snapshot === 12 ? 'Nhắc gia hạn' : 'Đã cập nhật lịch báo'
}
function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export async function visibleBranches(db: DB) {
  const { data, error } = await db.rpc('tuition_visible_branches')
  if (error || !data) throw new Error('LOAD')
  return data as { id: string; name: string }[]
}
export async function prepareBranches(db: DB) {
  const { data, error } = await db.rpc('tuition_granted_branches', { p_permission: 'tuition.renewal.prepare' })
  if (error || !data) throw new Error('LOAD')
  return data as string[]
}
export async function reminders(db: DB, params: Params) {
  const page = pageNumber(params.page)
  const { data, error } = await db.rpc('list_tuition_reminders', {
    p_branch: uuidPattern.test(params.branch ?? '') ? params.branch : null,
    p_plan: uuidPattern.test(params.plan ?? '') ? params.plan : null,
    p_state: params.state ?? null,
    p_reply: params.reply ?? null,
    p_limit: pageSize + 1,
    p_offset: (page - 1) * pageSize,
    p_reminder: null,
  })
  if (error || !data) throw new Error('LOAD')
  const found = data as Reminder[]
  return { data: found.slice(0, pageSize), page, more: found.length > pageSize }
}
export async function kpis(db: DB) {
  const { data, error } = await db.rpc('tuition_reminder_kpis')
  if (error || !data) throw new Error('LOAD')
  return data as { week: number; payment: number; upcoming: number; red: number; overdue: number; sent: number }
}
