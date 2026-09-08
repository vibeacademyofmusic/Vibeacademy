import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { observations } from './types'

export default async function StudentJournals({ studentId }: { studentId: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('learning_journals')
    .select('id, content, repertoire, skills, homework, notes, observation, updated_at, attendance_records!inner(session_occurrence_id, enrollments!inner(student_id, classes(name)), session_occurrences!inner(starts_at))')
    .eq('attendance_records.enrollments.student_id', studentId)
    .order('updated_at', { ascending: false }).limit(20)
  return (
    <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Nhật ký học tập</h2>
      <p className="mt-1 text-sm text-gray-500">20 nhật ký được cập nhật gần nhất. Mở buổi học để xem hoặc chỉnh sửa.</p>
      {error ? <p role="alert" className="mt-3 text-red-700">Chưa thể tải nhật ký học tập. Vui lòng liên hệ quản trị viên.</p>
        : !data?.length ? <p className="mt-3 text-sm text-gray-500">Chưa có nhật ký học tập.</p>
          : data.map(item => {
            const attendance = Array.isArray(item.attendance_records) ? item.attendance_records[0] : item.attendance_records
            const enrollment = Array.isArray(attendance.enrollments) ? attendance.enrollments[0] : attendance.enrollments
            const classItem = Array.isArray(enrollment.classes) ? enrollment.classes[0] : enrollment.classes
            const session = Array.isArray(attendance.session_occurrences) ? attendance.session_occurrences[0] : attendance.session_occurrences
            return (
              <article key={item.id} className="mt-4 border-t border-gray-100 pt-4">
                <Link className="font-medium text-blue-700 underline" href={`/admin/attendance/${attendance.session_occurrence_id}#learning-journals`}>
                  {classItem?.name ?? 'Lớp học'} · {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(session.starts_at))}
                </Link>
                <p className="mt-2 text-sm text-gray-500">{observations[item.observation as keyof typeof observations] ?? 'Chưa nhận xét'}</p>
                <dl className="mt-2 space-y-2 text-sm">
                  {([['Nội dung học', item.content], ['Bài học / Tác phẩm', item.repertoire], ['Kỹ năng', item.skills], ['Bài tập về nhà', item.homework], ['Ghi chú', item.notes]] as const).map(([label, value]) => value && (
                    <div key={label}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap break-words text-gray-600">{value}</dd></div>
                  ))}
                </dl>
              </article>
            )
          })}
    </section>
  )
}
