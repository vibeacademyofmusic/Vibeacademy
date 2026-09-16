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
 else if(action==='employee_rule'&&uid(get('employee'))&&uid(get('branch'))&&amount(get('rate'))&&Number(get('rate'))>0&&/^[A-Z]{3}$/.test(get('currency'))&&validDate(get('from'))&&(!get('to')||(validDate(get('to'))&&get('to')>=get('from')))) {rpc='add_employee_compensation_rule';Object.assign(args,{p_employee:get('employee'),p_branch:get('branch'),p_rate:get('rate'),p_currency:get('currency'),p_from:get('from'),p_to:get('to')||null})}
 else if(action==='session_rule'&&uid(teacher)&&uid(get('branch'))&&['ONE_ON_ONE','GROUP'].includes(get('class_type'))&&amount(get('rate'))&&Number(get('rate'))>0&&/^[A-Z]{3}$/.test(get('currency'))&&validDate(get('from'))&&(!get('to')||(validDate(get('to'))&&get('to')>=get('from')))) {rpc='add_session_compensation_rule';Object.assign(args,{p_teacher:teacher,p_branch:get('branch'),p_class_type:get('class_type'),p_rate:get('rate'),p_currency:get('currency'),p_from:get('from'),p_to:get('to')||null})}
 else if(action==='trip_costs'&&uid(get('payroll'))&&uid(pid)&&uid(get('trip'))&&uid(get('key'))&&['allowance','transport','lodging'].every(k=>/^\d{1,12}(\.\d{1,2})?$/.test(get(k)))&&note&&note.length<=2000) {rpc='add_payroll_trip_costs';Object.assign(args,{p_payroll:get('payroll'),p_trip:get('trip'),p_allowance:get('allowance'),p_transport:get('transport'),p_lodging:get('lodging'),p_reason:note,p_key:get('key')})}
 else if(action==='evidence_adjust'&&uid(get('payroll'))&&uid(pid)&&uid(get('key'))&&['BONUS','DEDUCTION','CORRECTION','TRAVEL_ALLOWANCE'].includes(get('kind'))&&amount(get('amount'))&&note&&note.length<=2000&&(!get('attendance')||uid(get('attendance')))&&(!get('trip')||uid(get('trip')))) {rpc='add_payroll_evidence_adjustment';Object.assign(args,{p_payroll:get('payroll'),p_kind:get('kind'),p_amount:get('amount'),p_reason:note,p_attendance:get('attendance')||null,p_trip:get('trip')||null,p_key:get('key')})}
 else if(action==='generate'&&uid(pid)) {rpc='generate_teacher_payroll';args.p_period=pid}
 else if(action==='transition'&&uid(pid)&&['DRAFT','REVIEW','APPROVED','FINALIZED'].includes(get('status'))&&/^\d+$/.test(get('version'))&&Number(get('version'))>0&&note&&note.length<=2000&&get('confirm')==='yes') {rpc='transition_payroll';Object.assign(args,{p_period:pid,p_version:Number(get('version')),p_status:get('status'),p_note:note}); if(get('override_type')||get('override_reason')) { if(['APPROVED','FINALIZED'].includes(get('status'))&&get('override_type')==='MAKER_CHECKER_EMERGENCY'&&get('override_reason')&&get('override_reason').length<=2000) {rpc='transition_payroll_with_override';Object.assign(args,{p_override_type:get('override_type'),p_override_reason:get('override_reason')})} else {rpc='';error='Ngoại lệ khẩn cấp cần đúng loại và lý do rõ ràng.'} }}
 else if(action==='adjust'&&uid(get('payroll'))&&uid(pid)&&['BONUS','DEDUCTION','CORRECTION'].includes(get('kind'))&&amount(get('amount'))&&note&&note.length<=2000) {rpc='add_payroll_adjustment';Object.assign(args,{p_payroll:get('payroll'),p_kind:get('kind'),p_amount:get('amount'),p_reason:note})}
 else error='Vui lòng kiểm tra dữ liệu, ngày hiệu lực và xác nhận.'
 const base=get('workspace')==='finance'?'/finance/payroll':'/admin/payroll'
 let destination=uid(pid)?base+'/'+pid:base
 if(rpc) {
  try {const result=await db.rpc(rpc,args);if(result.error) {
   const messages:Record<string,string>={
    'Monthly payroll requires linked Employee Master and approved attendance':'Lương tháng cần liên kết hồ sơ nhân viên và chấm công đã duyệt.',
    'Approved attendance required for every required shift':'Còn ca làm việc chưa có chấm công được duyệt. Hãy hoàn tất chấm công trước khi tính lương.',
    'No required minutes; manual payroll review required':'Kỳ không có phút làm việc bắt buộc. Cần kiểm tra lịch và hồ sơ nhân viên.',
    'Monthly assignment crosses payroll branch; review required':'Phân công trong kỳ không khớp chi nhánh trả lương. Cần kiểm tra trước khi tính.',
    'Explicit active employee branch mapping required':'Cần cấu hình liên kết đơn vị–chi nhánh và nhân viên lương tháng đang hoạt động.',
    'Deduction requires payable late or early evidence from this payroll':'Khấu trừ cần mã chấm công đi muộn/về sớm của chính nhân viên trong kỳ.',
    'Deduction evidence must match generated payable snapshot':'Bằng chứng phải khớp chấm công đã dùng khi tính lương.',
    'Approved trip for payroll employee required':'Cần mã chuyến công tác đã duyệt của chính nhân viên.',
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
