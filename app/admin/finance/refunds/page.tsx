import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { branches, studentNames } from '../query'
import { pageNumber, pageSize, type Params, vietnamDateTime } from '../operations'
import { paymentList, paymentDetail, total } from '../payments/data'
import { refundList, selectedRefund, refundAllocations } from './data'
import { createRefund, allocateRefund, voidRefund } from './actions'
import { money } from '../data'
import { Confirm, Field, Select, LoadError, Notice, Pager, Panel, Table, timeText } from '../_components/ui'
import SubmitButton from '../_components/SubmitButton'
export default async function RefundsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const db = await createClient()
  let loaded
  try {
    const [list, branchRows, payments, refund] = await Promise.all([refundList(db, params), branches(db), paymentList(db, { page: params.payment_page }, true, false), selectedRefund(db, params.selected)])
    const detail = await paymentDetail(db, refund?.payment_id ?? params.payment)
    const [allocations, names] = await Promise.all([detail ? refundAllocations(db, detail.payment.id) : [], studentNames(db, [...list.data.map(r => r.student_id_snapshot), ...payments.data.map(p => p.student_id_snapshot), ...(detail ? [detail.payment.student_id_snapshot] : [])])])
    loaded = { list, branchRows, payments, refund, detail, allocations, names }
  } catch { return <LoadError /> }
  const { list, branchRows, payments, refund, detail, allocations, names } = loaded
  const remaining = detail ? Number(detail.payment.amount) - total(detail.refunds) : 0
  const allocationPage = pageNumber(params.allocation_page)
  const originalRows = detail?.allocations.slice((allocationPage - 1) * pageSize, allocationPage * pageSize) ?? []
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Hoàn tiền</h1><Notice params={params} />
    <form className="grid gap-3 sm:grid-cols-4"><Select name="status" label="Trạng thái" options={['POSTED', 'VOIDED'].map(id => ({ id, name: id }))} value={params.status} /><Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} /><Field name="currency" label="Tiền tệ" required={false} value={params.currency} /><button className="self-end rounded border p-2">Lọc</button></form>
    <Table headers={['Phiếu hoàn', 'Thanh toán gốc', 'Học viên', 'Chi nhánh', 'Tiền tệ', 'Số tiền', 'Ngày hoàn', 'Lý do', 'Trạng thái']} rows={list.data.map(r => [<Link prefetch={false} key={r.id} className="underline" href={'?selected=' + r.id}>{r.refund_number}</Link>, r.payments.payment_number, names.get(r.student_id_snapshot), r.branch_name_snapshot, r.currency, money(r.amount, r.currency), timeText(r.refunded_at), r.reason, r.status])} /><Pager path="/admin/finance/refunds" params={params} {...list} />
    <Panel title="Chọn thanh toán để hoàn tiền"><Table headers={['Thanh toán POSTED', 'Học viên', 'Chi nhánh', 'Số tiền', 'Chọn']} rows={payments.data.map(p => [p.payment_number, names.get(p.student_id_snapshot), p.branch_name_snapshot, money(p.amount, p.currency), <Link key={p.id} prefetch={false} className="underline" href={'?payment=' + p.id}>Chọn thanh toán</Link>])} /><Pager path="/admin/finance/refunds" params={params} page={payments.page} more={payments.more} keyName="payment_page" /></Panel>
    {detail && <Panel title={'Thanh toán gốc ' + detail.payment.payment_number}>
      <p>{names.get(detail.payment.student_id_snapshot)} • {detail.payment.branch_name_snapshot} • {detail.payment.status}</p>
      <p>Số tiền: {money(detail.payment.amount, detail.payment.currency)} • Phân bổ gốc: {money(total(detail.allocations), detail.payment.currency)} • Đã hoàn: {money(total(detail.refunds), detail.payment.currency)} • Còn có thể hoàn: {money(remaining, detail.payment.currency)}</p>
      {!refund && detail.payment.status === 'POSTED' && remaining > 0 && <form action={createRefund} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="idempotency_key" value={randomUUID()}/><input type="hidden" name="payment_id" value={detail.payment.id} /><Field name="amount" label="Số tiền hoàn" type="number" max={remaining} /><Field name="refunded_at" label="Thời gian hoàn (giờ Việt Nam)" type="datetime-local" value={vietnamDateTime()} /><Field name="reason" label="Lý do hoàn tiền" /><Field name="notes" label="Ghi chú" required={false} /><Confirm text="Gửi yêu cầu hoàn tiền để phê duyệt. Chưa ghi nhận tiền hoàn khi mới gửi yêu cầu." /><SubmitButton>Gửi yêu cầu hoàn tiền</SubmitButton></form>}
      {refund && <><h3 className="font-semibold">{refund.refund_number} • {refund.status} • {money(refund.amount, refund.currency)}</h3><p>Phần hoàn chưa phân bổ: {refund.status === 'POSTED' ? money(Number(refund.amount) - total(allocations.filter(a => a.refund_id === refund.id)), refund.currency) : 'Phiếu đã vô hiệu'}</p></>}
      <h3 className="font-semibold">Phân bổ gốc và hóa đơn nhận hoàn</h3>
      <Table headers={['Hóa đơn gốc', 'Phân bổ gốc', 'Đã hoàn vào phân bổ', 'Thao tác']} rows={originalRows.map(a => {
        const refunded = total(allocations.filter(r => r.payment_allocation_id === a.id))
        const available = Number(a.amount) - refunded
        return [a.invoices.invoice_number, money(a.amount, detail.payment.currency), money(refunded, detail.payment.currency), refund?.status === 'POSTED' && available > 0 && !allocations.some(r => r.refund_id === refund.id && r.payment_allocation_id === a.id) && Number(refund.amount) > total(allocations.filter(r => r.refund_id === refund.id)) ? <form key={a.id} action={allocateRefund} className="space-y-2"><input type="hidden" name="idempotency_key" value={randomUUID()}/><input type="hidden" name="refund_id" value={refund.id} /><input type="hidden" name="selected" value={refund.id} /><input type="hidden" name="payment_allocation_id" value={a.id} /><Field name="amount" label={'Hoàn vào ' + a.invoices.invoice_number} type="number" max={Math.min(available, Number(refund.amount) - total(allocations.filter(r => r.refund_id === refund.id)))} /><Field name="reason" label="Lý do phân bổ hoàn tiền"/><Confirm text="Gửi phân bổ để người khác phê duyệt"/><SubmitButton>Yêu cầu phân bổ hoàn tiền</SubmitButton></form> : '—']
      })} />
      <Pager path="/admin/finance/refunds" params={params} page={allocationPage} more={detail.allocations.length > allocationPage * pageSize} keyName="allocation_page" />
      {refund?.status === 'POSTED' && <form action={voidRefund} className="space-y-3"><input type="hidden" name="idempotency_key" value={randomUUID()}/><input type="hidden" name="refund_id" value={refund.id} /><input type="hidden" name="selected" value={refund.id} /><Field name="reason" label="Lý do vô hiệu hoàn tiền" /><Confirm text="Vô hiệu phiếu hoàn sẽ hoàn tác ảnh hưởng của phiếu lên công nợ. Tôi xác nhận thao tác." /><SubmitButton>Yêu cầu vô hiệu hoàn tiền</SubmitButton></form>}
    </Panel>}
  </div>
}
