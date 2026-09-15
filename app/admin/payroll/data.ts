import { rows, type DB } from '../finance/query'
import { pageNumber, uuidPattern, type Params } from '../finance/operations'
export const states=['DRAFT','GENERATED','REVIEW','APPROVED','FINALIZED'].map((id,i)=>({id,name:['Bản nháp','Đã tính','Đang kiểm tra','Đã duyệt','Đã chốt'][i]}))
export const payTypes=[{id:'MONTHLY',name:'Lương tháng'},{id:'HOURLY',name:'Theo giờ'}]
export const money=(value:number|string,currency:string)=>`${Number(value).toLocaleString('vi-VN',{maximumFractionDigits:2})} ${currency}`
export type Period={id:string;branch_id:string;starts_on:string;ends_on:string;status:string;version:number;generated_by:string|null;approved_by:string|null;finalized_by:string|null}
export type Payroll={id:string;period_id:string;teacher_id:string;branch_id:string;teacher_name:string;pay_type:string;currency:string;base_salary:number;teaching_hours:number;hourly_earnings:number;adjustment_amount:number;gross_amount:number}
export type Summary=Period & {currency:string|null;teacher_count:number;gross_amount:number;monthly_total:number;hourly_total:number;adjustments:number}
export const payrollFields='id,period_id,teacher_id,branch_id,teacher_name,pay_type,currency,base_salary,teaching_hours,hourly_earnings,adjustment_amount,gross_amount'
export async function periods(db:DB,p:Params) {
 const page=pageNumber(p.page)
 let q=db.from('payroll_period_summary').select('id,branch_id,starts_on,ends_on,status,currency,teacher_count,gross_amount,monthly_total,hourly_total,adjustments')
 if(uuidPattern.test(p.branch||'')) q=q.eq('branch_id',p.branch!)
 if(states.some(s=>s.id===p.status)) q=q.eq('status',p.status!)
 if(/^\d{4}-(0[1-9]|1[0-2])$/.test(p.month||'')) q=q.eq('starts_on',p.month+'-01')
 const data=await rows(q.order('starts_on',{ascending:false}).order('id').order('currency').range((page-1)*25,page*25).returns<Summary[]>())
 return {data:data.slice(0,25),page,more:data.length>25}
}
export async function period(db:DB,id:string) {
 if(!uuidPattern.test(id)) return null
 return (await rows(db.from('payroll_periods').select('id,branch_id,starts_on,ends_on,status,version,generated_by,approved_by,finalized_by').eq('id',id).returns<Period[]>()))[0]||null
}
export async function payrollList(db:DB,id:string,p:Params) {
 const page=pageNumber(p.page)
 let q=db.from('teacher_payrolls').select(payrollFields).eq('period_id',id)
 if(uuidPattern.test(p.teacher||'')) q=q.eq('teacher_id',p.teacher!)
 if(payTypes.some(t=>t.id===p.type)) q=q.eq('pay_type',p.type!)
 const data=await rows(q.order('teacher_name').order('id').range((page-1)*25,page*25).returns<Payroll[]>())
 return {data:data.slice(0,25),page,more:data.length>25}
}
