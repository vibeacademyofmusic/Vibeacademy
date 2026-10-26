export const calendarZone = 'Asia/Ho_Chi_Minh'
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: calendarZone, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: calendarZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
export const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
export const periods = [
  { id: 'morning', label: 'Sáng', range: 'Trước 12:00' },
  { id: 'afternoon', label: 'Chiều', range: '12:00–17:59' },
  { id: 'evening', label: 'Tối', range: 'Từ 18:00' },
] as const
export type CalendarRoster = { enrollment_id: string; student_id: string; name: string; attendance: string | null }
export type CalendarSlot = {
  id: string; session_id: string | null; schedule_id: string; class_id: string
  roster_date: string; starts_at: string; ends_at: string; original_starts_at: string | null
  status: 'PLANNED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'; occurrence_type: 'REGULAR' | 'MAKEUP'
  class_name: string; class_code: string; branch_id: string; branch_name: string
  curriculum_id: string | null; program_name: string
  room_id: string | null; room_name: string | null; room_capacity: number | null; class_capacity: number | null
  teacher_id: string | null; teacher_name: string | null; assignment_type: string | null
  roster: CalendarRoster[]
}
export type CalendarSnapshot = { version: 1; monday: string; snapshot_at: string; branches: { id: string; name: string }[]; rows: CalendarSlot[] }

export function validCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '2000-01-01' || value > '2100-12-31') return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export function localDate(value: string) {
  // Locale punctuation/order differs between browser and server ICU versions.
  // Dates also act as map keys, so construct the ISO date from named parts.
  const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function localTime(value: string) {
  const parts = Object.fromEntries(timeFormatter.formatToParts(new Date(value)).map(part => [part.type, part.value]))
  return `${parts.hour}:${parts.minute}`
}

export function periodFor(value: string) {
  const hour = Number(localTime(value).slice(0, 2))
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
}

export function slotCapacity(row: CalendarSlot) {
  if (row.class_capacity === null || row.room_capacity === null) return null
  return Math.min(row.class_capacity, row.room_capacity)
}

export function slotCounts(row: CalendarSlot) {
  const marked = row.roster.filter(item => item.attendance !== null).length
  const present = row.roster.filter(item => item.attendance === 'PRESENT' || item.attendance === 'LATE').length
  const absent = row.roster.filter(item => item.attendance === 'ABSENT' || item.attendance === 'EXCUSED').length
  return { total: row.roster.length, marked, present, absent, unmarked: row.roster.length - marked }
}

export function slotState(row: CalendarSlot, now: string) {
  if (row.status === 'PLANNED') return 'Dự kiến · chưa tạo buổi'
  if (row.status === 'CANCELLED') return 'Đã hủy'
  if (row.status === 'COMPLETED') return 'Đã ghi nhận hoàn tất'
  if (Date.parse(row.starts_at) > Date.parse(now)) return 'Sắp đến giờ'
  if (Date.parse(row.ends_at) > Date.parse(now)) return 'Trong khung giờ học'
  return 'Đã qua giờ · chưa hoàn tất'
}

export function calendarIssues(rows: CalendarSlot[], now: string) {
  const result = new Map<string, string[]>()
  for (const row of rows) {
    const issues: string[] = []
    if (row.status !== 'CANCELLED') {
      if (!row.room_id) issues.push('Chưa gắn phòng')
      if (!row.teacher_id) issues.push('Chưa xác định giáo viên')
      const capacity = slotCapacity(row)
      if (capacity === null) issues.push('Chưa đủ thông tin sức chứa')
      else if (row.roster.length > capacity) issues.push('Vượt sức chứa')
      if (new Set(row.roster.map(person => person.student_id)).size !== row.roster.length) issues.push('Trùng học viên trong danh sách buổi')
      if (row.session_id && Date.parse(row.ends_at) <= Date.parse(now) && slotCounts(row).unmarked > 0) issues.push('Chưa điểm danh đủ')
      if (row.room_id && rows.some(other => other.id !== row.id && other.status !== 'CANCELLED' && other.room_id === row.room_id &&
        Date.parse(row.starts_at) < Date.parse(other.ends_at) && Date.parse(other.starts_at) < Date.parse(row.ends_at))) issues.push('Chồng lịch phòng')
    }
    result.set(row.id, issues)
  }
  return result
}

export function calendarTotals(rows: CalendarSlot[]) {
  const active = rows.filter(row => row.status !== 'CANCELLED')
  return {
    sessions: active.filter(row => row.session_id !== null).length,
    planned: active.filter(row => row.status === 'PLANNED').length,
    cancelled: rows.length - active.length,
    visits: active.reduce((sum, row) => sum + row.roster.length, 0),
    students: new Set(active.flatMap(row => row.roster.map(person => person.student_id))).size,
  }
}

// An invalid/mismatched payload is an error, never an empty calendar with zero totals.
export function parseCalendarSnapshot(input: unknown): CalendarSnapshot {
  const fail = () => { throw new Error('CALENDAR_RESPONSE_INVALID') }
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0
  const nullableText = (v: unknown) => v === null || text(v)
  const timestamp = (v: unknown): v is string => text(v) && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
  const capacity = (v: unknown) => v === null || (Number.isInteger(v) && Number(v) > 0)
  if (!object(input) || input.version !== 1 || !validCalendarDate(String(input.monday)) || new Date(`${input.monday}T12:00:00Z`).getUTCDay() !== 1 || !timestamp(input.snapshot_at) || !Array.isArray(input.rows) || !Array.isArray(input.branches)) return fail()
  for (const b of input.branches) if (!object(b) || !text(b.id) || !text(b.name)) return fail()
  const ids = new Set<string>()
  for (const row of input.rows) {
    if (!object(row) || !['id','schedule_id','class_id','class_name','class_code','branch_id','branch_name','program_name'].every(key => text(row[key])) ||
      !['session_id','room_id','room_name','teacher_id','teacher_name','curriculum_id','assignment_type'].every(key => nullableText(row[key])) ||
      !validCalendarDate(String(row.roster_date)) || !timestamp(row.starts_at) || !timestamp(row.ends_at) || Date.parse(row.ends_at) <= Date.parse(row.starts_at) ||
      !(row.original_starts_at === null || timestamp(row.original_starts_at)) || !capacity(row.class_capacity) || !capacity(row.room_capacity) ||
      !['PLANNED','SCHEDULED','COMPLETED','CANCELLED'].includes(String(row.status)) || !['REGULAR','MAKEUP'].includes(String(row.occurrence_type)) || !Array.isArray(row.roster)) return fail()
    if ((row.status === 'PLANNED') !== (row.session_id === null) || ids.has(String(row.id))) return fail()
    ids.add(String(row.id))
    if (localDate(row.starts_at) < String(input.monday) || localDate(row.starts_at) >= addDays(String(input.monday), 7)) return fail()
    const enrollmentIds = new Set<string>()
    for (const person of row.roster) {
      if (!object(person) || !text(person.enrollment_id) || !text(person.student_id) || !text(person.name) ||
        ![null,'PRESENT','LATE','ABSENT','EXCUSED'].includes(person.attendance as string | null) || enrollmentIds.has(person.enrollment_id)) return fail()
      enrollmentIds.add(person.enrollment_id)
    }
  }
  return input as CalendarSnapshot
}
