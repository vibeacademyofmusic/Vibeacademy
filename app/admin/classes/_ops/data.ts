import type { createClient } from '@/lib/supabase/server'
import { pageNumber, pageSize, uuidPattern } from '../../finance/operations'
import { formatLevelScope, type OpsView } from './model'

type DB = Awaited<ReturnType<typeof createClient>>
export type Params = Record<string, string | undefined>

function rel<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function todayVietnam() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
}

export async function loadClassOps(db: DB, params: Params, view: OpsView) {
  const branch = uuidPattern.test(params.branch ?? '') ? params.branch! : null
  const page = pageNumber(params.page)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayVietnam()

  const compatibility = loadScopeWarnings(db, branch)
  const [branches, courses, overview, classes, schedules, rooms, sessions, sessionDiag] = await Promise.all([
    db.from('branches').select('id,name,status').eq('status', 'ACTIVE').order('name').limit(200),
    db.from('courses').select('id,name,code,curriculum_id,level_id,status').eq('status', 'ACTIVE').order('name').limit(200),
    loadOverview(db, branch, compatibility),
    view === 'classes' || view === 'overview' ? loadClasses(db, { branch, page, q: params.q }, compatibility) : Promise.resolve(null),
    view === 'schedule' ? loadSchedules(db, { branch, page }) : Promise.resolve(null),
    view === 'rooms' ? loadRooms(db, { branch, page }) : Promise.resolve(null),
    view === 'attendance' ? loadAttendanceSessions(db, { branch, date, page, classId: params.class }) : Promise.resolve(null),
    view === 'attendance' ? diagnoseAttendanceDay(db, { branch, date }) : Promise.resolve(null),
  ])

  return {
    today: date,
    branches: branches.data ?? [],
    courses: courses.data ?? [],
    overview,
    classes,
    schedules,
    rooms,
    sessions,
    sessionDiag,
    levelsByCurriculum: await loadLevelsByCurriculum(db, (courses.data ?? []).map(c => c.curriculum_id)),
  }
}

async function loadLevelsByCurriculum(db: DB, curriculumIds: string[]) {
  const ids = [...new Set(curriculumIds.filter(Boolean))]
  const record: Record<string, { id: string; name: string; sequence_no: number }[]> = {}
  if (!ids.length) return record
  const { data } = await db.from('curriculum_levels').select('id,name,sequence_no,curriculum_id,status').in('curriculum_id', ids).eq('status', 'ACTIVE').order('sequence_no').limit(500)
  for (const row of data ?? []) {
    const list = record[row.curriculum_id] ?? []
    list.push({ id: row.id, name: row.name, sequence_no: row.sequence_no })
    record[row.curriculum_id] = list
  }
  return record
}

// Reuse the roster's authoritative compatibility RPC. Counts are derived per request,
// never stored, and cover every page in the selected branch (not just the visible class page).
async function loadScopeWarnings(db: DB, branch: string | null) {
  const classes: { id: string; name: string; status: string }[] = []
  const batchSize = 200
  for (let offset = 0; ; offset += batchSize) {
    let query = db.from('classes').select('id,name,status').order('id').range(offset, offset + batchSize - 1)
    if (branch) query = query.eq('branch_id', branch)
    const { data, error } = await query
    if (error) throw error
    classes.push(...(data ?? []))
    if ((data?.length ?? 0) < batchSize) break
  }
  const byClass = new Map<string, Set<string>>()
  for (let i = 0; i < classes.length; i += batchSize) {
    const ids = classes.slice(i, i + batchSize).map(row => row.id)
    const seen = new Set<string>()
    for (let offset = 0; ; offset += batchSize) {
      const { data, error } = await db.from('enrollments').select('id,class_id,student_id')
        .in('class_id', ids).in('status', ['ACTIVE', 'PAUSED']).order('id').range(offset, offset + batchSize - 1)
      if (error) throw error
      const rows = (data ?? []).filter(row => {
        const key = `${row.class_id}:${row.student_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      // Bound concurrent RPC work on the local runtime.
      for (let j = 0; j < rows.length; j += 8) {
        await Promise.all(rows.slice(j, j + 8).map(async row => {
          const { data: result, error: rpcError } = await db.rpc('class_enrollment_compatibility', {
            p_class: row.class_id, p_student: row.student_id,
          })
          if (rpcError) throw rpcError
          if (result === 'OUTSIDE_SCOPE') {
            const students = byClass.get(row.class_id) ?? new Set<string>()
            students.add(row.student_id)
            byClass.set(row.class_id, students)
          }
        }))
      }
      if ((data?.length ?? 0) < batchSize) break
    }
  }
  const affectedClasses = classes.filter(row => row.status === 'ACTIVE' && byClass.has(row.id))
    .map(row => ({ id: row.id, name: row.name, count: byClass.get(row.id)!.size }))
  const students = new Set(affectedClasses.flatMap(row => [...byClass.get(row.id)!]))
  return { byClass, affectedClasses, studentCount: students.size }
}

type ScopeWarnings = ReturnType<typeof loadScopeWarnings>

async function loadOverview(db: DB, branch: string | null, warnings: ScopeWarnings) {
  const scope = await warnings
  let classQ = db.from('classes').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE')
  if (branch) classQ = classQ.eq('branch_id', branch)
  const { count: activeClasses } = await classQ

  let scopeQ = db.from('classes').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE').is('accepted_from_level_id', null)
  if (branch) scopeQ = scopeQ.eq('branch_id', branch)
  const { count: unscoped } = await scopeQ

  // Share the attendance workspace's incomplete-session calculation, including partial marking.
  const attendance = []
  for (let page = 1; ; page++) {
    const result = await loadAttendanceSessions(db, { branch, date: todayVietnam(), page })
    attendance.push(...result.data.filter(row => row.status !== 'CANCELLED'))
    if (!result.more) break
  }
  const incompleteAttendance = attendance.filter(row => row.unmarked > 0).length

  return {
    activeClasses: activeClasses ?? 0,
    todaySessions: attendance.length,
    incompleteAttendance,
    unscopedClasses: unscoped ?? 0,
    outOfScopeStudents: scope.studentCount,
    outOfScopeClasses: scope.affectedClasses,
    needsAttention: (unscoped ?? 0) + incompleteAttendance + scope.affectedClasses.length,
  }
}

async function loadClasses(db: DB, opts: { branch: string | null; page: number; q?: string }, warnings: ScopeWarnings) {
  let q = db.from('classes').select(`
    id, code, name, class_type, capacity, status, branch_id, course_id,
    accepted_from_level_id, accepted_to_level_id,
    courses!inner(id, name, code, curriculum_id, level_id),
    branches!inner(id, name)
  `).order('name').range((opts.page - 1) * pageSize, opts.page * pageSize)
  if (opts.branch) q = q.eq('branch_id', opts.branch)
  if ((opts.q || '').trim()) q = q.ilike('name', '%' + opts.q!.trim().replace(/[%_,()]/g, ' ').slice(0, 60) + '%')
  const { data, error } = await q
  if (error) throw error
  const rows = data ?? []
  const visible = rows.slice(0, pageSize)
  const classIds = visible.map(r => r.id)
  const fromIds = [...new Set(visible.map(r => r.accepted_from_level_id).filter(Boolean))] as string[]
  const toIds = [...new Set(visible.map(r => r.accepted_to_level_id).filter(Boolean))] as string[]
  const levelIds = [...new Set([...fromIds, ...toIds])]
  const [{ data: levels }, { data: enrollCounts }, { data: teachers }, { data: schedules }] = await Promise.all([
    levelIds.length ? db.from('curriculum_levels').select('id,name').in('id', levelIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    classIds.length ? db.from('enrollments').select('class_id').in('class_id', classIds).in('status', ['ACTIVE', 'PAUSED']) : Promise.resolve({ data: [] as { class_id: string }[] }),
    classIds.length ? db.from('class_teachers').select('class_id, teacher_id, teachers(full_name, teacher_code)').in('class_id', classIds).eq('is_active', true).eq('teacher_role', 'PRIMARY') : Promise.resolve({ data: [] as never[] }),
    classIds.length ? db.from('schedules').select('class_id, day_of_week, start_time, end_time, room_id, status, rooms(name)').in('class_id', classIds).eq('status', 'ACTIVE') : Promise.resolve({ data: [] as never[] }),
  ])
  const scope = await warnings
  const levelMap = new Map((levels ?? []).map(l => [l.id, l.name]))
  const countMap = new Map<string, number>()
  for (const row of enrollCounts ?? []) countMap.set(row.class_id, (countMap.get(row.class_id) ?? 0) + 1)
  const teacherMap = new Map<string, string>()
  for (const row of teachers ?? []) {
    const t = rel(row.teachers as { full_name: string | null; teacher_code: string } | { full_name: string | null; teacher_code: string }[] | null)
    teacherMap.set(row.class_id, t?.full_name || t?.teacher_code || '—')
  }
  const scheduleMap = new Map<string, string>()
  const roomMap = new Map<string, string>()
  const dayLabels: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' }
  for (const row of schedules ?? []) {
    const label = `${dayLabels[row.day_of_week] ?? row.day_of_week} ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}`
    scheduleMap.set(row.class_id, (scheduleMap.get(row.class_id) ? scheduleMap.get(row.class_id) + '; ' : '') + label)
    const room = rel(row.rooms as { name: string } | { name: string }[] | null)
    if (room?.name) roomMap.set(row.class_id, room.name)
  }

  return {
    data: visible.map(row => {
      const course = rel(row.courses as { id: string; name: string; code: string; curriculum_id: string; level_id: string | null } | { id: string; name: string; code: string; curriculum_id: string; level_id: string | null }[])!
      const branchRow = rel(row.branches as { id: string; name: string } | { id: string; name: string }[])!
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        status: row.status,
        capacity: row.capacity,
        courseName: course.name,
        curriculumId: course.curriculum_id,
        courseLevelId: course.level_id,
        branchName: branchRow.name,
        scopeLabel: formatLevelScope(
          row.accepted_from_level_id ? levelMap.get(row.accepted_from_level_id) : null,
          row.accepted_to_level_id ? levelMap.get(row.accepted_to_level_id) : null,
        ),
        scopeConfigured: Boolean(row.accepted_from_level_id && row.accepted_to_level_id),
        teacherName: teacherMap.get(row.id) ?? '—',
        scheduleLabel: scheduleMap.get(row.id) ?? '—',
        roomName: roomMap.get(row.id) ?? '—',
        enrolled: countMap.get(row.id) ?? 0,
        outOfScopeCount: scope.byClass.get(row.id)?.size ?? 0,
      }
    }),
    page: opts.page,
    more: rows.length > pageSize,
  }
}

async function loadSchedules(db: DB, opts: { branch: string | null; page: number }) {
  let q = db.from('schedules').select(`
    id, class_id, day_of_week, start_time, end_time, status, room_id, effective_from, effective_to,
    classes!inner(id, name, branch_id, branches(name)),
    rooms(name)
  `).order('day_of_week').order('start_time').range((opts.page - 1) * pageSize, opts.page * pageSize)
  if (opts.branch) q = q.eq('classes.branch_id', opts.branch)
  const { data, error } = await q
  if (error) throw error
  const rows = data ?? []
  return { data: rows.slice(0, pageSize), page: opts.page, more: rows.length > pageSize, activeCount: rows.length }
}

async function loadRooms(db: DB, opts: { branch: string | null; page: number }) {
  let q = db.from('rooms').select('id, code, name, capacity, status, branch_id, branches(name)').order('code').range((opts.page - 1) * pageSize, opts.page * pageSize)
  if (opts.branch) q = q.eq('branch_id', opts.branch)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []).slice(0, pageSize)
  const roomIds = rows.map(row => row.id)
  const today = todayVietnam()
  const { data: sessions } = roomIds.length
    ? await db.from('session_occurrences').select('id, room_id, starts_at, ends_at, status, schedules(classes(name))').in('room_id', roomIds).gte('occurrence_date', today).neq('status', 'CANCELLED').order('starts_at').limit(200)
    : { data: [] as { id: string; room_id: string; starts_at: string; ends_at: string; status: string; schedules: { classes: { name: string } | { name: string }[] } | { classes: { name: string } | { name: string }[] }[] | null }[] }
  const now = Date.now()
  const current = new Map<string, string>()
  const next = new Map<string, string>()
  for (const session of sessions ?? []) {
    const start = new Date(session.starts_at).getTime()
    const end = new Date(session.ends_at).getTime()
    const schedule = rel(session.schedules)
    const classRow = schedule ? rel(schedule.classes) : null
    const label = `${classRow?.name ?? 'Ca học'} ${new Date(session.starts_at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}`
    if (start <= now && end >= now && !current.has(session.room_id)) current.set(session.room_id, label)
    else if (start > now && !next.has(session.room_id)) next.set(session.room_id, label)
  }
  return {
    data: rows.map(row => ({ ...row, currentSession: current.get(row.id) ?? '—', nextSession: next.get(row.id) ?? '—' })),
    page: opts.page,
    more: (data ?? []).length > pageSize,
  }
}

async function diagnoseAttendanceDay(db: DB, opts: { branch: string | null; date: string }) {
  let scheduleQ = db.from('schedules').select('id, class_id, classes!inner(branch_id)', { count: 'exact', head: true }).eq('status', 'ACTIVE')
  if (opts.branch) scheduleQ = scheduleQ.eq('classes.branch_id', opts.branch)
  const { count: activeSchedules } = await scheduleQ

  let sessionQ = db.from('session_occurrences').select('id', { count: 'exact', head: true }).eq('occurrence_date', opts.date).neq('status', 'CANCELLED')
  const { count: sessions } = await sessionQ

  return {
    activeSchedules: activeSchedules ?? 0,
    sessions: sessions ?? 0,
    date: opts.date,
  }
}

async function loadAttendanceSessions(db: DB, opts: { branch: string | null; date: string; page: number; classId?: string }) {
  let q = db.from('session_occurrences').select(`
    id, occurrence_date, starts_at, ends_at, status, occurrence_type, schedule_id, room_id,
    schedules!inner(id, class_id, classes!inner(id, name, branch_id, branches(name))),
    rooms!session_occurrences_room_id_fkey(name)
  `).eq('occurrence_date', opts.date).order('starts_at').range((opts.page - 1) * pageSize, opts.page * pageSize)
  if (opts.branch) q = q.eq('schedules.classes.branch_id', opts.branch)
  if (uuidPattern.test(opts.classId ?? '')) q = q.eq('schedules.class_id', opts.classId!)
  const { data, error } = await q
  if (error) throw error
  const rows = (data ?? []).slice(0, pageSize)
  const ids = rows.map(r => r.id)
  const classIds = [...new Set(rows.map(row => {
    const schedule = rel(row.schedules as { class_id: string } | { class_id: string }[])
    return schedule?.class_id
  }).filter(Boolean))] as string[]
  const [{ data: attendance }, { data: enrollments }, { data: teachers }] = await Promise.all([
    ids.length
      ? db.from('attendance_records').select('session_occurrence_id, status').in('session_occurrence_id', ids)
      : Promise.resolve({ data: [] as { session_occurrence_id: string; status: string }[] }),
    classIds.length
      ? db.from('enrollments').select('class_id').in('class_id', classIds).in('status', ['ACTIVE', 'PAUSED'])
      : Promise.resolve({ data: [] as { class_id: string }[] }),
    classIds.length
      ? db.from('class_teachers').select('class_id, teachers(full_name, teacher_code)').in('class_id', classIds).eq('is_active', true).eq('teacher_role', 'PRIMARY')
      : Promise.resolve({ data: [] as { class_id: string; teachers: { full_name: string | null; teacher_code: string } | { full_name: string | null; teacher_code: string }[] | null }[] }),
  ])
  const stats = new Map<string, { marked: number; absent: number }>()
  for (const row of attendance ?? []) {
    const item = stats.get(row.session_occurrence_id) ?? { marked: 0, absent: 0 }
    item.marked += 1
    if (row.status === 'ABSENT') item.absent += 1
    stats.set(row.session_occurrence_id, item)
  }
  const enrolledByClass = new Map<string, number>()
  for (const row of enrollments ?? []) enrolledByClass.set(row.class_id, (enrolledByClass.get(row.class_id) ?? 0) + 1)
  const teacherByClass = new Map<string, string>()
  for (const row of teachers ?? []) {
    const teacher = rel(row.teachers)
    teacherByClass.set(row.class_id, teacher?.full_name || teacher?.teacher_code || '—')
  }
  return {
    data: rows.map(row => {
      const schedule = rel(row.schedules as {
        class_id: string
        classes: { id: string; name: string; branch_id: string; branches: { name: string } | { name: string }[] } | { id: string; name: string; branch_id: string; branches: { name: string } | { name: string }[] }[]
      } | {
        class_id: string
        classes: { id: string; name: string; branch_id: string; branches: { name: string } | { name: string }[] } | { id: string; name: string; branch_id: string; branches: { name: string } | { name: string }[] }[]
      }[])!
      const classes = rel(schedule.classes)!
      const branches = rel(classes.branches)
      const room = rel(row.rooms as { name: string } | { name: string }[] | null)
      const st = stats.get(row.id) ?? { marked: 0, absent: 0 }
      const enrolled = enrolledByClass.get(schedule.class_id) ?? 0
      return {
        id: row.id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        occurrenceType: row.occurrence_type ?? 'REGULAR',
        classId: schedule.class_id,
        className: classes.name,
        branchName: branches?.name ?? '—',
        teacherName: teacherByClass.get(schedule.class_id) ?? '—',
        roomName: room?.name ?? '—',
        enrolled,
        marked: st.marked,
        unmarked: Math.max(enrolled - st.marked, 0),
        absent: st.absent,
      }
    }),
    page: opts.page,
    more: (data ?? []).length > pageSize,
  }
}

export async function loadClassRoster(db: DB, classId: string) {
  const { data: enrollments } = await db.from('enrollments').select('id, student_id, status').eq('class_id', classId).in('status', ['ACTIVE', 'PAUSED']).order('enrolled_at')
  const rows = enrollments ?? []
  const studentIds = rows.map(r => r.student_id)
  const { data: students } = studentIds.length
    ? await db.from('students').select('id, full_name, student_code').in('id', studentIds)
    : { data: [] as { id: string; full_name: string; student_code: string }[] }
  const studentMap = new Map((students ?? []).map(s => [s.id, s]))
  const roster = await Promise.all(rows.map(async enrollment => {
    const [{ data: levelRows }, { data: compatibility }] = await Promise.all([
      db.rpc('class_student_current_level', { p_class: classId, p_student: enrollment.student_id }),
      db.rpc('class_enrollment_compatibility', { p_class: classId, p_student: enrollment.student_id }),
    ])
    const level = Array.isArray(levelRows) ? levelRows[0] : levelRows
    const student = studentMap.get(enrollment.student_id)
    return {
      enrollmentId: enrollment.id,
      studentId: enrollment.student_id,
      studentName: student?.full_name ?? '—',
      studentCode: student?.student_code ?? '—',
      currentLevel: level?.level_name ?? '—',
      compatibility: (compatibility as string) ?? 'ACADEMIC_PROGRAM_MISSING',
    }
  }))
  return roster
}
