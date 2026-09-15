import Link from 'next/link'
import { adminClient, uuidPattern, pageNumber, type Params } from '../../../finance/operations'
import { rows } from '../../../finance/query'
import { period, payrollFields, money, type Payroll } from '../../data'
import { payrollAction } from '../../actions'
import { Panel, Table, Select, Field, LoadError, Pager } from '../../../finance/_components/ui'
import SubmitButton from '../../../finance/_components/SubmitButton'
export default async function TeacherPayroll({params,searchParams}:{params:Promise<{period:string;teacher:string}>;searchParams:Promise<Params>}) {
 const {period:id,teacher}=await params,p=await searchParams,page=pageNumber(p.page),db=await adminClient()
 if(!uuidPattern.test(teacher))return <p>Không tìm thấy giáo viên.</p>
 let head,t,loaded
 try {head=await period(db,id);[t]=await rows(db.from('teacher_payrolls').select(payrollFields).eq('period_id',id).eq('teacher_id',teacher).returns<Payroll[]>())}catch{return <LoadError/>}
 if(!head||!t)return <p>Chưa có bảng lương giáo viên.</p>
 try {loaded=await Promise.all([rows(db.from('payroll_earning_lines').select('id,session_id,earned_on,earning_type,duration_hours,rate,amount,duration_source,class_id').eq('payroll_id',t.id).order('earned_on').order('id').range((page-1)*25,page*25)),rows(db.from('payroll_adjustments').select('id,kind,amount,reason,created_by,approved_by').eq('payroll_id',t.id).order('created_at').limit(100))])}catch{return <LoadError/>}
 const [lines,adjustments]=loaded
 return <div className="min-w-0 space-y-5"><Link prefetch={false} href={'/admin/payroll/'+id}>← Kỳ lương</Link><h1 className="text-3xl font-bold">{t.teacher_name}</h1><p>{t.pay_type} • {head.starts_on.slice(0,7)} • {head.status}</p><p>Lương tháng: {money(t.base_salary,t.currency)} • Giờ dạy: {t.teaching_hours} • Theo giờ: {money(t.hourly_earnings,t.currency)} • Điều chỉnh: {money(t.adjustment_amount,t.currency)}</p><p className="text-xl font-bold">Tổng: {money(t.gross_amount,t.currency)}</p>
 {head.status==='FINALIZED'&&<Link prefetch={false} href={'/finance?payroll='+t.id}>Yêu cầu sửa sai lương đã chốt</Link>}<Panel title="Chi tiết thu nhập"><p>Thời lượng theo lịch, chưa có chấm công thực tế. Các dòng được phân trang theo buổi.</p><Table headers={['Ngày / buổi','Loại','Giờ','Mức áp dụng','Thành tiền']} rows={lines.slice(0,25).map(l=>[l.session_id?<Link key={l.id} prefetch={false} href={'/admin/attendance/'+l.session_id}>{l.earned_on}</Link>:l.earned_on,l.earning_type,l.duration_hours,money(l.rate,t.currency),money(l.amount,t.currency)])}/><Pager path={'/admin/payroll/'+id+'/'+teacher} params={p} page={page} more={lines.length>25}/></Panel>
 <Panel title="Các khoản điều chỉnh"><Table headers={['Loại','Số tiền','Lý do','Người tạo','Người duyệt']} rows={adjustments.map(a=>[a.kind,money(a.amount,t.currency),a.reason,a.created_by,a.approved_by||'Chưa duyệt'])}/>{['GENERATED','REVIEW'].includes(head.status)?<form action={payrollAction} className="space-y-3"><input type="hidden" name="action" value="adjust"/><input type="hidden" name="period" value={id}/><input type="hidden" name="payroll" value={t.id}/><Select name="kind" label="Loại điều chỉnh" options={[{id:'BONUS',name:'Thưởng'},{id:'DEDUCTION',name:'Khấu trừ'},{id:'CORRECTION',name:'Sửa sai'}]} required/><Field name="amount" label="Số tiền (âm nếu khấu trừ)"/><Field name="note" label="Lý do điều chỉnh"/><SubmitButton>Thêm điều chỉnh</SubmitButton></form>:<p>Điều chỉnh đang khóa. Khoản thu nhập gốc không được sửa.</p>}</Panel></div>
}
