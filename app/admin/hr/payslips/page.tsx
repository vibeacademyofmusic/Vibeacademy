import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { AppPage, DataTable, FormField, InlineNotice, MoneyDisplay, SelectField, StatusBadge } from '../../_components/vibe'
import { Notice } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { vietnamDateTime, type Params } from '../../finance/operations'
import { payslipComponentName } from '../../../documents/payslips/data'
import { payslipDisbursementAction } from './actions'
import { loadPayslipDisbursements } from './data'
import { paymentMethodLabels, paymentStatusLabels, type MoneyValue, type PaymentStatus, type PayrollDisbursementDetail } from './model'
import styles from './payslips.module.css'

function periodText(value: string) {
  const [year, month] = value.slice(0, 7).split('-')
  return `${month}/${year}`
}

function dateText(value: string | null) {
  return value ? value.slice(0, 10).split('-').reverse().join('/') : '—'
}

function timeText(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function paymentTone(status: PaymentStatus): 'neutral' | 'warning' | 'success' {
  if (status === 'PAID') return 'success'
  if (status === 'PARTIALLY_PAID') return 'warning'
  return 'neutral'
}

function Amount({ value, currency }: { value: MoneyValue; currency: string }) {
  return value == null ? <span>—</span> : <MoneyDisplay value={value} currency={currency}/>
}

function queryHref(params: Params, changes: Record<string, string | null>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value && !['error', 'success'].includes(key)) query.set(key, value)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) query.delete(key)
    else query.set(key, value)
  }
  return `/admin/hr/payslips?${query}`
}

function Workflow({ detail }: { detail: PayrollDisbursementDetail }) {
  const finalized = detail.period.status === 'FINALIZED'
  return <ol className={styles.workflow} aria-label="Luồng phiếu lương và chi trả">
    <li data-done><span>1</span><div><strong>Kỳ lương</strong><small>{finalized ? 'Đã chốt' : 'Đã duyệt'}</small></div></li>
    <li data-done><span>2</span><div><strong>Phiếu lương</strong><small>Sẵn sàng xem / in</small></div></li>
    <li data-active={detail.payment_status !== 'PAID'} data-done={detail.payment_status === 'PAID'}><span>3</span><div><strong>Chi trả</strong><small>{paymentStatusLabels[detail.payment_status]}</small></div></li>
  </ol>
}

function Breakdown({ detail }: { detail: PayrollDisbursementDetail }) {
  const currency = detail.payroll.currency
  const entries = detail.engine === 'V2'
    ? [
        ...detail.component_lines_v2.map(line => ({ id: line.id, name: payslipComponentName(line.component_code), source: `${line.category} · ${line.source_type}`, date: line.earned_on, amount: line.amount })),
        ...detail.period_actions_v2.map(action => ({ id: action.id, name: payslipComponentName(action.component_code), source: `${action.category} · ${action.reason}`, date: 'Trong kỳ', amount: action.amount })),
        ...detail.adjustments.map(item => ({ id: item.id, name: `Điều chỉnh · ${item.kind}`, source: item.reason, date: 'Trong kỳ', amount: item.amount })),
      ]
    : [
        ...detail.lines.map(line => ({ id: line.id, name: line.kind, source: 'Dữ liệu lương lịch sử', date: line.earned_on, amount: line.amount })),
        ...detail.adjustments.map(item => ({ id: item.id, name: `Điều chỉnh · ${item.kind}`, source: item.reason, date: 'Trong kỳ', amount: item.amount })),
      ]

  return entries.length ? <div className={styles.breakdown}>{entries.map(entry => <div className={styles.breakdownRow} key={entry.id}><div><strong>{entry.name}</strong><small>{entry.source}</small></div><span>{entry.date === 'Trong kỳ' ? entry.date : dateText(entry.date)}</span><Amount value={entry.amount} currency={currency}/></div>)}</div>
    : <InlineNotice>Không có breakdown khả dụng từ nguồn phiếu lương hiện tại. Hệ thống không thay thế bằng số 0.</InlineNotice>
}

export default async function Payslips({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const data = await loadPayslipDisbursements(params)
  if (!params.payroll && data.rows?.length) redirect(queryHref(params, { payroll: data.rows[0].id }))
  const detail = data.detail
  const currency = detail?.payroll.currency ?? 'VND'

  return <AppPage>
    <Notice params={params}/>
    <header className={styles.pageHeader}>
      <div><p className={styles.eyebrow}>05 / Phiếu lương</p><h1>Phiếu lương &amp; chi trả</h1><p>Theo dõi phiếu lương đã duyệt, số phải trả và lịch sử chi trả thực tế cho từng nhân sự.</p>{detail && <div className={styles.badges}><StatusBadge tone={detail.period.status === 'FINALIZED' ? 'success' : 'info'}>{detail.period.status === 'FINALIZED' ? 'Đã chốt' : 'Đã duyệt'}</StatusBadge><StatusBadge tone="info">Phiếu lương sẵn sàng</StatusBadge><StatusBadge tone={paymentTone(detail.payment_status)}>{paymentStatusLabels[detail.payment_status]}</StatusBadge></div>}</div>
      {detail && <div className={styles.headerActions}><Link className={styles.secondaryButton} href={`/documents/payslips/${detail.payroll.id}`} prefetch={false}>Xem / In phiếu lương</Link><a className={styles.secondaryButton} href={`?payroll=${detail.payroll.id}#payment-history`}>Lịch sử chi trả</a></div>}
    </header>

    <section className={styles.filterCard} aria-label="Bộ lọc phiếu lương"><form><div className={styles.filterGrid}>
      <SelectField label="Kỳ lương" name="period" defaultValue={params.period ?? ''}><option value="">Tất cả</option>{data.periods?.map(period => <option key={period.id} value={period.id}>{periodText(period.starts_on)} · {period.status === 'FINALIZED' ? 'Đã chốt' : 'Đã duyệt'}</option>)}</SelectField>
      <SelectField label="Chi nhánh" name="branch" defaultValue={params.branch ?? ''}><option value="">Tất cả</option>{data.branches?.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
      <SelectField label="Trạng thái chi trả" name="payment_status" defaultValue={params.payment_status ?? ''}><option value="">Tất cả</option>{Object.entries(paymentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
      <FormField label="Nhân viên / tìm kiếm" name="q" defaultValue={params.q ?? ''} maxLength={100}/>
      <button className={styles.primaryButton}>Lọc</button><Link className={styles.textButton} href="/admin/hr/payslips">Bỏ lọc</Link>
    </div></form>{data.filterError && <InlineNotice tone="error">{data.filterError}</InlineNotice>}</section>

    {data.listError && <InlineNotice tone="error">{data.listError}</InlineNotice>}
    {data.detailError && <InlineNotice tone="error">{data.detailError} Không suy đoán số đã chi hoặc số còn lại.</InlineNotice>}

    {detail && <div className={styles.workspace}>
      <main className={styles.mainColumn}>
        <section className={styles.card} aria-labelledby="payroll-information"><div className={styles.cardHeader}><div><p className={styles.kicker}>Thông tin phiếu lương</p><h2 id="payroll-information">Nhân sự và kỳ lương</h2></div></div><dl className={styles.facts}>
          <div><dt>Nhân viên</dt><dd>{detail.payroll.teacher_name}<small>{detail.employee_code}</small></dd></div>
          <div><dt>Chi nhánh trả lương</dt><dd>{detail.branch.name}</dd></div>
          <div><dt>Kỳ lương</dt><dd>Tháng {periodText(detail.period.starts_on)}<small>{dateText(detail.period.starts_on)} → {dateText(detail.period.ends_on)}</small></dd></div>
          <div><dt>Trạng thái kỳ</dt><dd>{detail.period.status === 'FINALIZED' ? 'Đã chốt' : 'Đã duyệt'}<small>{detail.engine === 'V2' ? 'Payroll V2' : 'Payroll lịch sử'}</small></dd></div>
        </dl></section>

        <section className={styles.card} aria-labelledby="payroll-breakdown"><div className={styles.cardHeader}><div><p className={styles.kicker}>Breakdown đã lưu</p><h2 id="payroll-breakdown">Chi tiết phiếu lương</h2><p>Dữ liệu từ kết quả Payroll đã được lưu; không tính lại từ cấu hình lương.</p></div><span>{currency}</span></div><Breakdown detail={detail}/></section>

        <section className={styles.card} aria-labelledby="record-payment"><div className={styles.cardHeader}><div><p className={styles.kicker}>Chi trả thực tế</p><h2 id="record-payment">Ghi nhận chi trả</h2><p>Hệ thống ghi nhận sự kiện đã xảy ra, không thực hiện chuyển tiền ngân hàng.</p></div></div>
          {detail.can_record ? <form action={payslipDisbursementAction} className={styles.paymentForm}><input type="hidden" name="action" value="record"/><input type="hidden" name="payroll" value={detail.payroll.id}/><input type="hidden" name="currency" value={currency}/><input type="hidden" name="key" value={randomUUID()}/><div className={styles.paymentFields}>
            <FormField label="Ngày chi" name="paid_on" type="date" defaultValue={vietnamDateTime().slice(0,10)} required/>
            <FormField label={`Số tiền (${currency})`} name="amount" type="number" min={currency === 'VND' ? '1' : '0.01'} step={currency === 'VND' ? '1' : '0.01'} defaultValue={String(detail.remaining_amount)} required/>
            <SelectField label="Phương thức" name="payment_method" required><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="OTHER">Khác</option></SelectField>
            <FormField label="Mã giao dịch / số phiếu chi" name="reference" maxLength={200}/>
            <label className={`vibe-field ${styles.paymentWide}`}><span>Ghi chú</span><textarea name="note" rows={2} maxLength={2000}/></label>
          </div><div className={styles.paymentAction}><SubmitButton>Ghi nhận chi trả</SubmitButton></div></form>
          : detail.period.status !== 'FINALIZED' ? <InlineNotice>Phiếu lương đã sẵn sàng xem, nhưng chỉ kỳ đã chốt mới được ghi nhận chi trả.</InlineNotice>
          : detail.payment_status === 'PAID' ? <InlineNotice>Đã ghi nhận đủ số phải trả. Không thể ghi vượt số dư.</InlineNotice>
          : <InlineNotice>Bạn không có quyền ghi nhận chi trả cho chi nhánh này.</InlineNotice>}
        </section>

        <section className={styles.card} id="payment-history" aria-labelledby="history-title"><div className={styles.cardHeader}><div><p className={styles.kicker}>Sổ chi trả</p><h2 id="history-title">Lịch sử chi trả</h2><p>Bản ghi đã hủy vẫn được giữ lại để đối soát.</p></div></div>
          {detail.payment_history.length ? <div className={styles.history}>{detail.payment_history.map(payment => <article className={styles.historyItem} key={payment.id}><div className={styles.historyTop}><div><span>Ngày chi</span><strong>{dateText(payment.paid_on)}</strong></div><div><span>Số tiền</span><strong><Amount value={payment.amount} currency={payment.currency}/></strong></div><div><span>Phương thức / tham chiếu</span><strong>{paymentMethodLabels[payment.payment_method]}</strong><small>{payment.reference || 'Không có mã tham chiếu'}</small></div><div><span>Trạng thái</span><StatusBadge tone={payment.status === 'ACTIVE' ? 'success' : 'error'}>{payment.status === 'ACTIVE' ? 'Đang hiệu lực' : 'Đã hủy'}</StatusBadge></div></div><p className={styles.historyMeta}>Ghi nhận bởi {payment.created_by_name} · {timeText(payment.created_at)}{payment.note ? ` · ${payment.note}` : ''}</p>
            {payment.status === 'CANCELLED' && <div className={styles.cancelled}>Đã hủy bởi {payment.cancelled_by_name} lúc {timeText(payment.cancelled_at)}. Lý do: {payment.cancel_reason}</div>}
            {payment.status === 'ACTIVE' && detail.can_cancel && <><form action={payslipDisbursementAction} className={styles.cancelForm}><input type="hidden" name="action" value="cancel"/><input type="hidden" name="payroll" value={detail.payroll.id}/><input type="hidden" name="payment" value={payment.id}/><input type="hidden" name="key" value={randomUUID()}/><label className="vibe-field"><span>Lý do hủy ghi nhận</span><textarea name="reason" rows={2} maxLength={2000} required/></label><SubmitButton>Hủy ghi nhận</SubmitButton></form><p className={styles.warning}>Hủy ghi nhận trong hệ thống không đồng nghĩa hoàn tiền tại ngân hàng.</p></>}
          </article>)}</div> : <InlineNotice>Chưa có lần chi trả nào được ghi nhận.</InlineNotice>}
        </section>
      </main>

      <aside className={styles.summaryCard} aria-label="Tổng hợp phiếu lương"><p className={styles.kicker}>Tổng hợp phiếu lương</p><div className={styles.summaryRows}>
        <div><span>Tổng thu nhập</span><strong><Amount value={detail.financial_summary.earnings} currency={currency}/></strong></div>
        <div><span>Tổng hoàn trả</span><strong><Amount value={detail.financial_summary.reimbursements} currency={currency}/></strong></div>
        <div><span>Tổng khấu trừ</span><strong><Amount value={detail.financial_summary.deductions} currency={currency}/></strong></div>
        <div><span>Điều chỉnh</span><strong><Amount value={detail.financial_summary.adjustment} currency={currency}/></strong></div>
        <div className={styles.net}><span>Thực lĩnh</span><strong><Amount value={detail.financial_summary.net} currency={currency}/></strong></div>
      </div><div className={styles.paymentSummary}><div><span>Đã ghi nhận chi</span><strong><Amount value={detail.paid_amount} currency={currency}/></strong></div><div><span>Còn phải chi</span><strong><Amount value={detail.remaining_amount} currency={currency}/></strong></div></div><Workflow detail={detail}/></aside>
    </div>}

    <section className={styles.listCard} aria-labelledby="payslip-list"><div className={styles.listHeader}><div><p className={styles.kicker}>Danh sách</p><h2 id="payslip-list">Phiếu lương trong phạm vi được xem</h2><p>Trạng thái chi trả được tính từ các bản ghi ACTIVE trong sổ chi trả.</p></div></div>
      {data.rows && <DataTable headers={['Nhân viên','Kỳ lương','Chi nhánh','Thực lĩnh','Đã chi','Còn lại','Phiếu lương','Trạng thái']} rows={data.rows.map(row => [<Link className={row.id === detail?.payroll.id ? styles.selectedLink : ''} key="employee" href={queryHref(params,{payroll:row.id})}>{row.teacher_name}<br/><small>{row.employee_code}</small></Link>,`${periodText(row.starts_on)} · ${row.period_status === 'FINALIZED' ? 'Đã chốt' : 'Đã duyệt'}`,row.branch_name,<Amount key="payable" value={row.payable_amount} currency={row.currency}/>,<Amount key="paid" value={row.paid_amount} currency={row.currency}/>,<Amount key="remaining" value={row.remaining_amount} currency={row.currency}/>,<Link key="slip" href={`/documents/payslips/${row.id}`} prefetch={false}>Xem phiếu lương →</Link>,<StatusBadge key="state" tone={paymentTone(row.payment_status)}>{paymentStatusLabels[row.payment_status]}</StatusBadge>])}/>}
      {data.rows && <nav className={styles.pagination} aria-label="Phân trang phiếu lương"><span>Trang {data.page} · tối đa 25 phiếu/trang</span>{data.page>1 && <Link href={queryHref(params,{page:String(data.page-1),payroll:null})}>Trang trước</Link>}{data.hasMore && <Link href={queryHref(params,{page:String(data.page+1),payroll:null})}>Trang sau</Link>}</nav>}
    </section>
  </AppPage>
}
