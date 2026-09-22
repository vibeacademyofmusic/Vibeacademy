'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(message: string): never {
  const text = message.includes('STALE') ? 'Dữ liệu đã thay đổi. Tải lại rồi thử lại.'
    : message.includes('TERMINAL') ? 'Hồ sơ này đã kết thúc.'
    : message.includes('TRANSITION_DENIED') ? 'Không thể chuyển trạng thái này.'
    : message.includes('RETURN_UNPROVEN') ? 'Chưa có ghi danh đang học để xác nhận đã quay lại.'
    : message.includes('NOTE_REQUIRED') ? 'Cần ghi chú cho trạng thái này.'
    : message.includes('UNAUTHORIZED') ? 'Bạn không có quyền thực hiện thao tác này.'
    : 'Không thực hiện được thao tác.'
  redirect('/admin/business/reactivation?error=' + encodeURIComponent(text))
}

export async function refreshReactivation(formData: FormData) {
  const client = await createClient()
  const { data } = await client.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const branch = String(formData.get('branch_id') ?? '')
  const { error } = await client.rpc('refresh_crm_reactivation', { p_branch: uuidPattern.test(branch) ? branch : null })
  if (error) fail(error.message)
  revalidatePath('/admin/business/reactivation')
  redirect('/admin/business/reactivation?success=' + encodeURIComponent('Đã làm mới danh sách'))
}

export async function transitionReactivation(formData: FormData) {
  const client = await createClient()
  const { data } = await client.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const { error } = await client.rpc('transition_crm_reactivation', {
    p_request: crypto.randomUUID(),
    p_case: String(formData.get('case_id') ?? ''),
    p_version: Number(formData.get('version')),
    p_to_status: String(formData.get('to_status') ?? ''),
    p_note: String(formData.get('note') ?? ''),
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/reactivation')
  redirect('/admin/business/reactivation')
}
