import { rows, type DB } from '../../finance/query'
import { pageNumber, pageSize, uuidPattern, vietnamDateTime, type Params } from '../../finance/operations'
export type Reminder = { id: string; enrollment_tuition_id: string; window_start: string; window_end: string; status: string; reason: string | null; marked_at: string | null; tuition_plan_id: string; starts_on: string; effective_ends_on: string; plan_name_snapshot: string; branch_id_snapshot: string; branch_name_snapshot: string; amount: number; currency: string; full_name: string; student_code: string }
export const filters = [{ id: 'due', name: 'Đến hạn hôm nay' }, { id: 'upcoming', name: 'Sắp đến hạn' }, { id: 'overdue', name: 'Quá hạn nhắc' }, { id: 'sent', name: 'Đã gửi' }, { id: 'skipped', name: 'Đã bỏ qua' }, { id: 'cancelled', name: 'Đã hủy' }]
export function timing(r: Pick<Reminder, 'status' | 'window_start' | 'window_end'>, today = vietnamDateTime().slice(0, 10)) {
  if (r.status !== 'PENDING') return r.status
  return r.window_start > today ? 'Sắp đến hạn' : r.window_end < today ? 'Quá hạn nhắc' : 'Đến hạn hôm nay'
}
export async function reminders(db: DB, params: Params) {
  const page = pageNumber(params.page), today = vietnamDateTime().slice(0, 10)
  let q = db.from('tuition_reminder_operations').select('id,enrollment_tuition_id,window_start,window_end,status,reason,marked_at,tuition_plan_id,starts_on,effective_ends_on,plan_name_snapshot,branch_id_snapshot,branch_name_snapshot,amount,currency,full_name,student_code')
  if (uuidPattern.test(params.branch ?? '')) q = q.eq('branch_id_snapshot', params.branch!)
  if (uuidPattern.test(params.plan ?? '')) q = q.eq('tuition_plan_id', params.plan!)
  if (['sent', 'skipped', 'cancelled'].includes(params.state ?? '')) q = q.eq('status', params.state!.toUpperCase())
  if (['due', 'upcoming', 'overdue'].includes(params.state ?? '')) {
    q = q.eq('status', 'PENDING')
    if (params.state === 'due') q = q.lte('window_start', today).gte('window_end', today)
    if (params.state === 'upcoming') q = q.gt('window_start', today)
    if (params.state === 'overdue') q = q.lt('window_end', today)
  }
  const data = await rows(q.order('window_start').order('id').range((page - 1) * pageSize, page * pageSize).returns<Reminder[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}
export async function kpis(db: DB) {
  const { data, error } = await db.rpc('tuition_reminder_kpis')
  if (error || !data) throw new Error('LOAD')
  return data as { week: number; upcoming: number; overdue: number; sent: number }
}
