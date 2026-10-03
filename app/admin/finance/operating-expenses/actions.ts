'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { adminClient, uuidPattern, validDate } from '../operations'

const base = '/admin/finance/operating-expenses'
const moneyPattern = /^\d{1,12}(\.\d{1,2})?$/
const categories = ['RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'FIXED_PHONE', 'SECURITY', 'CLEANING', 'SOFTWARE', 'MAINTENANCE', 'OTHER']
const safeErrors: Record<string, string> = {
  OPERATING_EXPENSE_UNAUTHORIZED: 'Tài khoản không có quyền chi phí cố định trên chi nhánh đã chọn.',
  OPERATING_EXPENSE_BRANCH_REQUIRED: 'Chi nhánh không hợp lệ hoặc không còn hoạt động.',
  OPERATING_EXPENSE_INVALID_CATEGORY: 'Danh mục không thuộc danh mục hệ thống.',
  OPERATING_EXPENSE_CUSTOM_CATEGORY_REQUIRED: 'Danh mục Khác cần tên danh mục riêng.',
  OPERATING_EXPENSE_CUSTOM_CATEGORY_NOT_ALLOWED: 'Chỉ danh mục Khác được nhập tên riêng.',
  OPERATING_EXPENSE_FIXED_AMOUNT_REQUIRED: 'Khoản số tiền cố định cần mức dự kiến lớn hơn 0.',
  OPERATING_EXPENSE_VND_REQUIRES_WHOLE_DONG: 'Số tiền VND phải là số nguyên đồng.',
  OPERATING_EXPENSE_INVALID_AMOUNT: 'Số tiền không hợp lệ.',
  OPERATING_EXPENSE_CHANGED_RELOAD: 'Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục.',
  OPERATING_EXPENSE_REQUEST_KEY_REUSED: 'Mã yêu cầu đã được dùng cho nội dung khác. Hãy tải lại.',
  OPERATING_EXPENSE_DRAFT_REQUIRED: 'Chỉ bản nháp mới ghi nhận hoặc sửa được.',
  OPERATING_EXPENSE_RECORDED_IMMUTABLE: 'Chi phí đã ghi nhận không thể sửa số tiền.',
  OPERATING_EXPENSE_TEMPLATE_RETIRED: 'Mẫu định kỳ đã ngừng hiệu lực.',
}

function value(form: FormData, key: string) {
  const raw = form.get(key)
  return typeof raw === 'string' ? raw.trim() : ''
}

function optional(form: FormData, key: string) {
  return value(form, key) || null
}

function messageFor(error: string) {
  const known = Object.entries(safeErrors).find(([code]) => error.includes(code))
  return known?.[1] ?? 'Không thể lưu vì dữ liệu hoặc quyền đã thay đổi. Hãy tải lại và kiểm tra trạng thái.'
}

export async function operatingExpenseAction(form: FormData) {
  const db = await adminClient()
  const action = value(form, 'action')
  const selected = value(form, 'selected')
  const query = new URLSearchParams(uuidPattern.test(selected) ? { selected } : {})
  const fail = (message: string): never => {
    query.set('error', message)
    redirect(`${base}?${query}`)
  }
  const requestKey = value(form, 'key')
  if (!uuidPattern.test(requestKey)) fail('Thiếu mã yêu cầu. Hãy tải lại biểu mẫu.')

  let rpc = ''
  let args: Record<string, unknown> = { p_key: requestKey }

  if (action === 'create_template') {
    const branch = value(form, 'branch')
    const category = value(form, 'category')
    const name = value(form, 'name')
    const amountMode = value(form, 'amount_mode')
    const expected = optional(form, 'expected_amount')
    const currency = value(form, 'currency').toUpperCase() || 'VND'
    const effectiveFrom = value(form, 'effective_from')
    const effectiveTo = optional(form, 'effective_to')
    if (!uuidPattern.test(branch) || !categories.includes(category) || name.length < 1 || name.length > 200 || !['FIXED', 'VARIABLE'].includes(amountMode) || !/^[A-Z]{3}$/.test(currency) || !validDate(effectiveFrom) || (effectiveTo && !validDate(effectiveTo))) {
      fail('Kiểm tra chi nhánh, danh mục, tên khoản chi, cách tính tiền và hiệu lực.')
    }
    if (amountMode === 'FIXED' && (!expected || !moneyPattern.test(expected) || Number(expected) <= 0)) {
      fail('Khoản số tiền cố định cần mức dự kiến lớn hơn 0.')
    }
    if (expected && (!moneyPattern.test(expected) || Number(expected) <= 0)) fail('Số tiền dự kiến không hợp lệ.')
    rpc = 'create_operating_expense_template'
    args = {
      ...args,
      p_branch: branch,
      p_category: category,
      p_custom_category_name: optional(form, 'custom_category_name'),
      p_name: name,
      p_vendor: optional(form, 'vendor'),
      p_amount_mode: amountMode,
      p_expected_amount: expected,
      p_currency: currency,
      p_effective_from: effectiveFrom,
      p_effective_to: effectiveTo,
    }
  } else if (action === 'prepare_month') {
    const month = `${value(form, 'month')}-01`
    const branch = value(form, 'branch')
    if (!/^\d{4}-\d{2}-01$/.test(month) || !validDate(month) || !uuidPattern.test(branch)) fail('Kiểm tra tháng và chi nhánh khi lập bản nháp.')
    rpc = 'prepare_operating_expense_month'
    args = { ...args, p_month: month, p_branch: branch }
  } else {
    const record = value(form, 'record')
    const version = value(form, 'version')
    if (!uuidPattern.test(record) || !/^\d+$/.test(version) || Number(version) < 1) fail('Phiên bản khoản chi không hợp lệ.')
    args = { ...args, p_record: record, p_version: Number(version) }
    if (action === 'record') {
      const expenseDate = value(form, 'expense_date')
      const dueDate = optional(form, 'due_date')
      const actual = value(form, 'actual_amount')
      const note = optional(form, 'note')
      if (!validDate(expenseDate) || (dueDate && !validDate(dueDate)) || !moneyPattern.test(actual) || Number(actual) <= 0 || (note && note.length > 2000)) {
        fail('Kiểm tra ngày phát sinh, số tiền thực tế và nội dung.')
      }
      rpc = 'record_operating_expense'
      args = {
        ...args,
        p_expense_date: expenseDate,
        p_due_date: dueDate,
        p_actual_amount: actual,
        p_vendor: optional(form, 'vendor'),
        p_reference: optional(form, 'reference'),
        p_note: note,
      }
    } else if (action === 'cancel') {
      const reason = value(form, 'reason')
      if (reason.length < 1 || reason.length > 2000) fail('Cần lý do hủy.')
      rpc = 'cancel_operating_expense'
      args = { ...args, p_reason: reason }
    } else {
      fail('Thao tác không hợp lệ.')
    }
  }

  let result: { data: unknown; error: { message: string } | null } = { data: null, error: { message: 'OPERATING_EXPENSE_UNKNOWN_RESULT' } }
  try {
    result = await db.rpc(rpc, args)
  } catch {
    fail('Không xác nhận được trạng thái ghi dữ liệu. Hãy tải lại danh sách để đối soát trước khi thử lại.')
  }
  if (result.error) fail(messageFor(result.error.message))
  const response = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : null
  if (typeof response?.record_id === 'string' && uuidPattern.test(response.record_id)) query.set('selected', response.record_id)
  revalidatePath(base)
  revalidatePath('/admin/finance')
  query.set('success', 'Đã lưu. Thao tác này chỉ ghi nhận chi phí, không xác nhận đã chi trả.')
  redirect(`${base}?${query}`)
}
