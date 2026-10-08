import {createClient} from '@/lib/supabase/server'
import {attendanceData} from '../attendance/data'
import {Field,Select,Panel,Table,Notice,LoadError,dateText,timeText} from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import type {Params} from '../../finance/operations'
import {configureLeave} from '../attendance/actions'
export default async function LeavePolicies({searchParams}:{searchParams:Promise<Params>}){
 const p=await searchParams,db=await createClient();let data
 try{data=await attendanceData(db,p,'policy')}catch{return <LoadError/>}
 const context=<><input type="hidden" name="employee_id" value={p.employee||''}/><input type="hidden" name="month" value={data.month}/><input type="hidden" name="unit" value={p.unit||''}/></>
 const unitOptions=data.units.map((u:{code:string;name:string})=>({id:u.code,name:u.code+' — '+u.name}))
 return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Chính sách nghỉ phép</h1><Notice params={p}/><p>Cấu hình hạn mức, không tạo yêu cầu nghỉ hay kết quả chấm công. Chính sách đã lưu giữ nguyên lịch sử; kỳ hiệu lực mới không được chồng lấn cùng phạm vi.</p>
 <form className="grid gap-3 sm:grid-cols-3"><Select name="employee" label="Nhân viên cho hạn mức cá nhân" options={data.employees.map((e:{id:string;employee_code:string;full_name:string|null})=>({id:e.id,name:e.employee_code+' — '+(e.full_name||'Chưa hiệu lực')}))} value={p.employee}/><Field name="month" label="Tháng xem chính sách" type="month" value={data.month}/><button className="rounded border p-2">Xem chính sách</button></form>
 <Panel title="Chính sách nghỉ phép"><p>Admin khai báo hạn mức theo phút trong khoảng hiệu lực cụ thể. Không tự đặt hạn mức HQ. Đối với nhân viên thường xuyên ST/LX, khai báo hạn mức thông thường 0 theo chính sách đã chốt; nghỉ Chủ nhật không tiêu phép. Phần vượt hạn mức được ghi riêng là phép không lương.</p>
 <form action={configureLeave} className="grid gap-3 sm:grid-cols-2">{context}<Select name="unit_code" label="Đơn vị áp dụng phép" required options={unitOptions}/><Field name="employee_group" label="Nhóm áp dụng (trống = mọi nhóm)" required={false}/><Select name="individual" label="Phạm vi nhân viên" options={[{id:'yes',name:'Chỉ nhân viên đang chọn'}]} emptyLabel="Theo đơn vị / nhóm"/><Field name="starts_on" label="Hạn mức từ ngày" type="date"/><Field name="ends_on" label="Hạn mức đến ngày" type="date"/><Field name="paid_minutes" label="Hạn mức phép có lương (phút, cho phép 0)"/><Field name="reason" label="Căn cứ chính sách phép"/><SubmitButton>Lưu chính sách phép</SubmitButton></form>
 <Table headers={['Đơn vị','Nhóm','Cá nhân','Từ / đến','Hạn mức phút','Căn cứ','Người lập','Ngày tạo']} rows={data.policies.map((l:{unit_code:string;employee_group:string|null;employee_id:string|null;starts_on:string;ends_on:string;paid_minutes:number;reason:string;actor:string;created_at:string})=>[l.unit_code,l.employee_group||'Mọi nhóm',l.employee_id?(data.employees.find((e:{id:string})=>e.id===l.employee_id)?.employee_code||'Nhân viên ngoài danh sách hiện tại'):'Theo đơn vị / nhóm',dateText(l.starts_on)+' – '+dateText(l.ends_on),l.paid_minutes,l.reason,data.personNames[l.actor]||'Tài khoản quản trị',timeText(l.created_at)])}/></Panel><p>Hiển thị tối đa 100 chính sách giao với tháng đang chọn. Chọn tháng cũ để xem lịch sử hiệu lực.</p></div>
}
