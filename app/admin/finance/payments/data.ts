import { all, rows, invoiceFields, type Invoice, type DB } from '../query'
import { pageNumber, pageSize, uuidPattern, type Params } from '../operations'
export type Payment = { id: string; payment_number: string; student_id_snapshot: string; branch_name_snapshot: string; branch_id_snapshot: string; currency: string; amount: number; payment_method: string; paid_at: string; reference: string | null; status: string }
export type Allocation = { id: string; payment_id: string; invoice_id: string | null; opening_receivable_id: string | null; amount: number; released_to_credit?: number; invoices: { invoice_number: string } | null }
export type RefundAmount = { id: string; payment_id: string; amount: number; status: string }
export const paymentFields = 'id,payment_number,student_id_snapshot,branch_name_snapshot,branch_id_snapshot,currency,amount,payment_method,paid_at,reference,status'
export const total = (rows: { amount: number }[]) => rows.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0) / 100
export async function paymentTotals(db: DB, ids: string[], includeRefunds = true) {
  if (!ids.length) return { allocations: [] as Allocation[], refunds: [] as RefundAmount[] }
  const [allocations, refunds, credits] = await Promise.all([
    all<Allocation>((a, b) => db.from('payment_allocations').select('id,payment_id,invoice_id,opening_receivable_id,amount,invoices(invoice_number)').in('payment_id', ids).order('id').range(a, b).returns<Allocation[]>()),
    includeRefunds ? all<RefundAmount>((a, b) => db.from('refunds').select('id,payment_id,amount,status').in('payment_id', ids).eq('status', 'POSTED').order('id').range(a, b).returns<RefundAmount[]>()) : Promise.resolve([] as RefundAmount[]),
    all<{ source_allocation_id: string | null; amount: number }>((a, b) => db.from('customer_credits').select('source_allocation_id,amount').in('payment_id', ids).order('id').range(a, b)),
  ])
  return { allocations: allocations.map(a => ({ ...a, released_to_credit: total(credits.filter(c => c.source_allocation_id === a.id)) })), refunds }
}
export async function paymentList(db: DB, params: Params, onlyPosted = false, includeTotals = true) {
  const page = pageNumber(params.page)
  let query = db.from('payments').select(paymentFields)
  if (onlyPosted) query = query.eq('status', 'POSTED')
  else if (['POSTED', 'VOIDED'].includes(params.status ?? '')) query = query.eq('status', params.status!)
  if (uuidPattern.test(params.branch ?? '')) query = query.eq('branch_id_snapshot', params.branch!)
  if (/^[A-Z]{3}$/.test(params.currency ?? '')) query = query.eq('currency', params.currency!)
  const result = await rows(query.order('paid_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<Payment[]>())
  const data = result.slice(0, pageSize)
  const totals = includeTotals ? await paymentTotals(db, data.map(p => p.id), false) : { allocations: [], refunds: [] }
  return { data, ...totals, more: result.length > pageSize, page }
}
export async function paymentDetail(db: DB, id?: string) {
  if (!uuidPattern.test(id ?? '')) return null
  const payment = (await rows(db.from('payments').select(paymentFields).eq('id', id!).returns<Payment[]>()))[0]
  if (!payment) return null
  const totals = await paymentTotals(db, [payment.id])
  return { payment, ...totals }
}
export async function allocationInvoices(db: DB, payment: Payment, params: Params) {
  const page = pageNumber(params.invoice_page)
  let query = db.from('invoice_receivables').select(invoiceFields).eq('student_id_snapshot', payment.student_id_snapshot).eq('currency', payment.currency).eq('invoice_status', 'ISSUED').gt('outstanding_balance', 0)
  if (uuidPattern.test(params.invoice ?? '')) query = query.eq('invoice_id', params.invoice!)
  const result = await rows(query.order('due_on').order('invoice_id').range((page - 1) * pageSize, page * pageSize).returns<Invoice[]>())
  return { data: result.slice(0, pageSize), page, more: result.length > pageSize }
}

export type OpeningBalance = { id: string; opening_as_of_date: string; currency: string; outstanding_balance: number }
export async function allocationOpenings(db: DB, payment: Payment, params: Params) {
  const page = pageNumber(params.opening_page)
  const result = await rows(db.from('opening_receivable_balances').select('id,opening_as_of_date,currency,outstanding_balance').eq('student_id', payment.student_id_snapshot).eq('branch_id', payment.branch_id_snapshot).eq('currency', payment.currency).eq('reversed', false).gt('outstanding_balance', 0).order('opening_as_of_date').order('id').range((page - 1) * pageSize, page * pageSize).returns<OpeningBalance[]>())
  return { data: result.slice(0, pageSize), page, more: result.length > pageSize }
}
export const effectiveAllocationTotal = (allocations: Allocation[]) => total(allocations.map(a => ({ amount: Number(a.amount) - Number(a.released_to_credit ?? 0) })))

// Candidate receipts, not inferred duplicates: staff chooses an existing receipt explicitly.
export async function invoicePaymentCandidates(db: DB, invoice: Invoice) {
 const payments = await rows(db.from('payments').select(paymentFields).eq('student_id_snapshot', invoice.student_id_snapshot).eq('currency', invoice.currency).eq('status', 'POSTED').order('paid_at', { ascending: false }).order('id').limit(25).returns<Payment[]>())
 const totals = await paymentTotals(db, payments.map(p => p.id), false)
 return payments.map(p => ({ ...p, unallocated: Math.max(0, Number(p.amount) - total(totals.allocations.filter(a => a.payment_id === p.id))) })).filter(p => p.unallocated > 0 && !totals.allocations.some(a => a.payment_id === p.id && a.invoice_id === invoice.invoice_id))
}
