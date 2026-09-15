'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '../finance/operations'
export type Quote = { starts_on: string; base_ends_on: string; list_price: number; discount_amount: number; amount: number; currency: string; branch_name: string; plan_name: string }
export type FormState = { error?: string; quote?: Quote }
function input(form: FormData, edit: boolean) {
  const get = (key: string) => String(form.get(key) ?? '').trim()
  const type = get('discount_type'), value = get('discount_value') || '0', name = get('discount_name')
  if (!['NONE', 'PERCENT', 'FIXED'].includes(type) || !/^\d{1,12}(\.\d{1,2})?$/.test(value) || (type === 'PERCENT' && Number(value) > 100) || (type !== 'NONE' && !name) || name.length > 300) throw new Error('INPUT')
  const args: Record<string, string | null> = { p_discount_type: type, p_discount_value: type === 'NONE' ? '0' : value, p_discount_name: type === 'NONE' ? null : name }
  if (edit) {
    if (!uuidPattern.test(get('tuition_id'))) throw new Error('INPUT')
    args.p_tuition_id = get('tuition_id')
  } else {
    if (!uuidPattern.test(get('enrollment_id')) || !uuidPattern.test(get('tuition_plan_id')) || (get('starts_on') && !validDate(get('starts_on'))) || get('notes').length > 2000) throw new Error('INPUT')
    Object.assign(args, { p_enrollment_id: get('enrollment_id'), p_tuition_plan_id: get('tuition_plan_id'), p_starts_on: get('starts_on') || null })
  }
  return args
}
const errors: Record<string, string> = {
  'Tuition discount cannot change after invoice creation': 'Khoản học phí này đã có hóa đơn. Không thể thay đổi chiết khấu trên kỳ học phí hiện tại.',
  'Scheduled tuition already exists': 'Đã có kỳ học phí được lên lịch. Hãy xử lý kỳ đó trước.',
  'Invalid tuition study start date': 'Kỳ đầu phải bắt đầu đúng ngày bắt đầu học.',
  'Tuition periods overlap': 'Ngày đã chọn trùng kỳ học phí hiện có.',
  'No active tuition price': 'Chưa có giá hoạt động cho gói tại chi nhánh này.',
}
async function operate(form: FormData, edit: boolean): Promise<FormState> {
  const db = await adminClient()
  const save = form.get('intent') === 'save'
  let args
  try { args = input(form, edit) } catch { return { error: 'Vui lòng kiểm tra ngày, gói học phí và thông tin chiết khấu.' } }
  if (save && form.get('confirm') !== 'yes') return { error: 'Vui lòng xác nhận lưu kỳ học phí.' }
  if (save && !edit) args.p_notes = String(form.get('notes') ?? '').trim() || null
  const rpc = edit ? (save ? 'update_tuition_discount' : 'preview_tuition_discount') : (save ? 'create_tuition_term' : 'preview_tuition_term')
  let result
  try { result = await db.rpc(rpc, args) } catch { return { error: 'Không xác nhận được kết quả. Hãy tải lại danh sách trước khi thử lại.' } }
  if (result.error) return { error: errors[result.error.message] ?? 'Không thể thực hiện. Hãy kiểm tra giá, trạng thái ghi danh, ngày và mức chiết khấu.' }
  if (!save) return { quote: result.data as Quote }
  for (const route of ['/admin/tuition', '/admin/tuition/reminders', '/admin/finance', '/admin/finance/invoices', '/admin/students', '/admin/enrollments']) revalidatePath(route, 'layout')
  redirect('/admin/tuition?selected=' + encodeURIComponent(String(result.data)) + '&success=' + encodeURIComponent('Đã lưu học phí.'))
}
export async function createTerm(_state: FormState, form: FormData) { return operate(form, false) }
export async function editDiscount(_state: FormState, form: FormData) { return operate(form, true) }
