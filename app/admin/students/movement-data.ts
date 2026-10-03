import { createClient } from '@/lib/supabase/server'
import { businessDate } from '@/app/admin/_lib/business-date'
import { uuidPattern, vietnamDateTime } from '@/app/admin/finance/operations'
import { dateLabel, distinctCount, instrumentShares, monthLabel, monthWindow, type InstrumentShare } from './movement'

type Client = Awaited<ReturnType<typeof createClient>>

export type MovementRow = {
  id: string
  code: string
  name: string
  branch: string
  when: string
  context: string
}

export type StudentMovement = {
  month: string
  monthText: string
  periodText: string
  branchId: string | null
  branchName: string
  branches: { id: string; name: string }[]
  generatedAt: string
  enrolledStudents: number
  instruments: InstrumentShare[]
  newcomers: MovementRow[]
  paused: MovementRow[]
  courseEnded: MovementRow[]
  counts: {
    newcomers: number
    active: number | null
    paused: number | null
    courseEnded: number
    withdrawn: number
    waiting: number | null
    future: number | null
    sessions: number | null
    reports: number | null
    feedback: number | null
  }
}

async function countOf(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return result.count ?? 0
}

async function rpcCount(result: PromiseLike<{ data: number | null; error: { message: string } | null }>) {
  const value = await result
  if (value.error) throw new Error(value.error.message)
  return value.data ?? 0
}

export async function loadStudentMovement(
  db: Client,
  params: { month?: string; branch?: string },
): Promise<StudentMovement> {
  const scope = monthWindow(params.month, businessDate())
  const branchId = uuidPattern.test(params.branch ?? '') ? params.branch! : null
  const { data: isAdmin, error: roleError } = await db.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  if (roleError) throw new Error(roleError.message)

  let newcomersQuery = db.from('students').select('id, student_code, full_name, admission_date, branches!students_default_branch_id_fkey(name)')
    .gte('admission_date', scope.start).lt('admission_date', scope.next)
    .order('admission_date').order('student_code').limit(100)
  let newCountQuery = db.from('students').select('id', { count: 'exact', head: true })
    .gte('admission_date', scope.start).lt('admission_date', scope.next)
  let endedQuery = db.from('enrollments').select('id, student_id, started_at, ended_at, status, students!inner(student_code, full_name), classes!inner(name, branch_id, branches!classes_branch_id_fkey(name))')
    .in('status', ['COMPLETED', 'WITHDRAWN'])
    .gte('ended_at', scope.start).lt('ended_at', scope.next)
    .order('ended_at').limit(200)
  let reportQuery = db.from('learning_report_list').select('id', { count: 'exact', head: true }).eq('status', 'READY_FOR_REVIEW')
  let rosterQuery = db.from('students').select('id', { count: 'exact', head: true }).in('status', ['ACTIVE', 'PAUSED'])
  let instrumentQuery = db.from('student_curriculum_enrollments')
    .select('student_id, curriculums!student_curriculum_enrollments_curriculum_id_fkey(name, code), students!inner(status, default_branch_id)')
    .eq('status', 'ACTIVE')
    .in('students.status', ['ACTIVE', 'PAUSED'])
    .limit(2000)
  if (branchId) {
    newcomersQuery = newcomersQuery.eq('default_branch_id', branchId)
    newCountQuery = newCountQuery.eq('default_branch_id', branchId)
    endedQuery = endedQuery.eq('classes.branch_id', branchId)
    reportQuery = reportQuery.eq('branch_id', branchId)
    rosterQuery = rosterQuery.eq('default_branch_id', branchId)
    instrumentQuery = instrumentQuery.eq('students.default_branch_id', branchId)
  }
  const today = businessDate()
  const sessionCount = async () => {
    const query = db.from('session_occurrences').select('id', { count: 'exact', head: true }).eq('occurrence_date', today)
    if (!branchId) return countOf(query)
    const classes = await db.from('classes').select('id').eq('branch_id', branchId).limit(500)
    if (classes.error) throw new Error(classes.error.message)
    const classIds = (classes.data ?? []).map(row => row.id)
    if (!classIds.length) return 0
    const schedules = await db.from('schedules').select('id').in('class_id', classIds).limit(1000)
    if (schedules.error) throw new Error(schedules.error.message)
    const scheduleIds = (schedules.data ?? []).map(row => row.id)
    if (!scheduleIds.length) return 0
    return countOf(query.in('schedule_id', scheduleIds))
  }

  const [branchRows, newRows, newCount, endedRows, rosterCount, instrumentRows, active, waiting, future, pausedCount, pausedRows, sessions, reports, feedback] = await Promise.all([
    db.from('branches').select('id, name').order('name').limit(200),
    newcomersQuery,
    newCountQuery,
    endedQuery,
    rosterQuery,
    instrumentQuery,
    rpcCount(db.rpc('count_current_student_enrollments', { p_branch: branchId, p_search: null, p_class: null, p_teacher: null })),
    rpcCount(db.rpc('count_waiting_placements', { p_branch: branchId, p_filter: 'ALL', p_search: null })),
    rpcCount(db.rpc('count_future_start_placements', { p_branch: branchId, p_search: null })),
    rpcCount(db.rpc('count_paused_student_enrollments', { p_branch: branchId, p_search: null, p_class: null, p_teacher: null })),
    db.rpc('list_paused_student_enrollments', { p_branch: branchId, p_search: null, p_limit: 100, p_offset: 0 }),
    sessionCount(),
    isAdmin === true ? countOf(reportQuery) : Promise.resolve(null),
    isAdmin === true ? countOf(db.from('lesson_feedback').select('id', { count: 'exact', head: true }).in('resolution_status', ['NEEDS_REVIEW', 'IN_REVIEW'])) : Promise.resolve(null),
  ])
  if (branchRows.error) throw new Error(branchRows.error.message)
  if (newRows.error) throw new Error(newRows.error.message)
  if (newCount.error) throw new Error(newCount.error.message)
  if (endedRows.error) throw new Error(endedRows.error.message)
  if (rosterCount.error) throw new Error(rosterCount.error.message)
  if (instrumentRows.error) throw new Error(instrumentRows.error.message)
  if (pausedRows.error) throw new Error(pausedRows.error.message)

  const branches = (branchRows.data ?? []).map(row => ({ id: row.id, name: row.name }))
  const branchName = branchId ? branches.find(row => row.id === branchId)?.name ?? 'Chi nhánh đã chọn' : 'Toàn hệ thống'
  type Ended = {
    id: string
    student_id: string
    started_at: string | null
    ended_at: string | null
    status: string
    students: { student_code: string; full_name: string }
    classes: { name: string; branch_id: string; branches: { name: string } | { name: string }[] }
  }
  const ended = (endedRows.data ?? []) as unknown as Ended[]
  const branchOf = (row: Ended) => Array.isArray(row.classes.branches) ? row.classes.branches[0]?.name : row.classes.branches?.name
  const courseRows = ended.filter(row => row.status === 'COMPLETED')
  const withdrawn = ended.filter(row => row.status === 'WITHDRAWN')
  type Paused = { enrollment_id: string; student_code: string; student_name: string; branch_name: string; class_name: string; started_on: string }
  const paused = (pausedRows.data ?? []) as Paused[]

  return {
    month: scope.month,
    monthText: monthLabel(scope.month),
    periodText: `${dateLabel(scope.start)} – ${dateLabel(scope.end)}`,
    branchId,
    branchName,
    branches,
    generatedAt: vietnamDateTime().replace('T', ' '),
    enrolledStudents: rosterCount.count ?? 0,
    instruments: instrumentShares(
      ((instrumentRows.data ?? []) as { student_id: string; curriculums: { name: string; code: string | null } | { name: string; code: string | null }[] | null }[])
        .map(row => {
          const curriculum = Array.isArray(row.curriculums) ? row.curriculums[0] : row.curriculums
          return { studentId: row.student_id, name: curriculum?.name ?? null, code: curriculum?.code ?? null }
        }),
      rosterCount.count ?? 0,
    ),
    newcomers: ((newRows.data ?? []) as unknown as { id: string; student_code: string; full_name: string; admission_date: string | null; branches: { name: string } | { name: string }[] | null }[]).map(row => {
      const branch = Array.isArray(row.branches) ? row.branches[0]?.name : row.branches?.name
      return {
        id: row.id,
        code: row.student_code,
        name: row.full_name,
        branch: branch || '—',
        when: dateLabel(row.admission_date),
        context: 'Nhập học',
      }
    }),
    paused: paused.map(row => ({
      id: row.enrollment_id,
      code: row.student_code,
      name: row.student_name,
      branch: row.branch_name,
      when: dateLabel(row.started_on),
      context: row.class_name,
    })),
    courseEnded: courseRows.map(row => ({
      id: row.id,
      code: row.students.student_code,
      name: row.students.full_name,
      branch: branchOf(row) || '—',
      when: dateLabel(row.ended_at),
      context: row.classes.name,
    })),
    counts: {
      newcomers: newCount.count ?? 0,
      active,
      paused: pausedCount,
      courseEnded: distinctCount(courseRows.map(row => row.student_id)),
      withdrawn: distinctCount(withdrawn.map(row => row.student_id)),
      waiting,
      future,
      sessions,
      reports,
      feedback,
    },
  }
}
