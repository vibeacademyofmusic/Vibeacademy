import Link from 'next/link'
import { adminClient, uuidPattern, type Params } from '../../finance/operations'
import { branches, rows } from '../../finance/query'
import { money } from '../../finance/data'
import { Field, Select, Table, Pager, Notice, LoadError, dateText, timeText } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { AppPage, PageHeader, MetricCard, StatusBadge, FilterBar, SectionCard } from '../../_components/vibe'
import { plans, debts } from '../data'
import { reminders, kpis, timing, filters, replyFilters, type Reminder } from './data'
import { generateReminders, resolveReminder, confirmTuitionZalo } from './actions'
import { loadTuitionNotice } from './notice'
import { noticeDate, zaloAttemptLabel } from '@/lib/integrations/zalo/tuition-notice'
import { tuitionReplyLabel } from '@/lib/integrations/zalo/tuition-reply'

function statusLabel(row: Reminder) {
  if (row.status === 'SKIPPED') return 'Đã bỏ qua'
  if (row.status === 'CANCELLED') return 'Đã hủy'
  if (row.status === 'SENT') return 'Đã ghi nhận gửi'
  if (row.status === 'PENDING') return timing(row)
  return row.status
}
function statusTone(row: Reminder): 'warning' | 'error' | 'info' | 'neutral' {
  if (row.status !== 'PENDING') return 'neutral'
  const label = timing(row)
  if (label === 'Quá hạn nhắc' || label === 'Quá hạn thanh toán nợ' || label === 'Trong hạn · cảnh báo đỏ') return 'error'
  if (label === 'Sắp đến hạn') return 'info'
  return 'warning'
}
function StatusCell({ row }: { row: Reminder }) {
  const label = statusLabel(row)
  const overdue = label === 'Quá hạn nhắc' || label === 'Quá hạn thanh toán nợ'
  return <span className="inline-flex flex-wrap gap-1"><StatusBadge tone={statusTone(row)}>{label}</StatusBadge>{overdue && <StatusBadge tone="warning">Cảnh báo</StatusBadge>}</span>
}

function zaloHref(params: Params, id?: string) {
  const query = new URLSearchParams()
  for (const key of ['state', 'branch', 'plan', 'page', 'reply'] as const) if (params[key]) query.set(key, params[key]!)
  if (id) query.set('zalo', id)
  const text = query.toString()
  return text ? `/admin/tuition/reminders?${text}` : '/admin/tuition/reminders'
}

export default async function ReminderPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient()
  let loaded
  try {
    const base = await Promise.all([reminders(db, params), kpis(db), branches(db), plans(db)])
    loaded = { base, debtRows: await debts(db, base[0].data.map(r => r.enrollment_tuition_id)) }
  } catch { return <LoadError /> }
  const { base: [list, counts, branchRows, planRows], debtRows } = loaded
  const debtMap = new Map(debtRows.map(d => [d.enrollment_tuition_id, d]))
  const attemptRows = list.data.length ? await rows(db.from('notification_jobs').select('entity_id,status,created_at').eq('entity_type', 'TUITION_REMINDER').eq('template_key', 'ZALO_TUITION_REMINDER').in('entity_id', list.data.map(row => row.id)).order('created_at', { ascending: false }).returns<{ entity_id: string; status: string; created_at: string }[]>()) : []
  const attemptByReminder = new Map<string, string>()
  for (const attempt of attemptRows) {
    const current = attemptByReminder.get(attempt.entity_id)
    if (!current) attemptByReminder.set(attempt.entity_id, attempt.status)
  }
  const selectedId = uuidPattern.test(params.zalo ?? '') ? params.zalo! : ''
  let notice = null
  if (selectedId) {
    try { notice = await loadTuitionNotice(db, selectedId, uuidPattern.test(params.parent ?? '') ? params.parent! : null) }
    catch { notice = null }
  }
  return <AppPage>
    <PageHeader title="Nhắc học phí" description="Gói 3 tháng: tuần đầu của tháng thứ ba hệ thống cập nhật lịch báo. Từ tuần thứ ba của tháng đó đến hết kỳ vẫn trong hạn và cảnh báo đỏ. Qua ngày cuối kỳ là quá hạn, cảnh báo đỏ và vàng. Gói 3 tháng đã thanh toán 50%: phần còn lại đến hạn thanh toán trong tuần đầu của tháng thứ hai; qua tuần đó là quá hạn thanh toán nợ. Học phí năm đã thanh toán 50%: phần còn lại đến hạn ở tuần thứ tư của tháng thứ ba, và qua tuần đầu của tháng thứ tư thì quá hạn thanh toán nợ. Bảo lưu không dịch các mốc này. Gói năm thanh toán đủ vẫn nhắc gia hạn ở tháng thứ mười. Chưa gửi tin cho phụ huynh." actions={<a href="#zalo-auto">Gửi báo tự động qua Zalo</a>} />
    <Notice params={params} />
    <div className="vibe-metrics">
      <MetricCard title="Sắp đến hạn" value={counts.upcoming} note="Chưa tới tuần cập nhật lịch" />
      <MetricCard title="Đến hạn thanh toán" value={counts.payment} note="Gói 3 tháng đã thanh toán 50%, tuần đầu tháng thứ hai" />
      <MetricCard title="Đã cập nhật lịch báo" value={counts.week} note="Tuần đầu tháng thứ ba, trước cảnh báo đỏ" />
      <MetricCard title="Trong hạn, cảnh báo đỏ" value={counts.red} note="Từ tuần thứ ba, hoặc phần còn lại học phí năm" />
      <MetricCard title="Quá hạn" value={counts.overdue} note="Đỏ và vàng. Nợ gói 3 tháng tính sau tuần đầu tháng thứ hai" />
    </div>
    <form action={generateReminders}><SubmitButton className="vibe-button vibe-button-primary">Tạo nhắc học phí còn thiếu</SubmitButton></form>
    <form><FilterBar>
      <Select name="state" label="Thời điểm / trạng thái" options={filters} value={params.state} />
      <Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} />
      <Select name="plan" label="Gói học phí" options={planRows} value={params.plan} />
      <Select name="reply" label="Phản hồi Zalo" options={replyFilters} value={params.reply} />
      <button className="vibe-button" type="submit">Lọc nhắc học phí</button>
    </FilterBar></form>
    <Table headers={['Học viên', 'Chi nhánh / gói', 'Kỳ học hiện tại', 'Khoảng nhắc', 'Trạng thái', 'Học phí hiện tại', 'Hóa đơn / công nợ', 'Zalo', 'Phản hồi', 'Xử lý']} rows={list.data.map(r => {
      const debt = debtMap.get(r.enrollment_tuition_id)
      return [r.full_name + ' (' + r.student_code + ')', r.branch_name_snapshot + ' / ' + r.plan_name_snapshot,
        <Link prefetch={false} key="term" href={'/admin/tuition?selected=' + r.enrollment_tuition_id}>{dateText(r.starts_on)} → {dateText(r.effective_ends_on)}</Link>,
        dateText(r.window_start) + ' → ' + dateText(r.window_end), <StatusCell key="status" row={r} />, money(r.amount, r.currency),
        debt ? <Link prefetch={false} key="invoice" href={'/admin/finance/invoices?selected=' + debt.invoice_id}>{debt.invoice_number} • {debt.receivable_status} • {debt.invoice_status === 'ISSUED' ? 'Còn nợ' : 'Số dư hóa đơn (chưa ghi nhận công nợ)'}{' '}{money(debt.outstanding_balance, debt.currency)}</Link> : 'Chưa có hóa đơn',
        <span key="zalo" className="grid min-w-36 gap-1 text-sm"><span>{zaloAttemptLabel(attemptByReminder.get(r.id))}</span><Link className="vibe-button" prefetch={false} href={zaloHref(params, r.id)} aria-label={'Gửi Zalo cho ' + r.full_name}>Gửi Zalo</Link><Link className="text-sm underline" prefetch={false} href={zaloHref(params, r.id) + '#lich-su'}>Lịch sử</Link></span>,
        <span key="reply" className="grid min-w-28 gap-1 text-sm"><span>{tuitionReplyLabel(r.reply_choice)}</span>{r.reply_submit_time && <small>{timeText(r.reply_submit_time)}</small>}{r.reply_needs_review && <StatusBadge tone="warning">Cần xác minh</StatusBadge>}</span>,
        r.status === 'PENDING' ? <form action={resolveReminder} key={r.id} className="min-w-48 space-y-2"><input type="hidden" name="reminder_id" value={r.id} /><Select name="status" label="Xử lý nhắc" required options={[{ id: 'SKIPPED', name: 'Bỏ qua' }, { id: 'CANCELLED', name: 'Hủy do không hợp lệ' }]} /><Field name="reason" label="Lý do" /><SubmitButton className="vibe-button">Lưu xử lý</SubmitButton></form> : <span key="audit">{r.reason}{r.marked_at && <small className="block">{timeText(r.marked_at)}</small>}</span>]
    })} />
    <Pager path="/admin/tuition/reminders" params={params} {...list} />
    {notice && <SectionCard title="Gửi thông báo học phí">
      <div className="space-y-3" id="gui-zalo">
        <p>{notice.studentName} ({notice.studentCode}) · {notice.branchName} · {noticeDate(notice.periodStart)} → {noticeDate(notice.periodEnd)}</p>
        <p>Người nhận: {notice.recipient?.name ?? 'Chưa chọn'} · {notice.maskedPhone}</p>
        <p>Trạng thái gửi: {notice.attemptLabel}. Trạng thái trong mẫu: {notice.status ?? 'Chưa đủ trạng thái'}</p>
        <p>Phản hồi: {notice.replyLabel}{notice.replyAt ? ` · ${timeText(notice.replyAt)}` : ''}{notice.needsReview ? ' · Cần xác minh' : ''}</p>
        <pre className="whitespace-pre-wrap rounded-xl border border-[var(--vibe-line)] bg-white p-4 text-sm">{notice.preview}</pre>
        {notice.blockers.length > 0 && <ul className="list-disc pl-5 text-sm">{notice.blockers.map(item => <li key={item}>{item}</li>)}</ul>}
        {notice.deliveryBlockers.length > 0 && <ul className="list-disc pl-5 text-sm">{notice.deliveryBlockers.map(item => <li key={item}>{item}</li>)}</ul>}
        <div className="flex flex-wrap gap-2">
          <Link className="vibe-button" href={zaloHref(params)}>Hủy</Link>
          <form action={confirmTuitionZalo}><input type="hidden" name="reminder_id" value={notice.reminderId} />{notice.recipient && <input type="hidden" name="parent_id" value={notice.recipient.id} />}<SubmitButton className="vibe-button vibe-button-primary">Xác nhận gửi cho học viên này</SubmitButton></form>
        </div>
        <div id="lich-su" className="space-y-2 text-sm">
          <p>Lịch sử gửi: {notice.sends.length ? notice.sends.map(row => `${row.sendStatus} · ${row.trackingId}`).join(' · ') : notice.attemptLabel}. Gửi thành công hoặc phát đến máy không đổi phản hồi thành Có.</p>
          <p>Lịch sử phản hồi:</p>
          {notice.replies.length ? <ul className="list-disc pl-5">{notice.replies.map(row => <li key={row.id}>{tuitionReplyLabel(row.choice)} · {timeText(row.submitTime)} · nhận {timeText(row.receivedAt)} · {row.trackingId} · {row.source}</li>)}</ul> : <p>Chưa có lịch sử phản hồi.</p>}
          <p>Xem trước không tạo lượt gửi. Xác nhận chỉ ghi lỗi khi Zalo thật đang tắt, và không đổi trạng thái nhắc học phí thành đã gửi. Dừng học chỉ ghi nhận ý định.</p>
        </div>
      </div>
    </SectionCard>}
    <SectionCard title="Zalo tự động">
      <div id="zalo-auto" className="space-y-2">
        <p>Chế độ hiện tại: xem trước. Gửi thật đang tắt. Chưa bật lịch gửi tự động và chưa gửi tồn đọng.</p>
        <p>Mẫu duy nhất ZALO_TUITION_REMINDER — Thông báo kỳ học và học phí. Loại mẫu: phản hồi nhanh, hai nút Tiếp tục học và Dừng học. Trạng thái mẫu: bản nháp. Mã mẫu Zalo: chưa gán. Nhắc gia hạn không phải nhắc nợ.</p>
        <p>Phạm vi: chi nhánh đang lọc trên trang này. Mốc nhắc vẫn là lịch học phí đã duyệt. Lần chạy gần nhất: chưa có vì lịch gửi chưa được bật.</p>
        <p>Tạm dừng nhắc từng học viên chưa mở, vì gửi tự động chưa chạy. Không có nút gửi hàng loạt.</p>
      </div>
    </SectionCard>
  </AppPage>
}
