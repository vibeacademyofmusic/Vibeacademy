'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

async function db() {
  const client = await createClient()
  const { data, error } = await client.auth.getClaims()
  if (error || !data?.claims) redirect('/login')
  return client
}

function back(error: { message?: string } | null) {
  revalidatePath('/admin/students')
  redirect(error?.message
    ? `/admin/students?view=waiting&error=${encodeURIComponent(placementMessage(error.message))}`
    : '/admin/students?view=waiting')
}

function placementMessage(error: string) {
  if (error.includes('PLACEMENT_UNAUTHORIZED')) return 'Bạn không có quyền xếp lớp tại chi nhánh này.'
  if (error.includes('PLACEMENT_PROGRAM_DENIED')) return 'Lớp không cùng chương trình với hồ sơ đăng ký.'
  if (error.includes('PLACEMENT_CLASS_FULL')) return 'Lớp đã đủ sĩ số.'
  if (error.includes('PLACEMENT_CLASS_DENIED')) return 'Lớp không thuộc chi nhánh hoặc không còn nhận học viên.'
  if (error.includes('PLACEMENT_ALREADY_ENROLLED')) return 'Học viên đã có ghi danh ở lớp này.'
  if (error.includes('PLACEMENT_TRANSITION_DENIED')) return 'Hồ sơ này không còn ở trạng thái có thể xếp lớp.'
  if (error.includes('PLACEMENT_START_DENIED')) return 'Ngày bắt đầu nằm ngoài thời gian của lớp.'
  if (error.includes('PLACEMENT_ALREADY_STARTED')) return 'Đã bắt đầu học — cần quy trình chuyển lớp.'
  if (error.includes('PLACEMENT_HISTORY_LOCKED')) return 'Hồ sơ đã có dữ liệu học tập, chưa thể sửa phân lớp tại đây.'
  if (error.includes('PLACEMENT_REASON_REQUIRED')) return 'Cần nhập lý do từ 1 đến 2000 ký tự.'
  if (error.includes('PLACEMENT_UNCHANGED')) return 'Lớp và ngày bắt đầu chưa thay đổi.'
  return 'Không xếp lớp được. Vui lòng kiểm tra lại lớp và ngày bắt đầu.'
}

export async function matchPlacement(formData: FormData) {
  const client = await db()
  const { error } = await client.rpc('set_student_placement_matching', {
    p_request: crypto.randomUUID(),
    p_placement: String(formData.get('placement_id') ?? ''),
    p_version: Number(formData.get('version') ?? 0),
  })
  back(error)
}

export async function assignPlacement(formData: FormData) {
  const client = await db()
  const start = String(formData.get('start_date') ?? '')
  const { error } = await client.rpc('assign_student_placement', {
    p_request: crypto.randomUUID(),
    p_placement: String(formData.get('placement_id') ?? ''),
    p_version: Number(formData.get('version') ?? 0),
    p_class: String(formData.get('class_id') ?? ''),
    p_start: datePattern.test(start) ? start : null,
  })
  back(error)
}

export async function changePlacement(formData: FormData) {
  const client = await db()
  const start = String(formData.get('start_date') ?? '')
  const { error } = await client.rpc('change_future_student_placement', {
    p_request: crypto.randomUUID(),
    p_placement: String(formData.get('placement_id') ?? ''),
    p_version: Number(formData.get('version') ?? 0),
    p_enrollment: String(formData.get('enrollment_id') ?? ''),
    p_class: String(formData.get('class_id') ?? ''),
    p_start: datePattern.test(start) ? start : null,
    p_reason: String(formData.get('reason') ?? ''),
  })
  back(error)
}

export async function cancelPlacement(formData: FormData) {
  const client = await db()
  const { error } = await client.rpc('cancel_future_student_placement', {
    p_request: crypto.randomUUID(),
    p_placement: String(formData.get('placement_id') ?? ''),
    p_version: Number(formData.get('version') ?? 0),
    p_enrollment: String(formData.get('enrollment_id') ?? ''),
    p_reason: String(formData.get('reason') ?? ''),
  })
  back(error)
}
