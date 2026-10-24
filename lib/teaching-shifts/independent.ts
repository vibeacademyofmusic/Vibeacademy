export const dayChoices = [
  { day: 1, label: 'Thứ 2', token: 'T2' },
  { day: 2, label: 'Thứ 3', token: 'T3' },
  { day: 3, label: 'Thứ 4', token: 'T4' },
  { day: 4, label: 'Thứ 5', token: 'T5' },
  { day: 5, label: 'Thứ 6', token: 'T6' },
  { day: 6, label: 'Thứ 7', token: 'T7' },
  { day: 7, label: 'Chủ nhật', token: 'CN' },
] as const

export const dayPresets = [
  { id: '2-4', label: '2–4', days: [1, 3] },
  { id: '3-5', label: '3–5', days: [2, 4] },
  { id: '2-3', label: '2–3', days: [1, 2] },
  { id: '4-5', label: '4–5', days: [3, 4] },
  { id: '2-4-6', label: '2–4–6', days: [1, 3, 5] },
] as const

export type ExistingShiftRow = {
  id: string
  code: string
  name: string
  branchId: string
  curriculumId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  dayCount: number
  roomId: string | null
  effectiveFrom: string
  effectiveTo: string | null
}

export type PlannedShift = {
  day: number
  dayLabel: string
  code: string
  name: string
  start: string
  end: string
  existing: { id: string; code: string; name: string; dayCount: number } | null
}

export type TimeWindow = { day: number; start: string; end: string }
export type KeyedWindow = TimeWindow & { key: number }

function byDay(left: KeyedWindow, right: KeyedWindow) {
  return left.day - right.day || left.key - right.key
}

export function toggleDayWindow(rows: KeyedWindow[], day: number, nextKey: number) {
  if (rows.some(row => row.day === day)) return { rows: rows.filter(row => row.day !== day), nextKey }
  return { rows: [...rows, { key: nextKey, day, start: '', end: '' }].sort(byDay), nextKey: nextKey + 1 }
}

export function selectPresetWindows(rows: KeyedWindow[], days: number[], nextKey: number) {
  let key = nextKey
  const next: KeyedWindow[] = []
  for (const day of days) {
    const kept = rows.filter(row => row.day === day)
    if (kept.length) next.push(...kept)
    else {
      next.push({ key, day, start: '', end: '' })
      key += 1
    }
  }
  return { rows: next.sort(byDay), nextKey: key }
}

export function addSameDayWindow(rows: KeyedWindow[], day: number, nextKey: number) {
  return { rows: [...rows, { key: nextKey, day, start: '', end: '' }].sort(byDay), nextKey: nextKey + 1 }
}

export function applyTimeToRemaining<T extends TimeWindow>(windows: T[], index: number): T[] {
  const source = windows[index]
  if (!source?.start || !source.end || clock(source.end) <= clock(source.start)) return windows
  return windows.map((window, position) => position === index ? window : { ...window, start: source.start, end: source.end })
}

export function windowProblems(windows: TimeWindow[]) {
  const incomplete = windows.some(window => !window.start || !window.end)
  const invalid = windows.some(window => Boolean(window.start && window.end && clock(window.end) <= clock(window.start)))
  const overlap = !incomplete && !invalid && weeklySelectionConflict(windows.map((window, index) => ({
    classId: `window-${index}`,
    day: window.day,
    start: window.start,
    end: window.end,
  })))
  return { incomplete, invalid, overlap }
}

export function clock(value: string) {
  return value.slice(0, 5)
}

export function shiftIdentityCode(programCode: string, day: number, start: string) {
  const token = dayChoices.find(choice => choice.day === day)?.token ?? `D${day}`
  const stamp = clock(start).replace(':', '')
  return `${programCode}-${token}-${stamp}`.replace(/[^A-Z0-9_-]/gi, '').toUpperCase().slice(0, 50)
}

export function shiftIdentityName(programName: string, day: number, start: string, end: string) {
  const label = dayChoices.find(choice => choice.day === day)?.label ?? `Thứ ${day}`
  return `${programName} · ${label} · ${clock(start)}–${clock(end)}`
}

function rangesOverlap(from: string, to: string | null, otherFrom: string, otherTo: string | null) {
  const end = to || '9999-12-31'
  const otherEnd = otherTo || '9999-12-31'
  return from <= otherEnd && end >= otherFrom
}

export function planIndependentShifts(input: {
  programCode: string
  programName: string
  branchId: string
  curriculumId: string
  days: number[]
  start: string
  end: string
  windows?: TimeWindow[]
  roomId?: string
  effectiveFrom?: string
  effectiveTo?: string | null
  existing: ExistingShiftRow[]
}): PlannedShift[] {
  const windows = input.windows?.filter(window => window.day >= 1 && window.day <= 7 && window.start && window.end)
  const planned = windows?.length
    ? windows
    : [...new Set(input.days.filter(day => day >= 1 && day <= 7))].sort((a, b) => a - b).map(day => ({ day, start: input.start, end: input.end }))
  const from = input.effectiveFrom || '0001-01-01'
  const to = input.effectiveTo ?? null
  return planned.map(window => {
    const sameSlot = input.existing.filter(row =>
      row.branchId === input.branchId
      && row.curriculumId === input.curriculumId
      && row.dayOfWeek === window.day
      && clock(row.startTime) === clock(window.start)
      && clock(row.endTime) === clock(window.end)
      && rangesOverlap(from, to, row.effectiveFrom || '0001-01-01', row.effectiveTo)
    )
    const match = input.roomId
      ? sameSlot.find(row => row.roomId === input.roomId) ?? null
      : null
    return {
      day: window.day,
      dayLabel: dayChoices.find(choice => choice.day === window.day)?.label ?? `Thứ ${window.day}`,
      code: shiftIdentityCode(input.programCode, window.day, window.start),
      name: shiftIdentityName(input.programName, window.day, window.start, window.end),
      start: clock(window.start),
      end: clock(window.end),
      existing: match ? { id: match.id, code: match.code, name: match.name, dayCount: match.dayCount } : null,
    }
  })
}

export type WeeklySession = { day: number; start: string; end: string; classId: string }

const labelDays: Record<string, number> = {
  'Thứ 2': 1,
  'Thứ 3': 2,
  'Thứ 4': 3,
  'Thứ 5': 4,
  'Thứ 6': 5,
  'Thứ 7': 6,
  'Chủ nhật': 7,
}

export function sessionsFromScheduleLabel(classId: string, label: string | null | undefined): WeeklySession[] {
  if (!label) return []
  return label.split(',').flatMap(part => {
    const match = part.trim().match(/^(Thứ [2-7]|Chủ nhật)\s+(\d{2}:\d{2})–(\d{2}:\d{2})$/)
    if (!match || !labelDays[match[1]]) return []
    return [{ classId, day: labelDays[match[1]], start: match[2], end: match[3] }]
  })
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string) {
  const minutes = (value: string) => {
    const [hours, mins] = value.slice(0, 5).split(':').map(Number)
    return hours * 60 + mins
  }
  return minutes(startA) < minutes(endB) && minutes(endA) > minutes(startB)
}

export function weeklySelectionConflict(sessions: WeeklySession[]) {
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const left = sessions[i]
      const right = sessions[j]
      if (left.classId !== right.classId && left.day === right.day && timesOverlap(left.start, left.end, right.start, right.end)) {
        return true
      }
    }
  }
  return false
}

export function weeklySessionCount(required: number | null | undefined, selected: number) {
  if (required == null || !Number.isInteger(required) || required < 1) return null
  return { selected, required, missing: Math.max(required - selected, 0) }
}
