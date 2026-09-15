'use server'
import { financeContext } from '../../finance/authorization'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { adminClient, uuidPattern, validDate } from '../finance/operations'
export async function payrollAction(form:FormData) {
 const get=(key:string)=>String(form.get(key)??'').trim()
 const db=get('action')==='transition'?(await financeContext()).db:await adminClient()
 const action=get('action'),pid=get('period'),teacher=get('teacher'),note=get('note')
 const args:Record<string,string|number|null>={}
 let rpc='',error=''
 const uid=(s:string)=>uuidPattern.test(s),amount=(s:string)=>/^-?\d{1,12}(\.\d{1,2})?$/.test(s)&&Number(s)!==0
 if(action==='create'&&uid(get('branch'))&&validDate(get('month')+'-01')) {rpc='create_payroll_period';Object.assign(args,{p_branch:get('branch'),p_month:get('month')+'-01'})}
 else if(action==='rule'&&uid(teacher)&&uid(get('branch'))&&['HOURLY','MONTHLY'].includes(get('type'))&&amount(get('rate'))&&Number(get('rate'))>0&&/^[A-Z]{3}$/.test(get('currency'))&&validDate(get('from'))&&(!get('to')||(validDate(get('to'))&&get('to')>=get('from')))) {rpc='add_compensation_rule';Object.assign(args,{p_teacher:teacher,p_branch:get('branch'),p_type:get('type'),p_rate:get('rate'),p_currency:get('currency'),p_from:get('from'),p_to:get('to')||null})}
 else if(action==='generate'&&uid(pid)) {rpc='generate_teacher_payroll';args.p_period=pid}
 else if(action==='transition'&&uid(pid)&&['DRAFT','REVIEW','APPROVED','FINALIZED'].includes(get('status'))&&/^\d+$/.test(get('version'))&&Number(get('version'))>0&&note&&note.length<=2000&&get('confirm')==='yes') {rpc='transition_payroll';Object.assign(args,{p_period:pid,p_version:Number(get('version')),p_status:get('status'),p_note:note}); if(get('override_type')||get('override_reason')) { if(['APPROVED','FINALIZED'].includes(get('status'))&&get('override_type')==='MAKER_CHECKER_EMERGENCY'&&get('override_reason')&&get('override_reason').length<=2000) {rpc='transition_payroll_with_override';Object.assign(args,{p_override_type:get('override_type'),p_override_reason:get('override_reason')})} else {rpc='';error='Ngoại lệ khẩn cấp cần đúng loại và lý do rõ ràng.'} }}
 else if(action==='adjust'&&uid(get('payroll'))&&uid(pid)&&['BONUS','DEDUCTION','CORRECTION'].includes(get('kind'))&&amount(get('amount'))&&note&&note.length<=2000) {rpc='add_payroll_adjustment';Object.assign(args,{p_payroll:get('payroll'),p_kind:get('kind'),p_amount:get('amount'),p_reason:note})}
 else error='Vui lòng kiểm tra dữ liệu, ngày hiệu lực và xác nhận.'
 const base=get('workspace')==='finance'?'/finance/payroll':'/admin/payroll'
 let destination=uid(pid)?base+'/'+pid:base
 if(rpc) {
  try {const result=await db.rpc(rpc,args);if(result.error) {
   const messages:Record<string,string>={
    'Payroll maker cannot approve or finalize':'Người tính lương hoặc thêm điều chỉnh không được tự duyệt/chốt. Hãy nhờ người có quyền khác kiểm tra.',
    'Valid SUPER_ADMIN emergency override reason and type required':'Ngoại lệ khẩn cấp chỉ dành cho SUPER_ADMIN, bắt buộc loại ngoại lệ và lý do.',
    'Completed session has unresolved teacher or compensation':'Có buổi hoàn tất chưa xác định giáo viên hoặc thiếu mức lương đúng ngày. Hãy bổ sung nguồn rồi tính lại.',
    'Monthly rule must cover full period; pay type and currency cannot change within period':'Lương tháng phải phủ trọn kỳ; không đổi loại lương hoặc tiền tệ giữa kỳ.',
    'Compensation dates overlap':'Ngày hiệu lực bị trùng với mức lương đang có.',
    'Payroll with adjustments cannot return to draft':'Đã có điều chỉnh: hãy thêm khoản sửa sai, không quay về bản nháp.',
    'Invalid teacher branch':'Giáo viên phải hoạt động và thuộc chi nhánh.',
   }
   error=messages[result.error.message]||'Không thể thực hiện. Hãy tải lại và kiểm tra trạng thái bảng lương.'
  } else if(action==='create'&&typeof result.data==='string'&&uid(result.data)) destination+='/'+result.data
  } catch {error='Chưa xác nhận được kết quả. Hãy tải lại trước khi thử lại.'}
 }
 revalidatePath('/admin/payroll','layout')
 revalidatePath('/finance','layout')
 redirect(destination+'?'+new URLSearchParams(error?{error}:{success:'Đã lưu thao tác bảng lương.'}))
}
