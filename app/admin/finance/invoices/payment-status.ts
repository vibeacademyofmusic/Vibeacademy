import type { Invoice } from '../query'
// Classify canonical ledger values, without recalculating allocations/refunds.
export function paymentStatus(invoice: Pick<Invoice, 'allocated_amount' | 'outstanding_balance' | 'invoice_status'>) {
  if (invoice.invoice_status !== 'ISSUED') return '—'
  if (Number(invoice.outstanding_balance) <= 0) return 'PAID'
  return Number(invoice.allocated_amount) > 0 ? 'PARTIALLY_PAID' : 'UNPAID'
}
