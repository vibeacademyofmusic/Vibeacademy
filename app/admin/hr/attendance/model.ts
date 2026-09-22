import type { Shift } from '../../employees/attendance/data'

export type Evidence = {
  work_date: string
  shift_code: string
  status: string
  checker: string | null
  qr_verified?: boolean
  reason?: string | null
  created_at?: string
  revision?: number
  arrived_at?: string | null
  departed_at?: string | null
  late_minutes?: number
  early_minutes?: number
  actor?: string | null
}

export type Request = {
  id: string
  work_date: string
  shift_code: string
  proposed_status: string
  reason: string
  status?: string
}

export type DayState =
  | 'worked'
  | 'qr'
  | 'missing'
  | 'leave'
  | 'off'
  | 'future'
  | 'pending'
  | 'exception'
  | 'late'
  | 'unavailable'

export const stateNames:
  Record<DayState, string> = {
    worked: 'Đã xác nhận',
    qr: 'Đã xác nhận bằng QR',
    missing: 'Thiếu bằng chứng',
    leave: 'Nghỉ phép đã duyệt',
    off: 'Không có ca',
    future: 'Ngày tương lai',
  pending: 'Chờ điều chỉnh',
  exception: 'Công tác / ngoại lệ',
  late: 'Đi muộn / về sớm',
  unavailable: 'Chưa tải nguồn',
}

export function dayState(
  date: string,
  today: string,
  shifts: Shift[],
  entries: Evidence[],
  requests: Request[],
  reviewed: Set<string>,
): DayState {
  if (
    requests.some(
      (r) =>
        r.work_date === date
        && !reviewed.has(r.id),
    )
  ) {
    return 'pending'
  }

  if (date > today) {
    return 'future'
  }

  const scheduled = shifts.filter(
    (s) =>
      s.work_date === date
      && s.scheduled_minutes > 0,
  )

  if (!scheduled.length) {
    return 'off'
  }

  const actual = scheduled.map(
    (s) =>
      entries.find(
        (e) =>
          e.work_date === date
          && e.shift_code
            === s.shift_code,
      ),
  )

  if (
    actual.some(
      (e) =>
        !e
        || (
          !e.checker
          && !e.qr_verified
        ),
    )
  ) {
    return 'missing'
  }

  if (
    actual.every(
      (e) =>
        e
        && [
          'PAID_LEAVE',
          'UNPAID_LEAVE',
        ].includes(e.status),
    )
  ) {
    return 'leave'
  }

  if (
    actual.every(
      (e) =>
        e
        && [
          'WORKED',
          'BUSINESS_TRIP',
        ].includes(e.status),
    )
  ) {
    return actual.every(
      (e) => e?.qr_verified,
    )
      ? 'qr'
      : 'worked'
  }

  if (
    actual.every(
      (e) =>
        e
        && [
          'LATE',
          'EARLY_LEAVE',
        ].includes(e.status),
    )
  ) {
    return 'late'
  }

  return 'exception'
}

export type TodayMetrics = {
  scheduled: number | null
  checkedIn: number | null
  completed: number | null
  missing: number | null
  lateEarly: number | null
}

type MetricPerson = {
  unavailable: boolean
  schedule: Shift[]
  entries: Evidence[]
  requests: Request[]
  reviewed: string[]
  name: string
  id: string
}

export function todayMetrics(
  people: MetricPerson[],
  today: string,
): TodayMetrics {
  const available = people.filter(
    (person) => !person.unavailable,
  )

  if (!available.length) {
    return {
      scheduled: people.length ? null : 0,
      checkedIn: people.length ? null : 0,
      completed: people.length ? null : 0,
      missing: people.length ? null : 0,
      lateEarly: people.length ? null : 0,
    }
  }

  let scheduled = 0
  let checkedIn = 0
  let completed = 0
  let missing = 0
  let lateEarly = 0

  for (const person of available) {
    const shifts = person.schedule.filter(
      (shift) =>
        shift.work_date === today
        && shift.scheduled_minutes > 0,
    )
    const entries = person.entries.filter(
      (entry) => entry.work_date === today,
    )

    if (shifts.length) scheduled += 1

    if (
      entries.some(
        (entry) => entry.arrived_at,
      )
    ) {
      checkedIn += 1
    }

    if (
      shifts.length
      && shifts.every((shift) => {
        const entry = entries.find(
          (item) =>
            item.shift_code
            === shift.shift_code,
        )
        return Boolean(
          entry
          && (
            entry.checker
            || entry.qr_verified
          ),
        )
      })
    ) {
      completed += 1
    }

    if (
      dayState(
        today,
        today,
        person.schedule,
        person.entries,
        person.requests,
        new Set(person.reviewed),
      ) === 'missing'
    ) {
      missing += 1
    }

    if (
      entries.some(
        (entry) =>
          entry.status === 'LATE'
          || entry.status
            === 'EARLY_LEAVE',
      )
    ) {
      lateEarly += 1
    }
  }

  return {
    scheduled,
    checkedIn,
    completed,
    missing,
    lateEarly,
  }
}

export type AttendanceIssue = {
  key: string
  name: string
  detail: string
}

export function attendanceIssues(
  people: MetricPerson[],
  today: string,
  days: string[],
): AttendanceIssue[] {
  const issues: AttendanceIssue[] = []

  for (const person of people) {
    if (person.unavailable) continue

    for (const request of person.requests) {
      if (
        request.work_date <= today
        && !person.reviewed.includes(
          request.id,
        )
      ) {
        issues.push({
          key:
            person.id
            + ':request:'
            + request.id,
          name: person.name,
          detail:
            'Chờ điều chỉnh · '
            + request.work_date,
        })
      }
    }

    for (const entry of person.entries) {
      if (entry.work_date > today) continue
      if (
        entry.status !== 'LATE'
        && entry.status !== 'EARLY_LEAVE'
      ) {
        continue
      }

      issues.push({
        key:
          person.id
          + ':late:'
          + entry.work_date
          + entry.shift_code,
        name: person.name,
        detail:
          entry.work_date
          + ' · Đi muộn '
          + (entry.late_minutes ?? 0)
          + ' phút, về sớm '
          + (entry.early_minutes ?? 0)
          + ' phút'
          + (
            entry.qr_verified
              ? ' · QR hệ thống'
              : entry.checker
                ? ' · Duyệt thủ công'
                : ''
          ),
      })
    }

    for (const date of days) {
      if (date >= today) continue
      if (
        dayState(
          date,
          today,
          person.schedule,
          person.entries,
          person.requests,
          new Set(person.reviewed),
        ) === 'missing'
      ) {
        issues.push({
          key:
            person.id
            + ':missing:'
            + date,
          name: person.name,
          detail:
            date
            + ' · Thiếu bằng chứng',
        })
      }
    }
  }

  return issues.slice(0, 30)
}
