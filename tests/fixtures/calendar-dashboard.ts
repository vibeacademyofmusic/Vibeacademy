import type { CalendarSlot, CalendarSnapshot } from '../../app/admin/coordination/calendar-model'

// Synthetic only. This fixture is never imported by an application route in source control.
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const rows: CalendarSlot[] = []
for (let day = 0; day < 7; day++) {
  for (const [period, hour] of [[0, 9], [1, 16], [2, 18]]) {
    if ((day + period) % 3 === 0) continue
    const n = day * 3 + period
    const program = ['Piano', 'Guitar', 'Violin'][n % 3]
    rows.push({ id: uid(100 + n), session_id: n % 3 === 1 ? null : uid(100 + n), schedule_id: uid(200 + n), class_id: uid(300 + n),
      roster_date: new Date(Date.UTC(2026, 9, 26 + day)).toISOString().slice(0, 10), starts_at: new Date(Date.UTC(2026, 9, 26 + day, hour - 7)).toISOString(), ends_at: new Date(Date.UTC(2026, 9, 26 + day, hour - 7 + 1, 30)).toISOString(),
      original_starts_at: n === 5 ? '2026-10-26T09:00:00Z' : null, status: n % 3 === 1 ? 'PLANNED' : n === 8 ? 'CANCELLED' : 'SCHEDULED', occurrence_type: n === 2 ? 'MAKEUP' : 'REGULAR',
      class_name: `Ca minh họa ${n}`, class_code: `DEMO-${n}`, branch_id: uid(1), branch_name: 'Cần Thơ · Minh họa', curriculum_id: uid(400 + n % 3), program_name: program,
      room_id: uid(500 + n % 6), room_name: `${program} ${n % 2 + 1}`, room_capacity: 6, class_capacity: 6,
      teacher_id: n === 3 ? null : uid(600 + n % 2), teacher_name: n === 3 ? null : `Giáo viên minh họa ${n % 2 + 1}`, assignment_type: 'PRIMARY',
      roster: Array.from({ length: n % 4 + 2 }, (_, i) => ({ enrollment_id: uid(1000 + n * 10 + i), student_id: uid(900 + i), name: `Học viên minh họa ${i + 1}`, attendance: n === 0 && i === 0 ? 'PRESENT' : null })),
    })
  }
}
const seed = rows.find(row => row.status === 'PLANNED')!
for (let index = 0; index < 4; index++) rows.push({ ...seed, id: uid(700 + index), class_code: `DEMO-DENSE-${index}`, room_id: uid(5000 + index), room_name: `Phòng minh họa ${index + 1}`, class_id: uid(800 + index), schedule_id: uid(850 + index) })
rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
export const calendarDashboardFixture: CalendarSnapshot = { version: 1, monday: '2026-10-26', snapshot_at: '2026-10-26T10:40:00Z', branches: [{ id: uid(1), name: 'Cần Thơ · Minh họa' }], rows }
