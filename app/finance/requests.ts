import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, readInput, uuidPattern } from '../admin/finance/operations'
import { financeContext } from './authorization'

export const operationNames: Record<string, string> = {
  APPLY_CUSTOMER_CREDIT: 'Sử dụng số dư khách hàng', REFUND_CUSTOMER_CREDIT: 'Hoàn số dư khách hàng',
  CANCEL_INVOICE: 'Hủy hóa đơn đã phát hành', REFUND: 'Hoàn tiền', VOID_PAYMENT: 'Hủy thanh toán', VOID_REFUND: 'Vô hiệu hoàn tiền',
  OPENING_RECEIVABLE_CORRECTION: 'Điều chỉnh công nợ mở sổ',
  ALLOCATE_REFUND: 'Phân bổ hoàn tiền', PAYROLL_CORRECTION: 'Sửa sai lương đã chốt',
}
export const approvalErrors: Record<string, string> = {
  'Maker cannot approve own financial request': 'Người lập không được tự duyệt yêu cầu.',
  'Source changed; cancel and create a new request': 'Dữ liệu nguồn đã thay đổi. Hãy hủy yêu cầu cũ và lập lại để kiểm tra số liệu mới.',
  'Reverse posted refunds before voiding payment': 'Cần vô hiệu các phiếu hoàn đã ghi nhận trước khi hủy thanh toán gốc.',
  'Create next open payroll period first': 'Chưa có kỳ lương mở tiếp theo. Hãy tạo kỳ lương trước.',
  'Generate next open period before posting correction': 'Hãy tính kỳ lương mở tiếp theo trước khi gửi correction.',
  'Correction has no remaining delta': 'Không còn chênh lệch cần điều chỉnh.',
  'Refund exceeds the remaining refundable payment amount': 'Số tiền hoàn vượt phần có thể hoàn còn lại.',
  'Valid SUPER_ADMIN emergency override reason and type required': 'Ngoại lệ khẩn cấp cần SUPER_ADMIN, đúng loại và lý do rõ ràng.',
  'Correct the original source line, not a posted correction line': 'Khoản này đã là correction. Hãy chọn dòng gốc của kỳ ban đầu để tránh tính trùng.',
  'Original earning or adjustment line required': 'Hãy chọn dòng thu nhập hoặc khoản điều chỉnh gốc.',
  'Idempotency key already used for different request': 'Biểu mẫu này đã được gửi với nội dung khác. Hãy tải lại để lập yêu cầu mới.',
}
export function financialRequestInput(form: FormData, operation: string) {
  if (!Object.hasOwn(operationNames, operation) || form.get('confirm') !== 'yes') throw new Error('INPUT')
  const common = readInput(form, { reason: 'required', idempotency_key: 'id' })
  const targetField = ['APPLY_CUSTOMER_CREDIT', 'REFUND_CUSTOMER_CREDIT'].includes(operation) ? 'credit_id' : operation === 'OPENING_RECEIVABLE_CORRECTION' ? 'opening_receivable_id' : operation === 'CANCEL_INVOICE' ? 'invoice_id' : operation === 'PAYROLL_CORRECTION' ? 'payroll_id' : ['VOID_REFUND', 'ALLOCATE_REFUND'].includes(operation) ? 'refund_id' : 'payment_id'
  const target = readInput(form, { [targetField]: 'id' })['p_' + targetField]
  let details: Record<string, string | null> = {}
  if (operation === 'APPLY_CUSTOMER_CREDIT') {
    const { p_amount } = readInput(form, { amount: 'amount' })
    const [kind, id, extra] = String(form.get('obligation') ?? '').split(':')
    if (!['invoice', 'opening'].includes(kind) || !uuidPattern.test(id ?? '') || extra !== undefined) throw new Error('INPUT')
    details = { amount: p_amount, [kind === 'invoice' ? 'invoice_id' : 'opening_receivable_id']: id }
  } else if (operation === 'REFUND_CUSTOMER_CREDIT') {
    const { p_amount, p_refunded_at } = readInput(form, { amount: 'amount', refunded_at: 'datetime' })
    details = { amount: p_amount, refunded_at: p_refunded_at }
  } else if (operation === 'REFUND') {
    const fields = readInput(form, { amount: 'amount', refunded_at: 'datetime', notes: 'optional' })
    details = { amount: fields.p_amount, refunded_at: fields.p_refunded_at, notes: fields.p_notes }
  } else if (operation === 'ALLOCATE_REFUND') {
    const fields = readInput(form, { amount: 'amount', payment_allocation_id: 'id' })
    details = { amount: fields.p_amount, payment_allocation_id: fields.p_payment_allocation_id }
  } else if (operation === 'OPENING_RECEIVABLE_CORRECTION') {
    const amount = String(form.get('corrected_amount') ?? '').trim()
    if (!/^\d{1,12}(\.\d{1,2})?$/.test(amount)) throw new Error('INPUT')
    details = { corrected_amount: amount }
  } else if (operation === 'PAYROLL_CORRECTION') {
    const amount = String(form.get('corrected_amount') ?? '').trim()
    const line = String(form.get('source_line') ?? '')
    const [lineType, lineId] = line.split(':')
    const runType = String(form.get('run_type') ?? '')
    if (!/^-?\d{1,12}(\.\d{1,2})?$/.test(amount) || !['NEXT_OPEN_PERIOD', 'OFF_CYCLE_CORRECTION'].includes(runType)) throw new Error('INPUT')
    if (line && (!['earning', 'adjustment'].includes(lineType) || !uuidPattern.test(lineId))) throw new Error('INPUT')
    details = { corrected_amount: amount, run_type: runType }
    if (line) details[lineType === 'earning' ? 'earning_id' : 'adjustment_id'] = lineId
  }
  return { p_operation: operation, p_target_id: target, p_details: details, p_reason: common.p_reason, p_idempotency_key: common.p_idempotency_key }
}
export function refreshFinance() {
  for (const path of ['/finance', '/admin/finance', '/admin/payroll', '/admin/migration']) revalidatePath(path, 'layout')
}
export async function submitFinancialRequest(form: FormData, operation: string, fromAdmin = false) {
  const db = fromAdmin ? await adminClient() : (await financeContext()).db
  let args
  try { args = financialRequestInput(form, operation) } catch { redirect('/finance?error=' + encodeURIComponent('Vui lòng kiểm tra dữ liệu và xác nhận yêu cầu.')) }
  let result
  try { result = await db.rpc('request_financial_action', args) } catch { redirect('/finance?error=' + encodeURIComponent('Chưa xác nhận được kết quả. Hãy kiểm tra danh sách trước khi gửi lại.')) }
  if (result.error) redirect('/finance?error=' + encodeURIComponent(approvalErrors[result.error.message] || 'Không thể tạo yêu cầu. Hãy kiểm tra quyền, dữ liệu và trạng thái nguồn.'))
  refreshFinance()
  redirect('/finance?' + new URLSearchParams({ selected: String(result.data), success: 'Đã gửi yêu cầu chờ người có quyền khác phê duyệt; chưa ghi nhận giao dịch.' }))
}
