'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type QuickState = { error?: string; success?: string }

function codes(form: FormData, name: string) {
  return String(form.get(name) ?? '').split(',').map(code => code.trim()).filter(Boolean)
}

export async function saveQuickEntry(_state: QuickState, form: FormData): Promise<QuickState> {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) return { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }
  const sessionId = String(form.get('session_id') ?? '')
  const intent = String(form.get('intent') ?? 'draft')
  const context = String(form.get('curriculum_context') ?? '')
  const content = String(form.get('content_covered') ?? '')
  const saved = await db.rpc('save_session_learning_context', {
    p_session: sessionId,
    p_content: content,
    p_context: context || null,
  })
  if (saved.error) return { error: message(saved.error.message) }
  const attendanceIds = String(form.get('attendance_ids') ?? '').split(',').filter(Boolean)
  for (const attendanceId of attendanceIds) {
    const status = String(form.get(`status:${attendanceId}`) ?? '')
    const absent = status === 'ABSENT' || status === 'EXCUSED'
    const entry = await db.rpc('save_student_learning_entry', {
      p_attendance: attendanceId,
      p_observation: absent ? 'NOT_RECORDED' : String(form.get(`observation:${attendanceId}`) ?? 'NOT_RECORDED'),
      p_progress_note: absent ? '' : String(form.get(`progress_note:${attendanceId}`) ?? ''),
      p_homework: String(form.get(`homework:${attendanceId}`) ?? ''),
      p_homework_custom: String(form.get(`homework_custom:${attendanceId}`) ?? '') === 'true',
      p_next_focus: String(form.get(`focus:${attendanceId}`) ?? '') || null,
      p_attention: String(form.get(`attention:${attendanceId}`) ?? '') === 'true',
      p_attention_reason: String(form.get(`attention_reason:${attendanceId}`) ?? '') || null,
      p_attention_detail: String(form.get(`attention_detail:${attendanceId}`) ?? ''),
      p_family_note: String(form.get(`family_note:${attendanceId}`) ?? ''),
      p_codes: absent ? [] : codes(form, `codes:${attendanceId}`),
    })
    if (entry.error) return { error: message(entry.error.message) }
  }
  if (intent === 'share') {
    const shared = await db.rpc('apply_shared_journal_practice', {
      p_session: sessionId,
      p_homework: String(form.get('shared_homework') ?? ''),
      p_focus: String(form.get('shared_focus') ?? '') || null,
    })
    if (shared.error) return { error: message(shared.error.message) }
  }
  if (intent === 'submit') {
    const submitted = await db.rpc('submit_session_learning_journal', { p_session: sessionId })
    if (submitted.error) return { error: message(submitted.error.message) }
  }
  revalidatePath(`/admin/attendance/${sessionId}`)
  return { success: intent === 'submit' ? 'Đã nộp nhật ký buổi học.' : intent === 'revise' ? 'Đã cập nhật nội dung đã nộp.' : 'Đã lưu bản nháp.' }
}

function message(error: string) {
  if (error.includes('JOURNAL_PROGRESS_REQUIRED')) return 'Học viên có mặt hoặc đi muộn cần nhận xét trước khi nộp.'
  if (error.includes('JOURNAL_CONTENT_REQUIRED')) return 'Cần nhập nội dung buổi học trước khi nộp.'
  if (error.includes('JOURNAL_ABSENT_OBSERVATION_DENIED')) return 'Học viên vắng không ghi nhận xét buổi học.'
  if (error.includes('JOURNAL_UNAUTHORIZED')) return 'Bạn không có quyền ghi nhật ký buổi học này.'
  return 'Không lưu được nhật ký. Vui lòng kiểm tra lại các mục đã chọn.'
}
