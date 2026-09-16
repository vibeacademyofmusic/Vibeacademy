import { displayLabel } from '@/lib/display'
import type { Snapshot } from '@/app/admin/reports/learning/data'

type PublicSnapshot = Partial<Omit<Snapshot, 'admin_note'>>
const summaryLabels = { general_comment: 'Nhận xét giáo viên', strengths: 'Điểm mạnh', improvement_areas: 'Cần cải thiện', next_focus: 'Trọng tâm tiếp theo', recommendation: 'Đề xuất' }

export default function ApprovedReport({ snapshot: s }: { snapshot: PublicSnapshot }) {
  return <div className="space-y-4">
    <p>Nội dung đã duyệt tại thời điểm tổng hợp; không tự thay đổi theo tiến độ hiện tại.</p>
    {s.class_name && <p>{s.branch?.name} · {s.class_name}</p>}
    {!!s.teachers?.length && <p>Giáo viên: {s.teachers.map(t => t.name || t.code).join(', ')}</p>}
    {s.attendance && <section><h4 className="font-semibold">Điểm danh</h4><p>Dự kiến: {s.attendance.scheduled} · Có mặt / đi muộn: {s.attendance.attended} · Vắng: {s.attendance.absent} · Có phép: {s.attendance.excused} · Chưa điểm danh: {s.attendance.unmarked}</p><p>Tỷ lệ có mặt: {s.attendance.rate == null ? 'Chưa có dữ liệu' : `${s.attendance.rate}%`}</p></section>}
    {s.academic && <section className="space-y-2"><h4 className="font-semibold">Tiến độ học tập</h4><p>{s.academic.curriculum || 'Chưa liên kết chương trình'} · {s.academic.current_grade || 'Chưa có Grade'}</p>{(s.academic.subjects || []).map((subject, i) => <div key={i} className="rounded border p-3"><p>{subject.grade} — {subject.name} ({subject.is_required ? 'Bắt buộc' : 'Tùy chọn'}): {displayLabel(subject.status)}{subject.score != null && ` · ${subject.score}`}</p>{subject.completion_rule !== 'DIRECT_ASSESSMENT' && <ul>{subject.components.map((c, j) => <li key={j}>{c.name} ({c.required ? 'Bắt buộc' : 'Tùy chọn'}): {displayLabel(c.status)}{c.score != null && ` · ${c.score}`}</li>)}</ul>}</div>)}</section>}
    {!!s.journals?.excerpts?.length && <section className="space-y-2"><h4 className="font-semibold">Nhật ký học tập</h4>{s.journals.excerpts.map((j, i) => <div key={i} className="whitespace-pre-wrap border-t pt-2"><p>{j.content}</p>{j.repertoire && <p>Tác phẩm: {j.repertoire}</p>}{j.skills && <p>Kỹ năng: {j.skills}</p>}{j.homework && <p>Luyện tập: {j.homework}</p>}</div>)}</section>}
    <section className="space-y-2"><h4 className="font-semibold">Nhận xét và định hướng</h4>{Object.entries(summaryLabels).map(([key, label]) => <p key={key} className="whitespace-pre-wrap"><strong>{label}: </strong>{s.teacher_summary?.[key] || 'Chưa có nhận xét'}</p>)}</section>
  </div>
}
