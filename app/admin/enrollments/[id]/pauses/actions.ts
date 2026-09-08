'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function savePause(form: FormData) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims) redirect('/login')
  const { data: allowed, error: roleError } = await supabase.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  if (roleError || !allowed) redirect('/login?error=B%E1%BA%A1n%20kh%C3%B4ng%20c%C3%B3%20quy%E1%BB%81n%20truy%20c%E1%BA%ADp')
  const id = String(form.get('enrollment_id') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect('/admin/classes?error=Th%C3%B4ng%20tin%20ghi%20danh%20kh%C3%B4ng%20h%E1%BB%A3p%20l%E1%BB%87')
  const path = `/admin/enrollments/${id}/pauses`
  const fail = (message: string): never => redirect(`${path}?error=${encodeURIComponent(message)}`)
  const { data: enrollment, error: loadError } = await supabase.from('enrollments').select('id, class_id, student_id, status, started_at, enrolled_at, ended_at').eq('id', id).maybeSingle()
  if (loadError || !enrollment) {
    redirect(
      `${path}?error=${encodeURIComponent('Không thể tải thông tin ghi danh')}`
    )
  }

    const reason = String(form.get('reason') ?? '').trim()
    if (!reason || reason.length > 500) {
      fail('Nhập lý do từ 1 đến 500 ký tự')
    }

    const operation = String(form.get('operation') ?? '')
    if (operation !== 'create' && operation !== 'cancel') {
      fail('Thao tác bảo lưu không hợp lệ')
    }

    let mutationError

    if (operation === 'cancel') {
      const pauseId = String(form.get('pause_id') ?? '')

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pauseId)) {
        fail('Thông tin đợt bảo lưu không hợp lệ')
      }

      const result = await supabase
        .from('enrollment_pauses')
        .update({
          status: 'CANCELLED',
          cancelled_at: new Date().toISOString(),
          cancelled_by: auth.claims.sub,
          cancel_reason: reason,
        })
        .eq('id', pauseId)
        .eq('enrollment_id', id)
        .eq('status', 'ACTIVE')
        .select('id')

      mutationError = result.error

      if (!result.error && !result.data?.length) {
        fail('Đợt bảo lưu này đã bị hủy hoặc không còn tồn tại')
      }
    } else {
    const start = String(form.get('starts_on') ?? '')
    const end = String(form.get('ends_on') ?? '')
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
    if (!validDate(start) || !validDate(end) || end < start) fail('Chọn ngày bắt đầu và kết thúc hợp lệ')
      if (enrollment.status !== 'ACTIVE') {
        fail('Chỉ có thể tạo bảo lưu cho ghi danh đang hoạt động')
      }

      if (!enrollment.started_at) {
        fail('Học viên chưa bắt đầu học nên chưa thể tạo bảo lưu')
      }

      if (
        start < enrollment.started_at ||
        (enrollment.ended_at && end > enrollment.ended_at)
      ) {
        fail('Ngày bảo lưu phải nằm trong thời gian học thực tế')
      }
    const result = await supabase.from('enrollment_pauses').insert({ enrollment_id: id, starts_on: start, ends_on: end, reason })
    mutationError = result.error
  }
  if (mutationError) {
    console.error('Pause update failed:', mutationError)
    if (mutationError.message.includes('Pause changes are blocked')) fail('Khoảng ngày này đã có điểm danh hoặc buổi học thường đã chốt. Hãy kiểm tra các buổi học trước khi thay đổi bảo lưu.')
    fail(mutationError.code === '23P01' ? 'Khoảng ngày này trùng với một đợt bảo lưu hiện có' : 'Không thể lưu bảo lưu. Vui lòng kiểm tra ngày đã chọn hoặc liên hệ quản trị viên.')
  }
  revalidatePath(path)
  revalidatePath(`/admin/classes/${enrollment.class_id}`)
  revalidatePath(`/admin/students/${enrollment.student_id}`)
  revalidatePath('/admin/attendance', 'layout')
  redirect(`${path}?success=%C4%90%C3%A3%20l%C6%B0u%20b%E1%BA%A3o%20l%C6%B0u`)
}
