'use server'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern } from '../../finance/operations'
export type Preview = { version:number; status:string; fingerprint:string; blocked:boolean; issues:string[]; rows:{employee_id:string;name:string;currency:string;current:string|null;projected:string|null;delta:string|null;issues:string[]}[] }
export async function previewPayroll(period:string):Promise<{data?:Preview;error?:string}> {
 const db=await adminClient()
 if(!uuidPattern.test(period))return {error:'Kỳ lương không hợp lệ.'}
 const result=await db.rpc('preview_staff_payroll_v2',{p_period:period})
 if(result.error)return {error:'Chưa tải được bản xem thử. Kiểm tra quyền và migration xem trước; chưa có dữ liệu nào thay đổi.'}
 return {data:result.data as Preview}
}
export async function confirmPayroll(period:string,version:number,fingerprint:string):Promise<{error?:string;ok?:boolean}> {
 const db=await adminClient()
 if(!uuidPattern.test(period)||!Number.isSafeInteger(version)||!/^[a-f0-9]{32}$/.test(fingerprint))return {error:'Bản xem thử không hợp lệ; tải lại.'}
 const result=await db.rpc('confirm_staff_payroll_v2',{p_period:period,p_version:version,p_fingerprint:fingerprint})
 if(result.error)return {error:result.error.message==='PAYROLL_PREVIEW_CHANGED_RELOAD'?'Nguồn hoặc phiên bản đã thay đổi. Xem chênh lệch lại trước khi xác nhận.':'Chưa thể tính lại: '+result.error.message}
 revalidatePath('/admin/payroll/'+period);revalidatePath('/admin/payroll');revalidatePath('/admin/hr')
 return {ok:true}
}
