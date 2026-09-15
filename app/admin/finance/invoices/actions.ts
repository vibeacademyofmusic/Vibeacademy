'use server'
import { mutate } from '../operations'
export async function createInvoice(form: FormData) { await mutate('invoices', 'create_tuition_invoice', form, { enrollment_tuition_id: 'id', notes: 'optional' }, { selectResult: true }) }
export async function issueInvoice(form: FormData) { await mutate('invoices', 'issue_invoice', form, { invoice_id: 'id', issued_on: 'date', due_on: 'date' }, { confirm: true, issue: true }) }
export async function cancelInvoice(form: FormData) { await mutate('invoices', 'cancel_invoice', form, { invoice_id: 'id', reason: 'required' }, { confirm: true }) }
