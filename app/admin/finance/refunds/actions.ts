'use server'
import { submitFinancialRequest } from '../../../finance/requests'
export async function createRefund(form: FormData) { await submitFinancialRequest(form, 'REFUND', true) }
export async function allocateRefund(form: FormData) { await submitFinancialRequest(form, 'ALLOCATE_REFUND', true) }
export async function voidRefund(form: FormData) { await submitFinancialRequest(form, 'VOID_REFUND', true) }
