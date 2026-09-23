import { rows, all, type DB } from '../finance/query'
import { pageNumber, pageSize, uuidPattern, validDate, type Params } from '../finance/operations'
export const states = [{ id: 'NORMAL', name: 'Mới' }, { id: 'NEEDS_REVIEW', name: 'Cần xử lý' }, { id: 'IN_REVIEW', name: 'Đang xử lý' }, { id: 'RESOLVED', name: 'Đã xử lý' }]
export const stateLabels = Object.fromEntries(states.map(s => [s.id, s.name]))
export const respondents = [{ id: 'STUDENT', name: 'Học viên' }, { id: 'PARENT', name: 'Phụ huynh' }]
export type Feedback = {
  id: string; session_occurrence_id: string; student_id: string; teacher_id: string; branch_id: string; enrollment_id?: string
  respondent_user_id: string; respondent_type: string; session_starts_at: string; submitted_at: string; overall_rating: number
  lesson_quality_rating: number | null; teacher_communication_rating: number | null; progress_perception_rating: number | null
  comment: string; is_low_rating: boolean; resolution_status: string; resolution_note: string; resolved_at: string | null
  resolved_by: string | null; version: number
  context_snapshot: { student_name: string; student_code: string; teacher_name: string; branch_name: string; class_name: string; respondent_name: string | null; teacher_basis?: string }
}
const fields = 'id,session_occurrence_id,student_id,teacher_id,branch_id,respondent_user_id,respondent_type,session_starts_at,submitted_at,overall_rating,lesson_quality_rating,teacher_communication_rating,progress_perception_rating,comment,is_low_rating,resolution_status,resolution_note,resolved_at,resolved_by,version,context_snapshot'

async function enrollmentIdsForClass(db: DB, classId?: string) {
  if (!uuidPattern.test(classId ?? '')) return null as string[] | null
  const enrollments = await rows(db.from('enrollments').select('id').eq('class_id', classId!).limit(200).returns<{ id: string }[]>())
  return enrollments.map(e => e.id)
}

export async function feedbackList(db: DB, params: Params) {
  const page = pageNumber(params.page)
  const classIds = await enrollmentIdsForClass(db, params.class)
  let q = db.from('lesson_feedback').select('id,session_starts_at,overall_rating,is_low_rating,resolution_status,respondent_type,context_snapshot')
  if (classIds !== null) q = classIds.length ? q.in('enrollment_id', classIds) : q.eq('enrollment_id', '00000000-0000-0000-0000-000000000000')
  if (uuidPattern.test(params.branch ?? '')) q = q.eq('branch_id', params.branch!)
  if (uuidPattern.test(params.teacher ?? '')) q = q.eq('teacher_id', params.teacher!)
  if (/^[1-5]$/.test(params.rating ?? '')) q = q.eq('overall_rating', Number(params.rating))
  if (respondents.some(r => r.id === params.respondent)) q = q.eq('respondent_type', params.respondent!)
  if (states.some(s => s.id === params.status)) q = q.eq('resolution_status', params.status!)
  if (params.review === 'yes') q = q.in('resolution_status', ['NEEDS_REVIEW', 'IN_REVIEW'])
  if (params.attention === 'low') q = q.eq('is_low_rating', true)
  if ((params.q || '').trim()) q = q.ilike('context_snapshot->>student_name', '%' + params.q!.trim().replace(/[%_,()]/g, ' ').slice(0, 80) + '%')
  if (validDate(params.from ?? '')) q = q.gte('session_starts_at', params.from + 'T00:00:00+07:00')
  if (validDate(params.to ?? '')) {
    const d = new Date(params.to + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    q = q.lt('session_starts_at', d.toISOString().slice(0, 10) + 'T00:00:00+07:00')
  }
  const data = await rows(q.order('session_starts_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<Feedback[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}

export async function feedbackDetail(db: DB, id: string) {
  if (!uuidPattern.test(id)) return null
  return (await rows(db.from('lesson_feedback').select(fields).eq('id', id).returns<Feedback[]>()))[0] ?? null
}

export async function teachers(db: DB) {
  return all((a, b) => db.from('teachers').select('id,full_name,teacher_code').order('teacher_code').order('id').range(a, b).returns<{ id: string; full_name: string | null; teacher_code: string }[]>())
}

export async function feedbackClasses(db: DB, params: Params) {
  let q = db.from('classes').select('id,name,branch_id').eq('status', 'ACTIVE').order('name').order('id').limit(200)
  if (uuidPattern.test(params.branch ?? '')) q = q.eq('branch_id', params.branch!)
  return rows(q.returns<{ id: string; name: string; branch_id: string }[]>())
}

export async function feedbackHistory(db: DB, id: string) {
  return rows(db.from('lesson_feedback_events').select('id,status,note,actor_id,created_at').eq('feedback_id', id).order('created_at', { ascending: false }).order('id').limit(100).returns<{ id: string; status: string; note: string; actor_id: string; created_at: string }[]>())
}

export async function feedbackReasons(db: DB, id: string) {
  return rows(db.from('lesson_feedback_reasons').select('reason_code,reason_label').eq('feedback_id', id).order('reason_code').returns<{ reason_code: string; reason_label: string }[]>())
}

export async function feedbackMetrics(db: DB, params: Params) {
  const scoped: Params = { ...params, status: undefined, review: undefined, rating: undefined, respondent: undefined, attention: undefined, q: undefined, page: undefined }
  const classIds = await enrollmentIdsForClass(db, scoped.class)
  const build = (select: string, options?: { count: 'exact'; head: boolean }) => {
    let q = db.from('lesson_feedback').select(select, options)
    if (classIds !== null) q = classIds.length ? q.in('enrollment_id', classIds) : q.eq('enrollment_id', '00000000-0000-0000-0000-000000000000')
    if (uuidPattern.test(scoped.branch ?? '')) q = q.eq('branch_id', scoped.branch!)
    if (uuidPattern.test(scoped.teacher ?? '')) q = q.eq('teacher_id', scoped.teacher!)
    if (validDate(scoped.from ?? '')) q = q.gte('session_starts_at', scoped.from + 'T00:00:00+07:00')
    if (validDate(scoped.to ?? '')) {
      const d = new Date(scoped.to + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      q = q.lt('session_starts_at', d.toISOString().slice(0, 10) + 'T00:00:00+07:00')
    }
    return q
  }
  const headCount = async (apply?: (q: ReturnType<typeof build>) => ReturnType<typeof build>) => {
    let q = build('id', { count: 'exact', head: true })
    if (apply) q = apply(q)
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  }
  const [total, needs, resolved, low] = await Promise.all([
    headCount(),
    headCount(q => q.in('resolution_status', ['NEEDS_REVIEW', 'IN_REVIEW'])),
    headCount(q => q.eq('resolution_status', 'RESOLVED')),
    headCount(q => q.eq('is_low_rating', true)),
  ])

  const data = await all((from, to) =>
    build('overall_rating,resolution_status,is_low_rating,context_snapshot')
      .order('id')
      .range(from, to)
      .returns<Pick<Feedback, 'overall_rating' | 'resolution_status' | 'is_low_rating' | 'context_snapshot'>[]>()
  )
  const average = data.length ? Math.round(data.reduce((sum, row) => sum + row.overall_rating, 0) / data.length * 10) / 10 : null
  const group = (key: 'teacher_name' | 'branch_name') => {
    const map = new Map<string, { name: string; total: number; sum: number }>()
    for (const row of data) {
      const name = row.context_snapshot[key] || '—'
      const item = map.get(name) || { name, total: 0, sum: 0 }
      item.total += 1
      item.sum += row.overall_rating
      map.set(name, item)
    }
    return [...map.values()]
  }
  return {
    total,
    average,
    needs,
    resolved,
    low,
    lowRate: total ? Math.round(low / total * 1000) / 10 : null,
    resolutionRate: total ? Math.round(resolved / total * 1000) / 10 : null,
    teachers: group('teacher_name'),
    branches: group('branch_name'),
  }
}
