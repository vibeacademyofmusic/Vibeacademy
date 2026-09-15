'use server'
import { createClient } from '@/lib/supabase/server'
// Portal foundation: identity and eligibility remain enforced inside the RPC.
export async function submitLessonFeedback(form:FormData) {
 const db=await createClient(),session=await db.auth.getClaims()
 if(session.error||!session.data?.claims) return {error:'Vui lòng đăng nhập.'}
 const rating=(key:string)=>{const raw=String(form.get(key)??'');return raw===''?null:/^[1-5]$/.test(raw)?Number(raw):NaN}
 const overall=rating('overall'),quality=rating('quality'),communication=rating('communication'),progress=rating('progress')
 const occurrence=String(form.get('session_id')??''),student=String(form.get('student_id')??''),type=String(form.get('respondent_type')??''),comment=String(form.get('comment')??'').trim()
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if(!uuid.test(occurrence)||!uuid.test(student)||!['STUDENT','PARENT'].includes(type)||overall===null||[overall,quality,communication,progress].some(Number.isNaN)||comment.length>4000) return {error:'Vui lòng kiểm tra đánh giá từ 1 đến 5 và thông tin buổi học.'}
 try {const r=await db.rpc('submit_lesson_feedback',{p_session_id:occurrence,p_student_id:student,p_respondent_type:type,p_overall:overall,p_quality:quality,p_communication:communication,p_progress:progress,p_comment:comment});return r.error?{error:'Không thể gửi. Buổi học chưa đủ điều kiện, quan hệ tài khoản không hợp lệ hoặc bạn đã gửi phản hồi.'}:{success:true}} catch {return {error:'Chưa xác nhận được kết quả. Không gửi lặp lại ngay.'}}
}
