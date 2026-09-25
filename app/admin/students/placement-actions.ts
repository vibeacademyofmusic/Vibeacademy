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
    ? `/admin/students?tab=waiting&error=${encodeURIComponent(placementMessage(error.message))}`
    : '/admin/students?tab=waiting')
}

function placementMessage(error: string) {
  if (error.includes('PLACEMENT_UNAUTHORIZED')) return 'Bạn không có quyền xếp học viên vào ca dạy tại chi nhánh này.'
  if (error.includes('PLACEMENT_PROGRAM_DENIED')) return 'Ca dạy không cùng chương trình với hồ sơ đăng ký.'
  if (error.includes('PLACEMENT_LEVEL_DENIED')) return 'Ca dạy không nhận trình độ hiện tại của học viên.'
  if (error.includes('PLACEMENT_TEACHER_REQUIRED')) return 'Ca dạy chưa có giáo viên chính hợp lệ.'
  if (error.includes('PLACEMENT_SCHEDULE_REQUIRED')) return 'Ca dạy chưa có lịch định kỳ.'
  if (error.includes('PLACEMENT_CLASS_FULL')) return 'Ca dạy đã đủ sĩ số.'
  if (error.includes('PLACEMENT_CLASS_DENIED')) return 'Ca dạy không thuộc chi nhánh hoặc không còn nhận học viên.'
  if (error.includes('PLACEMENT_ALREADY_ENROLLED')) return 'Học viên đã có ghi danh ở ca dạy này.'
  if (error.includes('PLACEMENT_TRANSITION_DENIED')) return 'Hồ sơ này không còn ở trạng thái có thể vào ca dạy.'
  if (error.includes('PLACEMENT_START_DENIED')) return 'Ngày bắt đầu nằm ngoài thời gian của ca dạy.'
  if (error.includes('PLACEMENT_ALREADY_STARTED')) return 'Đã bắt đầu học — cần quy trình đổi ca dạy.'
  if (error.includes('PLACEMENT_HISTORY_LOCKED')) return 'Hồ sơ đã có dữ liệu học tập, chưa thể sửa ca dạy tại đây.'
  if (error.includes('PLACEMENT_REASON_REQUIRED')) return 'Cần nhập lý do từ 1 đến 2000 ký tự.'
  if (error.includes('PLACEMENT_UNCHANGED')) return 'Ca dạy và ngày bắt đầu chưa thay đổi.'
  return 'Không vào ca dạy được. Vui lòng kiểm tra lại ca dạy và ngày bắt đầu.'
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
