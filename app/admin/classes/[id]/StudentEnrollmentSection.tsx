import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { StatusBadge } from '@/app/admin/_components/vibe'
import { compatibilityLabels, compatibilityTone } from '../_ops/model'
import { loadClassRoster } from '../_ops/data'

import {
  enrollStudent,
  withdrawStudent,
} from './actions'

type StudentEnrollmentSectionProps = {
  classId: string
  capacity: number
}

export default async function StudentEnrollmentSection({
  classId,
  capacity,
}: StudentEnrollmentSectionProps) {
  const supabase = await createClient()
  const todayInVietnam = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const roster = await loadClassRoster(supabase, classId)

  const { data: students } = await supabase
    .from('students')
    .select('id, student_code, full_name, status')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true })
    .limit(200)

  const enrolledStudentIds = new Set(roster.map(row => row.studentId))
  const availableStudents = (students ?? []).filter(student => !enrolledStudentIds.has(student.id))
  const remainingSeats = Math.max(capacity - roster.length, 0)
  const distribution = new Map<string, number>()
  for (const row of roster) {
    distribution.set(row.currentLevel, (distribution.get(row.currentLevel) ?? 0) + 1)
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Danh sách học viên</h2>
          <p className="mt-1 text-sm text-gray-500">Trình độ hiện tại lấy từ Student Academic Program — không copy Course.level_id.</p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{roster.length} / {capacity}</span>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold">PHÂN BỐ TRÌNH ĐỘ</h3>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {[...distribution.entries()].map(([level, count]) => <li key={level}>{level}: {count}</li>)}
          {!distribution.size && <li className="text-gray-500">Chưa có học viên.</li>}
        </ul>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-gray-500"><tr><th className="py-2">Học viên</th><th>Trình độ hiện tại</th><th>Tương thích</th><th></th></tr></thead>
          <tbody>
            {roster.map(row => (
              <tr key={row.enrollmentId} className="border-t">
                <td className="py-2"><Link href={`/admin/students/${row.studentId}`}>{row.studentName}</Link><p className="text-xs text-gray-500">{row.studentCode}</p></td>
                <td>{row.currentLevel}</td>
                <td><StatusBadge tone={compatibilityTone(row.compatibility)}>{compatibilityLabels[row.compatibility] ?? row.compatibility}</StatusBadge></td>
                <td>
                  <form action={withdrawStudent}>
                    <input type="hidden" name="class_id" value={classId} />
                    <input type="hidden" name="enrollment_id" value={row.enrollmentId} />
                    <input type="hidden" name="student_id" value={row.studentId} />
                    <button className="rounded border px-2 py-1 text-xs">Rút</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!roster.length && <p className="mt-4 text-sm text-gray-500">Chưa có học viên trong lớp.</p>}

      <form action={enrollStudent} className="mt-6 space-y-3 border-t pt-4">
        <h3 className="font-medium">Ghi danh học viên mới</h3>
        <p className="text-xs text-gray-500">Chỉ IN_SCOPE được phép. Lớp chưa cấu hình phạm vi sẽ bị chặn ghi danh mới.</p>
        <input type="hidden" name="class_id" value={classId} />
        <select name="student_id" required className="w-full rounded border px-3 py-2" disabled={remainingSeats === 0}>
          <option value="">Chọn học viên</option>
          {availableStudents.map(student => <option key={student.id} value={student.id}>{student.full_name} ({student.student_code})</option>)}
        </select>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Ngày ghi danh<input type="date" name="enrolled_at" required defaultValue={todayInVietnam} className="ml-2 rounded border px-2 py-1" /></label>
          <label className="text-sm">Ngày bắt đầu<input type="date" name="started_at" required defaultValue={todayInVietnam} className="ml-2 rounded border px-2 py-1" /></label>
        </div>
        <button className="rounded bg-gray-950 px-4 py-2 text-sm text-white" disabled={remainingSeats === 0}>Ghi danh</button>
      </form>
    </section>
  )
}
