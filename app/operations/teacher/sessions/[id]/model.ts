import type { ObservationOption } from '@/app/admin/learning-journals/priority'
export type Progress = { id: string; name: string; progress_id: string | null; status: string }
export type Component = Progress & { rule: string; items: Progress[] }
export type Subject = Progress & { rule: string; components: Component[] }
export type Entry = { id: string; version: number; observation: string; progress_note: string; individual_homework: string; homework_custom: boolean; next_focus_code: string | null; attention_required: boolean; attention_reason_code: string | null; attention_detail: string; attention_resolved_at: string | null; family_note: string; codes: string[] }
export type Participant = { enrollment_id: string; student_id: string; name: string; attendance_id: string | null; attendance: string | null; compatibility: string; academic_readable: boolean; academic: { id: string; name: string; level_name: string | null; level_id: string | null; started_at: string | null; level_status: string | null; subjects: Subject[] } | null; entry: Entry | null }
export type Option = { code: string; label_vi: string; sort_order: number; part_group?: string }
export type Workspace = { id: string; class_id: string; class_name: string; date: string; starts_at: string; ends_at: string; status: string; type: string; room: string | null; teacher: string | null; assignment_type: string; scope_from: string | null; scope_to: string | null; note: string | null; journal: { id: string; version: number; content_covered: string; curriculum_context: string | null; status: string; revision_count: number; submitted_at: string | null; revised_at: string | null } | null; participants: Participant[]; options: { observations: ObservationOption[]; focus: Option[]; reasons: Option[]; homework: (Option & { part_group: string })[] } }
export const attendanceLabels: Record<string, string> = { PRESENT: 'Có mặt', ABSENT: 'Vắng', LATE: 'Đi muộn', EXCUSED: 'Có phép' }
export const progressLabels: Record<string, string> = { NOT_STARTED: 'Chưa bắt đầu', IN_PROGRESS: 'Đang học', PASS: 'Đạt', MERIT: 'Khá', DISTINCTION: 'Xuất sắc', EXEMPT: 'Miễn', NOT_PASSED: 'Chưa đạt', COMPLETED: 'Hoàn thành', AVAILABLE: 'Có thể bắt đầu', LOCKED: 'Chưa mở' }
export function summary(data: Workspace) {
  const required = data.participants.filter(p => ['PRESENT','LATE'].includes(p.attendance ?? ''))
  const ready = required.filter(p => p.entry && p.entry.observation !== 'NOT_RECORDED' && p.entry.progress_note.trim())
  return { marked: data.participants.filter(p => p.attendance).length, required: required.length, ready: ready.length,
    submitted: data.journal?.status === 'SUBMITTED' ? ready.length : 0,
    attention: data.participants.filter(p => p.entry?.attention_required && !p.entry.attention_resolved_at).length }
}
export function sessionLabel(data: Pick<Workspace, 'status' | 'starts_at' | 'ends_at'>) {
  if (data.status === 'COMPLETED') return 'Đã hoàn tất'
  if (data.status === 'CANCELLED') return 'Đã hủy'
  const now = Date.now()
  if (data.status === 'SCHEDULED' && now >= Date.parse(data.starts_at) && now <= Date.parse(data.ends_at)) return 'Đang diễn ra'
  return 'Đã lên lịch'
}
export function journalLabel(data: Workspace, p: Participant) {
  if (!p.entry) return 'Chưa ghi nhận'
  if (data.journal?.status !== 'SUBMITTED') return 'Bản nháp'
  return data.journal.revision_count > 0 ? 'Đã chỉnh sửa' : 'Đã gửi'
}
export function teachingError(message: string) {
  if (/UNAUTHORIZED|DENIED/.test(message) && !/PROGRESS_DENIED|ABSENT_OBSERVATION/.test(message)) return 'Bạn không có quyền thực hiện thao tác này cho buổi học hoặc học viên đã chọn.'
  if (/TEACHING_STALE/.test(message)) return 'Dữ liệu đã thay đổi. Nội dung bạn nhập vẫn được giữ; hãy kiểm tra phiên bản mới trước khi lưu lại.'
  if (/CANCELLED/.test(message)) return 'Buổi học đã hủy, không thể ghi nhận thêm.'
  if (/FUTURE_LEVEL|scheduled start date/.test(message)) return 'Chưa đến ngày bắt đầu cấp độ này.'
  if (/ATTENDANCE_REQUIRED|ATTENDANCE_MISSING/.test(message)) return 'Hãy lưu điểm danh Có mặt hoặc Đi muộn trước khi cập nhật tiến độ.'
  if (/ATTENDANCE_HAS_FEEDBACK/.test(message)) return 'Học viên đã có nhận xét. Hãy kiểm tra và sửa nhật ký trước khi đổi sang Vắng hoặc Có phép.'
  if (/JOURNAL_PROGRESS_REQUIRED/.test(message)) return 'Học viên có mặt hoặc đi muộn cần quan sát và nhận xét tiến độ trước khi nộp.'
  if (/JOURNAL_CONTENT_REQUIRED/.test(message)) return 'Hãy lưu nội dung chung của buổi học trước khi nộp nhật ký.'
  if (/ABSENT_OBSERVATION/.test(message)) return 'Học viên vắng hoặc có phép không ghi nhận xét học tập; vẫn có thể lưu ghi chú và lưu ý phù hợp.'
  if (/All students.*marked/.test(message)) return 'Cần điểm danh đủ học viên trước khi hoàn tất ca dạy.'
  if (/ACADEMIC_MISSING/.test(message)) return 'Chưa xác định chương trình hoặc cấp độ đang học.'
  if (/PROGRESS_DENIED|derived|regress|sealed/.test(message)) return 'Không thể cập nhật tiến độ này. Hãy kiểm tra đúng học viên, cấp độ và quy tắc hoàn thành.'
  return 'Không thể lưu. Vui lòng kiểm tra dữ liệu và thử lại.'
}
