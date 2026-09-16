import Link from 'next/link'
import {randomUUID} from 'node:crypto'
import {createClient} from '@/lib/supabase/server'
import {attendanceData,attendanceStates,isLeave} from './data'
import {requestAttendance,reviewAttendance,requestTrip,reviewTrip} from './actions'
import {Field,Select,Panel,Table,Notice,LoadError,dateText,timeText} from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import {attendanceSummary} from './summary'
import type {Params} from '../../finance/operations'
export default async function EmployeeAttendance({searchParams}:{searchParams:Promise<Params>}){
 const p=await searchParams,db=await createClient();let data
 try{data=await attendanceData(db,p)}catch{return <LoadError/>}
 const summary=attendanceSummary(data.schedule,data.entries)
 const context=<><input type="hidden" name="employee_id" value={p.employee||''}/><input type="hidden" name="month" value={data.month}/><input type="hidden" name="unit" value={p.unit||''}/></>
 const unitOptions=data.units.map((u:{code:string;name:string})=>({id:u.code,name:u.code+' — '+u.name}))
 const chosen=data.schedule.find(s=>s.work_date===p.day&&s.shift_code===p.shift)
 const previous=data.entries.find((e:{work_date:string;shift_code:string})=>e.work_date===p.day&&e.shift_code===p.shift)
 const label=(state:string)=>attendanceStates.find(s=>s.id===state)?.name||state
 return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Chấm công nhân viên</h1><Notice params={p}/>
 <p>Chấm công theo từng ca, tách khỏi điểm danh học viên. Phút đi muộn/về sớm là bằng chứng; chưa tự quy đổi thành khoản trừ lương.</p>
 <form className="grid gap-3 sm:grid-cols-4"><Select name="employee" label="Nhân viên" required options={data.employees.map((e:{id:string;employee_code:string;full_name:string|null})=>({id:e.id,name:e.employee_code+' — '+(e.full_name||'Chưa hiệu lực')}))} value={p.employee}/><Field name="month" label="Tháng chấm công" type="month" value={data.month}/><Select name="unit" label="Đơn vị của ca" options={unitOptions} value={p.unit}/><button className="self-end rounded border p-2">Xem lịch chấm công</button></form>
 {!p.employee?<p>Chọn nhân viên để xem các ca trong tháng.</p>:<>
 <Panel title="Tổng hợp tháng theo ca đang lọc"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
 ['Tổng phút theo lịch phải làm',summary.required],['Phút được tính lương đã có bằng chứng',summary.payable],['Phút nghỉ không lương',summary.unpaid],['Phút vắng không phép',summary.absent],['Phút đi muộn',summary.late],['Phút về sớm',summary.early],['Phút nghỉ phép có lương',summary.paid],['Phút công tác đã ghi nhận',summary.trip]
 ].map(([name,value])=><div key={name}><dt>{name}</dt><dd className="font-semibold">{value}</dd></div>)}</dl><p>Còn {summary.pending} ca thiếu bằng chứng hợp lệ. Tổng này không phải bảng lương đã duyệt; Payroll kiểm tra đầy đủ kỳ khi tạo lương.</p></Panel>
 <Panel title="Lịch tháng và kết quả đã duyệt"><p>Ca chưa có bằng chứng vẫn là “Chưa ghi nhận”, không tự tính đã làm hay vắng mặt. Chủ nhật ST/LX là nghỉ theo lịch.</p>
 <Table headers={['Ngày','Ca','Đơn vị','Lịch Việt Nam','Thực tế','Phút lịch','Kết quả','Muộn / sớm','Lịch sử','Chi tiết']} rows={data.schedule.map(s=>{
 const e=data.entries.find((e:{work_date:string;shift_code:string})=>e.work_date===s.work_date&&e.shift_code===s.shift_code)
 return [dateText(s.work_date),s.shift_code==='AM'?'Sáng':'Chiều',s.unit_code,timeText(s.starts_at)+' – '+timeText(s.ends_at),e?(e.arrived_at?timeText(e.arrived_at):'Chưa có giờ đến')+' – '+(e.departed_at?timeText(e.departed_at):'Chưa có giờ về'):'—',s.scheduled_minutes,e?(e.status==='PAID_LEAVE'?`Phép: ${e.paid_leave_minutes} phút có lương / ${e.unpaid_leave_minutes} phút không lương`:label(e.status)):s.schedule_state==='SCHEDULED_OFF'?'Nghỉ theo lịch':'Chưa ghi nhận',e?`${e.late_minutes} / ${e.early_minutes} phút`:'—',e?.entry_kind==='MANUAL_CORRECTION'?'Đã chỉnh sửa • bản '+e.revision:e?'Bản '+e.revision:'—',<Link key={s.work_date+s.shift_code} prefetch={false} className="underline" href={'?'+new URLSearchParams({employee:p.employee!,month:data.month,unit:p.unit||'',day:s.work_date,shift:s.shift_code})}>Chi tiết / ghi nhận</Link>]
 })}/></Panel>
 {chosen&&<Panel title={'Ca '+chosen.shift_code+' ngày '+dateText(chosen.work_date)}><p>Đi muộn: {previous?.late_minutes||0} phút • Về sớm: {previous?.early_minutes||0} phút • Phép có lương: {previous?.paid_leave_minutes||0} phút • Phép không lương: {previous?.unpaid_leave_minutes||0} phút.</p>
 <p>Nghỉ phép phải được gửi và duyệt tại <Link prefetch={false} className="underline" href={'/admin/employees/leave-requests?'+new URLSearchParams({employee:p.employee!,month:data.month,day:chosen.work_date,shift:chosen.shift_code})}>Yêu cầu nghỉ phép</Link>. Mọi thay đổi kết quả hiện tại đều cần người khác duyệt.</p><form action={requestAttendance} className="grid gap-3 sm:grid-cols-2">{context}<input type="hidden" name="work_date" value={chosen.work_date}/><input type="hidden" name="shift_code" value={chosen.shift_code}/><input type="hidden" name="revision" value={previous?.revision||0}/><input type="hidden" name="idempotency_key" value={randomUUID()}/><Select name="status" label="Kết quả chấm công" required options={attendanceStates.filter(s=>!isLeave(s.id))} value={previous&&!isLeave(previous.status)?previous.status:undefined}/><Field name="arrived_at" label="Thời gian đến (giờ Việt Nam)" type="datetime-local" required={false}/><Field name="departed_at" label="Thời gian về (giờ Việt Nam)" type="datetime-local" required={false}/><Field name="reason" label="Căn cứ ghi nhận / chỉnh sửa"/><SubmitButton>Gửi chấm công để duyệt</SubmitButton></form><p>Cần người khác duyệt. Sửa chấm công tạo phiên bản mới, giữ nguyên bản gốc.</p></Panel>}
 <Panel title="Yêu cầu chấm công trong tháng (100 gần nhất)"><Table headers={['Ngày / ca','Đề nghị','Căn cứ','Người lập','Duyệt']} rows={data.requests.map((r:{id:string;work_date:string;shift_code:string;proposed_status:string;reason:string;maker:string})=>{
 const review=data.reviews.find((v:{request_id:string})=>v.request_id===r.id)
 return [dateText(r.work_date)+' '+r.shift_code,label(r.proposed_status),r.reason,data.personNames[r.maker]||'Tài khoản quản trị',review?review.decision:<form key={r.id} action={reviewAttendance} className="min-w-48 space-y-2">{context}<input type="hidden" name="request_id" value={r.id}/><Select name="decision" label="Quyết định chấm công" required options={[{id:'APPROVED',name:'Phê duyệt'},{id:'REJECTED',name:'Từ chối'}]}/><Field name="reason" label="Căn cứ duyệt chấm công"/><SubmitButton>Duyệt chấm công</SubmitButton></form>]
 })}/></Panel>
 <Panel title="Công tác"><p>Công tác HQ đến chi nhánh đã duyệt: Chủ nhật chỉ yêu cầu 14:00–18:00. Không tự đổi lịch khi yêu cầu chưa duyệt.</p>
 <form action={requestTrip} className="grid gap-3 sm:grid-cols-2">{context}<Select name="destination_unit" label="Đơn vị đến" required options={unitOptions}/><Select name="branch_id" label="Chi nhánh đã liên kết đơn vị đến" required options={data.units.filter((u:{branch_id:string|null})=>u.branch_id).map((u:{branch_id:string;name:string})=>({id:u.branch_id,name:u.name}))}/><Field name="starts_on" label="Ngày bắt đầu công tác" type="date"/><Field name="ends_on" label="Ngày kết thúc công tác" type="date"/><Field name="reason" label="Mục đích công tác"/><SubmitButton>Gửi công tác để duyệt</SubmitButton></form>
 <Table headers={['Từ / đến','Đơn vị','Lý do','Duyệt']} rows={data.trips.map((t:{id:string;starts_on:string;ends_on:string;origin_unit:string;destination_unit:string;reason:string})=>{
 const r=data.tripReviews.find((r:{trip_id:string})=>r.trip_id===t.id)
 return [dateText(t.starts_on)+' – '+dateText(t.ends_on),t.origin_unit+' → '+t.destination_unit,t.reason,r?r.decision:<form key={t.id} action={reviewTrip} className="space-y-2">{context}<input type="hidden" name="trip_id" value={t.id}/><Select name="decision" label="Quyết định công tác" required options={[{id:'APPROVED',name:'Phê duyệt'},{id:'REJECTED',name:'Từ chối'}]}/><Field name="reason" label="Căn cứ duyệt công tác"/><SubmitButton>Duyệt công tác</SubmitButton></form>]
 })}/></Panel>
 <Panel title="Lịch sử chấm công (100 gần nhất)"><Table headers={['Ngày / ca','Phiên bản','Kết quả','Loại','Lý do','Người lập / duyệt']} rows={data.history.map((h:{work_date:string;shift_code:string;revision:number;status:string;entry_kind:string;reason:string;actor:string;checker:string})=>[dateText(h.work_date)+' '+h.shift_code,h.revision,label(h.status),h.entry_kind==='MANUAL_CORRECTION'?'Chỉnh sửa có lịch sử':'Ghi nhận ban đầu',h.reason,(data.personNames[h.actor]||'Tài khoản quản trị')+' / '+(data.personNames[h.checker]||'Tài khoản quản trị')])}/></Panel>
 </>}

 </div>
}
