'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
async function submit(form: FormData, operation: 'attendance' | 'review' | 'trip' | 'tripReview' | 'policy') {
 const db=await createClient(), auth=await db.rpc('has_role',{role_code:'SUPER_ADMIN'})
 if(auth.error || auth.data!==true) redirect('/login')
 const v=(key:string)=>String(form.get(key)??'').trim(), optional=(key:string)=>v(key)||null
 const query=new URLSearchParams({employee:v('employee_id'),month:v('month')})
 if(!v('reason')) redirect('/admin/employees/attendance?error='+encodeURIComponent('Cần nhập lý do'))
 if(operation==='policy'&&(!/^\d+$/.test(v('paid_minutes'))||(v('individual')==='yes'&&!v('employee_id')))) redirect('/admin/employees/attendance?error='+encodeURIComponent('Hạn mức và phạm vi phép không hợp lệ'))
 const stamp=(key:string)=>v(key)? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v(key))?v(key)+':00+07:00':null:null
 if(['arrived_at','departed_at'].some(k=>v(k)&&!stamp(k))) redirect('/admin/employees/attendance?error='+encodeURIComponent('Thời gian không hợp lệ'))
 const result=operation==='attendance'?await db.rpc('request_employee_attendance',{p_employee:v('employee_id'),p_date:v('work_date'),p_shift:v('shift_code'),p_revision:Number(v('revision')),p_status:v('status'),p_arrived:stamp('arrived_at'),p_departed:stamp('departed_at'),p_reason:v('reason'),p_key:v('idempotency_key')}):
 operation==='review'?await db.rpc('review_employee_attendance',{p_request:v('request_id'),p_decision:v('decision'),p_reason:v('reason')}):
 operation==='trip'?await db.rpc('request_employee_trip',{p_employee:v('employee_id'),p_destination:v('destination_unit'),p_branch:v('branch_id'),p_from:v('starts_on'),p_to:v('ends_on'),p_reason:v('reason')}):
 operation==='tripReview'?await db.rpc('review_employee_trip',{p_trip:v('trip_id'),p_decision:v('decision'),p_reason:v('reason')}):
 await db.rpc('configure_employee_leave',{p_unit:v('unit_code'),p_group:optional('employee_group'),p_employee:v('individual')==='yes'?v('employee_id'):null,p_from:v('starts_on'),p_to:v('ends_on'),p_minutes:Number(v('paid_minutes')),p_reason:v('reason')})
 if(result.error)query.set('error',result.error.message)
 else{revalidatePath('/admin/employees/attendance');query.set('success','Đã lưu và giữ lịch sử. Yêu cầu cần người khác phê duyệt mới có hiệu lực.')}
 redirect('/admin/employees/attendance?'+query)
}
export async function requestAttendance(form:FormData){await submit(form,'attendance')}
export async function reviewAttendance(form:FormData){await submit(form,'review')}
export async function requestTrip(form:FormData){await submit(form,'trip')}
export async function reviewTrip(form:FormData){await submit(form,'tripReview')}
export async function configureLeave(form:FormData){await submit(form,'policy')}
