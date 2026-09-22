import Link from 'next/link'
import { adminClient, pageNumber, type Params } from '../../finance/operations'
import { monthRange } from '../../employees/attendance/data'
import { readComplete } from '../../payroll/_ux/load'
import { AppPage, PageHeader, FilterBar, FormField, DataTable, InlineNotice, MoneyDisplay, StatusBadge } from '../../_components/vibe'
import type { Config } from '../../payroll/_ux/model'
export default async function Teaching({searchParams}:{searchParams:Promise<Params>}) {
 const p=await searchParams,db=await adminClient(),range=monthRange(p.month),page=pageNumber(p.page)
 const sessions=await db.from('session_actual_teachers').select('session_id,teacher_id,class_id,branch_id,occurrence_date,status,starts_at,ends_at',{count:'exact'}).gte('occurrence_date',range.from).lte('occurrence_date',range.to).order('occurrence_date').order('session_id').range((page-1)*50,page*50-1)
 let rows:React.ReactNode[][]=[],unavailable=!!sessions.error
 try {
 const [staff,classes,configs]=await Promise.all([
 readComplete<{id:string;teacher_id:string|null;full_name:string|null}>((from,to)=>db.from('employee_directory').select('id,teacher_id,full_name',{count:'exact'}).order('id').range(from,to)),
 readComplete<{id:string;name:string;class_type:string}>((from,to)=>db.from('classes').select('id,name,class_type',{count:'exact'}).order('id').range(from,to)),
 readComplete<Config>((from,to)=>db.from('staff_compensation_components').select('*',{count:'exact'}).eq('component_code','TEACHING_PER_SESSION').eq('status','ACTIVE').lte('effective_from',range.to).or(`effective_to.is.null,effective_to.gte.${range.from}`).order('id').range(from,to)),
 ])
 rows=(sessions.data||[]).map(s=>{
 const person=staff.find(e=>e.teacher_id===s.teacher_id),klass=classes.find(c=>c.id===s.class_id)
 const matches=configs.filter(c=>c.employee_id===person?.id&&c.branch_id===s.branch_id&&c.calculation_method==='PER_SESSION'&&c.effective_from<=s.occurrence_date&&(!c.effective_to||c.effective_to>=s.occurrence_date)&&(!c.class_type||c.class_type===klass?.class_type)).sort((a,b)=>Number(!a.class_type)-Number(!b.class_type)||b.effective_from.localeCompare(a.effective_from)||a.id.localeCompare(b.id))
 const rate=matches[0],eligible=s.status==='COMPLETED'&&Date.parse(s.ends_at)<=Date.now()&&!!rate
 return [s.occurrence_date,klass?.name||'Chưa đọc được lớp',person?.full_name||'Chưa có liên kết Staff',`${Math.round((Date.parse(s.ends_at)-Date.parse(s.starts_at))/60000)} phút`,<StatusBadge key="state">{s.status==='COMPLETED'?'Hoàn tất':s.status}</StatusBadge>,eligible?'Đủ điều kiện nguồn':!rate?'Thiếu đơn giá đúng ngày':'Chưa hoàn tất / chưa kết thúc',<MoneyDisplay key="rate" value={rate?.rate} currency={rate?.currency||undefined}/>,<MoneyDisplay key="amount" value={eligible?rate.rate:null} currency={rate?.currency||undefined}/>]
 })
 }catch{unavailable=true}
 return <AppPage><PageHeader title="Đối soát buổi dạy" description="Giáo viên thực tế, thời lượng thực tế và đơn giá Staff đúng ngày dạy."/><form><FilterBar><FormField label="Tháng" type="month" name="month" defaultValue={range.month}/><button className="vibe-button">Lọc</button><Link className="vibe-button" href="/admin/session-teachers">Phân công giáo viên</Link></FilterBar></form><InlineNotice>Một buổi không tương đương một giờ. Số tiền ở đây là đối soát nguồn theo buổi hoàn tất, chưa phải kết quả kỳ lương hay bằng chứng chi trả.</InlineNotice>{unavailable?<InlineNotice tone="error">Không tải đủ nguồn đối soát; không suy đoán số tiền.</InlineNotice>:<DataTable headers={['Ngày','Lớp','Giáo viên thực tế','Thời lượng','Trạng thái','Điều kiện tính','Đơn giá / buổi','Tiền nguồn']} rows={rows}/>}<div className="vibe-actions">{page>1&&<Link href={`?month=${range.month}&page=${page-1}`}>Trang trước</Link>}<span>Trang {page} · tối đa 50 buổi</span>{page*50<(sessions.count||0)&&<Link href={`?month=${range.month}&page=${page+1}`}>Trang tiếp</Link>}</div></AppPage>
}
