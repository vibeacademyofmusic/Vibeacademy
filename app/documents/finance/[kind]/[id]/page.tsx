import InvoiceTemplate from '../../../_components/InvoiceTemplate'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { financeContext } from '@/app/finance/authorization'
import { all, rows, selectedInvoice, studentNames } from '@/app/admin/finance/query'
import { uuidPattern } from '@/app/admin/finance/operations'
import { money } from '@/app/admin/payroll/data'
import { Table, timeText, dateText, LoadError } from '@/app/admin/finance/_components/ui'
import { paymentDetail, effectiveAllocationTotal, total } from '@/app/admin/finance/payments/data'
import Document from '../../../_components/Document'
const kinds = ['invoices', 'payments', 'refunds', 'credits']
export default async function FinanceDocument({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params, { db, isSuperAdmin } = await financeContext()
  if (!kinds.includes(kind) || !uuidPattern.test(id)) notFound()
  const table = kind === 'credits' ? 'customer_credit_balances' : kind
  const fields: Record<string, string> = {
    invoices: 'id,invoice_number,enrollment_tuition_id,student_id_snapshot,branch_id_snapshot,branch_name_snapshot,currency,subtotal,total_amount,status,issued_on,due_on,notes,created_by',
    payments: 'id,payment_number,student_id_snapshot,branch_name_snapshot,currency,amount,status,paid_at,payment_method,reference,created_by,voided_at,void_reason',
    refunds: 'id,refund_number,payment_id,student_id_snapshot,branch_name_snapshot,currency,amount,status,refunded_at,reason,created_by,created_at',
    credits: 'id,student_id,branch_id,payment_id,opening_receivable_id,correction_id,currency,amount,applied_amount,refunded_amount,remaining_credit,voided_amount,created_at',
  }
  const record = await db.from(table).select(fields[kind]).eq('id', id).maybeSingle()
  if (record.error) return <LoadError/>
  if (!record.data) notFound()
  // Runtime projection is selected from a fixed allowlist; no query/table names come from unchecked input.
  const d = record.data as unknown as Record<string, string | number | null>
  const text = (key: string) => String(d[key] ?? ''), amount = (key: string) => money(Number(d[key] ?? 0), text('currency'))
  let body
    const student = (await studentNames(db, [text(kind === 'credits' ? 'student_id' : 'student_id_snapshot')])).values().next().value
    if (kind === 'invoices') {
      const [balance, items, tuition, contact] = await Promise.all([
        selectedInvoice(db, id),
        all((a, b) => db.from('invoice_items').select('id,description,quantity,unit_amount,line_total').eq('invoice_id', id).order('line_no').order('id').range(a, b)),
        rows(db.from('enrollment_tuition').select('starts_on,effective_ends_on,plan_name_snapshot,list_price,discount_amount').eq('id', text('enrollment_tuition_id'))),
        uuidPattern.test(text('branch_id_snapshot')) ? rows(db.from('branches').select('address,phone').eq('id', text('branch_id_snapshot'))) : Promise.resolve([]),
      ])
      if (!balance) return <LoadError/>
      return <InvoiceTemplate
        invoice={{ number: text('invoice_number'), status: text('status'), issuedOn: text('issued_on'), dueOn: text('due_on'), branch: text('branch_name_snapshot'), student: student || text('student_id_snapshot'), currency: text('currency'), subtotal: Number(d.subtotal), total: Number(d.total_amount), notes: text('notes') }}
        balance={balance} items={items} tuition={tuition[0]} contact={contact[0]} logoSrc="/vibe-logo.png"
        actions={isSuperAdmin ? <><Link href={'/admin/finance/invoices?selected=' + id}>Invoice workflow</Link>{text('status') === 'ISSUED' && Number(balance.outstanding_balance) > 0 && <Link href={'/admin/finance/payments?invoice=' + id}>Record payment</Link>}</> : <Link href="/finance">Finance approvals</Link>}
      />
    } else if (kind === 'payments') {
      const detail = await paymentDetail(db, id)
      if (!detail) return <LoadError/>
      const invoiceIds = detail.allocations.flatMap(a => a.invoice_id ? [a.invoice_id] : [])
      const balances = invoiceIds.length ? await all((a, b) => db.from('invoice_receivables').select('invoice_id,invoice_number,outstanding_balance,currency').in('invoice_id', invoiceIds).order('invoice_id').range(a, b)) : []
      body = <><p>Ngày thu: {timeText(text('paid_at'))} • {text('payment_method')}</p><p>Số tiền thu gốc: {amount('amount')}</p><p>Tham chiếu giao dịch: {text('reference') || '—'}</p><p>Phân bổ gốc sau chuyển credit (lịch sử): {money(effectiveAllocationTotal(detail.allocations), text('currency'))} • Đã hoàn: {money(total(detail.refunds), text('currency'))}</p><Table headers={['Hóa đơn / công nợ gốc', 'Số tiền phân bổ gốc', 'Chuyển số dư khách hàng']} rows={detail.allocations.map(a => [a.invoices?.invoice_number || a.opening_receivable_id, money(a.amount, text('currency')), money(a.released_to_credit || 0, text('currency'))])}/><Table headers={['Hóa đơn', 'Còn phải thu hiện tại']} rows={balances.map(b => [b.invoice_number, money(b.outstanding_balance, b.currency)])}/><p>Người ghi nhận thu: {text('created_by')}</p>{text('voided_at') && <p>Đã vô hiệu: {timeText(text('voided_at'))} • {text('void_reason')}. Số tiền gốc được giữ nguyên để đối chiếu.</p>}</>
    } else if (kind === 'refunds') {
      const approvals = await rows(db.from('financial_approval_requests').select('maker_user_id,approver_user_id,created_at,approved_at,operation').eq('result_id', id).in('operation', ['REFUND', 'REFUND_CUSTOMER_CREDIT']).eq('status', 'POSTED').order('created_at'))
      body = <><p>Thanh toán gốc: {text('payment_id')}</p><p>Ngày hoàn: {timeText(text('refunded_at'))} • Số tiền: {amount('amount')}</p><p>Lý do: {text('reason')}</p>{approvals.length ? approvals.map((a, i) => <p key={i}>Người lập: {a.maker_user_id} • Yêu cầu: {timeText(a.created_at)} • Người duyệt: {a.approver_user_id} • Ngày duyệt: {a.approved_at ? timeText(a.approved_at) : '—'}</p>) : <p>Chưa có dữ liệu người lập/người duyệt trong phạm vi xem; người ghi sổ: {text('created_by')}.</p>}</>
    } else {
      const uses = await all((a, b) => db.from('customer_credit_uses').select('id,kind,amount,refund_id,payment_allocation_id,created_at').eq('credit_id', id).order('created_at').order('id').range(a, b))
      body = <><p>Ngày tạo: {timeText(text('created_at'))}</p><p>Thanh toán gốc: {text('payment_id') || 'Trả trước chuyển đổi'} • Công nợ gốc: {text('opening_receivable_id')} • Điều chỉnh: {text('correction_id')}</p><p>Số dư gốc: {amount('amount')} • Đã phân bổ: {amount('applied_amount')} • Đã hoàn: {amount('refunded_amount')} • Vô hiệu: {amount('voided_amount')}</p><p className="font-bold">Còn lại: {amount('remaining_credit')}</p><Table headers={['Thời gian', 'Loại', 'Số tiền', 'Tham chiếu']} rows={uses.map(u => [timeText(u.created_at), u.kind, money(u.amount, text('currency')), u.refund_id || u.payment_allocation_id || u.id])}/><p>Số dư khách hàng không phải doanh thu. Lịch sử giữ cả giao dịch đã đảo; số dư hiện tại lấy từ sổ số dư chính thức.</p></>
    }
  const title = { invoices: 'Hóa đơn học phí', payments: 'Phiếu thu', refunds: 'Phiếu hoàn tiền', credits: 'Sao kê số dư khách hàng' }[kind]!
  return <Document title={title} reference={text({ invoices: 'invoice_number', payments: 'payment_number', refunds: 'refund_number', credits: 'id' }[kind]!)} actions={isSuperAdmin ? <><Link prefetch={false} href={'/admin/finance/' + kind + '?selected=' + id}>Thao tác / quy trình phê duyệt</Link>{kind === 'invoices' && text('status') === 'ISSUED' && <Link prefetch={false} href="/admin/finance/payments">Ghi nhận thanh toán</Link>}{kind === 'payments' && text('status') === 'POSTED' && <Link prefetch={false} href={'/admin/finance/refunds?payment=' + id}>Yêu cầu hoàn tiền</Link>}</> : <Link prefetch={false} href="/finance">Phê duyệt tài chính</Link>}><p>Học viên / khách hàng: {student || text(kind === 'credits' ? 'student_id' : 'student_id_snapshot')}</p><p>Chi nhánh: {text('branch_name_snapshot') || text('branch_id')} • {text('status')}</p>{body}<footer className="border-t pt-4"><p>Tham chiếu hệ thống: {id}</p><p>Chứng từ nội bộ VIBE Academy; không thay thế hóa đơn điện tử thuế. Công nợ/số dư là tình trạng tại thời điểm xem.</p></footer></Document>
}
