'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '@/app/admin/finance/operations'
export async function configureCompensation(form: FormData) {
  const db = await adminClient(), get = (key: string) => String(form.get(key) || '').trim(), employee = get('employee')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  let error = ''
  if (!uuidPattern.test(get('branch')) || !['MONTHLY', 'PER_SESSION', 'HOURLY'].includes(get('type')) || !/^\d{1,12}(\.\d{1,2})?$/.test(get('rate')) || Number(get('rate')) <= 0 || !/^[A-Z]{3}$/.test(get('currency')) || !validDate(get('from')) || (get('to') && (!validDate(get('to')) || get('to') < get('from'))) || !get('reason') || get('reason').length > 2000 || (get('type') === 'PER_SESSION' && !['ONE_ON_ONE', 'GROUP'].includes(get('class_type')))) error = 'Kiểm tra mức lương, ngày hiệu lực và lý do.'
  else {
    const result = await db.rpc('configure_employee_compensation', { p_employee: employee, p_branch: get('branch'), p_type: get('type'), p_rate: get('rate'), p_currency: get('currency'), p_from: get('from'), p_to: get('to') || null, p_class_type: get('type') === 'PER_SESSION' ? get('class_type') : null, p_reason: get('reason') })
    if (result.error) error = result.error.message === 'Compensation dates overlap' ? 'Ngày hiệu lực trùng mức lương đã có. Lịch sử không bị ghi đè.' : 'Không thể lưu. Kiểm tra liên kết giáo viên, chi nhánh và mức lương đang có.'
  }
  const path = '/admin/employees/' + employee + '/compensation'
  revalidatePath(path)
  revalidatePath('/admin/payroll')
  redirect(path + '?' + new URLSearchParams(error ? { error } : { success: 'Đã lưu mức lương và lý do.' }))
}
