import SessionTeacher from '../session-teachers/SessionTeacher'
import { createClient } from '@/lib/supabase/server'
import { displayLabel } from '@/lib/display'
import JournalForm from './JournalForm'
import type { Journal } from './types'

export default async function SessionJournals({ occurrenceId }: { occurrenceId: string }) {
  const supabase = await createClient()
  const { data: attendance, error } = await supabase.from('attendance_records')
    .select('id, status, enrollments!inner(students!inner(full_name, student_code))')
    .eq('session_occurrence_id', occurrenceId).order('created_at')
  if (error) return <p role="alert" className="rounded-xl bg-red-50 p-5 text-red-700">Không thể tải học viên để ghi nhật ký.</p>
  const { data: journals, error: journalError } = attendance?.length
    ? await supabase.from('learning_journals').select('*').in('attendance_record_id', attendance.map(row => row.id))
    : { data: [], error: null }
  return (
    <section id="learning-journals" className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-xl font-semibold">Nhật ký học tập</h2>
      <SessionTeacher id={occurrenceId} readOnly />
      <p className="mt-2 text-sm text-gray-600">Ghi nội dung theo từng học viên sau khi lưu điểm danh. Với học viên vắng, chỉ ghi nhận hướng dẫn hoặc bài tập gửi về, không ghi nhận như đã tham gia học.</p>
      {journalError ? <p role="alert" className="mt-4 text-red-700">Nhật ký chưa khả dụng. Vui lòng liên hệ quản trị viên để kiểm tra hệ thống.</p>
        : !attendance?.length ? <p className="mt-4 text-sm text-gray-500">Hãy lưu điểm danh để bắt đầu ghi nhật ký cho buổi học này.</p>
          : attendance.map(row => {
            const enrollment = Array.isArray(row.enrollments) ? row.enrollments[0] : row.enrollments
            const student = Array.isArray(enrollment.students) ? enrollment.students[0] : enrollment.students
            const journal = (journals as Journal[]).find(item => item.attendance_record_id === row.id)
            return (
              <details key={row.id} className="mt-4 rounded-xl border border-gray-200 p-4">
                <summary className="cursor-pointer font-medium">{student.full_name} · {student.student_code} · {displayLabel(row.status)}
                  <span className={`ml-2 text-sm ${journal ? 'text-green-700' : 'text-gray-500'}`}>{journal ? 'Đã có nhật ký' : 'Chưa ghi nhật ký'}</span>
                </summary>
                <JournalForm attendanceId={row.id} journal={journal} />
              </details>
            )
          })}
    </section>
  )
}
