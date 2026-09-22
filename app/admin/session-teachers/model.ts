export const assignmentPageSize = 25
export const assignmentWindowCap = 400

export const assignmentTabs = [
  ['needed', 'Cần phân công'],
  ['active', 'Đang giảng dạy'],
  ['teachers', 'Giáo viên'],
  ['warnings', 'Cảnh báo'],
] as const

export type AssignmentTab = (typeof assignmentTabs)[number][0]

export type AssignmentSession = {
  session_id: string
  class_id: string
  branch_id: string
  occurrence_date: string
  starts_at: string
  ends_at: string
  status: string
  teacher_id: string | null
  primary_teacher_id: string | null
  assignment_type: string | null
  reason: string | null
  is_locked: boolean
}

export type AssignmentWarning = {
  code: 'CLASS_NO_PRIMARY_TEACHER' | 'SESSION_NO_ACTUAL_TEACHER' | 'TEACHER_BRANCH_MISMATCH' | 'SCHEDULE_CONFLICT' | 'SUBSTITUTE_WITHOUT_REASON' | 'LOCK_STATE_INCONSISTENCY'
  sessionId: string
  teacherId: string | null
  classId: string
  startsAt: string
  text: string
}

export type ClassTeacherAssignment = {
  class_id: string
  teacher_id: string
  teacher_role: string
  is_active: boolean
  assigned_at: string
  ended_at: string | null
  branch_id: string
}

export type ClassPrimaryNeed = {
  classId: string
  branchId: string
  futureCount: number
  nearestStartsAt: string
  nearestDate: string
  nearestSessionId: string
}

const keptParams = ['tab', 'branch', 'teacher', 'from', 'to', 'status', 'page'] as const

export function vietnamToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function warningLabel(code: string) {
  if (code === 'CLASS_NO_PRIMARY_TEACHER') return 'Lớp chưa có giáo viên chính'
  if (code === 'SESSION_NO_ACTUAL_TEACHER') return 'Buổi chưa có giáo viên'
  if (code === 'TEACHER_BRANCH_MISMATCH') return 'Lệch chi nhánh'
  if (code === 'SCHEDULE_CONFLICT') return 'Trùng lịch'
  if (code === 'SUBSTITUTE_WITHOUT_REASON') return 'Thiếu lý do dạy thay'
  if (code === 'LOCK_STATE_INCONSISTENCY') return 'Lệch trạng thái khóa'
  return '—'
}

export function assignmentTypeLabel(type: string | null | undefined) {
  if (type === 'SUBSTITUTE') return 'Dạy thay'
  if (type === 'OVERRIDE') return 'Phân công riêng'
  if (type === 'PRIMARY') return 'Chính'
  return '—'
}

export function sessionStatusLabel(session: Pick<AssignmentSession, 'status' | 'is_locked'>) {
  if (session.is_locked || session.status === 'COMPLETED') return 'Đã khóa'
  if (session.status === 'CANCELLED') return 'Đã hủy'
  if (session.status === 'SCHEDULED') return 'Đã lên lịch'
  return '—'
}

export function needsAssignment(session: AssignmentSession, today: string) {
  return session.status === 'SCHEDULED'
    && !session.is_locked
    && !session.teacher_id
    && session.occurrence_date >= today
}

export function isCurrentTeaching(session: AssignmentSession, today: string) {
  return session.status === 'SCHEDULED' && session.occurrence_date >= today && !!session.teacher_id
}

export function isOperationalSubstitute(session: AssignmentSession, today: string) {
  return session.assignment_type === 'SUBSTITUTE' && isCurrentTeaching(session, today)
}

export function classesNeedingPrimary(sessions: AssignmentSession[], today: string) {
  const byClass = new Map<string, AssignmentSession[]>()
  for (const session of sessions) {
    if (session.status !== 'SCHEDULED' || session.is_locked || session.occurrence_date < today) continue
    const list = byClass.get(session.class_id) ?? []
    list.push(session)
    byClass.set(session.class_id, list)
  }
  const needs: ClassPrimaryNeed[] = []
  for (const [classId, list] of byClass) {
    if (list.some((session) => session.primary_teacher_id)) continue
    const nearest = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.session_id.localeCompare(b.session_id))[0]
    needs.push({
      classId,
      branchId: nearest.branch_id,
      futureCount: list.length,
      nearestStartsAt: nearest.starts_at,
      nearestDate: nearest.occurrence_date,
      nearestSessionId: nearest.session_id,
    })
  }
  return needs.sort((a, b) => a.nearestStartsAt.localeCompare(b.nearestStartsAt) || a.classId.localeCompare(b.classId))
}

export function assignmentWarnings(sessions: AssignmentSession[], today: string, eligibleBranches: Set<string>, conflictSessions: AssignmentSession[] = sessions) {
  const warnings: AssignmentWarning[] = []
  const missingPrimary = classesNeedingPrimary(sessions, today)
  const missingClasses = new Set(missingPrimary.map((item) => item.classId))
  for (const item of missingPrimary) {
    warnings.push({
      code: 'CLASS_NO_PRIMARY_TEACHER',
      sessionId: item.nearestSessionId,
      teacherId: null,
      classId: item.classId,
      startsAt: item.nearestStartsAt,
      text: 'Lớp chưa có giáo viên chính. Buổi tương lai chưa resolve được giáo viên từ phân công lớp.',
    })
  }
  for (const session of sessions) {
    if (needsAssignment(session, today) && !missingClasses.has(session.class_id)) {
      warnings.push({
        code: 'SESSION_NO_ACTUAL_TEACHER',
        sessionId: session.session_id,
        teacherId: session.teacher_id,
        classId: session.class_id,
        startsAt: session.starts_at,
        text: 'Buổi này chưa resolve được giáo viên thực tế. Phân công lớp không thay cho ngoại lệ của buổi.',
      })
    }
    if (
      session.status === 'SCHEDULED'
      && !session.is_locked
      && session.occurrence_date >= today
      && session.teacher_id
      && !eligibleBranches.has(`${session.teacher_id}:${session.branch_id}`)
    ) {
      warnings.push({
        code: 'TEACHER_BRANCH_MISMATCH',
        sessionId: session.session_id,
        teacherId: session.teacher_id,
        classId: session.class_id,
        startsAt: session.starts_at,
        text: 'Giáo viên thực tế không còn liên kết chi nhánh của buổi sắp dạy.',
      })
    }
    if (session.assignment_type === 'SUBSTITUTE' && !session.reason?.trim()) {
      warnings.push({
        code: 'SUBSTITUTE_WITHOUT_REASON',
        sessionId: session.session_id,
        teacherId: session.teacher_id,
        classId: session.class_id,
        startsAt: session.starts_at,
        text: 'Phân công dạy thay không có lý do.',
      })
    }
    if ((session.status === 'COMPLETED' && !session.is_locked) || (session.is_locked && session.status !== 'COMPLETED')) {
      warnings.push({
        code: 'LOCK_STATE_INCONSISTENCY',
        sessionId: session.session_id,
        teacherId: session.teacher_id,
        classId: session.class_id,
        startsAt: session.starts_at,
        text: 'Trạng thái hoàn tất và khóa phân công không khớp.',
      })
    }
  }
  const visible = new Set(sessions.map((session) => session.session_id))
  const open = conflictSessions.filter((session) => session.status === 'SCHEDULED' && session.teacher_id)
  const byTeacher = new Map<string, AssignmentSession[]>()
  for (const session of open) {
    const list = byTeacher.get(session.teacher_id!) ?? []
    list.push(session)
    byTeacher.set(session.teacher_id!, list)
  }
  for (const list of byTeacher.values()) {
    const overlapping = new Map<string, AssignmentSession>()
    const crossBranch = new Set<string>()
    for (let left = 0; left < list.length; left += 1) {
      for (let right = left + 1; right < list.length; right += 1) {
        const a = list[left]
        const b = list[right]
        if (a.starts_at < b.ends_at && b.starts_at < a.ends_at) {
          overlapping.set(a.session_id, a)
          overlapping.set(b.session_id, b)
          if (a.branch_id !== b.branch_id) {
            crossBranch.add(a.session_id)
            crossBranch.add(b.session_id)
          }
        }
      }
    }
    for (const [sessionId, session] of overlapping) {
      if (!visible.has(sessionId)) continue
      warnings.push({
        code: 'SCHEDULE_CONFLICT',
        sessionId,
        teacherId: session.teacher_id,
        classId: session.class_id,
        startsAt: session.starts_at,
        text: crossBranch.has(sessionId)
          ? 'Trùng lịch với một buổi tại chi nhánh khác.'
          : 'Cùng giáo viên có hai buổi chồng giờ.',
      })
    }
  }
  return warnings
}

export function warningSessionCount(warnings: AssignmentWarning[]) {
  return new Set(warnings.map((warning) => warning.sessionId)).size
}

export function measuredMinutes(session: Pick<AssignmentSession, 'starts_at' | 'ends_at'>) {
  const start = Date.parse(session.starts_at)
  const end = Date.parse(session.ends_at)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return Math.round((end - start) / 60000)
}

function coversDate(row: ClassTeacherAssignment, today: string) {
  return row.is_active && row.assigned_at <= today && (!row.ended_at || row.ended_at >= today)
}

export function teacherWorkloads(sessions: AssignmentSession[], assignments: ClassTeacherAssignment[], today: string) {
  const grouped = new Map<string, AssignmentSession[]>()
  for (const session of sessions) {
    if (!session.teacher_id || session.status === 'CANCELLED') continue
    const list = grouped.get(session.teacher_id) ?? []
    list.push(session)
    grouped.set(session.teacher_id, list)
  }
  const assignmentGroups = new Map<string, ClassTeacherAssignment[]>()
  for (const row of assignments) {
    if (!coversDate(row, today)) continue
    const list = assignmentGroups.get(row.teacher_id) ?? []
    list.push(row)
    assignmentGroups.set(row.teacher_id, list)
  }
  const teacherIds = new Set([...grouped.keys(), ...assignmentGroups.keys()])
  return [...teacherIds].map((teacherId) => {
    const list = grouped.get(teacherId) ?? []
    const roles = assignmentGroups.get(teacherId) ?? []
    const upcoming = list.filter((session) => session.status === 'SCHEDULED' && session.occurrence_date >= today)
    const parts = upcoming.map((session) => measuredMinutes(session))
    const minutes = parts.some((value) => value === null) ? null : parts.reduce<number>((total, value) => total + (value ?? 0), 0)
    return {
      teacherId,
      primaryClasses: new Set(roles.filter((row) => row.teacher_role === 'PRIMARY').map((row) => row.class_id)).size,
      assistantClasses: new Set(roles.filter((row) => row.teacher_role === 'ASSISTANT').map((row) => row.class_id)).size,
      upcoming: upcoming.length,
      substitute: list.filter((session) => session.assignment_type === 'SUBSTITUTE').length,
      branches: [...new Set([
        ...roles.map((row) => row.branch_id),
        ...list.map((session) => session.branch_id),
      ])],
      minutes,
    }
  }).sort((a, b) => b.upcoming - a.upcoming || b.primaryClasses - a.primaryClasses || a.teacherId.localeCompare(b.teacherId))
}

export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours} giờ ${rest} phút`
  if (hours) return `${hours} giờ`
  return `${rest} phút`
}

export function assignmentQuery(params: Record<string, string | undefined>, patch: Record<string, string | undefined> = {}) {
  const merged = { ...params, ...patch }
  const query = new URLSearchParams()
  for (const key of keptParams) {
    const value = merged[key]
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `/admin/session-teachers?${text}` : '/admin/session-teachers'
}
