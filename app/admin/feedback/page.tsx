import Link from 'next/link'
import { adminClient, type Params } from '../finance/operations'
import { branches } from '../finance/query'
import { Select, Field, Table, Pager, Notice, LoadError, timeText } from '../finance/_components/ui'
import { feedbackList, teachers, states, respondents } from './data'
export default async function FeedbackPage({searchParams}:{searchParams:Promise<Params>}) {
 const params=await searchParams,db=await adminClient()
 let loaded
 try {loaded=await Promise.all([feedbackList(db,params),branches(db),teachers(db)])} catch {return <LoadError/>}
 const [list,branchRows,teacherRows]=loaded
 return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Phản hồi buổi học</h1><Notice params={params}/><p>Phản hồi nội bộ, chỉ quản trị viên cấp cao được xem. Điểm thấp được đánh dấu bởi database; xử lý phản hồi không thay đổi đánh giá gốc.</p>
 <form className="grid gap-3 sm:grid-cols-3"><Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch}/><Select name="teacher" label="Giáo viên" options={teacherRows.map(t=>({id:t.id,name:t.full_name||t.teacher_code}))} value={params.teacher}/><Select name="rating" label="Điểm tổng thể" options={[1,2,3,4,5].map(n=>({id:String(n),name:String(n)}))} value={params.rating}/><Select name="respondent" label="Người phản hồi" options={respondents} value={params.respondent}/><Select name="status" label="Trạng thái xử lý" options={states} value={params.status}/><Select name="review" label="Cần xử lý" options={[{id:'yes',name:'Chưa xử lý xong'}]} value={params.review}/><Field name="from" label="Buổi học từ ngày" type="date" required={false} value={params.from}/><Field name="to" label="Đến ngày" type="date" required={false} value={params.to}/><button className="rounded border p-2">Lọc phản hồi</button></form>
 <Table headers={['Buổi học','Học viên','Giáo viên','Chi nhánh','Người phản hồi','Điểm','Xử lý']} rows={list.data.map(f=>[<Link key={f.id} prefetch={false} href={'/admin/feedback/'+f.id}>{timeText(f.session_starts_at)}</Link>,f.context_snapshot.student_name+' ('+f.context_snapshot.student_code+')',f.context_snapshot.teacher_name,f.context_snapshot.branch_name,respondents.find(r=>r.id===f.respondent_type)?.name,<span key="rating" className={f.is_low_rating?'font-semibold text-red-800':''}>{f.overall_rating}/5{f.is_low_rating?' • Điểm thấp':''}</span>,states.find(s=>s.id===f.resolution_status)?.name])}/><Pager path="/admin/feedback" params={params} {...list}/>
 </div>
}
