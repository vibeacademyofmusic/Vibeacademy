import { all, rows, type DB } from '../query'
import { pageNumber, pageSize, uuidPattern, type Params } from '../operations'
export type Refund = { id: string; refund_number: string; payment_id: string; student_id_snapshot: string; branch_name_snapshot: string; currency: string; amount: number; refunded_at: string; reason: string; status: string; payments: { payment_number: string } }
export type RefundAllocation = { id: string; refund_id: string; payment_allocation_id: string; amount: number }
const fields = 'id,refund_number,payment_id,student_id_snapshot,branch_name_snapshot,currency,amount,refunded_at,reason,status,payments(payment_number)'
export async function refundList(db: DB, params: Params) {
  const page = pageNumber(params.page)
  let query = db.from('refunds').select(fields)
  if (['POSTED', 'VOIDED'].includes(params.status ?? '')) query = query.eq('status', params.status!)
  if (uuidPattern.test(params.branch ?? '')) query = query.eq('branch_id_snapshot', params.branch!)
  if (/^[A-Z]{3}$/.test(params.currency ?? '')) query = query.eq('currency', params.currency!)
  const result = await rows(query.order('refunded_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<Refund[]>())
  const data = result.slice(0, pageSize)
  return { data, page, more: result.length > pageSize }
}
export async function selectedRefund(db: DB, id?: string) {
  if (!uuidPattern.test(id ?? '')) return null
  return (await rows(db.from('refunds').select(fields).eq('id', id!).returns<Refund[]>()))[0] ?? null
}
export async function refundAllocations(db: DB, paymentId: string) {
  return all<RefundAllocation>((a, b) => db.from('refund_allocations').select('id,refund_id,payment_allocation_id,amount,refunds!inner(payment_id,status)').eq('refunds.payment_id', paymentId).eq('refunds.status', 'POSTED').order('id').range(a, b).returns<RefundAllocation[]>())
}
