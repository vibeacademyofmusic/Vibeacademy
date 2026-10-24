import type {Shift} from './data'
type Entry={work_date:string;shift_code:string;status:string;checker:string|null;paid_leave_minutes:number;unpaid_leave_minutes:number;late_minutes:number;early_minutes:number;leave_policy_id:string|null}
// Display only: approved current evidence, never requests or historical revisions.
// Payroll remains authoritative and refuses generation while evidence is incomplete.
export function attendanceSummary(schedule:Shift[],entries:Entry[]){
 const total={required:0,payable:0,unpaid:0,absent:0,late:0,early:0,paid:0,trip:0,pending:0}
 for(const s of schedule){
  total.required+=s.scheduled_minutes
  const e=entries.find(e=>e.work_date===s.work_date&&e.shift_code===s.shift_code)
  if(!s.scheduled_minutes)continue
  if(!e?.checker){total.pending++;continue}
  if(e.status==='PAID_LEAVE'&&(!e.leave_policy_id||e.paid_leave_minutes+e.unpaid_leave_minutes!==s.scheduled_minutes)){total.pending++;continue}
  if(!['WORKED','BUSINESS_TRIP','LATE','EARLY_LEAVE','PAID_LEAVE','UNPAID_LEAVE','UNAUTHORIZED_ABSENCE'].includes(e.status)){total.pending++;continue}
  total.late+=e.late_minutes;total.early+=e.early_minutes
  if(['WORKED','BUSINESS_TRIP','LATE','EARLY_LEAVE'].includes(e.status))total.payable+=s.scheduled_minutes
  if(e.status==='PAID_LEAVE'){total.payable+=e.paid_leave_minutes;total.paid+=e.paid_leave_minutes;total.unpaid+=e.unpaid_leave_minutes}
  if(e.status==='UNPAID_LEAVE')total.unpaid+=s.scheduled_minutes
  if(e.status==='UNAUTHORIZED_ABSENCE')total.absent+=s.scheduled_minutes
  if(e.status==='BUSINESS_TRIP')total.trip+=s.scheduled_minutes
 }
 return total
}
