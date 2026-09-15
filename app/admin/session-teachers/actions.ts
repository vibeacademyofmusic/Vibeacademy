'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../finance/operations'
export async function assignSessionTeacher(form: FormData) {
  const db = await adminClient()
  const id = String(form.get('session_id') ?? '')
  const teacher = String(form.get('teacher_id') ?? '')
  const type = String(form.get('type') ?? '')
  const reason = String(form.get('reason') ?? '').trim()
  let error = ''
  if (!uuidPattern.test(id) || (teacher && !uuidPattern.test(teacher)) || !['PRIMARY','SUBSTITUTE','OVERRIDE'].includes(type) || !reason || reason.length > 2000) error = 'Vui lòng kiểm tra giáo viên và lý do.'
  else {
    const r = await db.rpc('set_session_teacher', {p_session_id:id,p_teacher_id:teacher || null,p_type:type,p_reason:reason})
    if (r.error) error = 'Không thể đổi giáo viên. Kiểm tra trạng thái buổi, giáo viên và chi nhánh.'
  }
  revalidatePath('/admin/attendance')
  revalidatePath('/admin/attendance/'+id)
  revalidatePath('/admin/session-teachers')
  redirect('/admin/attendance'+(uuidPattern.test(id)?'/'+id:'')+'?'+new URLSearchParams(error?{error}:{success:'Đã lưu phân công giáo viên buổi học.'}))
}
