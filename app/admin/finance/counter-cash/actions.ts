'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { signedInClient, uuidPattern, validDate } from '../operations'

const messages: Record<string, string> = {
  CASH_UNAUTHORIZED: 'Bạn chưa có quyền thu tiền mặt cho hồ sơ tại chi nhánh này.',
  CASH_ACK_REQUIRED: 'Chỉ xác nhận sau khi đã nhận đủ số tiền nhập tại quầy.',
  CASH_ONLINE_ORDER_OPEN: 'Hồ sơ còn đơn QR đang mở hoặc khoản chuyển tiền cần đối soát. Chưa ghi thu tiền mặt; hãy đối soát đơn trước.',
  CASH_STALE_BALANCE: 'Số tiền đã thu vừa thay đổi. Tải lại và kiểm tra phiếu thu trước khi thao tác tiếp.',
  CASH_EXCEEDS_BALANCE: 'Số tiền nhập vượt phần học phí còn phải thu.',
  CASH_BELOW_THRESHOLD: 'Khoản thu đầu tiên chưa đủ mức cọc hoặc mức thanh toán đã chốt.',
  CASH_DUE_REQUIRED: 'Chọn hạn thanh toán hết học phí hợp lệ.',
  CASH_INVOICE_REVIEW: 'Hóa đơn hoặc khoản thu cũ cần đối soát. Chưa tạo phiếu thu mới.',
  CASH_REQUEST_CONFLICT: 'Yêu cầu này đã dùng với dữ liệu khác. Kiểm tra phiếu thu trước khi mở lại form.',
  REGISTRATION_REVIEW_REQUIRED: 'Có hồ sơ trùng họ tên và ngày sinh. Cần xác minh danh tính trước khi nhận tiền cho đăng ký mới.',
  REGISTRATION_INCOMPLETE: 'Hoàn thiện thông tin học viên và phụ huynh trước khi thu tiền.',
  CASH_SOURCE_STATE: 'Trạng thái hồ sơ hiện tại chưa cho phép thu tiền mặt.',
}

export async function recordCounterCash(form: FormData) {
  const kind = String(form.get('kind') ?? '')
  const source = String(form.get('source_id') ?? '')
  const request = String(form.get('request_id') ?? '')
  const amount = String(form.get('amount') ?? '')
  const expected = String(form.get('expected_paid') ?? '')
  const due = String(form.get('due_on') ?? '')
  const note = String(form.get('note') ?? '').trim()
  const reminder = String(form.get('reminder_id') ?? '')
  const path = kind === 'REGISTRATION' && uuidPattern.test(source)
    ? `/admin/business/registrations/${source}` : '/admin/tuition/reminders'
  const query = new URLSearchParams()
  if (kind === 'RENEWAL' && uuidPattern.test(reminder)) query.set('renew', reminder)
  if (uuidPattern.test(request)) query.set('cash_request', request)
  const finish = (error: string): never => {
    query.set('cash_error', error)
    redirect(`${path}?${query}`)
  }
  if (!['REGISTRATION', 'RENEWAL'].includes(kind) || !uuidPattern.test(source) || !uuidPattern.test(request)
    || !/^\d+$/.test(amount) || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0
    || !/^\d+(?:\.0+)?$/.test(expected) || !Number.isSafeInteger(Number(expected))
    || (due && !validDate(due)) || note.length > 500) finish('Kiểm tra lại số tiền và thông tin hồ sơ. Chưa ghi thu.')
  if (form.get('cash_acknowledged') !== 'yes') finish(messages.CASH_ACK_REQUIRED)
  const db = await signedInClient()
  const result = await Promise.resolve(db.rpc('record_counter_cash', {
    p_request: request, p_kind: kind, p_source: source, p_amount: Number(amount), p_expected_paid: Number(expected),
    p_cash_acknowledged: true, p_due_on: due || null, p_note: note || null,
  })).catch(() => finish('Mất kết nối khi ghi nhận. Tải lại hồ sơ và kiểm tra phiếu thu trước khi thử lại; không nhận tiền lần nữa.'))
  if (result.error) {
    const code = Object.keys(messages).find(key => result.error.message.includes(key))
    finish(code ? messages[code] : 'Chưa xác nhận được kết quả thu. Tải lại hồ sơ và kiểm tra phiếu thu trước khi thử lại; không thu tiền lần nữa.')
  }
  const payment = result.data?.payment_id
  if (typeof payment !== 'string' || !uuidPattern.test(payment)) finish('Chưa xác nhận được phiếu thu. Kiểm tra hồ sơ trước khi thử lại.')
  for (const route of [path, '/admin/business/registrations', '/admin/students', '/admin/tuition/reminders', '/admin/finance/payments', '/admin/finance/invoices', '/admin/finance/receivables']) revalidatePath(route)
  query.delete('cash_request')
  query.set('cash_receipt', payment)
  redirect(`${path}?${query}`)
}
