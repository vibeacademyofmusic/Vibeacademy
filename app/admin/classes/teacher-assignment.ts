export type StoredClassTeacher = {
  id: string
  teacher_id: string
  teacher_role: string
  is_active: boolean
  assigned_at: string
  ended_at: string | null
}

export type ClassTeacherPlan =
  | { kind: 'unchanged' }
  | { kind: 'refused'; reason: 'history_gap' | 'same_day_start' }
  | { kind: 'assign'; assignedAt: string; closeId: string | null; closeOn: string | null }

function dayBefore(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10)
}

export function planClassTeacherAssignment(
  rows: StoredClassTeacher[],
  input: { teacherId: string; role: 'PRIMARY' | 'ASSISTANT'; assignedAt: string },
): ClassTeacherPlan {
  const assignedAt = input.assignedAt
  const sameTeacher = rows.find((row) => row.teacher_id === input.teacherId)
  if (sameTeacher) {
    const open = sameTeacher.is_active && !sameTeacher.ended_at
    if (open && sameTeacher.teacher_role === input.role) return { kind: 'unchanged' }
    return { kind: 'refused', reason: 'history_gap' }
  }

  if (input.role !== 'PRIMARY') {
    return { kind: 'assign', assignedAt, closeId: null, closeOn: null }
  }

  const current = rows.find((row) => row.teacher_role === 'PRIMARY' && row.is_active && !row.ended_at)
  if (!current) return { kind: 'assign', assignedAt, closeId: null, closeOn: null }

  const closeOn = dayBefore(assignedAt)
  if (current.assigned_at > closeOn) return { kind: 'refused', reason: 'same_day_start' }
  return { kind: 'assign', assignedAt, closeId: current.id, closeOn }
}

export function primaryOnDate(rows: StoredClassTeacher[], date: string) {
  const matches = rows.filter((row) =>
    row.teacher_role === 'PRIMARY'
    && row.assigned_at <= date
    && (!row.ended_at || row.ended_at >= date)
    && (row.is_active || row.ended_at !== null)
  )
  return matches.length === 1 ? matches[0].teacher_id : null
}
