'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import answers from '@/lib/academic/aural-answers.json'

const messages: Record<string, string> = {
  AURAL_ANSWER_DENIED: 'Học viên không xem đáp án từ tài khoản này. / This account cannot open the answer.',
  AURAL_ATTEMPT_DENIED: 'Bạn không có quyền ghi lần làm của học viên này.',
}

export async function revealAuralAnswer(lessonCode: string) {
  if (!/^AUR-G[1-8]-\d{2}$/.test(lessonCode)) return { error: 'Lesson không hợp lệ.' }
  const db = await createClient()
  const { data, error } = await db.rpc('reveal_aural_answer', { p_lesson: lessonCode })
  if (error) {
    const known = Object.keys(messages).find(code => error.message.includes(code))
    return { error: known ? messages[known] : 'Không mở được đáp án.' }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { error: 'Chưa có đáp án.' }
  const local = (answers as { answers: Record<string, { vi: string; en: string }> }).answers[lessonCode]
  if (local && (local.vi !== row.answer_vi || local.en !== row.answer_en)) return { error: 'Đáp án trong database không khớp nguồn chuẩn.' }
  return { vi: row.answer_vi as string, en: row.answer_en as string, material: row.material_status as string, review: row.review_status as string }
}

export async function recordAuralAttempt(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? '').trim()
  const db = await createClient()
  const student = text('student')
  if (!/^[0-9a-f-]{36}$/i.test(student)) return { error: 'Học viên không hợp lệ.' }
  const { error } = await db.rpc('record_aural_attempt', {
    p_student: student,
    p_program: text('program'),
    p_lesson: text('lesson'),
    p_mode: text('mode'),
    p_language: text('language'),
    p_response: text('response'),
    p_hearings: Number(text('hearings') || 0),
    p_hints: Number(text('hints') || 0),
    p_observation: text('observation'),
    p_note: text('note'),
    p_next: text('next'),
    p_date: text('performed_on'),
  })
  if (error) {
    const known = Object.keys(messages).find(code => error.message.includes(code))
    return { error: known ? messages[known] : 'Không lưu được lần làm.' }
  }
  revalidatePath(`/admin/students/${student}`)
  return { success: 'Đã lưu lần làm. Ngôn ngữ hướng dẫn không đổi tiến độ lesson.' }
}
