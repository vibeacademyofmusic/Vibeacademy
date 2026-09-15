'use server'
import { submitFinancialRequest } from '../../../finance/requests'
export async function applyCredit(form: FormData) { await submitFinancialRequest(form, 'APPLY_CUSTOMER_CREDIT', true) }
export async function refundCredit(form: FormData) { await submitFinancialRequest(form, 'REFUND_CUSTOMER_CREDIT', true) }
