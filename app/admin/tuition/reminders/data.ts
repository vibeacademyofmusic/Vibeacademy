import { rows, type DB } from '../../finance/query'
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
export async function reminders(db: DB, params: Params) {
  const page = pageNumber(params.page), today = vietnamDateTime().slice(0, 10)
  let q = db.from('tuition_reminder_operations').select('id,enrollment_tuition_id,window_start,window_end,status,reason,marked_at,tuition_plan_id,starts_on,effective_ends_on,plan_name_snapshot,branch_id_snapshot,branch_name_snapshot,amount,currency,full_name,student_code,event_code,duration_months_snapshot,red_on,reply_choice,reply_submit_time,reply_needs_review,contact_note,contact_noted_at,contact_noted_by_name')
  if (uuidPattern.test(params.branch ?? '')) q = q.eq('branch_id_snapshot', params.branch!)
  if (uuidPattern.test(params.plan ?? '')) q = q.eq('tuition_plan_id', params.plan!)
  if (['sent', 'skipped', 'cancelled'].includes(params.state ?? '')) q = q.eq('status', params.state!.toUpperCase())
  if (['due', 'payment', 'red', 'upcoming', 'overdue'].includes(params.state ?? '')) {
    q = q.eq('status', 'PENDING')
    if (params.state === 'due') q = q.neq('event_code', 'BALANCE_50_V1').lte('window_start', today).gte('window_end', today).or(`red_on.is.null,red_on.gt.${today}`)
    if (params.state === 'payment') q = q.eq('event_code', 'BALANCE_50_V1').eq('duration_months_snapshot', 3).lte('window_start', today).gte('window_end', today)
    if (params.state === 'red') q = q.lte('red_on', today).gte('window_end', today)
    if (params.state === 'upcoming') q = q.gt('window_start', today)
    if (params.state === 'overdue') q = q.lt('window_end', today)
  }
  if (params.reply === 'yes') q = q.eq('reply_choice', 'CONTINUE')
  if (params.reply === 'contact') q = q.eq('reply_choice', 'CONTACT')
  if (params.reply === 'no') q = q.eq('reply_choice', 'STOP')
  if (params.reply === 'pending') q = q.is('reply_choice', null)
  const data = await rows(q.order('window_start').order('id').range((page - 1) * pageSize, page * pageSize).returns<Reminder[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}
export async function kpis(db: DB) {
  const { data, error } = await db.rpc('tuition_reminder_kpis')
  if (error || !data) throw new Error('LOAD')
  return data as { week: number; payment: number; upcoming: number; red: number; overdue: number; sent: number }
}
