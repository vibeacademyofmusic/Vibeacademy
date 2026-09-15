'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../finance/operations'
export async function resolveFeedback(form:FormData) {
 const db=await adminClient(),id=String(form.get('id')??''),status=String(form.get('status')??''),note=String(form.get('note')??'').trim(),version=Number(form.get('version'))
 let error=''
 if(!uuidPattern.test(id)||!['IN_REVIEW','RESOLVED'].includes(status)||!note||note.length>4000||!Number.isSafeInteger(version)||version<1) error='Vui lòng kiểm tra trạng thái và ghi chú xử lý.'
 else {try {const r=await db.rpc('resolve_lesson_feedback',{p_id:id,p_version:version,p_status:status,p_note:note});if(r.error) error='Không thể cập nhật. Hãy tải lại để kiểm tra trạng thái mới nhất.'} catch {error='Chưa xác nhận được kết quả. Hãy tải lại trước khi thử lại.'}}
 revalidatePath('/admin/feedback')
 if(uuidPattern.test(id)) revalidatePath('/admin/feedback/'+id)
 redirect('/admin/feedback'+(uuidPattern.test(id)?'/'+id:'')+'?'+new URLSearchParams(error?{error}:{success:'Đã lưu xử lý phản hồi.'}))
}
