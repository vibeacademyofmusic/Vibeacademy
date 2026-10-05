import Link from 'next/link'
import CheckoutLink from './CheckoutLink'
import ReminderDialog from './ReminderDialog'
import { reminderReturnHref } from './dialog-context'
import { tuitionCheckoutUrl } from '@/lib/integrations/tuition/checkout-link'
import { adminClient, uuidPattern, type Params } from '../../finance/operations'
import { branches, rows } from '../../finance/query'
import { money } from '../../finance/data'
import { Field, Select, Table, Pager, Notice, LoadError, dateText, timeText } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { AppPage, PageHeader, MetricCard, StatusBadge, FilterBar, SectionCard } from '../../_components/vibe'
import { plans, debts } from '../data'
import { reminders, kpis, timing, filters, replyFilters, type Reminder } from './data'
import { generateReminders, resolveReminder, confirmTuitionZalo, recordTuitionNoticeConsent, recordTuitionContactNote } from './actions'
import { createTuitionRenewal, retryTuitionPayos, retryTuitionNotice } from './renewal-actions'
import { PAYMENT_TEMPLATE_REQUEST, renewalPaymentLabel, renewalProcessingLabel } from '@/lib/integrations/tuition/renewal-status'
import { loadTuitionNotice } from './notice'
import { noticeDate, zaloAttemptLabel } from '@/lib/integrations/zalo/tuition-notice'
import { zaloPilotOutboundBlocked } from '@/lib/integrations/zalo/pilot-outbound'
import { TUITION_CONTACT_STATUS, TUITION_REPLY_CONTINUE, TUITION_REPLY_OTHER, TUITION_REPLY_STOP, oauthCallbackLabel, readTuitionResponseSyncStatus, tuitionNoticeReplyLabel, tuitionResponseSyncFailing, tuitionSendLabel, webhookEndpointLabel } from '@/lib/integrations/zalo/tuition-reply'
import { zaloPublicProfile } from '@/lib/integrations/zalo/admin'
import { ReplySyncRefresh } from './ReplySyncRefresh'

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
function SendMark({ label }: { label: string }) {
  const tone = label === 'Đã gửi' ? 'success' : label === 'Gửi thất bại' ? 'error' : 'neutral'
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

function ReplyMark({ label }: { label: string }) {
  if (label === TUITION_REPLY_CONTINUE) return <StatusBadge tone="success">{label}</StatusBadge>
  if (label === TUITION_REPLY_OTHER) return <StatusBadge tone="warning">{label}</StatusBadge>
  if (label === TUITION_REPLY_STOP || label === 'Đồng bộ phản hồi đang lỗi') return <StatusBadge tone="error">{label}</StatusBadge>
  return <span>{label}</span>
}

function StatusCell({ row }: { row: Reminder }) {
  const label = statusLabel(row)
  const overdue = label === 'Quá hạn nhắc' || label === 'Quá hạn thanh toán nợ'
  return <span className="inline-flex flex-wrap gap-1"><StatusBadge tone={statusTone(row)}>{label}</StatusBadge>{overdue && <StatusBadge tone="warning">Cảnh báo</StatusBadge>}</span>
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function renewHref(params: Params, id: string) {
  const query = new URLSearchParams()
  for (const key of ['state', 'branch', 'plan', 'page', 'reply'] as const) if (params[key]) query.set(key, params[key]!)
  query.set('renew', id)
  return `/admin/tuition/reminders?${query}`
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
  // Selected detail is independently scoped by database RLS, not by current pagination/filters.
  let selectedRenewalReminder: Reminder | null = null
  if (uuidPattern.test(params.renew ?? '')) {
    const selected = await db.from('tuition_reminder_operations').select('*').eq('id', params.renew!).maybeSingle()
    if (selected.error) return <LoadError />
    selectedRenewalReminder = selected.data as Reminder | null
  }
  const processResult = uuidPattern.test(params.process ?? '') ? await db.from('tuition_reminder_operations').select('*').eq('id', params.process!).maybeSingle() : null
  const processRow = processResult?.data as Reminder | null
  const detailRows = selectedRenewalReminder && !list.data.some(row => row.id === selectedRenewalReminder!.id)
    ? [...list.data, selectedRenewalReminder] : list.data

  const attemptRows = list.data.length ? await rows(db.from('notification_jobs').select('entity_id,status,created_at').eq('entity_type', 'TUITION_REMINDER').eq('template_key', 'ZALO_TUITION_REMINDER').in('entity_id', list.data.map(row => row.id)).order('created_at', { ascending: false }).returns<{ entity_id: string; status: string; created_at: string }[]>()) : []
  const attemptByReminder = new Map<string, string>()
  for (const attempt of attemptRows) {
    const current = attemptByReminder.get(attempt.entity_id)
    if (!current) attemptByReminder.set(attempt.entity_id, attempt.status)
  }
  const sendStateRows = list.data.length ? await rows(db.from('tuition_zalo_sends').select('reminder_id,send_status,created_at').in('reminder_id', list.data.map(row => row.id)).order('created_at', { ascending: false }).returns<{ reminder_id: string; send_status: string; created_at: string }[]>()) : []
  const sendByReminder = new Map<string, string>()
  for (const send of sendStateRows) if (!sendByReminder.has(send.reminder_id)) sendByReminder.set(send.reminder_id, send.send_status)
  type RenewalRow = { id: string; reminder_id: string; state: string; plan_code: string; list_price: number; amount_due: number; payment_option: string; paid_amount: number; starts_on: string; due_on: string; zbs_status: string; confirmation_status: string; invoice_id: string; last_event: string | null }
  const renewalRows = detailRows.length ? await rows(db.from('tuition_renewal_cases').select('id,reminder_id,state,plan_code,list_price,amount_due,payment_option,paid_amount,starts_on,due_on,zbs_status,confirmation_status,invoice_id,last_event').in('reminder_id', detailRows.map(row => row.id)).returns<RenewalRow[]>()) : []
  const renewalByReminder = new Map(renewalRows.map(row => [row.reminder_id, row]))
  const invoiceRows = renewalRows.length ? await rows(db.from('invoices').select('id,invoice_number,status').in('id', renewalRows.map(row => row.invoice_id)).returns<{ id: string; invoice_number: string; status: string }[]>()) : []
  const invoiceById = new Map(invoiceRows.map(row => [row.id, row]))
  const orderRows = renewalRows.length ? await rows(db.from('tuition_payos_orders').select('case_id,state,checkout_url,payment_link_id,amount').in('case_id', renewalRows.map(row => row.id)).order('created_at', { ascending: false }).returns<{ case_id: string; state: string; checkout_url: string | null; payment_link_id: string | null; amount: number }[]>()) : []
  const orderByCase = new Map<string, { state: string; checkout_url: string | null; payment_link_id: string | null; amount: number }>()
  for (const order of orderRows) if (!orderByCase.has(order.case_id)) orderByCase.set(order.case_id, order)
  const returnHref = reminderReturnHref(params)
  const contextHref = reminderReturnHref(params, true)
  const context = <input type="hidden" name="return_context" value={contextHref} />
  const manualLive = !zaloPilotOutboundBlocked()
  const syncResult = await db.rpc('tuition_zalo_response_sync_status')
  const sync = syncResult.error ? null : readTuitionResponseSyncStatus(syncResult.data)
  const syncFailing = tuitionResponseSyncFailing(sync)
  const selectedId = uuidPattern.test(params.zalo ?? params.history ?? '') ? (params.zalo ?? params.history)! : ''
  let notice = null
  let noticeError = ''
  if (selectedId) {
    try { notice = await loadTuitionNotice(db, selectedId, uuidPattern.test(params.parent ?? '') ? params.parent! : null) }
    catch { noticeError = 'Không tải được thông báo và lịch sử. Hãy đóng cửa sổ rồi thử lại; chưa gửi tin.' }
  }
  return <AppPage>
    <PageHeader title="Nhắc học phí" description="Gói 3 tháng: tuần đầu của tháng thứ ba hệ thống cập nhật lịch báo. Từ tuần thứ ba của tháng đó đến hết kỳ vẫn trong hạn và cảnh báo đỏ. Qua ngày cuối kỳ là quá hạn, cảnh báo đỏ và vàng. Gói 3 tháng đã thanh toán 50%: phần còn lại đến hạn thanh toán trong tuần đầu của tháng thứ hai; qua tuần đó là quá hạn thanh toán nợ. Học phí năm đã thanh toán 50%: phần còn lại đến hạn ở tuần thứ tư của tháng thứ ba, và qua tuần đầu của tháng thứ tư thì quá hạn thanh toán nợ. Bảo lưu không dịch các mốc này. Gói năm thanh toán đủ vẫn nhắc gia hạn ở tháng thứ mười. Chưa gửi tin cho phụ huynh." actions={<Link scroll={false} prefetch={false} href={returnHref + (returnHref.includes('?') ? '&' : '?') + 'auto=1'}>Gửi báo tự động qua Zalo</Link>} />
    {!uuidPattern.test(params.renew ?? '') && !selectedId && !uuidPattern.test(params.process ?? '') && params.auto !== '1' && <Notice params={params} />}
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
      const rowOrder = orderByCase.get(renewalByReminder.get(r.id)?.id ?? '')
      const rowCheckout = rowOrder ? tuitionCheckoutUrl(rowOrder.payment_link_id, rowOrder.checkout_url) : null
      return [r.full_name + ' (' + r.student_code + ')', r.branch_name_snapshot + ' / ' + r.plan_name_snapshot,
        <Link prefetch={false} key="term" href={'/admin/tuition?selected=' + r.enrollment_tuition_id}>{dateText(r.starts_on)} → {dateText(r.effective_ends_on)}</Link>,
        dateText(r.window_start) + ' → ' + dateText(r.window_end), <StatusCell key="status" row={r} />, money(r.amount, r.currency),
        debt ? <Link prefetch={false} key="invoice" href={'/admin/finance/invoices?selected=' + debt.invoice_id}>{debt.invoice_number} • {debt.receivable_status} • {debt.invoice_status === 'ISSUED' ? 'Còn nợ' : 'Số dư hóa đơn (chưa ghi nhận công nợ)'}{' '}{money(debt.outstanding_balance, debt.currency)}</Link> : 'Chưa có hóa đơn',
        <span key="zalo" className="grid min-w-36 gap-1 text-sm"><SendMark label={sendByReminder.has(r.id) ? tuitionSendLabel(sendByReminder.get(r.id)) : zaloAttemptLabel(attemptByReminder.get(r.id))} /><Link className="vibe-button" scroll={false} prefetch={false} href={zaloHref(params, r.id)} aria-label={'Gửi Zalo cho ' + r.full_name}>Gửi Zalo</Link><Link className="text-sm underline" scroll={false} prefetch={false} href={zaloHref(params, r.id).replace('zalo=', 'history=')}>Lịch sử</Link></span>,
        <span key="reply" className="grid min-w-28 gap-1 text-sm"><ReplyMark label={tuitionNoticeReplyLabel(sendByReminder.get(r.id), r.reply_choice)} />{r.reply_choice === 'CONTACT' && <StatusBadge tone="warning">{TUITION_CONTACT_STATUS}</StatusBadge>}{r.reply_submit_time && <small>{timeText(r.reply_submit_time)}</small>}{r.contact_note && <small>Xử lý: {r.contact_note}{r.contact_noted_at ? ` · ${timeText(r.contact_noted_at)}` : ''}{r.contact_noted_by_name ? ` · ${r.contact_noted_by_name}` : ''}</small>}{r.reply_needs_review && <StatusBadge tone="warning">Cần xác minh</StatusBadge>}</span>,
        <span key="process" className="grid min-w-52 gap-2 text-sm"><span>Xử lý nội bộ: {renewalProcessingLabel(renewalByReminder.get(r.id)?.state, Boolean(r.reply_choice))}</span><span>Thanh toán: {renewalPaymentLabel(renewalByReminder.get(r.id)?.state)}</span>{renewalByReminder.get(r.id) && <span>{renewalByReminder.get(r.id)!.plan_code === 'VIBE_12_MONTHS' ? '1 năm' : '3 tháng'} · {money(renewalByReminder.get(r.id)!.list_price, 'VND')} · đến hạn {money(renewalByReminder.get(r.id)!.amount_due, 'VND')}</span>}{invoiceById.get(renewalByReminder.get(r.id)?.invoice_id ?? '') && <span>{invoiceById.get(renewalByReminder.get(r.id)!.invoice_id)!.invoice_number} · {invoiceById.get(renewalByReminder.get(r.id)!.invoice_id)!.status}</span>}{rowCheckout && <a className="underline" href={rowCheckout}>Mở payOS</a>}<Link className="vibe-button" scroll={false} prefetch={false} href={renewHref(params, r.id)}>Gia hạn</Link><button type="button" className="vibe-button" disabled aria-disabled="true" title="Chưa mở">Nghỉ học</button><button type="button" className="vibe-button" disabled aria-disabled="true" title="Chưa mở">Tạm ngừng</button>{r.status === 'PENDING' && <Link scroll={false} prefetch={false} className="vibe-button" href={renewHref(params, r.id).replace('renew=', 'process=')}>Xử lý nhắc</Link>}{r.status !== 'PENDING' && <span>{r.reason}{r.marked_at && <small className="block">{timeText(r.marked_at)}</small>}</span>}</span>]
    })} />
    <Pager path="/admin/tuition/reminders" params={params} {...list} />
    {uuidPattern.test(params.renew ?? '') && await (async () => {
      const renewRow = selectedRenewalReminder
      if (!renewRow) return <ReminderDialog title="Tạo gia hạn học phí" closeHref={returnHref}><p role="alert">Không tìm thấy nhắc học phí hoặc bạn không có quyền xem hồ sơ này.</p></ReminderDialog>
      const start = nextDate(renewRow.effective_ends_on)
      const quotes = await Promise.all(['VIBE_3_MONTHS', 'VIBE_12_MONTHS'].flatMap(plan => ['DEPOSIT_50', 'FULL'].map(async option => {
        const result = await db.rpc('preview_tuition_renewal', { p_reminder: renewRow.id, p_plan_code: plan, p_payment_option: option, p_starts_on: start })
        const data = result.data && typeof result.data === 'object' ? result.data as { list_price?: number; amount_due?: number; open_case_id?: string | null; current_ends_on?: string; branch_name?: string } : null
        return { plan, option, data, error: result.error?.message ?? '' }
      })))
      const renewal = renewalByReminder.get(renewRow.id)
      const order = renewal ? orderByCase.get(renewal.id) : undefined
      return <ReminderDialog title="Tạo gia hạn học phí" closeHref={returnHref}>
        <Notice params={params} />
        <div className="grid gap-4">
          <p>{renewRow.full_name} ({renewRow.student_code}) · {renewRow.branch_name_snapshot} · {renewRow.plan_name_snapshot}</p>
          <p>Kỳ hiện tại: {dateText(renewRow.starts_on)} → {dateText(renewRow.effective_ends_on)}. Ngày bắt đầu kỳ mới dự kiến: {dateText(start)}.</p>
          <p>Phản hồi khách hàng: {tuitionNoticeReplyLabel(sendByReminder.get(renewRow.id), renewRow.reply_choice)}. Xử lý nội bộ do nhân viên chọn, không tự lấy từ nút Tiếp tục học.</p>
          {renewal && <p>Đã có gia hạn mở: {renewalProcessingLabel(renewal.state, true)}. Hóa đơn {invoiceById.get(renewal.invoice_id)?.invoice_number ?? 'đã tạo'}. Đã thu {money(renewal.paid_amount, 'VND')}. Còn lại {money(Number(renewal.list_price) - Number(renewal.paid_amount), 'VND')}.</p>}
          <ul className="grid gap-1 text-sm">{quotes.map(quote => <li key={quote.plan + quote.option}>{quote.plan === 'VIBE_12_MONTHS' ? '1 năm' : '3 tháng'} · {quote.option === 'DEPOSIT_50' ? 'Đặt cọc 50%' : 'Thanh toán 100%'}: {quote.data ? `${money(quote.data.list_price ?? 0, 'VND')} · đến hạn ${money(quote.data.amount_due ?? 0, 'VND')}` : 'Không đọc được giá chi nhánh'}</li>)}</ul>
          <form action={createTuitionRenewal} className="grid max-w-xl gap-3">{context}
            <input type="hidden" name="reminder_id" value={renewRow.id} />
            <label className="vibe-field"><span>Gói học phí</span><select name="plan_code" required defaultValue={renewal?.plan_code ?? 'VIBE_3_MONTHS'}><option value="VIBE_3_MONTHS">3 tháng</option><option value="VIBE_12_MONTHS">1 năm</option></select></label>
            <label className="vibe-field"><span>Cách thanh toán</span><select name="payment_option" required defaultValue={renewal?.payment_option ?? 'DEPOSIT_50'}><option value="DEPOSIT_50">Đặt cọc 50%</option><option value="FULL">Thanh toán 100%</option></select></label>
            <label className="vibe-field"><span>Ngày bắt đầu kỳ mới</span><input name="starts_on" type="date" required defaultValue={renewal?.starts_on ?? start} /></label>
            <label className="vibe-field"><span>Hạn thanh toán</span><input name="due_on" type="date" required defaultValue={renewal?.due_on ?? renewRow.window_end} /></label>
            <label className="vibe-field"><span>Ghi chú nội bộ</span><textarea name="note" maxLength={2000} rows={3} /></label>
            <SubmitButton className="vibe-button vibe-button-primary" pendingLabel="Đang tạo gia hạn">Tạo gia hạn học phí</SubmitButton>
          </form>
          {renewal && <div className="flex flex-wrap gap-2"><form action={retryTuitionPayos}>{context}<input type="hidden" name="case_id" value={renewal.id} /><SubmitButton className="vibe-button">Mở / đối chiếu đơn payOS</SubmitButton></form><form action={retryTuitionNotice}>{context}<input type="hidden" name="case_id" value={renewal.id} /><SubmitButton className="vibe-button">Gửi lại ZBS</SubmitButton></form></div>}
          {order && tuitionCheckoutUrl(order.payment_link_id, order.checkout_url) && <CheckoutLink url={tuitionCheckoutUrl(order.payment_link_id, order.checkout_url)!} />}
          {order?.checkout_url && !tuitionCheckoutUrl(order.payment_link_id, order.checkout_url) && <p role="alert">Link payOS đã lưu không hợp lệ. Cần đối chiếu đơn trước khi thử lại.</p>}
          {renewal && <p>ZBS thanh toán: {renewal.zbs_status}. Xác nhận sau thu: {renewal.confirmation_status}. Bắt đầu kỳ mới: {dateText(renewal.starts_on)}. Sự kiện gần nhất: {renewal.last_event ?? 'chưa có'}.</p>}
          {renewal?.zbs_status === 'AWAITING_TEMPLATE' && <p>{PAYMENT_TEMPLATE_REQUEST}</p>}
        </div>
      </ReminderDialog>
    })()}
    {selectedId && <ReminderDialog title={params.history ? "Lịch sử Zalo" : "Gửi thông báo học phí"} closeHref={returnHref}>
      <Notice params={params} />
      {!notice && <p role="alert">{noticeError || "Không tìm thấy nhắc học phí hoặc bạn không có quyền xem hồ sơ này."}</p>}
      {notice && <>
      {!params.history && <>
      <div className="space-y-3" id="gui-zalo">
        <p>{notice.studentName} ({notice.studentCode}) · {notice.branchName} · {noticeDate(notice.periodStart)} → {noticeDate(notice.periodEnd)}</p>
        <p>Người nhận: {notice.recipient?.name ?? 'Chưa chọn'} · {notice.maskedPhone}</p>
        <p className="flex flex-wrap items-center gap-2">Trạng thái gửi: <SendMark label={notice.attemptLabel} /> <span>Đơn giá theo số điện thoại: {notice.priceVnd.toLocaleString('vi-VN')} VND/tin. Đường dẫn nút: không có.</span></p>
        {notice.candidates.length > 1 && <p className="flex flex-wrap gap-2">{notice.candidates.map(candidate => <Link className="vibe-button" key={candidate.id} scroll={false} prefetch={false} href={zaloHref(params, notice.reminderId) + '&parent=' + candidate.id}>{candidate.name}</Link>)}</p>}
        <p className="flex flex-wrap items-center gap-2">Phản hồi: <ReplyMark label={notice.replyLabel} />{notice.replyChoice === 'CONTACT' ? <StatusBadge tone="warning">{TUITION_CONTACT_STATUS}</StatusBadge> : null}{notice.replyAt ? <span>{timeText(notice.replyAt)}</span> : null}{notice.needsReview ? <StatusBadge tone="warning">Cần xác minh</StatusBadge> : null}</p>
        {notice.replyChoice === 'CONTACT' && <form action={recordTuitionContactNote} className="grid max-w-xl gap-3 rounded-xl border border-[var(--vibe-line)] bg-white p-4">{context}
          <p className="text-sm">Yêu cầu khác chỉ đưa hồ sơ vào danh sách cần nhân viên liên hệ. Lưu nội dung xử lý không đổi trạng thái học viên, ghi danh, bảo lưu, công nợ hoặc thanh toán.</p>
          <input type="hidden" name="reminder_id" value={notice.reminderId} />
          <label className="vibe-field"><span>Nội dung xử lý</span><textarea name="contact_note" required maxLength={2000} defaultValue={notice.contactNote ?? ''} rows={3} /></label>
          {notice.contactNotedAt && <p className="text-sm">Đã lưu lúc {timeText(notice.contactNotedAt)}{notice.contactNotedBy ? ` · ${notice.contactNotedBy}` : ''}.</p>}
          <SubmitButton className="vibe-button">Lưu nội dung xử lý</SubmitButton>
        </form>}
        <pre className="whitespace-pre-wrap rounded-xl border border-[var(--vibe-line)] bg-white p-4 text-sm">{notice.preview}</pre>
        {notice.blockers.length > 0 && <ul className="list-disc pl-5 text-sm">{notice.blockers.map(item => <li key={item}>{item}</li>)}</ul>}
        {notice.recipient && !notice.consentRecord && <form action={recordTuitionNoticeConsent} className="grid max-w-xl gap-3 rounded-xl border border-[var(--vibe-line)] bg-white p-4">{context}
          <p className="text-sm">Đồng ý nhận thông báo học phí gắn với từng học viên và phụ huynh này, không dùng đồng ý của học viên khác hay đồng ý lúc đăng ký. Chỉ ghi sau khi chính phụ huynh xác nhận cho {notice.studentName} ({notice.studentCode}).</p>
          <input type="hidden" name="reminder_id" value={notice.reminderId} />
          <input type="hidden" name="parent_id" value={notice.recipient.id} />
          <label className="vibe-field"><span>Nguồn xác nhận của phụ huynh</span><select name="source" required defaultValue=""><option value="" disabled>Chọn nguồn xác nhận thực tế</option><option value="TUITION_NOTICE_IN_PERSON">Phụ huynh xác nhận trực tiếp</option><option value="TUITION_NOTICE_PHONE">Phụ huynh xác nhận qua cuộc gọi</option><option value="TUITION_NOTICE_WRITTEN">Phụ huynh xác nhận bằng văn bản hoặc tin nhắn</option></select></label>
          <label className="flex items-start gap-2 text-sm"><input name="tuition_notice_consent" type="checkbox" value="yes" required />Tôi xác nhận phụ huynh đã đồng ý nhận thông báo học phí qua Zalo cho đúng học viên này.</label>
          <SubmitButton className="vibe-button">Ghi nhận đồng ý</SubmitButton>
        </form>}
        {notice.consentRecord && <p className="text-sm">Đã ghi nhận đồng ý cho đúng học viên này lúc {timeText(notice.consentRecord.grantedAt)}. Phạm vi: một học viên. Nguồn: {notice.consentRecord.source === 'TUITION_NOTICE_IN_PERSON' ? 'xác nhận trực tiếp' : notice.consentRecord.source === 'TUITION_NOTICE_PHONE' ? 'cuộc gọi' : notice.consentRecord.source === 'TUITION_NOTICE_WRITTEN' ? 'văn bản hoặc tin nhắn' : 'chưa ghi nguồn'}. Người ghi nhận: {notice.consentRecord.recordedBy ?? 'Chưa ghi nhận'}.</p>}
        {notice.deliveryBlockers.length > 0 && <ul className="list-disc pl-5 text-sm">{notice.deliveryBlockers.map(item => <li key={item}>{item}</li>)}</ul>}
        <div className="flex flex-wrap gap-2">
          <Link scroll={false} className="vibe-button" href={returnHref}>Hủy</Link>
          <form action={confirmTuitionZalo}>{context}<input type="hidden" name="reminder_id" value={notice.reminderId} />{notice.recipient && <input type="hidden" name="parent_id" value={notice.recipient.id} />}<SubmitButton className="vibe-button vibe-button-primary">Xác nhận gửi cho học viên này</SubmitButton></form>
        </div>
      </div>
      </>}
        <div id="lich-su" className="space-y-2 text-sm">
          <p>Lịch sử gửi: {notice.sends.length ? notice.sends.map(row => `${row.sendStatus} · ${row.trackingId}`).join(' · ') : notice.attemptLabel}. Đã tiếp nhận nghĩa là Zalo đã nhận tin, chưa phải đã tới máy. Đã phát đến máy là Zalo xác nhận tin đã tới điện thoại. Mẫu đang dùng nhận Tiếp tục học hoặc Dừng học. Yêu cầu khác chỉ áp dụng khi mẫu thay thế được duyệt và đưa vào sử dụng. Mỗi dòng giữ đúng chữ Zalo trả về, kèm thời điểm.</p>
          <p>Lịch sử phản hồi:</p>
          {notice.replies.length ? <ul className="list-disc space-y-1 pl-5">{notice.replies.map(row => <li key={row.id}><ReplyMark label={row.buttonData} /> · {timeText(row.submitTime)} · nhận {timeText(row.receivedAt)} · {row.trackingId} · {row.source}</li>)}</ul> : <p>Chưa có lịch sử phản hồi.</p>}
          <p>{manualLive ? 'Gửi thật thủ công đã bật cho đúng một học viên đã đủ điều kiện. Gửi theo lịch vẫn tắt. Không gửi hàng loạt.' : 'Xem trước không tạo lượt gửi. Gửi thật đang tắt.'} Tiếp tục học, Yêu cầu khác và Dừng học chỉ ghi nhận ý định.</p>
        </div>
      </>}
    </ReminderDialog>}
    {uuidPattern.test(params.process ?? '') && <ReminderDialog title="Xử lý nhắc học phí" closeHref={returnHref}>
      <Notice params={params} />
      {processResult?.error ? <LoadError /> : !processRow ? <p role="alert">Không tìm thấy nhắc học phí hoặc bạn không có quyền xem.</p> : processRow.status !== 'PENDING' ? <p>Nhắc học phí này đã được xử lý. {processRow.reason}</p> : <form action={resolveReminder} className="grid gap-3">{context}
        <p>{processRow.full_name} ({processRow.student_code}) · {processRow.branch_name_snapshot}</p>
        <input type="hidden" name="reminder_id" value={processRow.id} />
        <Select name="status" label="Xử lý nhắc" required options={[{ id: 'SKIPPED', name: 'Bỏ qua' }, { id: 'CANCELLED', name: 'Hủy do không hợp lệ' }]} />
        <Field name="reason" label="Lý do" required />
        <SubmitButton className="vibe-button vibe-button-primary">Lưu xử lý</SubmitButton>
      </form>}
    </ReminderDialog>}
    <ReplySyncRefresh paused={Boolean(params.renew || selectedId || params.process || params.auto)} />
    <SectionCard title="Đồng bộ phản hồi Zalo">
      <div className="space-y-2 text-sm">
        <p>Trang này tự làm mới phản hồi khi đang mở. Tiếp tục học chỉ là nội dung nút, không phải đã thanh toán. Cần liên hệ là yêu cầu nhân viên gọi lại. Cần xác minh là hai phản hồi khác nhau trên cùng tin, phải rà soát.</p>
        <p>Lần đồng bộ API thành công gần nhất: {sync?.lastSuccessAt ? timeText(sync.lastSuccessAt) : 'Chưa có.'}</p>
        {sync?.lastErrorAt ? <p>Lỗi đồng bộ gần nhất: {timeText(sync.lastErrorAt)} · mã {sync.lastErrorCode ?? 'không có mã'}{sync.authBackoffUntil ? ` · tạm dừng gọi đến ${timeText(sync.authBackoffUntil)}` : ''}</p> : <p>Chưa ghi nhận lỗi đồng bộ API.</p>}
        <p><StatusBadge tone={!sync ? 'warning' : sync.lastErrorAt && (!sync.lastSuccessAt || sync.lastErrorAt > sync.lastSuccessAt) ? 'error' : syncFailing ? 'warning' : 'success'}>{!sync ? 'API: chưa đọc được trạng thái' : sync.lastErrorAt && (!sync.lastSuccessAt || sync.lastErrorAt > sync.lastSuccessAt) ? 'API phản hồi đang lỗi' : syncFailing ? 'API phản hồi chưa hoạt động' : 'API phản hồi đang hoạt động'}</StatusBadge> Trạng thái API không xác định phụ huynh đã bấm hay chưa.</p>
        <p><StatusBadge tone={!sync || sync.webhookClicks === 0 ? 'warning' : sync.webhookPending > 0 ? 'error' : 'info'}>{!sync ? 'Webhook: chưa đọc được trạng thái' : sync.webhookPending > 0 ? 'Webhook: có phản hồi chờ xử lý' : sync.webhookClicks > 0 ? 'Webhook: đã lưu sự kiện phản hồi' : 'Webhook: chưa ghi nhận sự kiện phản hồi thật'}</StatusBadge>{sync ? ` ${sync.webhookClicks} sự kiện đã lưu, ${sync.webhookPending} sự kiện chưa xử lý xong.` : ''} Test kết nối không được tính là phản hồi học phí.</p>
        <p>Phản hồi của từng hồ sơ chỉ cập nhật từ dữ liệu đã đối chiếu và lưu. Thiếu dòng phản hồi không có nghĩa là phụ huynh chưa bấm.</p>
        <p className="break-words">App gửi tin {zaloPublicProfile.appId}. OA {zaloPublicProfile.oaId}. Credential đã lưu: app {sync?.credentialAppId ?? 'chưa đọc được'}, OA {sync?.credentialOaId ?? 'chưa đọc được'}. {webhookEndpointLabel(process.env.ZALO_WEBHOOK_PUBLIC_URL)} {oauthCallbackLabel(process.env.ZALO_OAUTH_REDIRECT_URI)}</p>
        {syncFailing && <ol className="list-decimal space-y-1 pl-5">
          <li>Đăng nhập tài khoản quản trị của OA Vibe Academy, mã {zaloPublicProfile.oaId}.</li>
          <li>Mở ứng dụng {zaloPublicProfile.appId} và xem quyền đã cấp cho đúng OA này. Ô chọn lúc yêu cầu quyền không được tính là đã cấp.</li>
          <li>Cần thấy đã cấp: Quản lý Message Template, và Nhận sự kiện quản lý Message Template.</li>
          <li>Webhook URL của ứng dụng phải là HTTPS kết thúc bằng /api/integrations/zalo/webhook, và tiến trình nhận phía sau địa chỉ đó phải đang chạy. Không điền callback OAuth.</li>
          <li>Đối chiếu log với mã tin và mã theo dõi của lần gửi hiện có; xử lý lại sự kiện đã lưu hoặc yêu cầu Zalo kiểm tra việc phát webhook. Không cần gửi tin hoặc phản hồi lại.</li>
        </ol>}
        {sync?.intervalSeconds == null && <p>Chu kỳ gọi API phản hồi chưa bật vì Zalo chưa công bố giới hạn tần suất đã xác minh, và lần gọi gần nhất chưa thành công.</p>}
      </div>
    </SectionCard>
    {params.auto === '1' && <ReminderDialog title="Zalo tự động" closeHref={returnHref}>
      <div id="zalo-auto" className="space-y-2">
        <p>{manualLive ? 'Chế độ hiện tại: Gửi thật thủ công đã bật. Gửi theo lịch đang tắt. Chưa gửi tồn đọng.' : 'Chế độ hiện tại: xem trước. Gửi thật đang tắt. Chưa bật lịch gửi tự động và chưa gửi tồn đọng.'}</p>
        <p>Mẫu đang gửi vẫn là ZALO_TUITION_REMINDER, mã Zalo 643118, trạng thái đã duyệt. Nút trên tin thật của mẫu này vẫn là Tiếp tục học và Dừng học. Chưa chuyển mã mẫu. Tham số: tên phụ huynh, kỳ học, tên học viên, học phí gói, hạn cuối khoảng nhắc, mã học viên. Không có đường dẫn. Gửi theo lịch đang tắt. Mẫu đăng ký 640377 giữ nguyên. Nhắc gia hạn không lấy số nợ.</p>
        <p>Nội dung mẫu thay thế đã chuẩn bị, chờ tạo và duyệt trên Zalo. Chưa dùng để gửi:</p>
        <pre className="whitespace-pre-wrap rounded-xl border border-[var(--vibe-line)] bg-white p-4 text-sm">{notice?.replacementPreview ?? 'Quý khách {customer_name}, Vibe Academy thông báo sắp kết thúc khoá học của học viên {student_name}, mã học viên {student_code}, kỳ học {period}. Học phí cần gia hạn là: {amount} đồng. Hạn thanh toán: {due_date}. Vui lòng xác nhận kế hoạch học tập của bạn để nhà trường có thể sắp xếp chương trình và kế hoạch tiếp theo cho mình. Vui lòng xác nhận bên dưới.\nNút phản hồi: Tiếp tục học\nNút phản hồi: Yêu cầu khác\nKhông có đường dẫn.'}</pre>
        <p>Phạm vi: chi nhánh đang lọc trên trang này. Mốc nhắc vẫn là lịch học phí đã duyệt. Lần chạy gần nhất: chưa có vì lịch gửi chưa được bật.</p>
        <p>Tạm dừng nhắc từng học viên chưa mở, vì gửi tự động chưa chạy. Không có nút gửi hàng loạt.</p>
      </div>
    </ReminderDialog>}
  </AppPage>
}
