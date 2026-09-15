import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export const invoiceStatuses = ['DRAFT', 'ISSUED', 'CANCELLED']
export const debtStatuses = ['OVERDUE', 'UNPAID', 'PARTIALLY_PAID', 'PAID']
export const paymentMethods = ['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const pageSize = 25
export type Params = Record<string, string | undefined>
export function pageNumber(value?: string) {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 && n <= 1000000 ? n : 1
}
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function vietnamDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  return parts.replace(' ', 'T')
}
export async function adminClient() {
  const db = await createClient()
  const { data, error } = await db.auth.getClaims()
  if (error || !data?.claims) redirect('/login')
  const role = await db.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  if (role.error || role.data !== true) redirect('/login?error=' + encodeURIComponent('Bạn không có quyền truy cập'))
  return db
}
export type Rule = 'id' | 'amount' | 'date' | 'datetime' | 'currency' | 'method' | 'required' | 'optional'
export function readInput(form: FormData, fields: Record<string, Rule>) {
  const result: Record<string, string | null> = {}
  for (const [field, rule] of Object.entries(fields)) {
    const raw = form.get(field)
    let value = typeof raw === 'string' ? raw.trim() : ''
    if (rule === 'currency' || rule === 'method') value = value.toUpperCase()
    const valid = rule === 'optional' ? value.length <= 2000
      : rule === 'id' ? uuidPattern.test(value)
      : rule === 'amount' ? /^\d{1,12}(\.\d{1,2})?$/.test(value) && Number(value) > 0
      : rule === 'date' ? validDate(value)
      : rule === 'datetime' ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && validDate(value.slice(0, 10)) && Number(value.slice(11, 13)) < 24 && Number(value.slice(14)) < 60
      : rule === 'currency' ? /^[A-Z]{3}$/.test(value)
      : rule === 'method' ? paymentMethods.includes(value)
      : value.length > 0 && value.length <= 2000
    if (!valid) throw new Error('INPUT')
    result['p_' + field] = rule === 'datetime' ? value + ':00+07:00' : value || null
  }
  return result
}
const safeErrors: Record<string, string> = {
  'An invoice already exists for this tuition term': 'Kỳ học phí này đã có hóa đơn.',
  'Allocation exceeds the remaining payment amount': 'Số tiền phân bổ vượt phần thanh toán còn lại.',
  'Allocation exceeds the remaining invoice balance': 'Số tiền phân bổ vượt giới hạn hóa đơn theo quy tắc hiện tại.',
  'This payment is already allocated to this invoice': 'Thanh toán này đã được phân bổ vào hóa đơn đã chọn.',
  'Payment and invoice must belong to the same student': 'Thanh toán và hóa đơn phải cùng học viên.',
  'Payment and invoice currencies must match': 'Thanh toán và hóa đơn phải cùng loại tiền.',
  'Refund exceeds the remaining refundable payment amount': 'Số tiền hoàn vượt phần có thể hoàn còn lại.',
  'Refund exceeds the original payment allocation amount': 'Số tiền hoàn vượt phân bổ gốc còn lại.',
  'Refund allocation exceeds the refund amount': 'Số tiền phân bổ vượt phiếu hoàn tiền.',
}
export async function mutate(module: 'invoices' | 'payments' | 'refunds', rpc: string, form: FormData, fields: Record<string, Rule>, options: { confirm?: boolean; issue?: boolean; selectResult?: boolean } = {}) {
  const db = await adminClient()
  const selected = String(form.get('selected') ?? '')
  const query = new URLSearchParams(uuidPattern.test(selected) ? { selected } : {})
  const payment = String(form.get('payment_id') ?? '')
  if (module === 'refunds' && uuidPattern.test(payment)) query.set('payment', payment)
  let args: Record<string, string | null>
  try {
    args = readInput(form, fields)
    if (options.confirm && form.get('confirm') !== 'yes') throw new Error('INPUT')
    if (options.issue && args.p_due_on! < args.p_issued_on!) throw new Error('INPUT')
  } catch {
    query.set('error', 'Vui lòng kiểm tra dữ liệu, ngày tháng và xác nhận thao tác.')
    redirect(`/admin/finance/${module}?${query}`)
  }
  let result
  try { result = await db.rpc(rpc, args) } catch {
    query.set('error', 'Không xác nhận được kết quả. Hãy tải lại danh sách trước khi thử lại để tránh tạo trùng.')
    redirect(`/admin/finance/${module}?${query}`)
  }
  if (result.error) {
    query.set('error', safeErrors[result.error.message] ?? 'Không thể thực hiện thao tác. Dữ liệu có thể đã thay đổi hoặc không thỏa điều kiện. Hãy tải lại và kiểm tra trạng thái.')
    redirect(`/admin/finance/${module}?${query}`)
  }
  for (const route of ['', '/invoices', '/payments', '/receivables', '/refunds']) revalidatePath('/admin/finance' + route)
  if (options.selectResult && typeof result.data === 'string' && uuidPattern.test(result.data)) query.set('selected', result.data)
  query.set('success', 'Thao tác thành công.')
  redirect(`/admin/finance/${module}?${query}`)
}
