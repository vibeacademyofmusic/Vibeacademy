import Link from 'next/link'
import { randomUUID } from 'node:crypto'
import { AppPage, DataTable, FormField, InlineNotice, MoneyDisplay, SelectField, StatusBadge } from '../../_components/vibe'
import { Notice } from '../_components/ui'
import SubmitButton from '../_components/SubmitButton'
import type { Params } from '../operations'
import { operatingExpenseAction } from './actions'
import { loadOperatingExpenses } from './data'
import { categoryLabel, monthText, operatingExpenseCategories, operatingExpenseStates, type MoneyValue, type OperatingExpenseDetail, type OperatingExpenseStatus } from './model'
import styles from './operating-expenses.module.css'

function HiddenFields({ action, selected, version }: { action: string; selected?: string; version?: number }) {
  return <>
    <input type="hidden" name="action" value={action}/>
    <input type="hidden" name="selected" value={selected ?? ''}/>
    <input type="hidden" name="record" value={selected ?? ''}/>
    <input type="hidden" name="version" value={version ?? ''}/>
    <input type="hidden" name="key" value={randomUUID()}/>
  </>
}

function Amount({ value, currency }: { value: MoneyValue; currency: string }) {
  return value == null ? <span>—</span> : <MoneyDisplay value={value} currency={currency}/>
}

function stateTone(status: string): 'neutral' | 'warning' | 'error' | 'success' | 'info' {
  if (status === 'RECORDED') return 'success'
  if (status === 'CANCELLED') return 'error'
  return 'neutral'
}

function dateText(value: string | null) {
  return value ? value.slice(0, 10).split('-').reverse().join('/') : '—'
}

function queryHref(params: Params, changes: Record<string, string | null> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value && !['error', 'success'].includes(key)) query.set(key, value)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) query.delete(key)
    else query.set(key, value)
  }
  const text = query.toString()
  return text ? `/admin/finance/operating-expenses?${text}` : '/admin/finance/operating-expenses'
}

function Workflow({ detail }: { detail?: OperatingExpenseDetail | null }) {
  const status = detail?.record.status
  return <ol className={styles.workflow} aria-label="Luồng chi phí cố định">
    <li data-active={!detail} data-done={Boolean(detail)}>
      <span>1</span><div><strong>Mẫu định kỳ</strong><small>Khai báo khoản chi theo chi nhánh</small></div>
    </li>
    <li data-active={status === 'DRAFT'} data-done={status === 'RECORDED' || status === 'CANCELLED'}>
      <span>2</span><div><strong>Ghi nhận tháng</strong><small>Số tiền thực tế chỉ có sau khi xác nhận</small></div>
    </li>
    <li data-active={status === 'RECORDED'} data-done={false}>
      <span>3</span><div><strong>Hạch toán / chi trả</strong><small>Chưa tích hợp chi trả</small></div>
    </li>
  </ol>
}

export default async function OperatingExpensesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const data = await loadOperatingExpenses(params)
  const detail = data.detail
  const record = detail?.record
  const currency = record?.currency ?? 'VND'

  return <AppPage>
    <Notice params={params}/>

    <header className={styles.pageHeader}>
      <div className={styles.headingCopy}>
        <p className={styles.eyebrow}>Tài chính / Vận hành</p>
        <h1>Chi phí cố định</h1>
        <p>Theo dõi các khoản chi vận hành định kỳ theo từng chi nhánh và ghi nhận chi phí thực tế từng tháng.</p>
        <div className={styles.badges}>
          <StatusBadge tone={record ? stateTone(record.status) : 'neutral'}>{record ? operatingExpenseStates[record.status] ?? record.status : 'Chưa chọn khoản chi'}</StatusBadge>
          <StatusBadge tone="warning">Chưa tích hợp chi trả</StatusBadge>
        </div>
      </div>
      <div className={styles.headerActions}>
        <a className={styles.secondaryButton} href="#workflow">Luồng xử lý</a>
        {record?.status === 'DRAFT' && <a className={styles.secondaryButton} href={`#record-expense`}>Ghi nhận chi phí</a>}
      </div>
    </header>

    {data.listError && <InlineNotice tone="error">{data.listError} Không hiển thị số liệu thay thế.</InlineNotice>}
    {data.detailError && <InlineNotice tone="error">{data.detailError} Không suy đoán số tiền hoặc trạng thái.</InlineNotice>}
    {data.contextError && <InlineNotice tone="error">{data.contextError}</InlineNotice>}

    <section className={styles.card} aria-labelledby="operating-expense-filters">
      <div className={styles.cardHeader}>
        <div><p className={styles.sectionKicker}>Bộ lọc</p><h2 id="operating-expense-filters">Lọc theo chi nhánh và kỳ</h2></div>
      </div>
      <form className={styles.filter}>
        <FormField label="Tháng" name="month" type="month" defaultValue={params.month ?? ''}/>
        <SelectField label="Chi nhánh" name="branch" defaultValue={params.branch ?? ''}>
          <option value="">Tất cả chi nhánh được phép xem</option>
          {data.context?.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </SelectField>
        <SelectField label="Danh mục" name="category" defaultValue={params.category ?? ''}>
          <option value="">Tất cả</option>
          {Object.entries(operatingExpenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
        <SelectField label="Trạng thái" name="status" defaultValue={params.status ?? ''}>
          <option value="">Tất cả</option>
          {Object.entries(operatingExpenseStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </SelectField>
        <FormField label="Search" name="q" defaultValue={params.q ?? ''} maxLength={100}/>
        <button className={styles.secondaryButton}>Lọc</button>
        <Link className={styles.textButton} href="/admin/finance/operating-expenses">Bỏ lọc</Link>
      </form>
    </section>

    <div className={styles.workspace}>
      <main className={styles.mainColumn}>
        {record && detail ? <>
          <section className={styles.card} aria-labelledby="operating-expense-detail">
            <div className={styles.cardHeader}>
              <div><p className={styles.sectionKicker}>Khoản chi tháng</p><h2 id="operating-expense-detail">{record.name}</h2></div>
              <span className={styles.currency}>{record.currency}</span>
            </div>
            <dl className={styles.claimFacts}>
              <div><dt>Khoản chi</dt><dd>{record.name}<small>{detail.template.amount_mode === 'FIXED' ? 'Số tiền cố định' : 'Số tiền biến động'}</small></dd></div>
              <div><dt>Chi nhánh</dt><dd>{detail.branch.name}<small>{detail.branch.code}</small></dd></div>
              <div><dt>Danh mục</dt><dd>{categoryLabel(record.category, record.custom_category_name)}</dd></div>
              <div><dt>Tháng</dt><dd>{monthText(record.expense_month)}</dd></div>
              <div><dt>Nhà cung cấp</dt><dd>{record.vendor ?? '—'}</dd></div>
              <div><dt>Ngày phát sinh</dt><dd>{dateText(record.expense_date)}</dd></div>
              <div><dt>Ngày đến hạn</dt><dd>{dateText(record.due_date)}</dd></div>
              <div><dt>Trạng thái</dt><dd><StatusBadge tone={stateTone(record.status)}>{operatingExpenseStates[record.status as OperatingExpenseStatus]}</StatusBadge></dd></div>
            </dl>
          </section>

          {record.status === 'DRAFT' && <section className={styles.card} id="record-expense">
            <div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Ghi nhận</p><h2>Ghi nhận chi phí tháng này</h2><p>Số tiền thực tế chỉ trở thành số liệu tài chính sau khi bấm ghi nhận. Mức dự kiến không phải chi phí thực tế.</p></div></div>
            <form action={operatingExpenseAction} className={styles.recordForm}>
              <HiddenFields action="record" selected={record.id} version={record.version}/>
              <FormField label="Ngày phát sinh" name="expense_date" type="date" defaultValue={record.expense_date ?? ''} required/>
              <FormField label="Ngày đến hạn" name="due_date" type="date" defaultValue={record.due_date ?? ''}/>
              <FormField label={`Số tiền thực tế (${record.currency})`} name="actual_amount" type="number" min={record.currency === 'VND' ? '1' : '0.01'} step={record.currency === 'VND' ? '1' : '0.01'} defaultValue={detail.template.amount_mode === 'FIXED' && record.expected_amount != null ? String(record.expected_amount) : ''} required/>
              <FormField label="Nhà cung cấp" name="vendor" defaultValue={record.vendor ?? ''} maxLength={200}/>
              <FormField label="Mã hóa đơn / tham chiếu" name="reference" defaultValue={record.reference ?? ''} maxLength={200}/>
              <label className="vibe-field"><span>Nội dung</span><textarea name="note" maxLength={2000} rows={3} defaultValue={record.note ?? ''}/></label>
              <div className={styles.newItemAction}><SubmitButton>Ghi nhận chi phí</SubmitButton></div>
            </form>
          </section>}

          {record.status === 'RECORDED' && <section className={styles.card}>
            <div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Đã khóa</p><h2>Chi phí đã ghi nhận</h2><p>Số tiền thực tế không còn sửa được. Đây không phải bằng chứng đã chi trả.</p></div></div>
            <dl className={styles.claimFacts}>
              <div><dt>Số tiền thực tế</dt><dd><Amount value={detail.actual_amount} currency={record.currency}/></dd></div>
              <div><dt>Tham chiếu</dt><dd>{record.reference ?? '—'}</dd></div>
              <div><dt>Nội dung</dt><dd>{record.note ?? '—'}</dd></div>
            </dl>
          </section>}

          {record.status !== 'CANCELLED' && <section className={styles.card}>
            <div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Hủy</p><h2>Hủy khoản chi</h2><p>Không xóa lịch sử. Sau khi hủy có thể lập bản nháp tháng này lại từ mẫu còn hiệu lực.</p></div></div>
            <form action={operatingExpenseAction} className={styles.cancelForm}>
              <HiddenFields action="cancel" selected={record.id} version={record.version}/>
              <label className="vibe-field"><span>Lý do hủy</span><textarea name="reason" maxLength={2000} rows={3} required/></label>
              <div className={styles.newItemAction}><SubmitButton>Hủy ghi nhận</SubmitButton></div>
            </form>
          </section>}
        </> : <section className={styles.card}>
          <div className={styles.cardHeader}><div><p className={styles.sectionKicker}>Bắt đầu</p><h2>Mẫu định kỳ và lập tháng</h2><p>Mẫu chỉ là kế hoạch. Chi phí thực tế chỉ xuất hiện sau khi ghi nhận từng tháng.</p></div></div>
          {data.context && <>
            <form action={operatingExpenseAction} className={styles.createForm}>
              <HiddenFields action="create_template"/>
              <SelectField label="Chi nhánh" name="branch" required>
                <option value="">Chọn chi nhánh</option>
                {data.context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </SelectField>
              <SelectField label="Danh mục" name="category" required>
                <option value="">Chọn danh mục</option>
                {Object.entries(operatingExpenseCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectField>
              <FormField label="Tên danh mục riêng (nếu Khác)" name="custom_category_name" maxLength={100}/>
              <FormField label="Tên khoản chi" name="name" maxLength={200} required/>
              <FormField label="Nhà cung cấp" name="vendor" maxLength={200}/>
              <SelectField label="Cách tính tiền" name="amount_mode" required>
                <option value="FIXED">Cố định</option>
                <option value="VARIABLE">Biến động</option>
              </SelectField>
              <FormField label="Mức dự kiến" name="expected_amount" type="number" min="1" step="1"/>
              <FormField label="Tiền tệ" name="currency" defaultValue="VND" pattern="[A-Z]{3}" required/>
              <FormField label="Hiệu lực từ" name="effective_from" type="date" required/>
              <FormField label="Hiệu lực đến" name="effective_to" type="date"/>
              <div className={styles.newItemAction}><SubmitButton>Lưu mẫu định kỳ</SubmitButton></div>
            </form>
            <form action={operatingExpenseAction} className={styles.prepareForm}>
              <HiddenFields action="prepare_month"/>
              <SelectField label="Chi nhánh lập tháng" name="branch" required>
                <option value="">Chọn chi nhánh</option>
                {data.context.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </SelectField>
              <FormField label="Tháng" name="month" type="month" required/>
              <div className={styles.newItemAction}><SubmitButton>Lập bản nháp tháng</SubmitButton></div>
            </form>
          </>}
        </section>}
      </main>

      <aside className={styles.summaryCard} id="workflow" aria-label="Tổng hợp chi phí">
        <p className={styles.sectionKicker}>Tổng hợp</p>
        <div className={styles.summaryRows}>
          <div><span>Mức dự kiến</span><strong>{record ? <Amount value={detail?.expected_amount ?? null} currency={currency}/> : '—'}</strong></div>
          <div className={styles.summaryTotal}><span>Chi phí thực tế</span><strong>{record ? <Amount value={detail?.actual_amount ?? null} currency={currency}/> : '—'}</strong></div>
          <div><span>Chênh lệch</span><strong>{record ? <Amount value={detail?.variance_amount ?? null} currency={currency}/> : '—'}</strong></div>
          <div><span>Chi nhánh</span><strong>{detail?.branch.name ?? '—'}</strong></div>
          <div><span>Kỳ</span><strong>{record ? monthText(record.expense_month) : '—'}</strong></div>
          <div><span>Danh mục</span><strong>{record ? categoryLabel(record.category, record.custom_category_name) : '—'}</strong></div>
        </div>
        <div className={styles.paymentState}>
          <span>Chi trả</span>
          <strong>Chưa tích hợp chi trả</strong>
          <small>Ghi nhận chi phí không đồng nghĩa khoản tiền đã được thanh toán. Không dùng sổ thu học phí hoặc chi lương cho module này.</small>
        </div>
        <Workflow detail={detail}/>
      </aside>
    </div>

    <section className={styles.history} aria-labelledby="operating-expense-list">
      <div className={styles.historyHeader}>
        <div><p className={styles.sectionKicker}>Danh sách</p><h2 id="operating-expense-list">Khoản chi theo tháng</h2></div>
      </div>
      {!data.listError && <DataTable headers={['Khoản chi', 'Chi nhánh', 'Tháng', 'Danh mục', 'Dự kiến', 'Thực tế', 'Trạng thái', 'Action']} rows={data.rows.map(row => [
        <Link prefetch={false} key="name" href={queryHref(params, { selected: row.id })}>{row.name} →</Link>,
        row.branch_name,
        monthText(row.expense_month),
        categoryLabel(row.category, row.custom_category_name),
        <Amount key="expected" value={row.expected_amount} currency={row.currency}/>,
        <Amount key="actual" value={row.actual_amount} currency={row.currency}/>,
        <StatusBadge key="status" tone={stateTone(row.status)}>{operatingExpenseStates[row.status] ?? row.status}</StatusBadge>,
        <Link prefetch={false} key="open" href={queryHref(params, { selected: row.id })}>Mở</Link>,
      ])}/>}
      {!data.listError && <nav className={styles.pagination} aria-label="Phân trang chi phí cố định">
        <span>Trang {data.page} · tối đa 25 hồ sơ/trang</span>
        {data.page > 1 && <Link href={queryHref(params, { page: String(data.page - 1) })}>Trang trước</Link>}
        {data.more && <Link href={queryHref(params, { page: String(data.page + 1) })}>Trang tiếp</Link>}
      </nav>}
    </section>
  </AppPage>
}
