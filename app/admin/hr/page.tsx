import Link from 'next/link'
import { readComplete } from '../payroll/_ux/load'
import { adminClient } from '../finance/operations'
import { AppPage, PageHeader, MetricCard, SectionCard, InlineNotice } from '../_components/vibe'
export default async function HROverview() {
 const db = await adminClient()
 const pending = await Promise.all([readComplete<{id:string}>((from,to)=>db.from('employee_attendance_requests').select('id',{count:'exact'}).order('id').range(from,to)),readComplete<{id:string;request_id:string}>((from,to)=>db.from('employee_attendance_reviews').select('id,request_id',{count:'exact'}).order('id').range(from,to))]).then(([requests,reviews])=>({count:requests.filter(r=>!reviews.some(v=>v.request_id===r.id)).length,error:null})).catch(()=>({count:null,error:true}))
 const results = await Promise.all([
  db.from('employee_directory').select('id', { count:'exact', head:true }).eq('employment_status','ACTIVE'),
  db.from('teachers').select('id', { count:'exact', head:true }),
  pending,
  db.from('payroll_periods').select('id', { count:'exact', head:true }).in('status',['DRAFT','GENERATED','REVIEW']),
  db.from('employee_expense_claims').select('id', { count:'exact', head:true }).eq('status','SUBMITTED'),
 ])
 const labels = ['Nhân viên đang làm việc','Hồ sơ giáo viên','Yêu cầu công chờ xử lý','Kỳ lương cần xử lý','Công tác phí chờ duyệt']
 return <AppPage><PageHeader title="Tổng quan HR" description="Hồ sơ nhân sự, dữ liệu công và các công việc cần xử lý trong kỳ."/><div className="vibe-metrics">{results.map((r,i) => <MetricCard key={labels[i]} title={labels[i]} value={r.error || r.count == null ? '—' : r.count} note={r.error ? 'Nguồn chưa khả dụng / chưa đủ quyền' : 'Trong phạm vi được phép xem'}/>)}</div><InlineNotice>Số yêu cầu công chỉ gồm các yêu cầu đang chờ xử lý. Mở bảng công tháng để kiểm tra ca thiếu bằng chứng. Kỳ đã tính hoặc đã duyệt chưa đồng nghĩa đã chi trả.</InlineNotice><div className="vibe-grid">{[['Chuẩn bị dữ liệu công','Bảng công tháng','/admin/hr/attendance','Đối soát lịch làm việc và bằng chứng đã xác nhận.'],['Cấu hình thu nhập','Mẫu lương & cấu hình','/admin/hr/templates','Chọn cấu trúc, nhập mức tiền theo từng nhân viên và ngày hiệu lực.'],['Kiểm tra kỳ lương','Mở kỳ lương','/admin/payroll','So sánh bản đã tính với cấu hình và nguồn mới.'],['Hoàn trả công tác phí','Bảng kê công tác phí','/admin/hr/expenses','Theo dõi hồ sơ, duyệt và đưa khoản hoàn trả vào kỳ lương.']].map(([title,label,href,note]) => <SectionCard key={href} title={title}><p>{note}</p><Link prefetch={false} className="vibe-button" href={href}>{label} →</Link></SectionCard>)}</div></AppPage>
}
