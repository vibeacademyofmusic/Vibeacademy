'use server'

import { operationalAdminOn } from '@/lib/auth/request'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern, validDate } from '../finance/operations'
import { inspectPortrait } from '@/lib/staff/profile'
import { commitPortrait, deletePortraitObject, staffError } from './portrait'

function read(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim()
}

async function adminDb() {
  const db = await createClient()
  const role = await operationalAdminOn(db)
  if (role.error || role.data !== true) redirect('/login')
  return db
}

function back(employee: string, error?: string, success?: string): never {
  const query = new URLSearchParams({ selected: employee })
  if (error) query.set('error', error)
  if (success) query.set('success', success)
  revalidatePath('/admin/employees')
  revalidatePath(`/documents/staff-cards/${employee}`)
  redirect(`/admin/employees?${query}`)
}

export async function assignTeaching(form: FormData) {
  const employee = read(form, 'employee_id')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  const db = await adminDb()
  const effective = read(form, 'effective_from')
  if (!validDate(effective)) back(employee, 'Ngày hiệu lực không hợp lệ.')
  const result = await db.rpc('assign_staff_teaching', {
    p_employee: employee,
    p_subject: read(form, 'subject_id'),
    p_capacity: read(form, 'capacity'),
    p_effective_from: effective,
    p_reason: read(form, 'reason'),
  })
  back(employee, result.error ? staffError(result.error.message) : undefined, result.error ? undefined : 'Đã ghi năng lực giảng dạy. Lịch sử cũ được giữ nguyên.')
}

export async function endTeaching(form: FormData) {
  const employee = read(form, 'employee_id')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  const db = await adminDb()
  const effective = read(form, 'effective_to')
  if (!validDate(effective)) back(employee, 'Ngày kết thúc không hợp lệ.')
  const result = await db.rpc('end_staff_teaching', {
    p_assignment: read(form, 'assignment_id'),
    p_effective_to: effective,
    p_reason: read(form, 'reason'),
  })
  back(employee, result.error ? staffError(result.error.message) : undefined, result.error ? undefined : 'Đã kết thúc năng lực. Bản ghi cũ vẫn còn trong lịch sử.')
}

export async function assignPosition(form: FormData) {
  const employee = read(form, 'employee_id')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  const db = await adminDb()
  const effective = read(form, 'effective_from')
  if (!validDate(effective)) back(employee, 'Ngày hiệu lực không hợp lệ.')
  const result = await db.rpc('assign_staff_position', {
    p_employee: employee,
    p_code: read(form, 'position_code'),
    p_effective_from: effective,
    p_reason: read(form, 'reason'),
  })
  back(employee, result.error ? staffError(result.error.message) : undefined, result.error ? undefined : 'Đã ghi vị trí công việc. Quyền tài khoản và lương không đổi.')
}

export async function endPosition(form: FormData) {
  const employee = read(form, 'employee_id')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  const db = await adminDb()
  const effective = read(form, 'effective_to')
  if (!validDate(effective)) back(employee, 'Ngày kết thúc không hợp lệ.')
  const result = await db.rpc('end_staff_position', {
    p_assignment: read(form, 'assignment_id'),
    p_effective_to: effective,
    p_reason: read(form, 'reason'),
  })
  back(employee, result.error ? staffError(result.error.message) : undefined, result.error ? undefined : 'Đã kết thúc vị trí. Lịch sử vẫn được giữ.')
}

export async function replacePortrait(form: FormData) {
  const employee = read(form, 'employee_id')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  const file = form.get('portrait')
  if (!(file instanceof File) || file.size === 0) back(employee, 'Hãy chọn một ảnh chân dung.')
  const portrait = file
  const bytes = new Uint8Array(await portrait.arrayBuffer())
  const inspected = inspectPortrait(bytes, portrait.type)
  if (!inspected.ok) back(employee, inspected.message)
  const db = await adminDb()
  const saved = await commitPortrait(db, employee, bytes, inspected)
  back(employee, saved.error || saved.warning || undefined, saved.error ? undefined : 'Đã cập nhật ảnh chân dung.')
}

export async function removePortrait(form: FormData) {
  const employee = read(form, 'employee_id')
  if (!uuidPattern.test(employee)) redirect('/admin/employees')
  const db = await adminDb()
  const result = await db.rpc('remove_staff_portrait', {
    p_employee: employee,
    p_reason: read(form, 'reason'),
  })
  if (result.error) back(employee, staffError(result.error.message))
  const path = typeof result.data === 'string' ? result.data : ''
  if (path) {
    const gone = await deletePortraitObject(db, path)
    if (!gone) back(employee, 'Đã gỡ ảnh khỏi hồ sơ. Tệp trong kho chưa xóa được, hãy thử lại.')
  }
  back(employee, undefined, 'Đã gỡ ảnh chân dung.')
}
