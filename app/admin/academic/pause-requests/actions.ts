'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function decidePauseRequest(form: FormData) {
  const requestId = String(form.get('request_id') ?? '')
  const decision = String(form.get('decision') ?? '')
  const note = String(form.get('note') ?? '').trim()
  const status = String(form.get('status') ?? '')
  const query = new URLSearchParams()
  if (status === 'REQUESTED' || status === 'APPROVED' || status === 'REJECTED') query.set('status', status)
  if (!uuidPattern.test(requestId) || (decision !== 'approve' && decision !== 'reject') || note.length < 1 || note.length > 500) {
    query.set('error', 'Chọn đúng yêu cầu và nhập ghi chú từ 1 đến 500 ký tự.')
    redirect('/admin/academic/pause-requests?' + query)
  }
  const db = await createClient()
  const { data: claims, error: claimsError } = await db.auth.getClaims()
  if (claimsError || !claims?.claims) redirect('/login')
  const allowed = await db.rpc('academic_ops_may_manage')
  if (allowed.error || allowed.data !== true) redirect('/login?error=' + encodeURIComponent('Bạn không có quyền truy cập'))
  const result = await db.rpc('decide_enrollment_pause', {
    p_request_id: requestId,
    p_approve: decision === 'approve',
    p_note: note,
  })
  revalidatePath('/admin/academic/pause-requests')
  if (result.error) {
    query.set('error', 'Không thể ghi quyết định. Hãy tải lại danh sách trước khi bấm lại.')
    redirect('/admin/academic/pause-requests?' + query)
  }
  const body = result.data as { ok?: boolean; blockers?: string[]; status?: string } | null
  if (!body?.ok) {
    const blocker = body?.blockers?.[0] ?? 'Yêu cầu không còn ở trạng thái chờ duyệt.'
    query.set('error', blocker)
    query.set('request', requestId)
    redirect('/admin/academic/pause-requests?' + query)
  }
  query.set('success', body.status === 'REJECTED' ? 'Đã từ chối yêu cầu bảo lưu.' : 'Đã duyệt yêu cầu bảo lưu.')
  query.set('request', requestId)
  redirect('/admin/academic/pause-requests?' + query)
}
