import Link from 'next/link'
import { adminClient, type Params } from '../finance/operations'
import { branches } from '../finance/query'
import { Select, Field, Table, Pager, Notice, LoadError, timeText } from '../finance/_components/ui'
import { AppPage, PageHeader, MetricCard } from '../_components/vibe'
import { businessDate, shiftBusinessDate } from '../_lib/business-date'
import { feedbackList, feedbackMetrics, teachers, states, respondents } from './data'
export default async function FeedbackPage({searchParams}:{searchParams:Promise<Params>}) {
 const params=await searchParams,db=await adminClient()
 const view=params.view==='all'||params.view==='quality'?params.view:'attention'
 const scoped:Params={...params,from:params.from||shiftBusinessDate(businessDate(),-29),to:params.to||businessDate(),review:view==='attention'&&!params.status?'yes':params.review}
 let loaded
 try {loaded=await Promise.all([feedbackList(db,scoped),feedbackMetrics(db,scoped),branches(db),teachers(db)])} catch {return <LoadError/>}
 const [list,metrics,branchRows,teacherRows]=loaded
 const tab=(name:string,label:string)=>{const query=new URLSearchParams();if(scoped.branch)query.set('branch',scoped.branch);if(scoped.teacher)query.set('teacher',scoped.teacher);if(scoped.from)query.set('from',scoped.from);if(scoped.to)query.set('to',scoped.to);if(name!=='attention')query.set('view',name);return <Link prefetch={false} href={'/admin/feedback?'+query} aria-current={view===name?'page':undefined} className="rounded border px-3 py-2">{label}</Link>}
 return <AppPage><PageHeader title="Phản hồi buổi học" description="Phản hồi từ học viên và phụ huynh giúp theo dõi chất lượng buổi học và xử lý các vấn đề cần quan tâm."/>
 <Notice params={params}/><p>Điểm thấp được đánh dấu bởi database. Xử lý phản hồi không thay đổi đánh giá gốc.</p>
 <div className="vibe-grid">{[['Tổng phản hồi',metrics.total,'all'],['Điểm trung bình',metrics.average??'—','quality'],['Cần xử lý',metrics.needs,'attention'],['Đã xử lý',metrics.resolved,'all']].map(([title,value,next])=><Link key={String(title)} prefetch={false} href={'/admin/feedback?view='+next+'&from='+scoped.from+'&to='+scoped.to}><MetricCard title={String(title)} value={value as never} note="Trong khoảng ngày đang lọc"/></Link>)}</div>
 <nav aria-label="Chế độ xem phản hồi" className="flex flex-wrap gap-2">{tab('attention','Cần xử lý')}{tab('all','Tất cả phản hồi')}{tab('quality','Tổng quan chất lượng')}</nav>
 <form className="grid gap-3 sm:grid-cols-3"><input type="hidden" name="view" value={view}/><Select name="branch" label="Chi nhánh" options={branchRows} value={scoped.branch}/><Select name="teacher" label="Giáo viên" options={teacherRows.map(t=>({id:t.id,name:t.full_name||t.teacher_code}))} value={scoped.teacher}/>{view==='all'&&<Select name="status" label="Trạng thái" options={states} value={params.status}/>}<Select name="respondent" label="Người phản hồi" options={respondents} value={params.respondent}/><Select name="rating" label="Điểm" options={[1,2,3,4,5].map(n=>({id:String(n),name:String(n)}))} value={params.rating}/><Field name="q" label="Tìm học viên" required={false} value={params.q}/><Field name="from" label="Từ ngày" type="date" required={false} value={scoped.from}/><Field name="to" label="Đến ngày" type="date" required={false} value={scoped.to}/><button className="rounded border p-2">Lọc phản hồi</button></form>
 {view==='quality'?<section className="space-y-3"><p>Tỷ lệ điểm thấp: {metrics.lowRate??'—'}%. Tỷ lệ đã xử lý: {metrics.resolutionRate??'—'}%.</p><Table headers={['Giáo viên','Số phản hồi','Điểm trung bình']} rows={metrics.teachers.map(row=>[row.name,row.total,row.total?Math.round(row.sum/row.total*10)/10:'—'])}/><Table headers={['Chi nhánh','Số phản hồi','Điểm trung bình']} rows={metrics.branches.map(row=>[row.name,row.total,row.total?Math.round(row.sum/row.total*10)/10:'—'])}/></section>:<>
 {view==='attention'&&!list.data.length&&<p>Không có phản hồi cần xử lý. Tất cả phản hồi điểm thấp hiện đã được giải quyết.</p>}
 {view==='all'&&!list.data.length&&<p>Chưa có phản hồi trong khoảng thời gian này.</p>}
 <Table headers={['Buổi học','Học viên','Giáo viên','Chi nhánh','Người phản hồi','Điểm','Xử lý']} rows={list.data.map(f=>[<Link key={f.id} prefetch={false} href={'/admin/feedback/'+f.id}>{timeText(f.session_starts_at)} • {f.context_snapshot.class_name}</Link>,f.context_snapshot.student_name+' ('+f.context_snapshot.student_code+')',f.context_snapshot.teacher_name,f.context_snapshot.branch_name,respondents.find(r=>r.id===f.respondent_type)?.name,<span key="rating" className={f.is_low_rating?'font-semibold text-red-800':''}>★ {f.overall_rating}/5{f.is_low_rating?' • Điểm thấp':''}</span>,states.find(s=>s.id===f.resolution_status)?.name])}/>
 <Pager path="/admin/feedback" params={{...scoped,view:view==='attention'?undefined:view}} {...list}/></>}
 </AppPage>
}
