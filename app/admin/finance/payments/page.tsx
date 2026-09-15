import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { branches, findStudents, studentNames } from '../query'
import { paymentMethods, type Params, vietnamDateTime } from '../operations'
import { paymentList, paymentDetail, allocationInvoices, allocationOpenings, total, effectiveAllocationTotal } from './data'
import { createPayment, allocatePayment, allocateOpeningPayment, voidPayment } from './actions'
import { money } from '../data'
import { Confirm, Field, Select, LoadError, Notice, Pager, Panel, Table, dateText, timeText } from '../_components/ui'
import SubmitButton from '../_components/SubmitButton'
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const db = await createClient()
  let loaded
  try {
    const [list, branchRows, students, detail] = await Promise.all([paymentList(db, params), branches(db), findStudents(db, params.student_q), paymentDetail(db, params.selected)])
    const [invoices, names, openings] = await Promise.all([detail ? allocationInvoices(db, detail.payment, params) : null, studentNames(db, [...list.data.map(p => p.student_id_snapshot), ...(detail ? [detail.payment.student_id_snapshot] : [])]), detail ? allocationOpenings(db, detail.payment, params) : null])
    loaded = { list, branchRows, students, detail, invoices, names, openings }
  } catch { return <LoadError /> }
  const { list, branchRows, students, detail, invoices, names, openings } = loaded
  const payment = detail?.payment
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Thanh toán</h1><Notice params={params} />
    <form className="grid gap-3 sm:grid-cols-4"><Select name="status" label="Trạng thái" options={['POSTED', 'VOIDED'].map(id => ({ id, name: id }))} value={params.status} /><Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} /><Field name="currency" label="Tiền tệ" required={false} value={params.currency} /><button className="self-end rounded border p-2">Lọc</button></form>
    <Table headers={['Thanh toán', 'Học viên', 'Chi nhánh', 'Tiền tệ', 'Số tiền', 'Phương thức', 'Ngày thu', 'Tham chiếu', 'Trạng thái', 'Phân bổ gốc', 'Chưa phân bổ']} rows={list.data.map(p => {
      const allocated = effectiveAllocationTotal(list.allocations.filter(a => a.payment_id === p.id))
      return [<Link prefetch={false} key={p.id} className="underline" href={'?selected=' + p.id}>{p.payment_number}</Link>, names.get(p.student_id_snapshot), p.branch_name_snapshot, p.currency, money(p.amount, p.currency), p.payment_method, timeText(p.paid_at), p.reference ?? '—', p.status, money(allocated, p.currency), p.status === 'POSTED' ? money(Math.max(0, Number(p.amount) - total(list.allocations.filter(a => a.payment_id === p.id))), p.currency) : '—']
    })} /><Pager path="/admin/finance/payments" params={params} {...list} />
    <p className="text-sm text-gray-600">Chưa phân bổ = tiền thu trừ các phân bổ gốc, theo hợp đồng RPC hiện tại. Hoàn tiền được theo dõi riêng.</p>
    {payment && detail && <Panel title={'Thanh toán ' + payment.payment_number}><p>{names.get(payment.student_id_snapshot)} • {money(payment.amount, payment.currency)} • {payment.status}</p>
      <p>Đã phân bổ: {money(effectiveAllocationTotal(detail.allocations), payment.currency)} • Đã hoàn: {money(total(detail.refunds), payment.currency)}</p>
      {payment.status === 'POSTED' && <>
        <Link prefetch={false} className="underline" href={'/admin/finance/refunds?payment=' + payment.id}>Tạo hoàn tiền cho thanh toán này</Link>
        <h3 className="font-semibold">Phân bổ vào hóa đơn</h3>
        <Table headers={['Hóa đơn', 'Hạn thanh toán', 'Trạng thái', 'Còn nợ', 'Phân bổ']} rows={(invoices?.data ?? []).map(i => [i.invoice_number, dateText(i.due_on), i.receivable_status, money(i.outstanding_balance, i.currency), detail.allocations.some(a => a.invoice_id === i.invoice_id) ? 'Đã có phân bổ từ thanh toán này' : <form action={allocatePayment} key={i.invoice_id} className="space-y-2"><input type="hidden" name="payment_id" value={payment.id} /><input type="hidden" name="selected" value={payment.id} /><input type="hidden" name="invoice_id" value={i.invoice_id} /><Field name="amount" label={'Số tiền cho ' + i.invoice_number} type="number" max={Math.min(Number(i.outstanding_balance), Number(payment.amount) - total(detail.allocations))} /><SubmitButton>Phân bổ</SubmitButton></form>])} />
        {invoices && <Pager path="/admin/finance/payments" params={params} page={invoices.page} more={invoices.more} keyName="invoice_page" />}
        <h3 className="font-semibold">Phân bổ thu nợ mở sổ</h3>
        <p>Chỉ trả công nợ cũ của cùng học viên, chi nhánh và tiền tệ. Tiền thu được tính theo ngày nhận; không tạo doanh thu mới.</p>
        <Table headers={['Ngày mở sổ', 'Còn nợ', 'Phân bổ']} rows={(openings?.data ?? []).map(o => [dateText(o.opening_as_of_date), money(o.outstanding_balance, o.currency), detail.allocations.some(a => a.opening_receivable_id === o.id) ? 'Đã có phân bổ từ thanh toán này' : Number(payment.amount) > total(detail.allocations) ? <form action={allocateOpeningPayment} key={o.id} className="space-y-2"><input type="hidden" name="payment_id" value={payment.id}/><input type="hidden" name="selected" value={payment.id}/><input type="hidden" name="opening_receivable_id" value={o.id}/><Field name="amount" label="Số tiền thu nợ mở sổ" type="number" max={Math.min(Number(o.outstanding_balance), Number(payment.amount) - total(detail.allocations))}/><SubmitButton>Phân bổ thu nợ mở sổ</SubmitButton></form> : 'Thanh toán đã phân bổ hết'])}/>
        {openings && <Pager path="/admin/finance/payments" params={params} page={openings.page} more={openings.more} keyName="opening_page"/>}
        <form action={voidPayment} className="space-y-3"><input type="hidden" name="idempotency_key" value={randomUUID()}/><input type="hidden" name="payment_id" value={payment.id} /><input type="hidden" name="selected" value={payment.id} /><Field name="reason" label="Lý do vô hiệu thanh toán" /><Confirm text="Vô hiệu thanh toán có thể làm công nợ mở lại. Tôi xác nhận thao tác." /><SubmitButton>Gửi yêu cầu vô hiệu thanh toán</SubmitButton></form>
      </>}
    </Panel>}
    <Panel title="Ghi nhận thanh toán mới">
      <form className="flex flex-wrap items-end gap-3"><Field name="student_q" label="Tìm học viên theo tên hoặc mã (tối đa 25 kết quả)" required={false} value={params.student_q} /><button className="rounded border p-2">Tìm học viên</button></form>
      {params.student_q && students.length === 0 && <p>Không tìm thấy học viên.</p>}
      {students.length > 0 && <form action={createPayment} className="grid gap-3 sm:grid-cols-2"><Select name="student_id" label="Học viên" required options={students.map(s => ({ id: s.id, name: `${s.full_name} (${s.student_code})` }))} /><Select name="branch_id" label="Chi nhánh nhận tiền" options={branchRows} required /><Field name="amount" label="Số tiền" type="number" /><Field name="currency" label="Tiền tệ" value="VND" /><Select name="payment_method" label="Phương thức" required options={paymentMethods.map(id => ({ id, name: id }))} /><Field name="paid_at" label="Thời gian thu (giờ Việt Nam)" type="datetime-local" value={vietnamDateTime()} /><Field name="reference" label="Tham chiếu" required={false} /><Field name="notes" label="Ghi chú" required={false} /><SubmitButton>Ghi nhận thanh toán</SubmitButton></form>}
    </Panel>
  </div>
}
