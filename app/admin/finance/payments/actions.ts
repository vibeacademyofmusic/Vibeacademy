'use server'
import { submitFinancialRequest } from '../../../finance/requests'
import { mutate, adminClient, readInput, uuidPattern } from '../operations'
import { selectedInvoice } from '../query'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
export async function createPayment(form: FormData) { await mutate('payments', 'create_payment_once', form, { idempotency_key: 'id', student_id: 'id', branch_id: 'id', amount: 'amount', currency: 'currency', payment_method: 'method', paid_at: 'datetime', reference: 'optional', notes: 'optional' }, { selectResult: true }) }
export async function allocatePayment(form: FormData) { await mutate('payments', 'allocate_payment_to_invoice', form, { payment_id: 'id', invoice_id: 'id', amount: 'amount' }) }
export async function voidPayment(form: FormData) { await submitFinancialRequest(form, 'VOID_PAYMENT', true) }

export async function allocateOpeningPayment(form: FormData) { await mutate('payments', 'allocate_payment_to_opening', form, { payment_id: 'id', opening_receivable_id: 'id', amount: 'amount' }) }

// Guided invoice flow: record a payment, then explicitly allocate the resulting
// payment on its detail page. Never imply two separate RPCs are atomic.
export async function createInvoicePayment(form: FormData) {
  const db = await adminClient()
  const invoiceId = String(form.get('invoice_id') ?? '')
  let error = '', paymentId = ''
  try {
    const invoice = await selectedInvoice(db, invoiceId)
    const args = readInput(form, { idempotency_key: 'id', amount: 'amount', payment_method: 'method', paid_at: 'datetime', reference: 'optional', notes: 'optional' })
    if (!invoice || invoice.invoice_status !== 'ISSUED' || Number(invoice.outstanding_balance) <= 0 || Number(args.p_amount) > Number(invoice.outstanding_balance)) {
      error = 'Hóa đơn phải đã phát hành, còn nợ và số tiền thu không vượt số còn nợ. Hãy tải lại.'
    } else {
      const result = await db.rpc('create_payment_once', { ...args, p_student_id: invoice.student_id_snapshot, p_branch_id: invoice.branch_id_snapshot, p_currency: invoice.currency })
      if (result.error) error = 'Không thể ghi nhận thanh toán. Hãy kiểm tra dữ liệu và tải lại.'
      else if (typeof result.data === 'string' && uuidPattern.test(result.data)) paymentId = result.data
      else error = 'Chưa xác nhận được kết quả. Kiểm tra danh sách thanh toán trước khi thử lại để tránh thu trùng.'
    }
  } catch {
    error = 'Chưa xác nhận được kết quả hoặc dữ liệu không hợp lệ. Kiểm tra danh sách thanh toán trước khi thử lại.'
  }
  for (const route of ['', '/payments', '/invoices', '/receivables']) revalidatePath('/admin/finance' + route)
  const query = new URLSearchParams(uuidPattern.test(invoiceId) ? { invoice: invoiceId } : {})
  if (paymentId) { query.set('selected', paymentId); query.set('success', 'Đã ghi nhận tiền. Bước 2: phân bổ thanh toán vào hóa đơn bên dưới.') }
  else { query.set('error', error); const key = String(form.get('idempotency_key') ?? ''); if (uuidPattern.test(key)) query.set('entry', key) }
  redirect('/admin/finance/payments?' + query)
}
