import { adminClient } from '../finance/operations'
import { rows, all } from '../finance/query'
import { Panel, Select, inputClass, timeText } from '../finance/_components/ui'
import { assignSessionTeacher } from './actions'
export default async function SessionTeacher({id,readOnly=false}:{id:string;readOnly?:boolean}) {
 const db=await adminClient()
 const [v]=await rows(db.from('session_actual_teachers').select('teacher_id,primary_teacher_id,assignment_type,reason,assigned_by,assigned_at,is_locked,status,branch_id').eq('session_id',id))
 if(!v) return <p>Chưa xác định giáo viên buổi học.</p>
 const teachers=await all((a,b)=>db.from('teachers').select('id,full_name,teacher_code,status').order('id').range(a,b))
 const name=(id:string)=>teachers.find(t=>t.id===id)?.full_name||teachers.find(t=>t.id===id)?.teacher_code||'Chưa xác định'
 if(readOnly) return <p>Giáo viên buổi học: {name(v.teacher_id)}{v.assignment_type==='SUBSTITUTE'?' • Dạy thay':''}</p>
 const links=await rows(db.from('teacher_branches').select('teacher_id').eq('branch_id',v.branch_id))
 return <Panel title="Giáo viên buổi học"><p>Giáo viên chính của lớp: {name(v.primary_teacher_id)}</p><p>Giáo viên thực tế: {name(v.teacher_id)} • {v.assignment_type==='SUBSTITUTE'?'Dạy thay':v.assignment_type==='OVERRIDE'?'Phân công riêng':'Bình thường'}</p>{v.reason&&<p>Lý do: {v.reason} • Người phân công: {v.assigned_by} • {timeText(v.assigned_at)}</p>}{v.is_locked||v.status!=='SCHEDULED'?<p>Phân công đã khóa. Không thay đổi lịch sử buổi hoàn tất.</p>:<form action={assignSessionTeacher} className="mt-3 space-y-3"><input type="hidden" name="session_id" value={id}/><Select name="teacher_id" label="Đổi giáo viên buổi này (để trống để về giáo viên lớp)" options={teachers.filter(t=>t.status==='ACTIVE'&&links.some(l=>l.teacher_id===t.id)).map(t=>({id:t.id,name:t.full_name||t.teacher_code}))}/><Select name="type" label="Loại phân công" required options={[{id:'SUBSTITUTE',name:'Dạy thay'},{id:'OVERRIDE',name:'Phân công riêng'},{id:'PRIMARY',name:'Giáo viên buổi'}]}/><label className="block">Lý do<input name="reason" required maxLength={2000} className={inputClass}/></label><button className="rounded border p-2">Lưu giáo viên buổi học</button></form>}</Panel>
}
