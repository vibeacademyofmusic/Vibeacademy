'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { observations, type JournalState } from './types'

export async function saveJournal(_state: JournalState, form: FormData): Promise<JournalState> {
  const supabase = await createClient()
  const { data: auth, error: authError } = await supabase.auth.getClaims()
  if (authError || !auth?.claims) return { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }
  const { data: allowed, error: roleError } = await supabase.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  if (roleError || !allowed) return { error: 'Bạn không có quyền cập nhật nhật ký học tập.' }

  const attendanceId = String(form.get('attendance_record_id') ?? '')
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(attendanceId)) {
    return { error: 'Bản ghi điểm danh không hợp lệ.' }
  }
  const fields = {
    content: String(form.get('content') ?? '').trim(),
    repertoire: String(form.get('repertoire') ?? '').trim(),
    skills: String(form.get('skills') ?? '').trim(),
    homework: String(form.get('homework') ?? '').trim(),
    notes: String(form.get('notes') ?? '').trim(),
    observation: String(form.get('observation') ?? ''),
  }
  if (!fields.content || fields.content.length > 4000 || fields.homework.length > 4000 || fields.notes.length > 4000 || fields.skills.length > 2000 || fields.repertoire.length > 2000) {
    return { error: 'Vui lòng nhập nội dung học và giữ các trường trong giới hạn ký tự cho phép.' }
  }
  if (!Object.hasOwn(observations, fields.observation)) return { error: 'Nhận xét nhanh không hợp lệ.' }

  const { data: attendance, error: attendanceError } = await supabase.from('attendance_records')
    .select('id, session_occurrence_id, enrollment_id').eq('id', attendanceId).maybeSingle()
  if (attendanceError || !attendance) return { error: 'Không tìm thấy điểm danh. Hãy lưu điểm danh trước khi ghi nhật ký.' }
  const { data: enrollment, error: enrollmentError } = await supabase.from('enrollments')
    .select('student_id').eq('id', attendance.enrollment_id).single()
  if (enrollmentError || !enrollment) return { error: 'Không thể xác định học viên của bản ghi này.' }

  // An explicit version prevents a stale form from overwriting another editor.
  const journalId = String(form.get('journal_id') ?? '')
const version = String(form.get('updated_at') ?? '')

if (
  journalId &&
  !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(journalId)
) {
  return { error: 'Nhật ký học tập không hợp lệ.' }
}

if (journalId && (!version || Number.isNaN(Date.parse(version)))) {
  return {
    error: 'Phiên bản nhật ký không hợp lệ. Hãy tải lại trang trước khi chỉnh sửa.',
  }
}

const result = journalId
    ? await supabase.from('learning_journals').update(fields).eq('id', journalId)
      .eq('attendance_record_id', attendanceId).eq('updated_at', version).select('id')
    : await supabase.from('learning_journals').insert({ ...fields, attendance_record_id: attendanceId }).select('id')
  if (result.error) {
    console.error('Save learning journal:', result.error)
    return { error: result.error.code === '23505'
      ? 'Nhật ký vừa được tạo ở phiên khác. Hãy tải lại trang để xem nội dung mới nhất.'
      : 'Không thể lưu nhật ký. Vui lòng thử lại hoặc liên hệ quản trị viên.' }
  }
  if (!result.data?.length) return { error: 'Nhật ký đã thay đổi ở phiên khác. Hãy sao chép nội dung đang nhập và tải lại trang trước khi sửa tiếp.' }
  revalidatePath(`/admin/attendance/${attendance.session_occurrence_id}`)
  revalidatePath(`/admin/students/${enrollment.student_id}`)
  return { success: 'Đã lưu nhật ký học tập.' }
}
