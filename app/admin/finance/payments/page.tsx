import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { branches, findStudents, studentNames, selectedInvoice } from '../query'
import { paymentMethods, type Params, vietnamDateTime, uuidPattern } from '../operations'
import { paymentList, paymentDetail, allocationInvoices, allocationOpenings, total, effectiveAllocationTotal, invoicePaymentCandidates } from './data'
import { createPayment, createInvoicePayment, allocatePayment, allocateOpeningPayment, voidPayment } from './actions'
import { money } from '../data'
import { Confirm, Field, Select, LoadError, Notice, Pager, Panel, Table, dateText, timeText } from '../_components/ui'
import SubmitButton from '../_components/SubmitButton'
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const db = await createClient()
  let loaded
  try {
    const [list, branchRows, students, detail, targetInvoice] = await Promise.all([paymentList(db, params), branches(db), findStudents(db, params.student_q), paymentDetail(db, params.selected), selectedInvoice(db, params.invoice)])
    const [invoices, names, openings] = await Promise.all([detail ? allocationInvoices(db, detail.payment, params) : null, studentNames(db, [...list.data.map(p => p.student_id_snapshot), ...(detail ? [detail.payment.student_id_snapshot] : [])]), detail ? allocationOpenings(db, detail.payment, params) : null])
    loaded = { list, branchRows, students, detail, invoices, names, openings, targetInvoice }
  } catch { return <LoadError /> }
  const { list, branchRows, students, detail, invoices, names, openings, targetInvoice } = loaded
  const entryKey = uuidPattern.test(params.entry ?? '') ? params.entry! : randomUUID()
  let existingPayments: Awaited<ReturnType<typeof invoicePaymentCandidates>> = []
  try { if (targetInvoice && !detail) existingPayments = await invoicePaymentCandidates(db, targetInvoice) } catch { return <LoadError /> }
  const payment = detail?.payment
  // The allocation RPC reserves original allocations, including amounts released to credit.
  const allocated = detail ? total(detail.allocations) : 0
  const unallocated = payment ? Math.max(0, Math.round((Number(payment.amount) - allocated) * 100) / 100) : 0
  const singleInvoice = invoices?.page === 1 && !invoices.more && invoices.data.length === 1
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Thanh toán</h1><Notice params={params} />
    <form className="grid gap-3 sm:grid-cols-4"><Select name="status" label="Trạng thái" options={['POSTED', 'VOIDED'].map(id => ({ id, name: id }))} value={params.status} /><Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} /><Field name="currency" label="Tiền tệ" required={false} value={params.currency} /><button className="self-end rounded border p-2">Lọc</button></form>
    <Table headers={['Thanh toán', 'Học viên', 'Chi nhánh', 'Tiền tệ', 'Số tiền', 'Phương thức', 'Ngày thu', 'Tham chiếu', 'Trạng thái', 'Phân bổ gốc', 'Chưa phân bổ']} rows={list.data.map(p => {
      const allocated = effectiveAllocationTotal(list.allocations.filter(a => a.payment_id === p.id))
      return [<Link prefetch={false} key={p.id} className="underline" href={'?selected=' + p.id}>{p.payment_number}</Link>, names.get(p.student_id_snapshot), p.branch_name_snapshot, p.currency, money(p.amount, p.currency), p.payment_method, timeText(p.paid_at), p.reference ?? '—', p.status, money(allocated, p.currency), p.status === 'POSTED' ? money(Math.max(0, Number(p.amount) - total(list.allocations.filter(a => a.payment_id === p.id))), p.currency) : '—']
    })} /><Pager path="/admin/finance/payments" params={params} {...list} />
    <p className="text-sm text-gray-600">Chưa phân bổ = tiền thu trừ các phân bổ gốc, theo hợp đồng RPC hiện tại. Hoàn tiền được theo dõi riêng.</p>
    {targetInvoice && <Panel title={'Thu tiền cho ' + targetInvoice.invoice_number}>
      <Link className="underline" href={'/admin/finance/invoices?selected=' + targetInvoice.invoice_id}>Quay lại hóa đơn</Link>
      <p>{targetInvoice.branch_name_snapshot} • Còn phải thu: {money(targetInvoice.outstanding_balance, targetInvoice.currency)}</p>
      <p>Bước 1: ghi nhận khoản tiền thực nhận. Bước 2: phân bổ khoản tiền đó vào hóa đơn. Hóa đơn chỉ giảm nợ sau khi phân bổ thành công.</p>
      {!payment && targetInvoice.invoice_status === 'ISSUED' && Number(targetInvoice.outstanding_balance) > 0 && <section><h3 className="font-semibold">Phân bổ khoản tiền đã thu</h3><p>Không ghi nhận tiền lần nữa nếu đã có phiếu thu. Nhập số tiền ở phiếu thu phù hợp rồi bấm Xác nhận phân bổ vào hóa đơn. Thành công sẽ mở lại hóa đơn với công nợ đã cập nhật; thao tác này không tăng thực thu.</p>{existingPayments.length ? <Table headers={['Phiếu thu', 'Ngày thu', 'Đã nhận', 'Chưa phân bổ', 'Thao tác']} rows={existingPayments.map(p => [p.payment_number, timeText(p.paid_at), money(p.amount, p.currency), money(p.unallocated, p.currency), <form key={p.id} action={allocatePayment} className="space-y-2">
        <input type="hidden" name="payment_id" value={p.id} />
        <input type="hidden" name="selected" value={p.id} />
        <input type="hidden" name="invoice_id" value={targetInvoice.invoice_id} />
        <Field name="amount" label={'Phân bổ từ ' + p.payment_number} type="number" value={String(Math.min(p.unallocated, Number(targetInvoice.outstanding_balance)))} max={Math.min(p.unallocated, Number(targetInvoice.outstanding_balance))} />
        <SubmitButton>Xác nhận phân bổ vào hóa đơn</SubmitButton>
      </form>])} /> : <p>Không tìm thấy khoản tiền phù hợp trong 25 phiếu thu gần nhất. Kiểm tra danh sách thanh toán trước khi ghi nhận mới.</p>}</section>}
      {!payment && targetInvoice.invoice_status === 'ISSUED' && Number(targetInvoice.outstanding_balance) > 0 && <form action={createInvoicePayment} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="invoice_id" value={targetInvoice.invoice_id} /><input type="hidden" name="idempotency_key" value={entryKey} />
        <Field name="amount" label="Số tiền thực nhận" type="number" value={String(targetInvoice.outstanding_balance)} max={Number(targetInvoice.outstanding_balance)} />
        <Select name="payment_method" label="Phương thức" required options={paymentMethods.map(id => ({ id, name: id }))} />
        <Field name="paid_at" label="Thời gian thu (giờ Việt Nam)" type="datetime-local" value={vietnamDateTime()} />
        <Field name="reference" label="Tham chiếu" required={false} /><Field name="notes" label="Ghi chú" required={false} />
        <SubmitButton>Ghi nhận tiền và chuyển đến phân bổ</SubmitButton>
      </form>}
    </Panel>}
    {payment && detail && <Panel title={'Thanh toán ' + payment.payment_number}>
      <Link prefetch={false} className="underline" href={'/documents/finance/payments/' + payment.id}>Xem / In chứng từ</Link>
      <dl className="grid gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-3">
        <div><dt className="text-sm text-gray-600">Số thanh toán</dt><dd className="font-semibold">{payment.payment_number}</dd></div>
        <div><dt className="text-sm text-gray-600">Học viên</dt><dd className="font-semibold">{names.get(payment.student_id_snapshot) ?? '—'}</dd></div>
        <div><dt className="text-sm text-gray-600">Trạng thái</dt><dd className="font-semibold">{payment.status}</dd></div>
        <div><dt className="text-sm text-gray-600">Số tiền đã nhận</dt><dd className="text-lg font-semibold">{money(payment.amount, payment.currency)}</dd></div>
        <div><dt className="text-sm text-gray-600">Đã phân bổ</dt><dd className="text-lg font-semibold">{money(allocated, payment.currency)}</dd></div>
        <div><dt className="text-sm text-gray-600">Chưa phân bổ</dt><dd className="text-lg font-semibold text-blue-800">{payment.status === 'POSTED' ? money(unallocated, payment.currency) : '—'}</dd></div>
      </dl>
      <p className="text-sm text-gray-600">Đã phân bổ tính theo phân bổ gốc. Phần chuyển sang credit và hoàn tiền được theo dõi riêng; không cộng lại vào số tiền có thể phân bổ.</p>
      <p>Đã hoàn: {money(total(detail.refunds), payment.currency)}</p>
      {payment.status === 'POSTED' && <>
        <Link prefetch={false} className="underline" href={'/admin/finance/refunds?payment=' + payment.id}>Tạo hoàn tiền cho thanh toán này</Link>
        <h3 className="font-semibold">Phân bổ vào hóa đơn</h3>
        <p>Hóa đơn chỉ giảm công nợ sau khi khoản tiền được phân bổ thành công.</p>
        <p className="text-sm text-gray-600">Mỗi khoản thanh toán chỉ được phân bổ một lần vào cùng một hóa đơn, kể cả khi phân bổ một phần. Hãy kiểm tra số tiền trước khi xác nhận.</p>
        {unallocated === 0 && <p role="status" className="rounded bg-blue-50 p-3">Khoản thanh toán đã được phân bổ hết.</p>}
        {invoices?.data.length ? <Table headers={['Hóa đơn', 'Hạn thanh toán', 'Còn nợ', 'Phân bổ']} rows={invoices.data.map(i => {
          const limit = Math.min(Number(i.outstanding_balance), unallocated)
          const alreadyAllocated = detail.allocations.some(a => a.invoice_id === i.invoice_id)
          return [
            <Link prefetch={false} key={i.invoice_id} className="underline" href={'/admin/finance/invoices?selected=' + i.invoice_id}>{i.invoice_number}</Link>,
            dateText(i.due_on), money(i.outstanding_balance, i.currency),
            alreadyAllocated ? 'Đã có phân bổ từ thanh toán này. Hệ thống không cho phân bổ lần hai vào cùng hóa đơn.' : limit <= 0 ? 'Không còn tiền để phân bổ' :
            <div key={i.invoice_id} className="space-y-3">
              <form action={allocatePayment} className="space-y-2">
                <input type="hidden" name="payment_id" value={payment.id} />
                <input type="hidden" name="selected" value={payment.id} />
                <input type="hidden" name="invoice_id" value={i.invoice_id} />
                <Field name="amount" label={'Số tiền cho ' + i.invoice_number} type="number" value={singleInvoice || params.invoice === i.invoice_id ? String(limit) : undefined} max={limit} />
                <p className="text-sm text-gray-600">Tối đa: {money(limit, payment.currency)}</p>
                <SubmitButton>Phân bổ</SubmitButton>
              </form>
              {unallocated === Number(i.outstanding_balance) && <form action={allocatePayment}>
                <input type="hidden" name="payment_id" value={payment.id} />
                <input type="hidden" name="selected" value={payment.id} />
                <input type="hidden" name="invoice_id" value={i.invoice_id} />
                <input type="hidden" name="amount" value={String(limit)} />
                <SubmitButton>Phân bổ toàn bộ</SubmitButton>
              </form>}
            </div>,
          ]
        })} /> : <p className="rounded bg-gray-50 p-3">Không có hóa đơn ISSUED còn công nợ phù hợp với học viên và loại tiền của khoản thanh toán này.</p>}
        {params.invoice && <Link prefetch={false} className="block text-sm underline" href={'/admin/finance/payments?selected=' + payment.id}>Xem tất cả hóa đơn phù hợp</Link>}
        {invoices && <Pager path="/admin/finance/payments" params={params} page={invoices.page} more={invoices.more} keyName="invoice_page" />}
      </>}
      <h3 className="font-semibold">Lịch sử phân bổ</h3>
      {detail.allocations.length ? <Table headers={['Hóa đơn / công nợ', 'Số tiền phân bổ gốc']} rows={detail.allocations.map(a => [
        a.invoice_id ? <Link prefetch={false} key={a.id} className="underline" href={'/admin/finance/invoices?selected=' + a.invoice_id}>{a.invoices?.invoice_number ?? a.invoice_id}</Link> : 'Thu nợ mở sổ',
        money(a.amount, payment.currency),
      ])} /> : <p>Chưa có phân bổ nào cho khoản thanh toán này.</p>}
      {payment.status === 'POSTED' && <>
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
      {students.length > 0 && <form action={createPayment} className="grid gap-3 sm:grid-cols-2"><input type="hidden" name="idempotency_key" value={entryKey} /><Select name="student_id" label="Học viên" required options={students.map(s => ({ id: s.id, name: `${s.full_name} (${s.student_code})` }))} /><Select name="branch_id" label="Chi nhánh nhận tiền" options={branchRows} required /><Field name="amount" label="Số tiền" type="number" /><Field name="currency" label="Tiền tệ" value="VND" /><Select name="payment_method" label="Phương thức" required options={paymentMethods.map(id => ({ id, name: id }))} /><Field name="paid_at" label="Thời gian thu (giờ Việt Nam)" type="datetime-local" value={vietnamDateTime()} /><Field name="reference" label="Tham chiếu" required={false} /><Field name="notes" label="Ghi chú" required={false} /><SubmitButton>Ghi nhận thanh toán</SubmitButton></form>}
    </Panel>
  </div>
}
