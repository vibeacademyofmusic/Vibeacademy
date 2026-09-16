import Link from 'next/link'
import {randomUUID} from 'node:crypto'
import {createClient} from '@/lib/supabase/server'
import {attendanceData,attendanceStates,isLeave} from '../attendance/data'
import {requestLeave,reviewLeave} from '../attendance/actions'
import {Field,Select,Panel,Table,Notice,LoadError,dateText,timeText} from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import type {Params} from '../../finance/operations'
export default async function LeaveRequests({searchParams}:{searchParams:Promise<Params>}){
 const p=await searchParams,db=await createClient();let data
 try{data=await attendanceData(db,p,'leave')}catch{return <LoadError/>}
 const chosen=data.schedule.find(s=>s.work_date===p.day&&s.shift_code===p.shift)
 const previous=data.entries.find((e:{work_date:string;shift_code:string})=>e.work_date===p.day&&e.shift_code===p.shift)
 const context=<><input type="hidden" name="employee_id" value={p.employee||''}/><input type="hidden" name="month" value={data.month}/><input type="hidden" name="unit" value={p.unit||''}/></>
 const decisionLabel=(value:string)=>value==='APPROVED'?'Đã duyệt':value==='REJECTED'?'Đã từ chối':'Chờ duyệt'
 return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Yêu cầu nghỉ phép</h1><Notice params={p}/>
 <p>Admin lập yêu cầu theo ca và người khác duyệt. Chỉ yêu cầu đã duyệt mới cập nhật chấm công. Hiện hỗ trợ ghi nhận nghỉ nguyên ca đã diễn ra; chưa hỗ trợ xin nghỉ ngày tương lai, nghỉ một phần ca hay nhân viên tự gửi đơn.</p>
 <form className="grid gap-3 sm:grid-cols-4"><Select name="employee" label="Nhân viên" required value={p.employee} options={data.employees.map((e:{id:string;employee_code:string;full_name:string|null})=>({id:e.id,name:e.employee_code+' — '+(e.full_name||'Chưa hiệu lực')}))}/><Field name="month" label="Tháng nghỉ phép" type="month" value={data.month}/><Select name="unit" label="Đơn vị của ca" value={p.unit} options={data.units.map((u:{code:string;name:string})=>({id:u.code,name:u.code+' — '+u.name}))}/><button className="rounded border p-2">Xem yêu cầu nghỉ phép</button></form>
 {!p.employee?<p>Chọn nhân viên để xem yêu cầu nghỉ phép.</p>:<>
 <Panel title="Chọn ca nghỉ"><Table headers={['Ngày','Ca','Đơn vị','Giờ Việt Nam','Phút theo ca','Thao tác']} rows={data.schedule.filter(s=>s.scheduled_minutes>0).map(s=>[dateText(s.work_date),s.shift_code==='AM'?'Sáng':'Chiều',s.unit_code,timeText(s.starts_at)+' – '+timeText(s.ends_at),s.scheduled_minutes,<Link key={s.work_date+s.shift_code} prefetch={false} className="underline" href={'?'+new URLSearchParams({employee:p.employee!,month:data.month,unit:p.unit||'',day:s.work_date,shift:s.shift_code})}>Chọn ca</Link>])}/></Panel>
 {chosen&&chosen.scheduled_minutes>0&&<Panel title={'Yêu cầu nghỉ ngày '+dateText(chosen.work_date)+' • '+(chosen.shift_code==='AM'?'Sáng':'Chiều')}>
 <p>Yêu cầu {chosen.scheduled_minutes} phút theo ca. Phép có lương được duyệt theo hạn mức còn lại; phần vượt hạn mức là nghỉ không lương.</p>
 <form action={requestLeave} className="grid gap-3 sm:grid-cols-2">{context}<input type="hidden" name="work_date" value={chosen.work_date}/><input type="hidden" name="shift_code" value={chosen.shift_code}/><input type="hidden" name="revision" value={previous?.revision||0}/><input type="hidden" name="idempotency_key" value={randomUUID()}/><Select name="status" label="Loại nghỉ phép" required options={attendanceStates.filter(s=>isLeave(s.id))}/><Field name="reason" label="Lý do xin nghỉ / chỉnh sửa"/><SubmitButton>Gửi yêu cầu nghỉ phép</SubmitButton></form></Panel>}
 <Panel title="Yêu cầu nghỉ phép (100 gần nhất)"><Table headers={['Ngày / ca','Loại / phút yêu cầu','Người lập / gửi lúc','Lý do','Trạng thái / kết quả','Duyệt']} rows={data.requests.map((r:{id:string;work_date:string;shift_code:string;proposed_status:string;created_at:string;maker:string;reason:string;schedule_snapshot:{scheduled_minutes:number}})=>{
 const review=data.reviews.find((v:{request_id:string})=>v.request_id===r.id)
 const outcome=data.entries.find((e:{request_id:string})=>e.request_id===r.id)
 return [dateText(r.work_date)+' '+(r.shift_code==='AM'?'Sáng':'Chiều'),(r.proposed_status==='PAID_LEAVE'?'Phép theo hạn mức':'Không lương')+' / '+r.schedule_snapshot.scheduled_minutes+' phút',(data.personNames[r.maker]||'Tài khoản quản trị')+' • '+timeText(r.created_at),r.reason,decisionLabel(review?.decision)+(outcome?` • ${outcome.paid_leave_minutes} phút có lương / ${outcome.unpaid_leave_minutes} phút không lương`:review?.decision==='APPROVED'?' • Xem phiên bản đã duyệt trong lịch sử':''),review?<span>{data.personNames[review.checker]||'Tài khoản quản trị'} • {review.reason} • {timeText(review.created_at)}</span>:<form key={r.id} action={reviewLeave} className="min-w-48 space-y-2">{context}<input type="hidden" name="request_id" value={r.id}/><Select name="decision" label="Quyết định nghỉ phép" required options={[{id:'APPROVED',name:'Phê duyệt'},{id:'REJECTED',name:'Từ chối'}]}/><Field name="reason" label="Căn cứ duyệt / từ chối"/><SubmitButton>Duyệt yêu cầu nghỉ phép</SubmitButton></form>]
 })}/></Panel>
 <Panel title="Lịch sử kết quả nghỉ phép (trong 100 phiên bản gần nhất)"><Table headers={['Ngày / ca','Phiên bản','Kết quả','Lý do']} rows={data.history.filter((h:{status:string})=>isLeave(h.status)).map((h:{work_date:string;shift_code:string;revision:number;status:string;reason:string})=>[dateText(h.work_date)+' '+h.shift_code,h.revision,h.status==='PAID_LEAVE'?'Phép theo hạn mức':'Không lương',h.reason])}/></Panel>
 <Link prefetch={false} className="underline" href={'/admin/employees/attendance?'+new URLSearchParams({employee:p.employee,month:data.month})}>Xem kết quả chấm công đã duyệt</Link>
 </>}
 </div>
}
