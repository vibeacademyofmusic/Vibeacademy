'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { businessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { coordinationReturn, placementStaffMessage, withCoordinationState } from '../coordination/rules'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

async function db() {
  const client = await createClient()
  const { data, error } = await client.auth.getClaims()
  if (error || !data?.claims) redirect('/login')
  return client
}

function back(formData: FormData, error: { message?: string } | null, destination?: string) {
  revalidatePath('/admin/students')
  revalidatePath('/admin/classes')
  revalidatePath('/admin/attendance')
  const placement = String(formData.get('placement_id') ?? '')
  const start = String(formData.get('start_date') ?? '')
  const classId = String(formData.get('class_id') ?? '')
  const base = coordinationReturn(String(formData.get('return_to') ?? '')) || '/admin/students?tab=coordination&view=queue'
  if (error?.message) {
    const known = placementStaffMessage(error.message)
    const reference = crypto.randomUUID().slice(0, 8)
    if (!known) console.error('placement failed', reference, error.message)
    redirect(withCoordinationState(base, {
      error: known || `Không xếp ca được. Mã đối chiếu ${reference}.`,
      place: placement || undefined,
      start: datePattern.test(start) ? start : undefined,
      class: error.message.includes('PLACEMENT_CLASS_FULL') ? undefined : classId || undefined,
      success: undefined,
    }))
  }
  redirect(destination || withCoordinationState(base, {
    view: 'queue',
    place: undefined,
    class: undefined,
    start: undefined,
    error: undefined,
    placed: placement || '1',
    success: datePattern.test(start) && start > businessDate()
      ? 'Đã xếp ca. Học viên ở trạng thái đã xếp ca – chờ bắt đầu cho đến ngày tham gia.'
      : 'Đã xếp ca.',
  }))
}

export async function matchPlacement(formData: FormData) {
  const client = await db()
  const { error } = await client.rpc('set_student_placement_matching', {
    p_request: String(formData.get('request_id') || crypto.randomUUID()),
    p_placement: String(formData.get('placement_id') ?? ''),
    p_version: Number(formData.get('version') ?? 0),
  })
  back(formData, error)
}

export async function assignPlacement(formData: FormData) {
  const client = await db()
  const start = String(formData.get('start_date') ?? '')
  if (datePattern.test(start) && start < businessDate()) {
    back(formData, { message: 'PLACEMENT_START_PAST' })
  }
  const classIds = [...new Set(formData.getAll('class_id').map(value => String(value)).filter(Boolean))]
  const placement = String(formData.get('placement_id') ?? '')
  const { error } = await client.rpc('assign_student_shift_set', {
    p_request: String(formData.get('request_id') || crypto.randomUUID()),
    p_placement: placement,
    p_version: Number(formData.get('version') ?? 0),
    p_classes: classIds,
    p_start: datePattern.test(start) ? start : null,
  })
  if (!error) {
    const saved = await client.from('student_placement_cases').select('status, required_weekly_sessions').eq('id', placement).maybeSingle()
    const required = saved.data?.required_weekly_sessions
    if (typeof required === 'number' && saved.data?.status === 'MATCHING') {
      revalidatePath('/admin/students')
      revalidatePath('/admin/classes')
      revalidatePath('/admin/attendance')
      const base = coordinationReturn(String(formData.get('return_to') ?? '')) || '/admin/students?tab=coordination&view=queue'
      redirect(withCoordinationState(base, {
        error: undefined,
        place: placement,
        start: datePattern.test(start) ? start : undefined,
        success: `Đã xếp một phần lịch. Hồ sơ yêu cầu ${required} buổi/tuần và vẫn còn thiếu buổi.`,
      }))
    }
  }
  back(formData, error)
}

export async function changePlacement(formData: FormData) {
  const client = await db()
  const start = String(formData.get('start_date') ?? '')
  const { error } = await client.rpc('change_future_student_placement', {
    p_request: String(formData.get('request_id') || crypto.randomUUID()),
    p_placement: String(formData.get('placement_id') ?? ''),
    p_version: Number(formData.get('version') ?? 0),
    p_enrollment: String(formData.get('enrollment_id') ?? ''),
    p_class: String(formData.get('class_id') ?? ''),
    p_start: datePattern.test(start) ? start : null,
    p_reason: String(formData.get('reason') ?? ''),
  })
  back(formData, error)
}

export async function cancelPlacement(formData: FormData) {
  const client = await db()
  const { error } = await client.rpc('cancel_future_student_placement', {
    p_request: String(formData.get('request_id') || crypto.randomUUID()),
    p_placement: String(formData.get('placement_id') ?? ''),
    p_version: Number(formData.get('version') ?? 0),
    p_enrollment: String(formData.get('enrollment_id') ?? ''),
    p_reason: String(formData.get('reason') ?? ''),
  })
  back(formData, error)
}
