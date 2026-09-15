'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function submit(form: FormData, operation: 'create' | 'version' | 'link' | 'unit') {
  const db = await createClient()
  const { data, error } = await db.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  if (error || !data) redirect('/login')
  const value = (key: string) => String(form.get(key) ?? '').trim()
  const optional = (key: string) => value(key) || null
  const reason = value('reason')
  if (!reason) redirect('/admin/employees?error=' + encodeURIComponent('Cần nhập lý do'))
  const common = { p_full_name: value('full_name'), p_group: value('employee_group'), p_pay_type: value('pay_type'), p_role: optional('operational_role_id'), p_reason: reason }
  const employee = value('employee_id')
  const result = operation === 'create'
    ? await db.rpc('create_employee', { ...common, p_home: value('home_unit'), p_hire_date: value('hire_date'), p_profile: optional('profile_id'), p_teacher: optional('teacher_id') })
    : operation === 'version'
      ? await db.rpc('set_employee_version', { ...common, p_employee: employee, p_expected_version: Number(value('expected_version')), p_effective_on: value('effective_on'), p_unit: value('unit_code'), p_status: value('employment_status') })
      : operation === 'link'
        ? await db.rpc('link_employee_identity', { p_employee: employee, p_profile: optional('profile_id'), p_teacher: optional('teacher_id'), p_reason: reason })
        : await db.rpc('configure_employee_unit', { p_unit: value('unit_code'), p_branch: optional('branch_id'), p_reason: reason })
  const selected = operation === 'create' && !result.error ? String(result.data) : employee
  const query = new URLSearchParams(selected ? { selected } : {})
  if (result.error) query.set('error', result.error.message)
  else { revalidatePath('/admin/employees'); query.set('success', 'Đã lưu hồ sơ và lịch sử thay đổi') }
  redirect('/admin/employees?' + query)
}
export async function createEmployee(form: FormData) { await submit(form, 'create') }
export async function updateEmployment(form: FormData) { await submit(form, 'version') }
export async function linkIdentity(form: FormData) { await submit(form, 'link') }
export async function configureUnit(form: FormData) { await submit(form, 'unit') }
