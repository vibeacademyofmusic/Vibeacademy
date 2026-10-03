'use server'
import { redirect } from 'next/navigation'
import { financeContext } from './authorization'
import { approvalErrors, refreshFinance, submitFinancialRequest } from './requests'
import { uuidPattern } from '../admin/finance/operations'

export async function requestAction(form: FormData) {
  await submitFinancialRequest(form, String(form.get('operation') ?? ''))
}
export async function reviewAction(form: FormData) {
  const { db } = await financeContext()
  const id = String(form.get('request_id') ?? '')
  const action = String(form.get('action') ?? '')
  const note = String(form.get('note') ?? '').trim()
  const overrideType = String(form.get('override_type') ?? '')
  const overrideReason = String(form.get('override_reason') ?? '').trim()
  let error = ''
  if (!uuidPattern.test(id) || !['approve', 'cancel'].includes(action) || !note || note.length > 2000 || form.get('confirm') !== 'yes') error = 'Vui lòng nhập lý do và xác nhận.'
  if ((overrideType || overrideReason) && (action !== 'approve' || overrideType !== 'MAKER_CHECKER_EMERGENCY' || !overrideReason || overrideReason.length > 2000)) error = 'Ngoại lệ khẩn cấp cần đúng loại và lý do.'
  if (!error) {
    try {
      const result = action === 'approve'
        ? await db.rpc('approve_financial_action', { p_request_id: id, p_note: note, p_override_type: overrideType || null, p_override_reason: overrideReason || null })
        : await db.rpc('cancel_financial_action', { p_request_id: id, p_reason: note })
      if (result.error) error = approvalErrors[result.error.message] || 'Không thể thực hiện. Hãy kiểm tra quyền và trạng thái yêu cầu.'
    } catch { error = 'Chưa xác nhận được kết quả. Hãy tải lại trước khi thử lại.' }
  }
  refreshFinance()
  redirect('/finance?' + new URLSearchParams({ ...(uuidPattern.test(id) ? { selected: id } : {}), ...(error ? { error } : { success: 'Đã xử lý yêu cầu.' }) }))
}
