import { reportSummaryLabels } from '@/lib/reports/summary-labels'
import { displayLabel } from '@/lib/display'
import type { Snapshot } from '@/app/admin/reports/learning/data'
import '../admin/reports/learning/[id]/print.css'

type PublicSnapshot = Partial<Omit<Snapshot, 'admin_note'>>

const field = (label: string, value: string | number | null | undefined) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Chưa có'}</dd></div>

export default function ApprovedReport({ snapshot: s }: { snapshot: PublicSnapshot }) {
  const summaries = Object.entries(reportSummaryLabels).filter(([key]) => s.teacher_summary?.[key])
  const subjects = s.academic?.subjects ?? []
  return <div className="official-learning-report learning-report">
    <article className="academic-document learning-report-paper">
      <header className="academic-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/vibe-logo.png" width={180} height={120} alt="VIBE Academy" />
        <p>VIBE ACADEMY OF MUSIC &amp; CINEMA</p>
        <h1>BÁO CÁO HỌC TẬP</h1>
      </header>
      <section>
        <h2>THÔNG TIN HỌC VIÊN</h2>
        <div className="academic-columns">
          <dl>
            {field('HỌC VIÊN', s.student?.name)}
            {field('MÃ HỌC VIÊN', s.student?.code)}
            {field('CHI NHÁNH', s.branch?.name)}
            {field('CA DẠY', s.class_name)}
            {field('GIÁO VIÊN', s.teachers?.map(t => t.name || t.code).join(', ') || null)}
          </dl>
          <dl>
            {field('CHƯƠNG TRÌNH', s.academic?.curriculum)}
            {field('TRÌNH ĐỘ', s.academic?.current_grade)}
            {field('KỲ BÁO CÁO', s.period_start && s.period_end ? `${s.period_start} – ${s.period_end}` : null)}
          </dl>
        </div>
      </section>
      {s.attendance && <section>
        <h2>CHUYÊN CẦN</h2>
        <dl className="academic-metrics">
          {field('DỰ KIẾN', s.attendance.scheduled)}
          {field('CÓ MẶT', s.attendance.attended)}
          {field('VẮNG', s.attendance.absent)}
          {field('CÓ PHÉP', s.attendance.excused)}
          {field('CHƯA ĐIỂM DANH', s.attendance.unmarked)}
          {field('TỶ LỆ', s.attendance.rate == null ? 'Chưa có dữ liệu' : `${s.attendance.rate}%`)}
        </dl>
      </section>}
      {s.academic && <section>
        <h2>TIẾN ĐỘ HỌC TẬP</h2>
        <p className="academic-note">Nội dung đã duyệt tại thời điểm tổng hợp; không tự thay đổi theo tiến độ hiện tại.</p>
        {!subjects.length && <p>Chưa có tiến độ trong kỳ này.</p>}
        <table>
          <thead><tr>{['MÔN HỌC', 'YÊU CẦU', 'TRẠNG THÁI', 'ĐIỂM', 'HỌC PHẦN'].map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
          <tbody>{subjects.map((subject, index) => <tr key={index}>
            <td>{subject.grade} — {subject.name}</td>
            <td>{subject.is_required ? 'Bắt buộc' : 'Tùy chọn'}</td>
            <td>{displayLabel(subject.status)}</td>
            <td>{subject.score ?? '—'}</td>
            <td>{subject.completion_rule === 'DIRECT_ASSESSMENT' || !subject.components?.length
              ? '—'
              : <ul>{subject.components.map((component, componentIndex) => <li key={componentIndex}>{component.name} ({component.required ? 'Bắt buộc' : 'Tùy chọn'}): {displayLabel(component.status)}{component.score == null ? '' : ` · ${component.score}`}</li>)}</ul>}
            </td>
          </tr>)}</tbody>
        </table>
      </section>}
      <section>
        <h2>NHẬT KÝ HỌC TẬP</h2>
        {!s.journals?.excerpts?.length && <p>Chưa có nhật ký học tập.</p>}
        {s.journals?.excerpts?.map((entry, index) => <div className="academic-entry" key={index}><dl>
          {entry.content && field('NỘI DUNG', entry.content)}
          {entry.repertoire && field('TÁC PHẨM', entry.repertoire)}
          {entry.skills && field('KỸ NĂNG', entry.skills)}
          {entry.homework && field('LUYỆN TẬP', entry.homework)}
        </dl></div>)}
      </section>
      <section>
        <h2>NHẬN XÉT VÀ ĐỊNH HƯỚNG</h2>
        {summaries.length === 0 && <p>Chưa có nhận xét</p>}
        {summaries.map(([key, label]) => <div className="academic-assessment" key={key}><h3>{label}</h3><p>{s.teacher_summary?.[key]}</p></div>)}
      </section>
      <footer>VIBE ACADEMY OF MUSIC &amp; CINEMA</footer>
    </article>
  </div>
}
