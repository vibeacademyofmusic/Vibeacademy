import { rows, type DB } from '../../finance/query'
import { pageNumber, pageSize, uuidPattern, validDate, type Params } from '../../finance/operations'
export const types = [{ id: 'MONTHLY', name: 'Báo cáo tháng' }, { id: 'END_OF_COURSE', name: 'Tổng kết cuối khóa' }]
export const statuses = [{ id: 'DRAFT', name: 'Bản nháp' }, { id: 'READY_FOR_REVIEW', name: 'Chờ duyệt' }, { id: 'APPROVED', name: 'Đã duyệt' }, { id: 'CANCELLED', name: 'Đã hủy' }]
export const summaryFields = [{ id: 'general_comment', name: 'Nhận xét giáo viên' }, { id: 'strengths', name: 'Điểm mạnh' }, { id: 'improvement_areas', name: 'Cần cải thiện' }, { id: 'next_focus', name: 'Trọng tâm tiếp theo' }, { id: 'recommendation', name: 'Đề xuất tiếp theo / cuối khóa' }]
export type Snapshot = {
  as_of: string; period_start: string; period_end: string; class_name: string
  teachers: { code: string; name: string | null; role: string }[]
  student: { name: string; code: string }; branch: { name: string }
  academic: { curriculum: string | null; current_grade: string | null; status: string | null; subjects: { grade: string; grade_status: string; name: string; is_required: boolean; completion_rule: string; status: string; score: number | null; components: { name: string; required: boolean; status: string; score: number | null }[] }[] }
  attendance: { scheduled: number; attended: number; absent: number; excused: number; unmarked: number; makeup: number; rate: number | null }
  journals: { count: number; excerpts: { content: string; repertoire: string; skills: string; homework: string; observation: string; updated_at: string }[] }
  teacher_summary?: Record<string, string>; admin_note?: string
}
export type Report = { id: string; report_type: string; status: string; version: number; period_start: string; period_end: string; generated_at: string; approved_at: string | null; draft_data: Snapshot; snapshot_data: Snapshot | null; teacher_summary: Record<string, string>; admin_note: string }
export type ListReport = Pick<Report, 'id' | 'report_type' | 'status' | 'period_start' | 'period_end' | 'generated_at' | 'approved_at'> & { student_name: string; student_code: string; branch_name: string }
export async function reportList(db: DB, params: Params) {
  const page = pageNumber(params.page)
  let q = db.from('learning_report_list').select('id,report_type,status,period_start,period_end,generated_at,approved_at,student_name,student_code,branch_name')
  if (uuidPattern.test(params.branch ?? '')) q = q.eq('branch_id', params.branch!)
  if (types.some(t => t.id === params.type)) q = q.eq('report_type', params.type!)
  if (statuses.some(t => t.id === params.status)) q = q.eq('status', params.status!)
  if (/^\d{4}-\d{2}$/.test(params.month ?? '') && validDate(params.month + '-01')) {
    const start = params.month + '-01', end = new Date(start + 'T00:00:00Z')
    end.setUTCMonth(end.getUTCMonth() + 1)
    q = q.gte('period_start', start).lt('period_start', end.toISOString().slice(0, 10))
  }
  const search = params.search?.trim().replace(/[^\p{L}\p{N} @.-]/gu, ' ').slice(0, 100)
  if (search) q = q.or(`student_name.ilike.%${search}%,student_code.ilike.%${search}%`)
  const data = await rows(q.order('period_start', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<ListReport[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}
export async function reportDetail(db: DB, id: string) {
  if (!uuidPattern.test(id)) return null
  return (await rows(db.from('learning_reports').select('id,report_type,status,version,period_start,period_end,generated_at,approved_at,draft_data,snapshot_data,teacher_summary,admin_note').eq('id', id).returns<Report[]>()))[0] ?? null
}
export async function history(db: DB, id: string) {
  return rows(db.from('learning_report_events').select('id,event,version,created_at,actor_id').eq('report_id', id).order('created_at', { ascending: false }).order('id').limit(100).returns<{ id: string; event: string; version: number; created_at: string; actor_id: string }[]>())
}
export async function enrollmentChoices(db: DB, params: Params) {
  const page = pageNumber(params.enrollments_page)
  let q = db.from('enrollments').select('id,started_at,students!inner(full_name,student_code),classes!inner(name,branches!inner(name))').not('started_at', 'is', null)
  const search = params.student?.trim().replace(/[^\p{L}\p{N} -]/gu, ' ').slice(0, 80)
  if (search) q = q.or(`full_name.ilike.%${search}%,student_code.ilike.%${search}%`, { referencedTable: 'students' })
  const data = await rows(q.order('started_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<{ id: string; students: { full_name: string; student_code: string }; classes: { name: string; branches: { name: string } } }[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}
