import { rows, type DB } from '../../finance/query'
import { pageNumber, pageSize, uuidPattern, validDate, vietnamDateTime, type Params } from '../../finance/operations'
export const types = [{ id: 'MONTHLY', name: 'Báo cáo tháng' }, { id: 'END_OF_COURSE', name: 'Tổng kết cuối khóa' }]
export const statuses = [
  { id: 'DRAFT', name: 'Bản nháp' },
  { id: 'READY_FOR_REVIEW', name: 'Chờ duyệt' },
  { id: 'APPROVED', name: 'Đã duyệt' },
  { id: 'PUBLISHED', name: 'Đã phát hành' },
  { id: 'CANCELLED', name: 'Đã hủy' },
]
export const statusLabels = Object.fromEntries(statuses.map(s => [s.id, s.name]))
export const summaryFields = [
  { id: 'achievement', name: 'Kết quả / tiến bộ nổi bật' },
  { id: 'difficulty', name: 'Khó khăn hiện tại' },
  { id: 'intervention', name: 'Hướng xử lý của giáo viên' },
  { id: 'next_month_plan', name: 'Kế hoạch tháng tiếp theo' },
  { id: 'practice_consistency', name: 'Mức độ luyện tập đều đặn' },
  { id: 'lesson_preparation', name: 'Mức độ chuẩn bị trước buổi học' },
  { id: 'learning_attitude', name: 'Thái độ / mức độ tham gia học tập' },
]
export const evaluationFields = [
  { id: 'achievement', name: 'Kỹ thuật / tiến bộ kỹ năng' },
  { id: 'difficulty', name: 'Đọc nhạc / khó khăn' },
  { id: 'practice_consistency', name: 'Nhịp / tiết tấu & thói quen luyện tập' },
  { id: 'lesson_preparation', name: 'Aural / chuẩn bị buổi học' },
  { id: 'learning_attitude', name: 'Thái độ học tập' },
  { id: 'intervention', name: 'Điểm mạnh & hướng xử lý' },
]
export const developmentFields = [
  { id: 'next_month_plan', name: 'Mục tiêu ngắn hạn / kế hoạch kỳ tới' },
]

export const legacySummaryFallback: Record<string, string[]> = {
  achievement: ['general_comment', 'strengths'],
  difficulty: ['improvement_areas'],
  intervention: ['next_focus'],
  next_month_plan: ['recommendation'],
}
export type Snapshot = {
  as_of: string; period_start: string; period_end: string; class_name: string
  teachers: { code: string; name: string | null; role: string }[]
  student: { name: string; code: string }; branch: { name: string }
  academic: { curriculum: string | null; current_grade: string | null; status: string | null; subjects: { grade: string; grade_status: string; name: string; is_required: boolean; completion_rule: string; status: string; score: number | null; components: { name: string; required: boolean; status: string; score: number | null }[] }[] }
  attendance: { scheduled: number; attended: number; absent: number; excused: number; unmarked: number; makeup: number; rate: number | null }
  journals: { count: number; excerpts: { content: string; repertoire: string; skills: string; homework: string; observation: string; updated_at: string }[] }
  teacher_summary?: Record<string, string>; admin_note?: string
}
export type Report = { id: string; student_id: string; approved_by: string | null; approver_name?: string | null; report_type: string; status: string; version: number; period_start: string; period_end: string; generated_at: string; approved_at: string | null; sent_at: string | null; draft_data: Snapshot; snapshot_data: Snapshot | null; teacher_summary: Record<string, string>; admin_note: string }
export type ListReport = Pick<Report, 'id' | 'report_type' | 'status' | 'period_start' | 'period_end' | 'generated_at' | 'approved_at'> & {
  student_name: string
  student_code: string
  branch_name: string
  class_name?: string | null
  current_grade?: string | null
  academic_status?: string | null
  curriculum_name?: string | null
  teacher_names?: string | null
  class_id?: string | null
}

const listFields = 'id,report_type,status,period_start,period_end,generated_at,approved_at,student_name,student_code,branch_name,class_name,current_grade,academic_status,curriculum_name,teacher_names,class_id'

function todayVietnam() {
  return vietnamDateTime().slice(0, 10)
}

export function reportView(params: Params) {
  return params.view === 'all' || params.view === 'approved' || params.view === 'overdue' ? params.view : 'needs'
}

function buildListQuery(db: DB, params: Params, select: string, options?: { count: 'exact'; head: boolean }) {
  let q = db.from('learning_report_list').select(select, options)
  if (uuidPattern.test(params.branch ?? '')) q = q.eq('branch_id', params.branch!)
  if (uuidPattern.test(params.class ?? '')) q = q.eq('class_id', params.class!)
  if (types.some(t => t.id === params.type)) q = q.eq('report_type', params.type!)
  if (statuses.some(t => t.id === params.status)) q = q.eq('status', params.status!)
  if ((params.grade ?? '').trim()) q = q.ilike('current_grade', '%' + params.grade!.trim().replace(/[%_,()]/g, ' ').slice(0, 40) + '%')
  if ((params.curriculum ?? '').trim()) q = q.ilike('curriculum_name', '%' + params.curriculum!.trim().replace(/[%_,()]/g, ' ').slice(0, 60) + '%')
  if ((params.teacher_q ?? '').trim()) q = q.ilike('teacher_names', '%' + params.teacher_q!.trim().replace(/[%_,()]/g, ' ').slice(0, 60) + '%')
  if (/^\d{4}-\d{2}$/.test(params.month ?? '') && validDate(params.month + '-01')) {
    const start = params.month + '-01', end = new Date(start + 'T00:00:00Z')
    end.setUTCMonth(end.getUTCMonth() + 1)
    q = q.gte('period_start', start).lt('period_start', end.toISOString().slice(0, 10))
  }
  const search = params.search?.trim().replace(/[^\p{L}\p{N} @.-]/gu, ' ').slice(0, 100)
  if (search) q = q.or(`student_name.ilike.%${search}%,student_code.ilike.%${search}%`)
  const view = reportView(params)
  const today = todayVietnam()
  if (view === 'needs' && !params.status) q = q.in('status', ['DRAFT', 'READY_FOR_REVIEW'])
  if (view === 'approved' && !params.status) q = q.in('status', ['APPROVED', 'PUBLISHED'])
  if (view === 'overdue') {
    if (!params.status) q = q.in('status', ['DRAFT', 'READY_FOR_REVIEW'])
    q = q.lt('period_end', today)
  }
  return q
}

export async function reportList(db: DB, params: Params) {
  const page = pageNumber(params.page)
  const q = buildListQuery(db, params, listFields)
  const data = await rows(q.order('period_start', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<ListReport[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}

/** Bounded head counts for KPI cards — no full-table client load. */
export async function reportMetrics(db: DB, params: Params) {
  const today = todayVietnam()
  const scoped = { ...params, status: undefined, view: 'all', page: undefined }
  const count = async (apply?: (q: ReturnType<typeof buildListQuery>) => ReturnType<typeof buildListQuery>) => {
    let q = buildListQuery(db, scoped, 'id', { count: 'exact', head: true })
    if (apply) q = apply(q)
    const { count: value, error } = await q
    if (error) throw error
    return value ?? 0
  }
  const [draft, review, approved, overdue] = await Promise.all([
    count(q => q.eq('status', 'DRAFT')),
    count(q => q.eq('status', 'READY_FOR_REVIEW')),
    count(q => q.in('status', ['APPROVED', 'PUBLISHED'])),
    count(q => q.in('status', ['DRAFT', 'READY_FOR_REVIEW']).lt('period_end', today)),
  ])
  return { needs: draft + review, draft, review, approved, overdue, due: null as number | null }
}

export async function reportFilterOptions(db: DB, params: Params) {
  let classQuery = db.from('classes').select('id,name,branch_id').eq('status', 'ACTIVE').order('name').order('id').limit(200)
  if (uuidPattern.test(params.branch ?? '')) classQuery = classQuery.eq('branch_id', params.branch!)
  const classRows = await rows(classQuery.returns<{ id: string; name: string; branch_id: string }[]>())
  return { classes: classRows.map(c => ({ id: c.id, name: c.name })) }
}

export async function reportDetail(db: DB, id: string) {
  if (!uuidPattern.test(id)) return null
  const report = (await rows(db.from('learning_reports').select('id,student_id,approved_by,report_type,status,version,period_start,period_end,generated_at,approved_at,sent_at,draft_data,snapshot_data,teacher_summary,admin_note').eq('id', id).returns<Report[]>()))[0] ?? null
  if (report?.approved_by) {
    try {
      const profile = (await rows(db.from('profiles').select('full_name').eq('id', report.approved_by).returns<{ full_name: string | null }[]>()))[0]
      return { ...report, approver_name: profile?.full_name ?? null }
    } catch { /* Preserve the recorded approver ID if the display name is unavailable. */ }
  }
  return report
}
export async function history(db: DB, id: string) {
  return rows(db.from('learning_report_events').select('id,event,version,created_at,actor_id').eq('report_id', id).order('created_at', { ascending: false }).order('id').limit(100).returns<{ id: string; event: string; version: number; created_at: string; actor_id: string }[]>())
}
export async function enrollmentChoices(db: DB, params: Params) {
  const page = pageNumber(params.enrollments_page)
  let q = db.from('enrollments').select('id,started_at,ended_at,students!inner(full_name,student_code),classes!inner(name,branches!inner(name))').not('started_at', 'is', null)
  const search = params.student?.trim().replace(/[^\p{L}\p{N} -]/gu, ' ').slice(0, 80)
  if (search) q = q.or(`full_name.ilike.%${search}%,student_code.ilike.%${search}%`, { referencedTable: 'students' })
  const data = await rows(q.order('started_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<{ id: string; started_at: string; ended_at: string | null; students: { full_name: string; student_code: string }; classes: { name: string; branches: { name: string } } }[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}

export async function latestMonthlyReport(db: DB, enrollmentId: string) {
  if (!uuidPattern.test(enrollmentId)) return null
  return (await rows(db.from('learning_reports').select('id,period_end,status')
    .eq('enrollment_id', enrollmentId).eq('report_type', 'MONTHLY')
    .order('period_end', { ascending: false }).order('id').limit(1)
    .returns<{ id: string; period_end: string; status: string }[]>()))[0] ?? null
}

export type ReportContact = { id: string; name: string; email: string | null; phone: string | null }
export type DeliveryJob = { id: string; recipient_id: string; channel: string; status: string; delivery_mode: string; created_at: string; sent_at: string | null; provider_receipt: string | null }
export async function reportDelivery(db: DB, report: Report) {
  const [students, links, jobs] = await Promise.all([
    rows(db.from('students').select('id,user_id,full_name,email,phone').eq('id', report.student_id).returns<{ id: string; user_id: string | null; full_name: string; email: string | null; phone: string | null }[]>()),
    rows(db.from('student_parents').select('parent_id,valid_from,valid_until').eq('student_id', report.student_id).eq('is_active', true).returns<{ parent_id: string; valid_from: string | null; valid_until: string | null }[]>()),
    rows(db.from('notification_jobs').select('id,recipient_id,channel,status,delivery_mode,created_at,sent_at,provider_receipt').eq('entity_type', 'LEARNING_REPORT').eq('entity_id', report.id).order('created_at', { ascending: false }).order('id').limit(100).returns<DeliveryJob[]>()),
  ])
  const now = Date.now()
  const ids = links.filter(l => (!l.valid_from || Date.parse(l.valid_from) <= now) && (!l.valid_until || Date.parse(l.valid_until) > now)).map(l => l.parent_id)
  const parents = ids.length ? await rows(db.from('parents').select('user_id').in('id', ids).eq('status', 'ACTIVE').returns<{ user_id: string | null }[]>()) : []
  const profileIds = [...new Set([...parents.map(p => p.user_id), ...jobs.map(j => j.recipient_id)].filter((id): id is string => Boolean(id)))]
  const profiles = profileIds.length ? await rows(db.from('profiles').select('id,full_name,phone,status').in('id', profileIds).returns<{ id: string; full_name: string | null; phone: string | null; status: string }[]>()) : []
  const contacts: ReportContact[] = students.map(s => ({ id: s.user_id ?? s.id, name: s.full_name, email: s.email, phone: s.phone }))
  for (const parent of parents) {
    const p = profiles.find(p => p.id === parent.user_id && p.status === 'ACTIVE')
    if (p && !contacts.some(c => c.id === p.id)) contacts.push({ id: p.id, name: p.full_name ?? p.id, email: null, phone: p.phone })
  }
  return { contacts, jobs, names: new Map(profiles.map(p => [p.id, p.full_name ?? p.id])) }
}
