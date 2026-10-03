import { rows, type DB } from '../query'
import { pageNumber, uuidPattern, type Params } from '../operations'
export type Credit = { id: string; student_id: string; branch_id: string; payment_id: string | null; opening_receivable_id: string; correction_id: string; currency: string; amount: number; applied_amount: number; refunded_amount: number; remaining_credit: number; legacy_settlement_credit: boolean; payment_status: string | null; voided_amount: number; created_at: string }
const fields = 'id,student_id,branch_id,payment_id,opening_receivable_id,correction_id,currency,amount,applied_amount,refunded_amount,remaining_credit,legacy_settlement_credit,payment_status,voided_amount,created_at'
export async function creditData(db: DB, params: Params) {
  const page = pageNumber(params.page)
  const [list, selected] = await Promise.all([
    rows(db.from('customer_credit_balances').select(fields).order('created_at', { ascending: false }).order('id').range((page - 1) * 25, page * 25).returns<Credit[]>()),
    uuidPattern.test(params.selected ?? '') ? rows(db.from('customer_credit_balances').select(fields).eq('id', params.selected!).returns<Credit[]>()) : Promise.resolve([] as Credit[]),
  ])
  const credit = selected[0]
  const [invoices, openings, uses] = credit ? await Promise.all([
    rows(db.from('invoice_receivables').select('invoice_id,invoice_number,outstanding_balance,currency').eq('student_id_snapshot', credit.student_id).eq('branch_id_snapshot', credit.branch_id).eq('currency', credit.currency).eq('invoice_status', 'ISSUED').gt('outstanding_balance', 0).order('due_on').order('invoice_id').limit(50)),
    rows(db.from('opening_receivable_balances').select('id,opening_as_of_date,outstanding_balance,currency').eq('student_id', credit.student_id).eq('branch_id', credit.branch_id).eq('currency', credit.currency).eq('reversed', false).gt('outstanding_balance', 0).order('opening_as_of_date').order('id').limit(50)),
    rows(db.from('customer_credit_uses').select('id,kind,amount,refund_id,payment_allocation_id,created_at').eq('credit_id', credit.id).order('created_at', { ascending: false }).order('id').limit(50)),
  ]) : [[], [], []]
  return { data: list.slice(0, 25), more: list.length > 25, page, credit, invoices, openings, uses }
}
