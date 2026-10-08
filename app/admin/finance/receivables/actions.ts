'use server'
import { submitFinancialRequest } from '../../../finance/requests'
export async function correctOpening(form: FormData) { await submitFinancialRequest(form, 'OPENING_RECEIVABLE_CORRECTION', true) }
