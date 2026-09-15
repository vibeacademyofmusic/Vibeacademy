import Link from 'next/link'
import { adminClient, pageNumber, uuidPattern, validDate, type Params } from '../finance/operations'
import { rows } from '../finance/query'
import { teachers } from '../feedback/data'
import { Table, Select, Field, Pager, timeText } from '../finance/_components/ui'
export default async function TeacherSchedule({searchParams}:{searchParams:Promise<Params>}) {
 const p=await searchParams,db=await adminClient(),page=pageNumber(p.page)
 const from=validDate(p.from||'')?p.from!:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date())
 let q=db.from('session_actual_teachers').select('session_id,class_id,branch_id,starts_at,teacher_id,assignment_type,status').gte('occurrence_date',from)
 if(uuidPattern.test(p.teacher||'')) q=q.eq('teacher_id',p.teacher!)
 const [sessions,ts]=await Promise.all([rows(q.order('starts_at').order('session_id').range((page-1)*25,page*25)),teachers(db)])
 return <div className="space-y-5"><h1 className="text-3xl font-bold">Lịch giáo viên theo buổi</h1><form className="grid gap-3 sm:grid-cols-3"><Select name="teacher" label="Giáo viên thực tế" options={ts.map(t=>({id:t.id,name:t.full_name||t.teacher_code}))} value={p.teacher}/><Field name="from" label="Từ ngày" type="date" value={from}/><button>Lọc lịch</button></form><Table headers={['Buổi học','Giáo viên','Phân công','Trạng thái']} rows={sessions.slice(0,25).map(s=>[<Link prefetch={false} key={s.session_id} href={'/admin/attendance/'+s.session_id}>{timeText(s.starts_at)}</Link>,ts.find(t=>t.id===s.teacher_id)?.full_name||'Chưa xác định',s.assignment_type==='SUBSTITUTE'?'Dạy thay':s.assignment_type,s.status])}/><Pager path="/admin/session-teachers" params={p} page={page} more={sessions.length>25}/></div>
}
