import Link from 'next/link'
import { adminClient, type Params } from '../../finance/operations'
import { Panel, Table, Select, Notice, LoadError, inputClass, timeText } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { feedbackDetail, feedbackHistory, respondents, states } from '../data'
import { resolveFeedback } from '../actions'
export default async function FeedbackDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Params>}) {
 const {id}=await params,query=await searchParams,db=await adminClient()
 let f,events
 try {f=await feedbackDetail(db,id);events=f?await feedbackHistory(db,id):[]} catch {return <LoadError/>}
 if(!f) return <p>Không tìm thấy phản hồi.</p>
 const c=f.context_snapshot
 return <div className="min-w-0 space-y-6"><Link prefetch={false} href="/admin/feedback">← Danh sách phản hồi</Link><h1 className="text-3xl font-bold">Phản hồi buổi học</h1><Notice params={query}/>
 <Panel title="Buổi học và người phản hồi"><p>{c.student_name} ({c.student_code}) • {c.branch_name}</p><p>{c.class_name} • {timeText(f.session_starts_at)}</p><Link prefetch={false} href={'/admin/attendance/'+f.session_occurrence_id}>Xem buổi học</Link><p>Giáo viên: {c.teacher_name}. {c.teacher_basis==='ACTUAL_SESSION_TEACHER'?'Giáo viên thực tế được ghi nhận theo buổi học.':'Snapshot cũ theo giáo viên chính của lớp tại lúc gửi.'}</p><p>{respondents.find(r=>r.id===f.respondent_type)?.name}: {c.respondent_name||'Chưa có tên hồ sơ'}</p><p>Gửi lúc {timeText(f.submitted_at)}</p></Panel>
 <Panel title="Đánh giá gốc"><p className={f.is_low_rating?'font-semibold text-red-800':''}>Tổng thể: {f.overall_rating}/5{f.is_low_rating?' • Điểm thấp':''}</p><p>Chất lượng: {f.lesson_quality_rating??'Chưa đánh giá'} • Giao tiếp: {f.teacher_communication_rating??'Chưa đánh giá'} • Cảm nhận tiến bộ: {f.progress_perception_rating??'Chưa đánh giá'}</p><p className="whitespace-pre-wrap">{f.comment||'Không có nhận xét'}</p></Panel>
 <Panel title="Xử lý phản hồi"><p>{states.find(s=>s.id===f.resolution_status)?.name}</p><p className="whitespace-pre-wrap">{f.resolution_note||'Chưa có ghi chú xử lý'}</p>{f.resolved_at&&<p>Đã xử lý lúc {timeText(f.resolved_at)} • {f.resolved_by}</p>}<form action={resolveFeedback} className="space-y-3"><input type="hidden" name="id" value={f.id}/><input type="hidden" name="version" value={f.version}/><Select name="status" label="Chuyển trạng thái" required options={f.resolution_status==='RESOLVED'?[{id:'IN_REVIEW',name:'Mở lại để xử lý'}]:states.filter(s=>['IN_REVIEW','RESOLVED'].includes(s.id)&&s.id!==f.resolution_status)}/><label className="block">Ghi chú xử lý<textarea className={inputClass} name="note" maxLength={4000} required/></label><SubmitButton>Lưu xử lý</SubmitButton></form></Panel>
 <Panel title="Lịch sử xử lý"><p>100 thao tác gần nhất. Nội dung phản hồi gốc không bị xóa khi xử lý.</p><Table headers={['Trạng thái','Ghi chú','Người xử lý','Thời gian']} rows={events.map(e=>[states.find(s=>s.id===e.status)?.name,e.note,e.actor_id,timeText(e.created_at)])}/></Panel></div>
}
