import Link from 'next/link'
import { adminClient, type Params, vietnamDateTime } from '../finance/operations'
import { branches } from '../finance/query'
import { money } from '../finance/data'
import { Field, Select, Panel, Table, Pager, Notice, LoadError, dateText } from '../finance/_components/ui'
import { terms, selectedTerm, plans, enrollmentChoices, debts, daysBetween, statuses } from './data'
import TuitionForm from './TuitionForm'
export default async function TuitionPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient()
  let loaded
  try {
    const base = await Promise.all([terms(db, params), selectedTerm(db, params.selected), branches(db), plans(db), enrollmentChoices(db, params)])
    const debtRows = await debts(db, base[1] ? [base[1].id] : [])
    loaded = { base, debtRows }
  } catch { return <LoadError /> }
  const { base: [list, selected, branchRows, planRows, enrollments], debtRows } = loaded
  const enrollment = enrollments.data.find(e => e.id === params.create)
  const today = vietnamDateTime().slice(0, 10)
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Vận hành học phí</h1><Notice params={params} />
    <form className="grid gap-3 sm:grid-cols-3">
      <Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} />
      <Select name="status" label="Trạng thái" options={statuses.map(id => ({ id, name: id }))} value={params.status} />
      <Select name="plan" label="Gói học phí" options={planRows} value={params.plan} />
      <Field name="currency" label="Tiền tệ (VND, USD…)" required={false} value={params.currency} />
      <Select name="invoice" label="Hóa đơn" options={[{ id: 'yes', name: 'Có hóa đơn' }, { id: 'no', name: 'Chưa có hóa đơn' }]} value={params.invoice} />
      <Select name="expiring" label="Sắp hết hạn" options={[{ id: 'current', name: 'Tháng này' }, { id: 'next', name: 'Tháng sau' }]} value={params.expiring} />
      {params.enrollment && <input type="hidden" name="enrollment" value={params.enrollment} />}
      <button className="rounded border p-2">Lọc học phí</button><Link href="/admin/tuition" prefetch={false}>Xóa bộ lọc</Link>
    </form>
    <Table headers={['Học viên', 'Chi nhánh / gói', 'Trạng thái', 'Bắt đầu', 'Kết thúc gốc', 'Kết thúc hiệu lực', 'Giá niêm yết', 'Chiết khấu', 'Thành tiền', 'Hóa đơn', 'Chi tiết']} rows={list.data.map(t => [
      t.enrollments.students.full_name + ' (' + t.enrollments.students.student_code + ')', t.branch_name_snapshot + ' / ' + t.plan_name_snapshot, t.status,
      dateText(t.starts_on), dateText(t.base_ends_on), <span key="end">{dateText(t.effective_ends_on)}{t.status !== 'CANCELLED' && <small className="block">{t.starts_on > today ? 'Chưa bắt đầu' : daysBetween(today, t.effective_ends_on) < 0 ? 'Đã hết hạn' : `Còn ${daysBetween(today, t.effective_ends_on)} ngày`}</small>}</span>,
      money(t.list_price, t.currency), money(t.discount_amount, t.currency), money(t.amount, t.currency),
      t.invoices ? <Link prefetch={false} href={'/admin/finance/invoices?selected=' + t.invoices.id}>{t.invoices.invoice_number} • {t.invoices.status}</Link> : 'Chưa có',
      <Link prefetch={false} key={t.id} href={'/admin/tuition?selected=' + t.id}>Mở kỳ học phí</Link>,
    ])} /><Pager path="/admin/tuition" params={params} {...list} />
    {selected && <Panel title={selected.enrollments.students.full_name + ' — ' + selected.plan_name_snapshot}>
      <ol className="space-y-2 text-sm"><li>Bắt đầu học: {dateText(selected.enrollments.started_at)}</li><li>Bắt đầu học phí: {dateText(selected.starts_on)}</li><li>Kết thúc gốc: {dateText(selected.base_ends_on)}</li><li>Được gia hạn {daysBetween(selected.base_ends_on, selected.effective_ends_on)} ngày</li><li>Kết thúc hiệu lực: {dateText(selected.effective_ends_on)}</li></ol>
      <div className="flex flex-wrap gap-4"><Link prefetch={false} href={'/admin/enrollments/' + selected.enrollment_id + '/pauses'}>Lịch sử bảo lưu</Link><Link prefetch={false} href={'/admin/tuition?enrollment=' + selected.enrollment_id}>Các kỳ của ghi danh</Link><Link prefetch={false} href={'/admin/students/' + selected.enrollments.student_id}>Hồ sơ học viên</Link></div>
      {debtRows.map(d => <p key={d.invoice_id}><Link prefetch={false} href={'/admin/finance/invoices?selected=' + d.invoice_id}>{d.invoice_number}</Link> • {d.invoice_status} • {money(d.total_amount, d.currency)} • {d.receivable_status} • {d.invoice_status === 'ISSUED' ? 'Còn nợ' : 'Số dư hóa đơn (chưa ghi nhận công nợ)'}{' '}{money(d.outstanding_balance, d.currency)}</p>)}
      {selected.invoices ? <div><fieldset disabled className="grid gap-3 sm:grid-cols-3"><Field name="locked_discount_type" label="Loại chiết khấu đã chốt" value={selected.discount_type} /><Field name="locked_discount_value" label="Mức chiết khấu đã chốt" value={String(selected.discount_value)} /><Field name="locked_discount_name" label="Tên chiết khấu đã chốt" value={selected.discount_name ?? '—'} /></fieldset><p className="rounded bg-amber-50 p-3">Khoản học phí này đã có hóa đơn. Không thể thay đổi chiết khấu trên kỳ học phí hiện tại.</p></div> : selected.status === 'CANCELLED' ? <p>Kỳ đã hủy, không thể chỉnh chiết khấu hoặc tạo hóa đơn.</p> : <>
        <TuitionForm key={selected.id} term={selected} /><Link prefetch={false} href={'/admin/finance/invoices?tuition=' + selected.id}>Tạo hóa đơn</Link>
      </>}
    </Panel>}
    <Panel title="Tạo kỳ học phí cho ghi danh">
      <form className="flex flex-wrap items-end gap-3"><Field name="student" label="Tìm tên / mã học viên" required={false} value={params.student} /><button className="rounded border p-2">Tìm ghi danh</button></form>
      <Table headers={['Học viên', 'Lớp / Chi nhánh', 'Bắt đầu học', 'Tạo kỳ']} rows={enrollments.data.map(e => [e.students.full_name + ' (' + e.students.student_code + ')', e.classes.name + ' / ' + e.classes.branches.name, dateText(e.started_at), <Link prefetch={false} key={e.id} href={'/admin/tuition?' + new URLSearchParams({ create: e.id, enrollments_page: String(enrollments.page), student: params.student ?? '' })}>Chọn ghi danh</Link>])} />
      <Pager path="/admin/tuition" params={params} page={enrollments.page} more={enrollments.more} keyName="enrollments_page" />
      {enrollment && <Panel title={'Kỳ mới — ' + enrollment.students.full_name}><p>{enrollment.classes.branches.name} • Bắt đầu học {dateText(enrollment.started_at)}</p><TuitionForm key={enrollment.id} enrollment={enrollment.id} plans={planRows.filter(p => p.status === 'ACTIVE')} /></Panel>}
    </Panel>
  </div>
}
