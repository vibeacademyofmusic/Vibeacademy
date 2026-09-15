import { rows, all, type DB } from '../finance/query'
import { pageNumber, pageSize, uuidPattern, validDate, type Params } from '../finance/operations'
export const states = [{id:'NORMAL',name:'Bình thường'},{id:'NEEDS_REVIEW',name:'Cần xem xét'},{id:'IN_REVIEW',name:'Đang xử lý'},{id:'RESOLVED',name:'Đã xử lý'}]
export const respondents = [{id:'STUDENT',name:'Học viên'},{id:'PARENT',name:'Phụ huynh'}]
export type Feedback = { id:string; session_occurrence_id:string; student_id:string; teacher_id:string; branch_id:string; respondent_user_id:string; respondent_type:string; session_starts_at:string; submitted_at:string; overall_rating:number; lesson_quality_rating:number|null; teacher_communication_rating:number|null; progress_perception_rating:number|null; comment:string; is_low_rating:boolean; resolution_status:string; resolution_note:string; resolved_at:string|null; resolved_by:string|null; version:number; context_snapshot:{student_name:string;student_code:string;teacher_name:string;branch_name:string;class_name:string;respondent_name:string|null} }
const fields = 'id,session_occurrence_id,student_id,teacher_id,branch_id,respondent_user_id,respondent_type,session_starts_at,submitted_at,overall_rating,lesson_quality_rating,teacher_communication_rating,progress_perception_rating,comment,is_low_rating,resolution_status,resolution_note,resolved_at,resolved_by,version,context_snapshot'
export async function feedbackList(db:DB, params:Params) {
 const page=pageNumber(params.page)
 let q=db.from('lesson_feedback').select('id,session_starts_at,overall_rating,is_low_rating,resolution_status,respondent_type,context_snapshot')
 if(uuidPattern.test(params.branch??'')) q=q.eq('branch_id',params.branch!)
 if(uuidPattern.test(params.teacher??'')) q=q.eq('teacher_id',params.teacher!)
 if(/^[1-5]$/.test(params.rating??'')) q=q.eq('overall_rating',Number(params.rating))
 if(respondents.some(r=>r.id===params.respondent)) q=q.eq('respondent_type',params.respondent!)
 if(states.some(s=>s.id===params.status)) q=q.eq('resolution_status',params.status!)
 if(params.review==='yes') q=q.in('resolution_status',['NEEDS_REVIEW','IN_REVIEW'])
 if(validDate(params.from??'')) q=q.gte('session_starts_at',params.from+'T00:00:00+07:00')
 if(validDate(params.to??'')) {const d=new Date(params.to+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);q=q.lt('session_starts_at',d.toISOString().slice(0,10)+'T00:00:00+07:00')}
 const data=await rows(q.order('session_starts_at',{ascending:false}).order('id').range((page-1)*pageSize,page*pageSize).returns<Feedback[]>())
 return {data:data.slice(0,pageSize),page,more:data.length>pageSize}
}
export async function feedbackDetail(db:DB,id:string) {
 if(!uuidPattern.test(id)) return null
 return (await rows(db.from('lesson_feedback').select(fields).eq('id',id).returns<Feedback[]>()))[0]??null
}
export async function teachers(db:DB) {
 return all((a,b)=>db.from('teachers').select('id,full_name,teacher_code').order('teacher_code').order('id').range(a,b).returns<{id:string;full_name:string|null;teacher_code:string}[]>())
}
export async function feedbackHistory(db:DB,id:string) {
 return rows(db.from('lesson_feedback_events').select('id,status,note,actor_id,created_at').eq('feedback_id',id).order('created_at',{ascending:false}).order('id').limit(100).returns<{id:string;status:string;note:string;actor_id:string;created_at:string}[]>())
}
