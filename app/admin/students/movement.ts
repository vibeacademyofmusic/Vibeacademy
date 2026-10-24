export type MovementScope = {
  month: string
  start: string
  end: string
  next: string
}

export function monthWindow(month: string | undefined, today: string): MovementScope {
  const fallback = /^\d{4}-\d{2}-\d{2}$/.test(today) ? today.slice(0, 7) : '1970-01'
  const value = month && /^\d{4}-\d{2}$/.test(month) ? month : fallback
  const [year, mon] = value.split('-').map(Number)
  return {
    month: value,
    start: `${value}-01`,
    end: new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10),
    next: new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10),
  }
}

export function monthLabel(month: string) {
  const [year, mon] = month.split('-')
  return `Tháng ${mon}/${year}`
}

export function dateLabel(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return '—'
  const [year, mon, day] = value.slice(0, 10).split('-')
  return `${day}/${mon}/${year}`
}

export function distinctCount(ids: string[]) {
  return new Set(ids).size
}

const instrumentOrder = ['Piano', 'Guitar', 'Violin', 'Trống']

export function instrumentLabel(name: string | null | undefined, code?: string | null) {
  const text = `${code ?? ''} ${name ?? ''}`.toLowerCase()
  if (text.includes('drum') || text.includes('trống')) return 'Trống'
  if (text.includes('piano')) return 'Piano'
  if (text.includes('guitar')) return 'Guitar'
  if (text.includes('violin')) return 'Violin'
  return name?.trim() || 'Chưa gắn môn'
}

export type InstrumentShare = { name: string; students: number; share: string }

export function instrumentShares(
  assignments: { studentId: string; name: string | null; code?: string | null }[],
  totalStudents: number,
): InstrumentShare[] {
  const groups = new Map<string, Set<string>>()
  const assigned = new Set<string>()
  for (const row of assignments) {
    const label = instrumentLabel(row.name, row.code)
    if (label === 'Chưa gắn môn') continue
    assigned.add(row.studentId)
    const ids = groups.get(label) ?? new Set<string>()
    ids.add(row.studentId)
    groups.set(label, ids)
  }
  const rows = [...groups.entries()].map(([name, ids]) => ({ name, students: ids.size }))
  rows.sort((left, right) => {
    const leftRank = instrumentOrder.indexOf(left.name)
    const rightRank = instrumentOrder.indexOf(right.name)
    if (leftRank !== -1 || rightRank !== -1) return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank)
    return right.students - left.students || left.name.localeCompare(right.name, 'vi')
  })
  const missing = Math.max(0, totalStudents - assigned.size)
  if (missing > 0) rows.push({ name: 'Chưa gắn môn', students: missing })
  const share = (students: number) => totalStudents > 0 ? `${Math.round((students / totalStudents) * 100)}%` : '—'
  return rows.map(row => ({ ...row, share: share(row.students) }))
}
