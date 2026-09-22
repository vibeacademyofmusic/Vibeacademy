import Link from 'next/link'
import { adminClient, type Params } from '../../../finance/operations'
import { Panel, Table, Notice, LoadError, Confirm, inputClass, dateText, timeText } from '../../../finance/_components/ui'
import SubmitButton from '../../../finance/_components/SubmitButton'
import { reportDetail, history, statuses, types, summaryFields, legacySummaryFallback, reportDelivery } from '../data'
import { updateReport } from '../actions'
import ReportDocument from './ReportDocument'
import PrintReportButton from './PrintReportButton'
export default async function LearningReportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params, query = await searchParams, db = await adminClient()
  let report, events
  try { report = await reportDetail(db, id); events = report ? await history(db, id) : [] } catch { return <LoadError /> }
  if (!report) return <p>Không tìm thấy báo cáo.</p>
  const r = report, s = r.snapshot_data ?? r.draft_data, summary = s.teacher_summary ?? r.teacher_summary
  const summaryValue = (id: string) => {
    const direct = summary[id]
    if (direct) return direct

    for (const legacyKey of legacySummaryFallback[id] ?? []) {
      if (summary[legacyKey]) return summary[legacyKey]
    }

    return ''
  }
  const action = (value: string, label: string, confirm = false) => <form action={updateReport} className="space-y-2"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.version} /><input type="hidden" name="action" value={value} />{confirm && <Confirm text={'Xác nhận ' + label.toLowerCase()} />}<SubmitButton>{label}</SubmitButton></form>
  if (['APPROVED', 'PUBLISHED'].includes(r.status)) {
    let delivery: Awaited<ReturnType<typeof reportDelivery>> | null = null
    if (r.status === 'PUBLISHED') {
      try { delivery = await reportDelivery(db, r) } catch { /* Delivery failure must not hide the frozen document. */ }
    }
    return <div className={`learning-report official-learning-report learning-report-page${query.print === '1' ? ' report-print-preview' : ''}`}>
      <div className="report-controls learning-report-toolbar space-y-4">
        <div className="flex flex-wrap items-center gap-4"><Link prefetch={false} href="/admin/reports/learning">← BACK</Link><PrintReportButton />{r.status === 'APPROVED' && action('PUBLISH', 'PUBLISH REPORT', true)}</div>
        <Notice params={query} />
        <p>Nội dung đã duyệt được khóa. Phát hành không đồng nghĩa với gửi email hoặc Zalo.</p>
      </div>
      <ReportDocument report={r} />
      <div className="report-controls learning-report-admin space-y-6">
        {r.status === 'PUBLISHED' && <Panel title="DELIVERY">
          <p>Thông tin liên hệ hiện tại; không thay đổi bản báo cáo đã duyệt.</p>
          {!delivery ? <p role="alert">Không tải được thông tin người nhận và lịch sử gửi. Vui lòng tải lại.</p> : <>
            {delivery.contacts.length ? <Table headers={['RECIPIENT', 'EMAIL', 'PHONE']} rows={delivery.contacts.map(c => [c.name, c.email || 'Not provided.', c.phone || 'Not provided.'])} /> : <p>Không có thông tin người nhận phù hợp.</p>}
            {!delivery.contacts.some(c => c.email) && <p>No eligible email recipient.</p>}
            {!delivery.contacts.some(c => c.phone) && <p>No eligible Zalo recipient.</p>}
          </>}
          <div className="flex flex-wrap gap-6">
            <div><button type="button" disabled aria-describedby="email-unavailable" className="rounded border px-4 py-2 opacity-50">SEND EMAIL</button><p id="email-unavailable">EMAIL PROVIDER NOT CONFIGURED</p></div>
            <div><button type="button" disabled aria-describedby="zalo-unavailable" className="rounded border px-4 py-2 opacity-50">SEND ZALO</button><p id="zalo-unavailable">ZALO PROVIDER NOT CONFIGURED</p></div>
          </div>
          <p>Chưa thể gửi báo cáo. Không tạo hàng đợi hoặc ghi nhận đã gửi khi chưa kết nối nhà cung cấp.</p>
        </Panel>}
        {r.status === 'PUBLISHED' && delivery && <Panel title="DELIVERY HISTORY">
          <p>Tối đa 100 bản ghi gần nhất. MOCK là kiểm thử, không phải gửi thật.</p>
          {delivery.jobs.length ? <Table headers={['DATE', 'CHANNEL', 'RECIPIENT', 'STATUS', 'REFERENCE']} rows={delivery.jobs.map(j => [timeText(j.sent_at ?? j.created_at), `${j.channel} · ${j.delivery_mode}`, delivery.names.get(j.recipient_id) ?? delivery.contacts.find(c => c.id === j.recipient_id)?.name ?? j.recipient_id, j.status, j.provider_receipt ?? j.id])} /> : <p>NOT_SENT — No delivery records.</p>}
        </Panel>}
        {(s.admin_note ?? r.admin_note) && <Panel title="Ghi chú quản trị (không in)"><p className="whitespace-pre-wrap">{s.admin_note ?? r.admin_note}</p></Panel>}
        <Panel title="Lịch sử xử lý"><Table headers={['Thao tác', 'Phiên bản', 'Thời gian', 'Người xử lý']} rows={events.map(e => [e.event, e.version, timeText(e.created_at), e.actor_id])} /></Panel>
      </div>
    </div>
  }
  return <article className={`learning-report min-w-0 space-y-6${query.print === '1' ? ' report-print-preview' : ''}`}><Link className="report-controls" prefetch={false} href="/admin/reports/learning">← Danh sách báo cáo</Link><h1 className="text-3xl font-bold">{types.find(t => t.id === r.report_type)?.name}</h1><div className="report-controls"><Notice params={query} /></div>
    <p>{statuses.find(t => t.id === r.status)?.name} • Phiên bản {r.version}</p>
    {r.status === 'APPROVED' && <p>Đã khóa nội dung và lưu lịch sử. Không thể chỉnh sửa trực tiếp.</p>}
    <Panel title="Học viên và kỳ học"><p>{s.student.name} ({s.student.code})</p><p>{s.branch.name} • {s.class_name}</p><p>{dateText(s.period_start)} → {dateText(s.period_end)}</p><p>Giáo viên: {s.teachers.map(t => t.name || t.code).join(", ") || "Chưa có phân công"}</p><p>Tổng hợp lúc {timeText(s.as_of)}</p></Panel>
    <Panel title="Điểm danh"><p>Dự kiến: {s.attendance.scheduled} • Có mặt / đi muộn: {s.attendance.attended} • Vắng: {s.attendance.absent} • Có phép: {s.attendance.excused} • Chưa điểm danh: {s.attendance.unmarked} • Buổi bù dự kiến: {s.attendance.makeup}</p><p>Tỷ lệ có mặt trên số buổi đã điểm danh: {s.attendance.rate === null ? 'Chưa có dữ liệu' : s.attendance.rate + '%'}. Không tính buổi đã hủy; buổi thường trong bảo lưu được loại trừ nếu chưa có điểm danh.</p></Panel>
    <Panel title="Tiến độ Academic"><p>{s.academic.curriculum ?? 'Chưa liên kết chương trình'} • Grade hiện tại: {s.academic.current_grade ?? 'Chưa có'}</p><p>Tiến độ tại thời điểm tổng hợp, không phải bản dựng lại cuối tháng. Trạng thái do Academic Engine quyết định; môn / thành phần tùy chọn không chặn hoàn thành.</p>
      <Table headers={['Grade', 'Môn học', 'Yêu cầu', 'Trạng thái / điểm', 'Thành phần ACTIVE']} rows={s.academic.subjects.map(subject => [subject.grade + ' • ' + subject.grade_status, subject.name, subject.is_required ? 'Bắt buộc' : 'Tùy chọn', subject.status + (subject.score === null ? '' : ' / ' + subject.score), <ul key={subject.name}>{subject.components.map((c, index) => <li key={index}>{c.name} ({c.required ? 'bắt buộc' : 'tùy chọn'}): {c.status}{c.score === null ? '' : ' / ' + c.score}</li>)}</ul>])} />
    </Panel>
    <Panel title="Nhật ký học tập"><p>{s.journals.count} buổi có nhật ký. Hiển thị tối đa 30 nhật ký cập nhật gần nhất trong kỳ; đây là ghi chép quan sát, không phải kết quả đánh giá tự động.</p>{!s.journals.count && <p>Chưa có nhật ký học tập.</p>}{s.journals.excerpts.map((j, i) => <section className="space-y-1 border-t pt-3 whitespace-pre-wrap" key={i}><p>{j.content}</p>{j.repertoire && <p>Tác phẩm: {j.repertoire}</p>}{j.skills && <p>Kỹ năng: {j.skills}</p>}{j.homework && <p>Luyện tập: {j.homework}</p>}</section>)}</Panel>
    <Panel title="Nhận xét và định hướng"><p>Nội dung chuyên môn do giáo viên cung cấp; Academic/Admin kiểm tra và duyệt. Nội dung trống cần bổ sung, không được tự suy diễn.</p>{summaryFields.map(f => <section key={f.id}><h3 className="font-medium">{f.name}</h3><p className="whitespace-pre-wrap">{summaryValue(f.id) || 'Chưa nhập'}</p></section>)}<h3 className="font-medium">Ghi chú quản trị</h3><p className="whitespace-pre-wrap">{(s.admin_note ?? r.admin_note) || 'Chưa nhập'}</p></Panel>
    <div className="report-controls space-y-4">{r.status === 'DRAFT' && <Panel title="Nhập nhận xét"><form action={updateReport} className="space-y-3"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.version} /><input type="hidden" name="action" value="SAVE" />{[...summaryFields, { id: 'admin_note', name: 'Ghi chú quản trị' }].map(f => <label className="block space-y-1" key={f.id}><span>{f.name}</span><textarea className={inputClass} name={f.id} maxLength={4000} defaultValue={f.id === 'admin_note' ? r.admin_note : summaryValue(f.id)} /></label>)}<SubmitButton>Lưu nhận xét</SubmitButton></form></Panel>}
      {r.status === 'DRAFT' && <div className="flex flex-wrap gap-4">{action('REGENERATE', 'Tổng hợp lại bản nháp')}{action('READY', 'Chuyển chờ duyệt')}</div>}
      {r.status === 'READY_FOR_REVIEW' && <div className="flex flex-wrap gap-4">{action('APPROVE', 'Duyệt và khóa báo cáo', true)}{action('RETURN', 'Trả về bản nháp')}</div>}
      {['DRAFT', 'READY_FOR_REVIEW'].includes(r.status) && action('CANCEL', 'Hủy báo cáo', true)}
      <Link prefetch={false} href={'/admin/reports/learning/' + r.id + '?print=1'}>Xem bản in</Link><p>Có thể dùng chức năng In của trình duyệt. Bản in hiện dành cho quản trị viên, bao gồm ghi chú nội bộ.</p>
    </div>
    <Panel title="Lịch sử xử lý"><p>Hiển thị tối đa 100 thao tác gần nhất. Chưa gửi email / Zalo.</p><Table headers={['Thao tác', 'Phiên bản', 'Thời gian', 'Người xử lý']} rows={events.map(e => [e.event, e.version, timeText(e.created_at), e.actor_id])} /></Panel>
  </article>
}
