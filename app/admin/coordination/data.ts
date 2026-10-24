import type { createClient } from '@/lib/supabase/server'
import { businessDate, shiftBusinessDate } from '@/app/admin/_lib/business-date'
import { pageNumber, pageSize, uuidPattern } from '@/app/admin/finance/operations'
import { proposedParticipationDate } from './rules'

type DB = Awaited<ReturnType<typeof createClient>>
export type Params = Record<string, string | undefined>

export type WaitingRow = {
  placement_id: string
  placement_version: number
  student_id: string
  student_name: string
  parent_name: string | null
  branch_id: string
  branch_name: string
  program_name: string | null
  level_name: string | null
  desired_start: string | null
  preferred_schedule: string | null
  placement_status: string
  class_name: string | null
  teacher_name: string | null
  scheduled_start: string | null
  owner_name: string | null
  days_waiting: number
  enrollment_id: string | null
  class_id: string | null
}

export type CandidateRow = {
  class_id: string | null
  class_code: string | null
  class_name: string | null
  branch_name: string | null
  outcome: string
  reason_code: string | null
  preference_fit: string | null
  open_seats: number | null
  capacity: number | null
  enrolled_count: number | null
  first_session_at: string | null
  schedule_label: string | null
  teacher_name: string | null
  room_name: string | null
  level_label: string | null
  suggestion_code: string | null
  total_eligible: number | null
  total_ineligible: number | null
  total_unknown: number | null
  evaluated_count: number | null
}

export type StoredWindow = { day: number; start: string; end: string }
export type PlacedShift = { classId: string; code: string; name: string; day: number; start: string; end: string }

const datePattern = /^\d{4}-\d{2}-\d{2}$/

export function coordinationView(value?: string) {
  if (value === 'queue' || value === 'shifts' || value === 'today') return value
  return 'week'
}

export function weekBounds(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7
  const monday = shiftBusinessDate(date, 1 - weekday)
  const next = shiftBusinessDate(monday, 7)
  return { monday, next, startIso: `${monday}T00:00:00+07:00`, endIso: `${next}T00:00:00+07:00` }
}

async function placedWeeklySessions(db: DB, detail: Record<string, unknown>) {
  const studentId = typeof detail.student_id === 'string' ? detail.student_id : ''
  if (!studentId) return 0
  const enrolled = await db.from('enrollments').select('class_id').eq('student_id', studentId).in('status', ['ACTIVE', 'PAUSED'])
  const classIds = (enrolled.data ?? []).map(row => row.class_id).filter(Boolean)
  if (!classIds.length) return 0
  const schedules = await db.from('schedules').select('id').in('class_id', classIds).eq('status', 'ACTIVE')
  return schedules.data?.length ?? 0
}

function legacyWindows(detail: Record<string, unknown>): StoredWindow[] {
  const days = Array.isArray(detail.availability_days) ? detail.availability_days.map(Number).filter(day => day >= 1 && day <= 7) : []
  const start = typeof detail.availability_start === 'string' ? detail.availability_start.slice(0, 5) : ''
  const end = typeof detail.availability_end === 'string' ? detail.availability_end.slice(0, 5) : ''
  if (!days.length || !start || !end || end <= start) return []
  return days.map(day => ({ day, start, end }))
}

async function loadPlacedShifts(db: DB, studentId: string, branchId: string): Promise<PlacedShift[]> {
  if (!studentId) return []
  const enrolled = await db.from('enrollments').select('class_id, classes!inner(code, name, branch_id)').eq('student_id', studentId).in('status', ['ACTIVE', 'PAUSED'])
  const rows = (enrolled.data ?? []).flatMap(row => {
    const klass = Array.isArray(row.classes) ? row.classes[0] : row.classes
    if (!klass || (branchId && klass.branch_id !== branchId)) return []
    return [{ classId: row.class_id as string, code: klass.code as string, name: klass.name as string }]
  })
  if (!rows.length) return []
  const schedules = await db.from('schedules').select('class_id, day_of_week, start_time, end_time').in('class_id', rows.map(row => row.classId)).eq('status', 'ACTIVE').order('day_of_week').order('start_time')
  return (schedules.data ?? []).flatMap(schedule => {
    const klass = rows.find(row => row.classId === schedule.class_id)
    if (!klass) return []
    return [{ ...klass, day: schedule.day_of_week, start: String(schedule.start_time).slice(0, 5), end: String(schedule.end_time).slice(0, 5) }]
  })
}

function failure(error: { message?: string } | null) {
  const reference = crypto.randomUUID().slice(0, 8)
  console.error('coordination load failed', reference, error?.message)
  return { message: 'Không tải được dữ liệu ca dạy. Hãy thử lại.', reference }
}

export async function loadCoordination(db: DB, params: Params) {
  const view = coordinationView(params.view)
  const today = businessDate()
  const branch = uuidPattern.test(params.branch ?? '') ? params.branch! : ''
  const curriculum = uuidPattern.test(params.curriculum ?? '') ? params.curriculum! : ''
  const place = uuidPattern.test(params.place ?? '') ? params.place! : ''
  const page = pageNumber(params.page)
  const q = (params.q ?? '').trim()
  const filter = params.filter === 'UNASSIGNED' || params.filter === 'MATCHING' ? params.filter : 'ALL'
  const date = datePattern.test(params.date ?? '') ? params.date! : today

  if (view === 'shifts' || view === 'week' || view === 'today') {
    return { view, today, branch, curriculum, place, page, q, filter, date, queue: null, candidates: null, detail: null, placedWeekly: 0, windows: [] as StoredWindow[], placedShifts: [] as PlacedShift[], sessions: null, rooms: [] as { id: string; name: string }[], error: null as string | null, reference: null as string | null }
  }

  const listArgs = {
    p_curriculum: curriculum || null,
    p_branch: branch || null,
    p_filter: filter,
    p_search: q || null,
    p_limit: pageSize + 1,
    p_offset: (page - 1) * pageSize,
  }
  const [rowsResult, summaryResult, waitingCount, unassignedCount, matchingCount, futureCount, branchesResult, programsResult] = await Promise.all([
    db.rpc('list_waiting_placements_by_curriculum', listArgs),
    db.rpc('waiting_placement_summary', { p_branch: branch || null }),
    db.rpc('count_waiting_placements_by_curriculum', { p_curriculum: curriculum || null, p_branch: branch || null, p_filter: 'ALL', p_search: q || null }),
    db.rpc('count_waiting_placements_by_curriculum', { p_curriculum: curriculum || null, p_branch: branch || null, p_filter: 'UNASSIGNED', p_search: q || null }),
    db.rpc('count_waiting_placements_by_curriculum', { p_curriculum: curriculum || null, p_branch: branch || null, p_filter: 'MATCHING', p_search: q || null }),
    db.rpc('count_future_start_placements_by_curriculum', { p_curriculum: curriculum || null, p_branch: branch || null, p_search: q || null }),
    db.from('branches').select('id,name').order('name').limit(200),
    db.from('operational_curriculums').select('id,name').order('name'),
  ])
  const failed = [rowsResult, summaryResult, waitingCount, unassignedCount, matchingCount, futureCount].find(result => result.error)
  if (failed?.error) {
    const problem = failure(failed.error)
    return { view, today, branch, curriculum, place, page, q, filter, date, queue: null, candidates: null, detail: null, placedWeekly: 0, windows: [] as StoredWindow[], placedShifts: [] as PlacedShift[], sessions: null, rooms: [], error: problem.message, reference: problem.reference }
  }
  const rows = ((rowsResult.data ?? []) as WaitingRow[])
  const pageRows = rows.slice(0, pageSize)
  const signals = pageRows.length
    ? await db.rpc('placement_queue_signals', { p_cases: pageRows.map(row => row.placement_id) })
    : { data: [], error: null }
  if (signals.error) {
    const problem = failure(signals.error)
    return { view, today, branch, curriculum, place, page, q, filter, date, queue: null, candidates: null, detail: null, placedWeekly: 0, windows: [] as StoredWindow[], placedShifts: [] as PlacedShift[], sessions: null, rooms: [], error: problem.message, reference: problem.reference }
  }
  const blockers = new Map<string, string>((signals.data ?? []).map((row: { placement_id: string; blocker_code: string }) => [row.placement_id, row.blocker_code]))
  let detail = null as null | Record<string, unknown>
  let candidates: { rows: CandidateRow[]; error: string | null; reference: string | null } | null = null
  let windows: StoredWindow[] = []
  let placedShifts: PlacedShift[] = []
  if (place) {
    const placement = await db.from('student_placement_cases').select(`
      id, version, status, desired_start_date, scheduled_start_date, preferred_schedule,
      availability_days, availability_start, availability_end, availability_mode, availability_note, required_weekly_sessions,
      branch_id, student_id, enrollment_id, assigned_class_id, owner_user_id,
      students(full_name, student_code, default_branch_id),
      branches(name),
      registration_applications(id, status, application_code, curriculum_id, level_id, payment_confirmed_at, preferred_schedule)
    `).eq('id', place).maybeSingle()
    if (placement.error) {
      const problem = failure(placement.error)
      candidates = { rows: [], error: problem.message, reference: problem.reference }
    } else if (!placement.data) {
      candidates = { rows: [], error: 'Không tìm thấy hồ sơ chờ ca trong phạm vi của bạn.', reference: null }
    } else {
      detail = placement.data as Record<string, unknown>
      const stored = await db.from('placement_time_windows').select('day_of_week, start_time, end_time, sort_order').eq('placement_id', place).order('sort_order').order('day_of_week').order('start_time')
      if (stored.error) {
        const problem = failure(stored.error)
        candidates = { rows: [], error: problem.message, reference: problem.reference }
      } else {
      windows = (stored.data ?? []).map(row => ({
        day: Number(row.day_of_week),
        start: String(row.start_time).slice(0, 5),
        end: String(row.end_time).slice(0, 5),
      }))
      if (!windows.length) windows = legacyWindows(placement.data)
      placedShifts = await loadPlacedShifts(db, String(placement.data.student_id ?? ''), String(placement.data.branch_id ?? ''))
      const requested = datePattern.test(params.start ?? '') ? params.start! : null
      const desired = typeof placement.data.desired_start_date === 'string' ? placement.data.desired_start_date : null
      const start = proposedParticipationDate(requested && requested >= today ? requested : desired, today)
      const candidateResult = await db.rpc('list_placement_candidates', {
        p_placement: place,
        p_start: start,
        p_limit: 20,
        p_offset: Math.max(pageNumber(params.candidate_page) - 1, 0) * 20,
      })
      if (candidateResult.error) {
        const problem = failure(candidateResult.error)
        candidates = { rows: [], error: problem.message, reference: problem.reference }
      } else {
        candidates = { rows: (candidateResult.data ?? []) as CandidateRow[], error: null, reference: null }
      }
      }
    }
  }
  const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data
  return {
    view,
    today,
    branch,
    curriculum,
    place,
    page,
    q,
    filter,
    date,
    error: null as string | null,
    reference: null as string | null,
    queue: {
      rows: pageRows,
      more: rows.length > pageSize,
      blockers,
      summary,
      counts: {
        waiting: waitingCount.data ?? 0,
        unassigned: unassignedCount.data ?? 0,
        matching: matchingCount.data ?? 0,
        future: futureCount.data ?? 0,
      },
      branches: branchesResult.data ?? [],
      programs: programsResult.data ?? [],
    },
    candidates,
    detail,
    placedWeekly: detail ? await placedWeeklySessions(db, detail) : 0,
    windows,
    placedShifts,
    sessions: null,
    rooms: [] as { id: string; name: string }[],
  }
}

export async function loadWeek(db: DB, params: Params) {
  const today = businessDate()
  const date = datePattern.test(params.date ?? '') ? params.date! : today
  const branch = uuidPattern.test(params.branch ?? '') ? params.branch! : ''
  const bounds = weekBounds(date)
  let query = db.from('session_occurrences').select(`
    id, starts_at, ends_at, status, occurrence_date, rescheduled_at, room_id, schedule_id,
    schedules!inner(id, class_id, day_of_week, start_time, end_time, effective_from, classes!inner(id, name, code, branch_id, branches(name)))
  `).gte('starts_at', bounds.startIso).lt('starts_at', bounds.endIso).order('starts_at').limit(300)
  if (branch) query = query.eq('schedules.classes.branch_id', branch)
  const [sessions, branches, rooms] = await Promise.all([
    query,
    db.from('branches').select('id,name').order('name').limit(200),
    uuidPattern.test(params.recur ?? '')
      ? db.from('rooms').select('id,name,branch_id').eq('status', 'ACTIVE').order('name').limit(200)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (sessions.error) {
    const problem = failure(sessions.error)
    return { date, bounds, branch, branches: branches.data ?? [], sessions: null, rooms: [], error: problem.message, reference: problem.reference }
  }
  return { date, bounds, branch, branches: branches.data ?? [], sessions: sessions.data ?? [], rooms: rooms.data ?? [], error: null as string | null, reference: null as string | null }
}
