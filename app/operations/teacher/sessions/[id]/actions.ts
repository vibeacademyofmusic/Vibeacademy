'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { teachingError } from './model'
export type SaveState = { error?: string; success?: string }
export async function saveTeaching(_state: SaveState, form: FormData): Promise<SaveState> {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) return { error: 'Phiên đăng nhập đã hết hạn.' }
  const text = (name: string) => String(form.get(name) ?? '')
  const session = text('session'), enrollment = text('enrollment'), action = text('intent')
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
  if (!uuid.test(session) || (enrollment && !uuid.test(enrollment))) return {error:'Buổi học hoặc học viên không hợp lệ.'}
  if (!['attendance','progress','journal','context','complete','submit'].includes(action)) return {error:'Thao tác không hợp lệ.'}
  const payload = action === 'attendance' ? {status:text('status')}
    : action === 'progress' ? {kind:text('kind'),progress_id:text('progress_id'),status:text('status'),expected_status:text('expected_status')}
    : action === 'context' ? {content:text('content'),context:text('context'),version:Number(text('version'))}
    : action === 'journal' ? {version:Number(text('version')),observation:text('observation'),progress_note:text('progress_note'),
      homework:text('homework'),homework_custom:text('homework_custom')==='true',focus:text('focus'),attention:text('attention')==='on',
      attention_reason:text('attention_reason'),attention_detail:text('attention_detail'),family_note:text('family_note'),codes:form.getAll('codes').map(String)} : {}
  const {error} = await db.rpc('teacher_session_write',{p_session:session,p_enrollment:enrollment||null,p_action:action,p_payload:payload})
  if (error) return {error:teachingError(error.message)}
  revalidatePath(`/operations/teacher/sessions/${session}`)
  revalidatePath('/operations/teacher')
  revalidatePath(`/admin/attendance/${session}`)
  return {success: action==='complete' ? 'Đã hoàn tất ca dạy.' : action==='submit' ? 'Đã nộp nhật ký.' : 'Đã lưu.'}
}
