'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern, validDate } from '../../finance/operations'

const base = '/admin/hr/payslips'
const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/
const safeErrors: Record<string, string> = {
  PAYROLL_DISBURSEMENT_UNAUTHORIZED: 'Bạn không có quyền ghi nhận chi trả cho chi nhánh này.',
  PAYROLL_DISBURSEMENT_FINALIZED_REQUIRED: 'Chỉ kỳ lương đã chốt mới được ghi nhận chi trả.',
  PAYROLL_DISBURSEMENT_INVALID_AMOUNT: 'Số tiền chi không hợp lệ.',
  PAYROLL_DISBURSEMENT_VND_WHOLE_REQUIRED: 'Khoản chi VND phải là số nguyên đồng.',
  PAYROLL_DISBURSEMENT_CURRENCY_MISMATCH: 'Loại tiền phải trùng với phiếu lương.',
  PAYROLL_DISBURSEMENT_INVALID_DATE: 'Ngày chi không hợp lệ hoặc nằm trong tương lai.',
  PAYROLL_DISBURSEMENT_EXCEEDS_REMAINING: 'Số tiền vượt quá phần còn phải chi.',
  PAYROLL_DISBURSEMENT_REQUEST_KEY_REUSED: 'Mã yêu cầu đã được dùng cho nội dung khác. Hãy tải lại trang.',
  PAYROLL_DISBURSEMENT_ALREADY_CANCELLED: 'Ghi nhận này đã được hủy trước đó.',
  PAYROLL_DISBURSEMENT_CANCEL_REASON_REQUIRED: 'Cần nhập lý do hủy ghi nhận.',
}

function value(form: FormData, key: string) {
  const raw = form.get(key)
  return typeof raw === 'string' ? raw.trim() : ''
}

function fail(payroll: string, message: string): never {
  const query = new URLSearchParams(uuidPattern.test(payroll) ? { payroll } : {})
  query.set('error', message)
  redirect(`${base}?${query}`)
}

export async function payslipDisbursementAction(form: FormData) {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')

  const action = value(form, 'action')
  const payroll = value(form, 'payroll')
  const key = value(form, 'key') || randomUUID()
  if (!uuidPattern.test(payroll) || !uuidPattern.test(key)) fail(payroll, 'Biểu mẫu không hợp lệ. Hãy tải lại trang.')

  let rpc: 'record_payroll_disbursement' | 'cancel_payroll_disbursement'
  let args: Record<string, string | null>

  if (action === 'record') {
    const amount = value(form, 'amount')
    const currency = value(form, 'currency').toUpperCase()
    const paidOn = value(form, 'paid_on')
    const method = value(form, 'payment_method')
    const reference = value(form, 'reference')
    const note = value(form, 'note')
    if (!moneyPattern.test(amount) || Number(amount) <= 0 || !/^[A-Z]{3}$/.test(currency) || !validDate(paidOn)
      || !['BANK_TRANSFER', 'CASH', 'OTHER'].includes(method) || reference.length > 200 || note.length > 2000
      || (currency === 'VND' && !/^\d{1,12}$/.test(amount))) {
      fail(payroll, 'Kiểm tra ngày chi, số tiền, phương thức và nội dung nhập.')
    }
    rpc = 'record_payroll_disbursement'
    args = { p_payroll: payroll, p_amount: amount, p_currency: currency, p_paid_on: paidOn,
      p_payment_method: method, p_reference: reference || null, p_note: note || null, p_key: key }
  } else if (action === 'cancel') {
    const payment = value(form, 'payment')
    const reason = value(form, 'reason')
    if (!uuidPattern.test(payment) || reason.length < 1 || reason.length > 2000) fail(payroll, 'Cần chọn đúng ghi nhận và nhập lý do hủy.')
    rpc = 'cancel_payroll_disbursement'
    args = { p_payment: payment, p_reason: reason, p_key: key }
  } else {
    fail(payroll, 'Thao tác không hợp lệ.')
  }

  let result: { data: unknown; error: { message: string } | null }
  try {
    result = await db.rpc(rpc, args)
  } catch {
    fail(payroll, 'Chưa xác nhận được kết quả ghi nhận. Hãy tải lại và đối chiếu trước khi thử lại.')
  }
  if (result.error) {
    const known = Object.entries(safeErrors).find(([code]) => result.error?.message.includes(code))
    fail(payroll, known?.[1] ?? 'Không thể thực hiện. Dữ liệu, trạng thái hoặc quyền có thể đã thay đổi.')
  }

  revalidatePath(base)
  const query = new URLSearchParams({ payroll, success: action === 'record' ? 'Đã ghi nhận chi trả vào sổ lương.' : 'Đã hủy ghi nhận; lịch sử vẫn được giữ nguyên.' })
  redirect(`${base}?${query}`)
}
