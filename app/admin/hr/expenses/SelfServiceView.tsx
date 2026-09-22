import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { AppPage, DataTable, FormField, InlineNotice, MoneyDisplay, SelectField, StatusBadge } from '../../_components/vibe'
import { Notice } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { payrollAction } from '../../payroll/actions'
import type { Params } from '../../finance/operations'
import { expenseAction } from './actions'
import { loadExpenses } from './data'
import { categorySuggestions, expenseStates, type ExpenseClaim } from './model'
import styles from './expenses.module.css'

function HiddenFields({ action, claim }: { action: string; claim?: ExpenseClaim }) {
  return <><input type="hidden" name="action" value={action}/><input type="hidden" name="claim" value={claim?.id ?? ''}/><input type="hidden" name="version" value={claim?.version ?? ''}/><input type="hidden" name="key" value={randomUUID()}/></>
}

function CategoryInput({ defaultValue }: { defaultValue?: string }) {
  return <label className="vibe-field"><span>Hạng mục</span><input name="category_name" list="expense-category-suggestions" defaultValue={defaultValue} maxLength={100} required/></label>
}

function monthText(value: string) {
  const [year, month] = value.slice(0, 7).split('-')
  return `${month}/${year}`
}

function stateTone(status: string): 'neutral' | 'warning' | 'error' | 'success' | 'info' {
  if (status === 'APPROVED') return 'success'
  if (status === 'SUBMITTED') return 'info'
  if (status === 'RETURNED') return 'warning'
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'error'
  return 'neutral'
}

function Workflow({ status, posted }: { status?: string; posted: boolean }) {
  const reviewing = status === 'SUBMITTED'
  const approved = status === 'APPROVED'
  return <ol className={styles.workflow} aria-label="Luồng xử lý bảng kê">
    <li data-active={!status || ['DRAFT', 'RETURNED'].includes(status)} data-done={reviewing || approved}>
      <span>1</span><div><strong>Lập bảng kê</strong><small>Nhập ngày, nội dung và số tiền</small></div>
    </li>
    <li data-active={reviewing} data-done={approved}>
      <span>2</span><div><strong>Người khác kiểm tra</strong><small>Người lập không tự duyệt khoản mình lập</small></div>
    </li>
    <li data-active={approved && !posted} data-done={posted}>
      <span>3</span><div><strong>Đưa vào kỳ lương</strong><small>Ghi nhận khoản hoàn trả đúng một lần</small></div>
    </li>
  </ol>
}

export default async function Expenses({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const data = await loadExpenses(params)
  const ownCurrentClaim = !params.claim && data.context
    ? data.claims.find(item => item.created_by === data.actorId && item.employee_id === data.context?.employee.id && !['REJECTED', 'CANCELLED'].includes(item.status))
    : null
  if (ownCurrentClaim) redirect(`/admin/hr/expenses?claim=${ownCurrentClaim.id}`)
  const claim = data.detail?.claim
  const owner = Boolean(claim && claim.created_by === data.actorId)
  const editable = Boolean(claim && owner && ['DRAFT', 'RETURNED'].includes(claim.status))
  const isV2 = claim?.claim_model === 'ITEMIZED_V2'
  const posted = data.detail?.payroll_posting.status === 'ACTIVE'
  const itemCount = data.detail?.items.length ?? 0

  return <AppPage>
    <Notice params={params}/>
    <datalist id="expense-category-suggestions">{categorySuggestions.map(category => <option key={category} value={category}/>)}</datalist>

    <header className={styles.pageHeader}>
      <div className={styles.headingCopy}>
        <p className={styles.eyebrow}>04 / Khoản phát sinh</p>
        <h1>Bảng kê công tác phí</h1>
        <p>{claim ? `${claim.title} · Mã hồ sơ ${claim.id.slice(0, 8).toUpperCase()}` : 'Lập bảng kê từ chuyến công tác đã được phê duyệt.'}</p>
        <div className={styles.badges}>
          <StatusBadge tone={claim ? stateTone(claim.status) : 'neutral'}>{claim ? expenseStates[claim.status] ?? claim.status : 'Chưa tạo bảng kê'}</StatusBadge>
          {claim && <StatusBadge tone={posted ? 'success' : 'warning'}>{posted ? 'Đã đưa vào kỳ' : 'Chưa đưa vào kỳ'}</StatusBadge>}
          {claim && <StatusBadge tone="info">Thanh toán: chưa xác nhận</StatusBadge>}
        </div>
      </div>
      <div className={styles.headerActions}>
        <a className={styles.secondaryButton} href={claim ? `?claim=${claim.id}#workflow` : '#workflow'}>Luồng bảng kê</a>
        {editable && claim && <a className={styles.secondaryButton} href={`?claim=${claim.id}#new-expense-item`}>Thêm khoản chi</a>}
        {editable && isV2 && <form action={expenseAction}><HiddenFields action="submit_v2" claim={claim}/><button className={styles.primaryButton} disabled={itemCount === 0}>Gửi duyệt</button></form>}
      </div>
    </header>

    {data.listError && <InlineNotice tone="error">{data.listError} Không hiển thị số liệu thay thế.</InlineNotice>}
    {data.detailError && <InlineNotice tone="error">{data.detailError} Không suy đoán số tiền hoặc trạng thái.</InlineNotice>}

    <div className={styles.workspace}>
      <main className={styles.mainColumn}>
        {claim && data.detail ? <>
          <section className={styles.card} aria-labelledby="claim-information">
            <div className={styles.cardHeader}>
              <div><p className={styles.sectionKicker}>Thông tin bảng kê</p><h2 id="claim-information">Chuyến công tác và người đề nghị</h2></div>
            </div>
            {data.relatedReadError && <InlineNotice tone="error">Không xác nhận được đầy đủ dữ liệu liên quan. Các thao tác phụ thuộc đã được khóa.</InlineNotice>}
            <dl className={styles.claimFacts}>
              <div><dt>Nhân viên</dt><dd>{data.person ? <>{data.person.full_name}<small>{data.person.employee_code}</small></> : 'Không xác nhận được dữ liệu'}</dd></div>
              <div><dt>Chi nhánh chịu chi phí</dt><dd>{data.branch?.name ?? 'Không xác nhận được dữ liệu'}</dd></div>
              <div><dt>Chuyến / mục đích công tác</dt><dd>{data.detail.trip ? <>{data.detail.trip.reason}<small>{data.detail.trip.starts_on} → {data.detail.trip.ends_on}</small></> : claim.title}</dd></div>
              <div><dt>Đề nghị đưa vào kỳ</dt><dd>Tháng {monthText(claim.requested_month)}<small>{claim.currency}</small></dd></div>
            </dl>
          </section>

          {isV2 ? <section className={styles.card} aria-labelledby="expense-items">
            <div className={styles.cardHeader}>
              <div><p className={styles.sectionKicker}>Chi tiết phát sinh</p><h2 id="expense-items">Các khoản chi</h2><p>Nhập đúng ngày phát sinh, hạng mục, nội dung và số tiền thực tế.</p></div>
              <span className={styles.currency}>{claim.currency}</span>
            </div>

            {data.detail.items.length ? <div className={styles.itemsTable}>
              <div className={styles.itemsHead} aria-hidden="true"><span>Ngày / hạng mục</span><span>Nội dung chi</span><span>Số tiền</span><span>Thao tác</span></div>
              {data.detail.items.map((item, index) => editable ? <div className={styles.itemRow} key={item.id}>
                <form className={styles.rowForm} id={`save-${item.id}`} action={expenseAction}><HiddenFields action="save_item_v2" claim={claim}/><input type="hidden" name="item" value={item.id}/></form>
                <div className={styles.itemIdentity}><span className={styles.itemNumber}>{String(index + 1).padStart(2, '0')}</span><label><span>Ngày phát sinh</span><input form={`save-${item.id}`} name="expense_date" type="date" defaultValue={item.expense_date} required/></label><label><span>Hạng mục</span><input form={`save-${item.id}`} name="category_name" list="expense-category-suggestions" defaultValue={item.category_name} maxLength={100} required/></label></div>
                <label className={styles.noteField}><span>Nội dung chi</span><textarea form={`save-${item.id}`} name="note" defaultValue={item.note} maxLength={2000} rows={3} required/></label>
                <label className={styles.moneyField}><span>Số tiền</span><input form={`save-${item.id}`} name="amount" type="number" min={claim.currency === 'VND' ? '1' : '0.01'} step={claim.currency === 'VND' ? '1' : '0.01'} defaultValue={item.amount} required/><small>{claim.currency}</small></label>
                <div className={styles.rowActions}><button className={styles.saveButton} form={`save-${item.id}`}>Lưu</button><form action={expenseAction}><HiddenFields action="remove_item_v2" claim={claim}/><input type="hidden" name="item" value={item.id}/><SubmitButton>Xóa</SubmitButton></form></div>
              </div> : <div className={styles.readonlyItem} key={item.id}><div><span>{item.expense_date}</span><strong>{item.category_name}</strong></div><p>{item.note}</p><MoneyDisplay value={item.amount} currency={claim.currency}/><span>Đã khóa</span></div>)}
            </div> : <div className={styles.emptyItems}><strong>Chưa có khoản chi nào</strong><p>Thêm khoản chi đầu tiên để hoàn thiện và gửi bảng kê.</p></div>}

            {editable && <form action={expenseAction} className={styles.newItem} id="new-expense-item"><HiddenFields action="save_item_v2" claim={claim}/><input type="hidden" name="item" value={randomUUID()}/><div className={styles.newItemHeading}><span>+</span><div><strong>Thêm khoản chi</strong><small>Mỗi lần lưu tạo một dòng chi phí mới.</small></div></div><div className={styles.newItemFields}><FormField label="Ngày phát sinh" name="expense_date" type="date" required/><CategoryInput/><label className="vibe-field"><span>Nội dung chi</span><textarea name="note" maxLength={2000} rows={2} required/></label><FormField label={`Số tiền (${claim.currency})`} name="amount" type="number" min={claim.currency === 'VND' ? '1' : '0.01'} step={claim.currency === 'VND' ? '1' : '0.01'} required/></div><div className={styles.newItemAction}><SubmitButton>Thêm vào bảng kê</SubmitButton></div></form>}
          </section> : <section className={styles.card}><div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Dữ liệu lịch sử</p><h2>Bảng kê theo mô hình cũ — chỉ đọc</h2></div></div><InlineNotice>Hồ sơ dùng mô hình cũ theo từng chuyến. Nội dung lịch sử được giữ nguyên và không thể sửa bằng biểu mẫu V2.</InlineNotice><DataTable headers={['Ngày chuyến', 'Mô tả', 'Phụ cấp', 'Đi lại', 'Lưu trú', 'Tổng dòng']} rows={data.detail.lines.map(line => [`${line.trip_snapshot.trip?.starts_on ?? '—'} → ${line.trip_snapshot.trip?.ends_on ?? '—'}`, line.note, <MoneyDisplay key="allowance" value={line.allowance} currency={claim.currency}/>, <MoneyDisplay key="transport" value={line.transport} currency={claim.currency}/>, <MoneyDisplay key="lodging" value={line.lodging} currency={claim.currency}/>, <MoneyDisplay key="total" value={line.total_amount} currency={claim.currency}/>])}/></section>}

          {isV2 && claim.status === 'SUBMITTED' && !owner && <section className={styles.card}><div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Kiểm tra độc lập</p><h2>Quyết định của người duyệt</h2><p>Người lập bảng kê không thể tự phê duyệt hồ sơ của mình.</p></div></div><form action={expenseAction} className={styles.reviewForm}><HiddenFields action="review_v2" claim={claim}/><SelectField label="Quyết định" name="decision" required><option value="RETURNED">Trả về bổ sung</option><option value="APPROVED">Phê duyệt</option><option value="REJECTED">Từ chối</option></SelectField><FormField label="Lý do kiểm tra" name="reason" maxLength={2000} required/><SubmitButton>Lưu quyết định</SubmitButton></form></section>}

          {claim.status === 'APPROVED' && <section className={styles.card}><div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Hoàn trả qua lương</p><h2>Đưa khoản hoàn trả vào kỳ lương</h2></div></div>{posted ? <InlineNotice>Đã ghi nhận vào Payroll. Không thể ghi lần hai. Đây không phải bằng chứng chi trả.</InlineNotice> : data.periods === null ? <InlineNotice tone="error">Không xác nhận được kỳ lương phù hợp; thao tác chưa được mở.</InlineNotice> : data.periods.length ? data.periods.map(period => <form action={payrollAction} key={period.id} className={styles.payrollForm}><input type="hidden" name="action" value="v2_expense"/><input type="hidden" name="period" value={period.id}/><input type="hidden" name="version" value={period.version}/><input type="hidden" name="employee" value={claim.employee_id}/><input type="hidden" name="claim" value={claim.id}/><input type="hidden" name="key" value={randomUUID()}/><FormField label="Căn cứ ghi nhận hoàn trả" name="note" required/><SubmitButton>Ghi nhận vào kỳ {period.starts_on.slice(0, 7)}</SubmitButton></form>) : <p>Chưa có kỳ đã tính hoặc đang kiểm tra phù hợp tháng và chi nhánh. <Link href="/admin/payroll">Mở kỳ lương →</Link></p>}</section>}
        </> : <section className={styles.card} aria-labelledby="new-claim">
          <div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Bắt đầu</p><h2 id="new-claim">Tạo bảng kê của tôi</h2><p>Nhân viên và chi nhánh được lấy từ quan hệ nhân sự đang hiệu lực. Một bảng kê chỉ gắn với một chuyến đã được người khác phê duyệt.</p></div></div>
          {data.contextError ? <InlineNotice tone="error">{data.contextError}</InlineNotice> : data.context && <>
            <dl className={styles.claimFacts}><div><dt>Nhân viên</dt><dd>{data.context.employee.full_name}<small>{data.context.employee.employee_code}</small></dd></div><div><dt>Chi nhánh chịu chi phí</dt><dd>{data.context.branch.name}</dd></div></dl>
            {data.context.trips.length ? <form action={expenseAction} className={styles.createForm}><HiddenFields action="create_v2"/><SelectField label="Chuyến công tác đã duyệt" name="trip" required><option value="">Chọn chuyến</option>{data.context.trips.map(trip => <option key={trip.id} value={trip.id}>{trip.starts_on} → {trip.ends_on} · {trip.reason}</option>)}</SelectField><FormField label="Tháng đề nghị hoàn trả" name="month" type="month" required/><FormField label="Tiền tệ" name="currency" defaultValue="VND" pattern="[A-Z]{3}" required/><SubmitButton>Tạo bản nháp</SubmitButton></form> : <InlineNotice>Chưa có chuyến công tác đã duyệt nào đủ điều kiện để tạo bảng kê mới. Chuyến đã gắn với bảng kê hiện có sẽ được mở trực tiếp thay vì tạo trùng.</InlineNotice>}
          </>}
        </section>}
      </main>

      <aside className={styles.summaryCard} id="workflow" aria-label="Tổng hợp bảng kê">
        <p className={styles.sectionKicker}>Tổng hợp bảng kê</p>
        <div className={styles.summaryRows}>
          <div><span>Khoản chi</span><strong>{claim && isV2 ? itemCount : '—'}</strong></div>
          <div><span>Hạng mục</span><strong>{claim && isV2 ? data.detail?.category_breakdown.length ?? 0 : '—'}</strong></div>
          <div className={styles.summaryTotal}><span>Tổng đề nghị</span><strong>{claim && data.detail ? <MoneyDisplay value={data.detail.total_amount} currency={claim.currency}/> : '—'}</strong></div>
          <div><span>Đã duyệt</span><strong>{claim?.status === 'APPROVED' ? <MoneyDisplay value={claim.approved_amount} currency={claim.currency}/> : '—'}</strong></div>
          <div><span>Đã đưa vào kỳ</span><strong>{posted ? 'Đã ghi nhận' : 'Chưa ghi nhận'}</strong></div>
        </div>
        {claim && isV2 && data.detail && data.detail.category_breakdown.length > 0 && <div className={styles.breakdown}><h3>Theo hạng mục</h3>{data.detail.category_breakdown.map(group => <div key={group.category_name}><span>{group.category_name}</span><MoneyDisplay value={group.amount} currency={claim.currency}/></div>)}</div>}
        <div className={styles.paymentState}><span>Trạng thái chi trả</span><strong>Chưa có bằng chứng chi trả</strong><small>Việc phê duyệt hoặc đưa vào kỳ không đồng nghĩa khoản tiền đã được thanh toán.</small></div>
        <Workflow status={claim?.status} posted={posted}/>
      </aside>
    </div>

    <section className={styles.history} aria-labelledby="claim-history">
      <div className={styles.historyHeader}><div><p className={styles.sectionKicker}>Tra cứu</p><h2 id="claim-history">Các bảng kê trong phạm vi được xem</h2></div><form><div className={styles.filter}><SelectField label="Trạng thái" name="status" defaultValue={params.status ?? ''}><option value="">Tất cả</option>{Object.entries(expenseStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField><button className={styles.secondaryButton}>Lọc</button><Link className={styles.textButton} href="/admin/hr/expenses">Bỏ lọc</Link></div></form></div>
      {!data.listError && <DataTable headers={['Mục đích', 'Nhân viên', 'Tháng đề nghị', 'Trạng thái', 'Tổng đề nghị', 'Đã duyệt', 'Payroll']} rows={data.claims.map(item => [<Link prefetch={false} key="claim" href={`?claim=${item.id}`}>{item.title} →</Link>, `${item.full_name} · ${item.employee_code}`, monthText(item.requested_month), <StatusBadge key="status" tone={stateTone(item.status)}>{expenseStates[item.status] ?? item.status}</StatusBadge>, <MoneyDisplay key="total" value={item.total_amount} currency={item.currency}/>, item.status === 'APPROVED' ? <MoneyDisplay key="approved" value={item.approved_amount} currency={item.currency}/> : 'Chưa duyệt', item.payroll_posting_state === 'POSTED' ? 'Đã đưa vào kỳ' : 'Chưa đưa vào kỳ'])}/>}
      {!data.listError && <nav className={styles.pagination} aria-label="Phân trang bảng kê"><span>Trang {data.page} · tối đa 25 hồ sơ/trang</span>{data.page > 1 && <Link href={`?page=${data.page - 1}`}>Trang trước</Link>}{data.claims.length === 25 && <Link href={`?page=${data.page + 1}`}>Trang sau</Link>}</nav>}
    </section>
  </AppPage>
}
