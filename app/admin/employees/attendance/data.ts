import type {SupabaseClient} from '@supabase/supabase-js'
import type {Params} from '../../finance/operations'
export const attendanceStates=[{id:'WORKED',name:'Đã làm việc'},{id:'SCHEDULED_OFF',name:'Nghỉ theo lịch'},{id:'PAID_LEAVE',name:'Nghỉ phép có lương (theo hạn mức)'},{id:'UNPAID_LEAVE',name:'Nghỉ không lương'},{id:'UNAUTHORIZED_ABSENCE',name:'Vắng không phép'},{id:'BUSINESS_TRIP',name:'Công tác'},{id:'LATE',name:'Đi muộn'},{id:'EARLY_LEAVE',name:'Về sớm'}]
export function monthRange(input?:string){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(new Date())
 const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(input||'')?input!:today
 const [year,m]=month.split('-').map(Number)
 return {month,from:month+'-01',to:month+'-'+new Date(Date.UTC(year,m,0)).getUTCDate()}
}
export type Shift={work_date:string;shift_code:string;unit_code:string;employment_version:number;starts_at:string;ends_at:string;scheduled_minutes:number;schedule_state:string;trip_id:string|null}
export async function attendanceData(db:SupabaseClient,p:Params){
 const range=monthRange(p.month)
 const result=await Promise.all([
 db.from('employee_directory').select('id,employee_code,full_name').order('employee_code').limit(100),
 db.from('organization_units').select('code,name,branch_id').order('code'),
 p.employee?db.rpc('employee_schedule',{p_employee:p.employee,p_from:range.from,p_to:range.to}):Promise.resolve({data:[],error:null}),
 p.employee?db.from('employee_attendance_current').select('*').eq('employee_id',p.employee).gte('work_date',range.from).lte('work_date',range.to).order('work_date').order('shift_code'):Promise.resolve({data:[],error:null}),
 p.employee?db.from('employee_attendance_requests').select('*').eq('employee_id',p.employee).gte('work_date',range.from).lte('work_date',range.to).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
 p.employee?db.from('employee_trips').select('*').eq('employee_id',p.employee).lte('starts_on',range.to).gte('ends_on',range.from).order('starts_on'):Promise.resolve({data:[],error:null}),
 db.from('employee_leave_policies').select('*').lte('starts_on',range.to).gte('ends_on',range.from).order('starts_on',{ascending:false}).limit(100),
 p.employee?db.from('employee_attendance_entries').select('id,work_date,shift_code,revision,status,entry_kind,reason,actor,checker,created_at').eq('employee_id',p.employee).gte('work_date',range.from).lte('work_date',range.to).order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
 ])
 if(result.some(x=>x.error))throw new Error('Attendance data unavailable')
 const [employees,units,schedule,entries,requests,trips,policies,history]=result.map(x=>x.data||[])
 const reviews=await Promise.all([requests.length?db.from('employee_attendance_reviews').select('request_id,decision,checker').in('request_id',requests.map((r:{id:string})=>r.id)):Promise.resolve({data:[],error:null}),trips.length?db.from('employee_trip_reviews').select('trip_id,decision,checker').in('trip_id',trips.map((r:{id:string})=>r.id)):Promise.resolve({data:[],error:null})])
 if(reviews.some(x=>x.error))throw new Error('Review data unavailable')
 return {...range,employees,units,schedule:(schedule as Shift[]).filter(s=>!p.unit||s.unit_code===p.unit),entries,requests,trips,policies,history,reviews:reviews[0].data||[],tripReviews:reviews[1].data||[]}
}
