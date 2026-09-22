'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminClient, uuidPattern, validDate } from '../../finance/operations'

const base = '/admin/hr/expenses'
const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/
const safeErrors: Record<string, string> = {
  EXPENSE_ACTIVE_EMPLOYEE_LINK_AND_OWN_PERMISSION_REQUIRED: 'Tài khoản chưa liên kết với quan hệ nhân sự đang hiệu lực hoặc chưa có quyền tự xem lương.',
  EXPENSE_APPROVED_OWN_TRIP_REQUIRED: 'Chuyến công tác không thuộc nhân viên hiện tại hoặc chưa được duyệt.',
  EXPENSE_TRIP_RESERVED_BY_ANOTHER_CLAIM: 'Chuyến công tác đã có bảng kê đang hiệu lực.',
  EXPENSE_CHANGED_RELOAD: 'Bảng kê đã thay đổi. Hãy tải lại trước khi tiếp tục.',
  EXPENSE_V2_ITEMS_LOCKED: 'Các khoản chi đã khóa ở trạng thái hiện tại.',
  EXPENSE_NONEMPTY_POSITIVE_CLAIM_REQUIRED: 'Cần ít nhất một khoản chi hợp lệ trước khi gửi duyệt.',
  EXPENSE_INDEPENDENT_REVIEWER_REQUIRED: 'Người lập hoặc nhân viên của bảng kê không được tự duyệt.',
  EXPENSE_REVIEW_REASON_REQUIRED: 'Cần nhập lý do kiểm tra.',
  EXPENSE_REQUEST_KEY_REUSED: 'Mã yêu cầu đã được dùng cho nội dung khác. Hãy tải lại.',
  EXPENSE_VND_REQUIRES_WHOLE_DONG: 'Khoản chi VND phải là số nguyên đồng.',
  EXPENSE_INVALID_MONEY: 'Số tiền không hợp lệ.',
}

function value(form: FormData, key: string) {
  const raw = form.get(key)
  return typeof raw === 'string' ? raw.trim() : ''
}

function messageFor(error: string) {
  const known = Object.entries(safeErrors).find(([code]) => error.includes(code))
  return known?.[1] ?? 'Không thể lưu vì dữ liệu hoặc quyền đã thay đổi. Hãy tải lại và kiểm tra trạng thái.'
}

export async function expenseAction(form: FormData) {
  const db = await adminClient()
  const action = value(form, 'action')
  const claim = value(form, 'claim')
  const query = new URLSearchParams(uuidPattern.test(claim) ? { claim } : {})
  const fail = (message: string): never => {
    query.set('error', message)
    redirect(`${base}?${query}`)
  }

  const requestKey = value(form, 'key')
  if (!uuidPattern.test(requestKey)) fail('Thiếu mã yêu cầu. Hãy tải lại biểu mẫu.')

  let rpc = ''
  let args: Record<string, unknown> = { p_key: requestKey }

  if (action === 'create_v2') {
    const month = `${value(form, 'month')}-01`
    const currency = value(form, 'currency').toUpperCase()
    const trip = value(form, 'trip')
    if (!uuidPattern.test(trip) || !validDate(month) || !/^[A-Z]{3}$/.test(currency)) {
      fail('Kiểm tra chuyến đã duyệt, tháng đề nghị và tiền tệ.')
    }
    rpc = 'create_employee_expense_claim_v2'
    args = { ...args, p_trip: trip, p_month: month, p_currency: currency }
  } else {
    const version = value(form, 'version')
    if (!uuidPattern.test(claim) || !/^\d+$/.test(version) || Number(version) < 1) {
      fail('Phiên bản bảng kê không hợp lệ.')
    }
    args = { ...args, p_claim: claim, p_version: Number(version) }

    if (action === 'save_item_v2') {
      const item = value(form, 'item')
      const expenseDate = value(form, 'expense_date')
      const categoryName = value(form, 'category_name')
      const note = value(form, 'note')
      const amount = value(form, 'amount')
      if (!uuidPattern.test(item) || !validDate(expenseDate) || categoryName.length < 1 || categoryName.length > 100 || note.length < 1 || note.length > 2000 || !moneyPattern.test(amount) || Number(amount) <= 0) {
        fail('Kiểm tra ngày, hạng mục, nội dung chi và số tiền.')
      }
      rpc = 'save_employee_expense_claim_item_v2'
      args = { ...args, p_item: item, p_expense_date: expenseDate, p_category_name: categoryName, p_note: note, p_amount: amount }
    } else if (action === 'remove_item_v2') {
      const item = value(form, 'item')
      if (!uuidPattern.test(item)) fail('Khoản chi không hợp lệ.')
      rpc = 'remove_employee_expense_claim_item_v2'
      args = { ...args, p_item: item }
    } else if (action === 'submit_v2') {
      rpc = 'submit_employee_expense_claim_v2'
    } else if (action === 'review_v2') {
      const decision = value(form, 'decision')
      const reason = value(form, 'reason')
      if (!['APPROVED', 'RETURNED', 'REJECTED'].includes(decision) || reason.length < 1 || reason.length > 2000) {
        fail('Cần quyết định và lý do kiểm tra hợp lệ.')
      }
      rpc = 'review_employee_expense_claim_v2'
      args = { ...args, p_decision: decision, p_reason: reason }
    } else {
      fail('Thao tác không hợp lệ.')
    }
  }

  if (!rpc) fail('Thao tác không hợp lệ.')
  let result: { data: unknown; error: { message: string } | null } = { data: null, error: { message: 'EXPENSE_UNKNOWN_RESULT' } }
  try {
    result = await db.rpc(rpc, args)
  } catch {
    fail('Không xác nhận được trạng thái ghi dữ liệu. Hãy tải lại bảng kê để đối soát trước khi thử lại.')
  }
  if (result.error) fail(messageFor(result.error.message))

  const response = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null
  if (typeof response?.claim_id === 'string' && uuidPattern.test(response.claim_id)) query.set('claim', response.claim_id)
  revalidatePath(base)
  revalidatePath('/admin/hr')
  revalidatePath('/admin/payroll')
  query.set('success', 'Đã lưu với kiểm tra phiên bản và lịch sử. Thao tác này không xác nhận chi trả.')
  redirect(`${base}?${query}`)
}
