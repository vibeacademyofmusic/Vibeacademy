'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function submitFeedback(form: FormData) {
  const db = await createClient(), auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  const student = String(form.get('student') || ''), session = String(form.get('session') || '')
  const respondent = String(form.get('respondent') || ''), rating = String(form.get('rating') || ''), comment = String(form.get('comment') || '').trim()
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuid.test(student) || !uuid.test(session)) redirect('/my-learning?error=invalid')
  const path = `/my-learning?student=${student}&tab=attendance`
  if (!['STUDENT', 'PARENT'].includes(respondent) || !/^[1-5]$/.test(rating) || comment.length > 4000) redirect(path + '&error=feedback_invalid')
  const result = await db.rpc('submit_lesson_feedback', { p_student_id: student, p_session_id: session, p_respondent_type: respondent, p_overall: Number(rating), p_comment: comment })
  if (result.error) redirect(path + (result.error.code === '23505' ? '&error=feedback_duplicate' : '&error=feedback_denied'))
  revalidatePath('/my-learning')
  redirect(path + '&success=feedback')
}
