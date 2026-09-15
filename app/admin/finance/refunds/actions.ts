'use server'
import { mutate } from '../operations'
export async function createRefund(form: FormData) { await mutate('refunds', 'create_refund', form, { payment_id: 'id', amount: 'amount', refunded_at: 'datetime', reason: 'required', notes: 'optional' }, { confirm: true, selectResult: true }) }
export async function allocateRefund(form: FormData) { await mutate('refunds', 'allocate_refund_to_payment_allocation', form, { refund_id: 'id', payment_allocation_id: 'id', amount: 'amount' }) }
export async function voidRefund(form: FormData) { await mutate('refunds', 'void_refund', form, { refund_id: 'id', reason: 'required' }, { confirm: true }) }
