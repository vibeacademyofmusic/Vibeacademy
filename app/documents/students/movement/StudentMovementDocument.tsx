import type { StudentMovement } from '@/app/admin/students/movement-data'
import '../../finance/management-report/financial-report-print.css'

function lines(rows: StudentMovement['newcomers']) {
  if (!rows.length) return <p className="fm-note">Không có học viên trong phạm vi này.</p>
  return (
    <table>
      <thead>
        <tr><th>Học viên</th><th>Mã</th><th>Chi nhánh</th><th>Ngày</th><th>Bối cảnh</th></tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id}>
            <td>{row.name}</td>
            <td>{row.code}</td>
            <td>{row.branch}</td>
            <td>{row.when}</td>
            <td>{row.context}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function StudentMovementDocument({ report }: { report: StudentMovement }) {
  const counts = report.counts
  return (
    <article className="fm-report">
      <header className="fm-brand fm-keep">
        <p className="fm-kicker">VIBE Academy</p>
        <h1>BÁO CÁO HỌC VIÊN</h1>
        <p>Student movement report</p>
      </header>
      <dl className="fm-meta">
        <div><dt>Kỳ</dt><dd>{report.periodText}</dd></div>
        <div><dt>Phạm vi</dt><dd>{report.branchName}</dd></div>
        <div><dt>Tháng</dt><dd>{report.monthText}</dd></div>
        <div><dt>Thời điểm tạo</dt><dd>{report.generatedAt}</dd></div>
      </dl>
      <section className="fm-section">
        <h2>CHỈ SỐ ĐIỀU HÀNH</h2>
        <div className="fm-kpis">
          <article><p>Học viên mới trong tháng</p><strong>{counts.newcomers}</strong></article>
          <article><p>Đang học</p><strong>{counts.active ?? '—'}</strong></article>
          <article><p>Đang bảo lưu</p><strong>{counts.paused ?? '—'}</strong></article>
          <article><p>Nghỉ khi hết khóa</p><strong>{counts.courseEnded}</strong></article>
        </div>
        <table>
          <thead><tr><th>Chỉ tiêu</th><th className="fm-num">Số học viên</th></tr></thead>
          <tbody>
            <tr><td>Học viên mới trong tháng</td><td className="fm-num">{counts.newcomers}</td></tr>
            <tr><td>Học viên đang hoạt động</td><td className="fm-num">{counts.active ?? '—'}</td></tr>
            <tr><td>Đang bảo lưu</td><td className="fm-num">{counts.paused ?? '—'}</td></tr>
            <tr><td>Nghỉ khi hết khóa trong tháng</td><td className="fm-num">{counts.courseEnded}</td></tr>
            <tr><td>Nghỉ giữa khóa trong tháng</td><td className="fm-num">{counts.withdrawn}</td></tr>
            <tr><td>Chờ vào ca dạy</td><td className="fm-num">{counts.waiting ?? '—'}</td></tr>
            <tr><td>Đã vào ca dạy – chờ bắt đầu</td><td className="fm-num">{counts.future ?? '—'}</td></tr>
          </tbody>
        </table>
        <p className="fm-note">Học viên mới tính theo ngày nhập học của hồ sơ. Bảo lưu là ghi danh đang trong kỳ bảo lưu tại ngày hôm nay. Nghỉ khi hết khóa là ghi danh đã hoàn tất trong tháng và không gồm học viên nghỉ giữa khóa.</p>
      </section>
      <section className="fm-section">
        <h2>CƠ CẤU THEO MÔN</h2>
        <p className="fm-note">{report.branchName}: {report.enrolledStudents} nhạc sinh đang có hồ sơ. Một nhạc sinh học nhiều môn được tính ở từng môn.</p>
        <table>
          <thead><tr><th>Môn</th><th className="fm-num">Số nhạc sinh</th><th className="fm-num">Tỷ lệ</th></tr></thead>
          <tbody>
            <tr><td>Tổng nhạc sinh</td><td className="fm-num">{report.enrolledStudents}</td><td className="fm-num">100%</td></tr>
            {report.instruments.map(row => (
              <tr key={row.name}><td>{row.name}</td><td className="fm-num">{row.students}</td><td className="fm-num">{row.share}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="fm-section">
        <h2>HỌC VIÊN MỚI TRONG THÁNG</h2>
        {lines(report.newcomers)}
      </section>
      <section className="fm-section">
        <h2>ĐANG BẢO LƯU</h2>
        {lines(report.paused)}
      </section>
      <section className="fm-section">
        <h2>NGHỈ KHI HẾT KHÓA</h2>
        {lines(report.courseEnded)}
      </section>
      <footer>Báo cáo quản trị học viên · {report.monthText} · {report.branchName}</footer>
    </article>
  )
}
