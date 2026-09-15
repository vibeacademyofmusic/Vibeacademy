import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { branches, invoiceList, selectedInvoice } from '../query'
import { type Params, vietnamDateTime } from '../operations'
import { tuitionCandidates } from './data'
import { createInvoice, issueInvoice, cancelInvoice } from './actions'
import { InvoiceFilters, InvoiceTable } from '../_components/InvoiceList'
import { Confirm, Field, LoadError, Notice, Pager, Panel, Table, dateText } from '../_components/ui'
import SubmitButton from '../_components/SubmitButton'
import { money } from '../data'
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const db = await createClient()
  let loaded
  try { loaded = await Promise.all([invoiceList(db, params), branches(db), tuitionCandidates(db, params), selectedInvoice(db, params.selected)]) } catch { return <LoadError /> }
  const [list, branchRows, terms, selected] = loaded
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Hóa đơn</h1><Notice params={params} />
    <InvoiceFilters params={params} branches={branchRows} /><InvoiceTable {...list} /><Pager path="/admin/finance/invoices" params={params} {...list} />
    {selected && <Panel title={'Hóa đơn ' + selected.invoice_number}>
      <p>{selected.invoice_status} • {money(selected.total_amount, selected.currency)} • {selected.branch_name_snapshot}</p>
      {selected.invoice_status === 'DRAFT' && <form action={issueInvoice} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="invoice_id" value={selected.invoice_id} /><input type="hidden" name="selected" value={selected.invoice_id} />
        <Field name="issued_on" label="Ngày phát hành" type="date" value={vietnamDateTime().slice(0, 10)} /><Field name="due_on" label="Hạn thanh toán" type="date" />
        <Confirm text="Xác nhận phát hành hóa đơn và ghi nhận công nợ." /><SubmitButton>Phát hành hóa đơn</SubmitButton>
      </form>}
      {['DRAFT', 'ISSUED'].includes(selected.invoice_status) && (Number(selected.gross_allocated_amount) > 0 ? <p>Hóa đơn có phân bổ thanh toán đã ghi nhận; không thể hủy trực tiếp.</p> : <form action={cancelInvoice} className="space-y-3"><input type="hidden" name="idempotency_key" value={randomUUID()}/><input type="hidden" name="invoice_status" value={selected.invoice_status}/>
        <input type="hidden" name="invoice_id" value={selected.invoice_id} /><input type="hidden" name="selected" value={selected.invoice_id} /><Field name="reason" label="Lý do hủy hóa đơn" /><Confirm text="Xác nhận hủy hóa đơn này." /><SubmitButton>{selected.invoice_status==='DRAFT'?'Hủy hóa đơn':'Gửi yêu cầu hủy hóa đơn'}</SubmitButton>
      </form>)}
    </Panel>}
    <Panel title="Tạo hóa đơn từ kỳ học phí"><p className="text-sm text-gray-600">Chỉ hiển thị kỳ học phí chưa có hóa đơn và chưa bị hủy. Mỗi trang tối đa 25 kỳ.</p>
      <Table headers={['Học viên', 'Chi nhánh', 'Gói học phí', 'Bắt đầu', 'Kết thúc hiệu lực', 'Giảm giá', 'Thành tiền', 'Tạo hóa đơn nháp']} rows={terms.data.map(t => [t.enrollments.students.full_name + ' (' + t.enrollments.students.student_code + ')', t.branch_name_snapshot, t.plan_name_snapshot, dateText(t.starts_on), dateText(t.effective_ends_on), money(t.discount_amount, t.currency), money(t.amount, t.currency), <form action={createInvoice} key={t.id} className="space-y-2"><input type="hidden" name="enrollment_tuition_id" value={t.id} /><SubmitButton>Tạo DRAFT</SubmitButton></form>])} />
      <Pager path="/admin/finance/invoices" params={params} page={terms.page} more={terms.more} keyName="terms_page" />
    </Panel>
  </div>
}
