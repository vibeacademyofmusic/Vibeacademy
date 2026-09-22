import Link from 'next/link'
import { money } from '../data'
import { debtStatuses, invoiceStatuses, type Params } from '../operations'
import type { Invoice, Branch } from '../query'
import { Table, Select, Field, dateText } from './ui'
export function InvoiceFilters({ params, branches, debt = false }: { params: Params; branches: Branch[]; debt?: boolean }) {
  return <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
    {!debt && <Select name="status" label="Trạng thái hóa đơn" options={invoiceStatuses.map(id => ({ id, name: id }))} value={params.status} />}
    <Select name="receivable" label="Trạng thái công nợ" emptyLabel={debt ? 'Còn công nợ' : 'Tất cả'} options={[...(debt ? [{ id: 'ALL', name: 'Tất cả, gồm đã thanh toán' }] : []), ...debtStatuses.map(id => ({ id, name: id }))]} value={params.receivable} />
    <Select name="branch" label="Chi nhánh" options={branches} value={params.branch} /><Field name="currency" label="Tiền tệ (VD: VND)" required={false} value={params.currency} />
    <button className="self-end rounded border px-4 py-2">Lọc</button>
  </form>
}
export function InvoiceTable({ data, names, debt = false }: { data: Invoice[]; names: Map<string, string>; debt?: boolean }) {
  return <Table headers={['Hóa đơn', 'Học viên', 'Chi nhánh', 'Tiền tệ', 'Tổng tiền', ...(!debt ? ['Trạng thái hóa đơn', 'Ngày phát hành'] : []), 'Trạng thái thanh toán / công nợ', 'Hạn thanh toán', 'Đã phân bổ (ròng)', 'Đã hoàn', 'Còn nợ', 'Ngày quá hạn']} rows={data.map(i => [
    <Link prefetch={false} key={i.invoice_id} className="underline" href={'/admin/finance/invoices?selected=' + i.invoice_id}>{i.invoice_number}</Link>, names.get(i.student_id_snapshot) ?? 'Không tìm thấy học viên', i.branch_name_snapshot, i.currency, money(i.total_amount, i.currency),
    ...(!debt ? [i.invoice_status, dateText(i.issued_on)] : []), i.receivable_status, dateText(i.due_on), money(i.allocated_amount, i.currency), money(i.refunded_amount, i.currency), money(i.outstanding_balance, i.currency), i.days_overdue,
  ])} />
}
