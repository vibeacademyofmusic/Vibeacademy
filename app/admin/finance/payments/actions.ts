'use server'
import { submitFinancialRequest } from '../../../finance/requests'
import { mutate } from '../operations'
export async function createPayment(form: FormData) { await mutate('payments', 'create_payment', form, { student_id: 'id', branch_id: 'id', amount: 'amount', currency: 'currency', payment_method: 'method', paid_at: 'datetime', reference: 'optional', notes: 'optional' }, { selectResult: true }) }
export async function allocatePayment(form: FormData) { await mutate('payments', 'allocate_payment_to_invoice', form, { payment_id: 'id', invoice_id: 'id', amount: 'amount' }) }
export async function voidPayment(form: FormData) { await submitFinancialRequest(form, 'VOID_PAYMENT', true) }

export async function allocateOpeningPayment(form: FormData) { await mutate('payments', 'allocate_payment_to_opening', form, { payment_id: 'id', opening_receivable_id: 'id', amount: 'amount' }) }
