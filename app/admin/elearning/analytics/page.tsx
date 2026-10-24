import Link from 'next/link'
import { adminClient, pageNumber, uuidPattern } from '../../finance/operations'

type Analytics = {
  version_id:string; title:string; version:number; state:string
  lessons:{code:string;title:string;acknowledged_learners:number}[]
  assessments:{id:string;title:string;kind:string;policy_state:string;attempts:number;learners:number;in_progress:number;pending_review:number;passed:number;failed:number;average_completed_score:number|null}[]
}
const kinds:Record<string,string>={PRACTICE:'Luyện tập',CHECKPOINT:'Kiểm tra từng phần',FINAL:'Đánh giá cuối Grade'}
const states:Record<string,string>={DRAFT:'Bản nháp',IN_REVIEW:'Chờ duyệt',APPROVED:'Đã duyệt',PUBLISHED:'Đã xuất bản',RETIRED:'Ngừng cung cấp'}
export default async function LearningAnalytics({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const p=await searchParams,db=await adminClient(),page=pageNumber(p.page)
  const selected=p.version&&uuidPattern.test(p.version)?p.version:null
  const [versions,result]=await Promise.all([
    db.from('learning_versions').select('id,title,version,state').order('created_at',{ascending:false}).order('id').range((page-1)*25,page*25),
    selected?db.rpc('learning_version_analytics',{p_version:selected}):Promise.resolve(null),
  ])
  const data=result?.error?null:result?.data as Analytics|null|undefined
  return <main className="space-y-5 p-4 sm:p-6">
    <Link prefetch={false} href="/admin/elearning" className="text-blue-700 underline">Về nội dung học</Link>
    <h1 className="text-2xl font-semibold">Thống kê học trực tuyến</h1>
    <p>Số học viên xác nhận đã xem bài không phải kết quả hoàn thành Academic. Thống kê bao gồm lịch sử của phiên bản, kể cả khi quyền học đã hết hạn.</p>
    <p>Kết quả dùng lần chấm lại mới nhất. Số lượt làm có thể lớn hơn số học viên; điểm trung bình chỉ tính lượt đã chấm xong, không phải điểm tổng kết của học viên.</p>
    {(versions.error||result?.error||(p.version&&!selected))&&<p role="alert">Không tải được thống kê yêu cầu. Không coi dữ liệu bị thiếu là kết quả bằng không.</p>}
    <section className="space-y-2"><h2 className="text-xl font-semibold">Chọn phiên bản</h2>
      {!versions.error&&!versions.data?.length&&<p>Chưa có phiên bản nội dung.</p>}
      {versions.data?.slice(0,25).map(v=><Link key={v.id} prefetch={false} href={'?'+new URLSearchParams({page:String(page),version:v.id})} aria-current={selected===v.id?'page':undefined} className="block break-words rounded border p-3 aria-[current=page]:border-blue-700">{v.title} · v{v.version} · {states[v.state]||v.state}</Link>)}
      <nav className="flex gap-4">{page>1&&<Link prefetch={false} href={'?page='+(page-1)}>Trang trước</Link>}{(versions.data?.length||0)>25&&<Link prefetch={false} href={'?page='+(page+1)}>Trang sau</Link>}</nav>
    </section>
    {data&&<><h2 className="break-words text-xl font-semibold">{data.title} · v{data.version} · {states[data.state]||data.state}</h2>
      <section className="space-y-3"><h3 className="font-semibold">Xác nhận đã xem bài</h3>{data.lessons.map(l=><article key={l.code} className="break-words rounded border p-3"><h4>{l.code} — {l.title}</h4><p>{l.acknowledged_learners} học viên đã xác nhận</p></article>)}</section>
      <section className="space-y-3"><h3 className="font-semibold">Lượt đánh giá</h3>{!data.assessments.length&&<p>Chưa có đề đánh giá cho phiên bản này.</p>}{data.assessments.map(a=><article key={a.id} className="space-y-1 break-words rounded border p-3"><h4 className="font-semibold">{a.title} — {kinds[a.kind]||a.kind} · {states[a.policy_state]||a.policy_state}</h4><p>{a.attempts} lượt · {a.learners} học viên</p><p>Đang làm: {a.in_progress} · Chờ chấm: {a.pending_review}</p><p>Đạt: {a.passed} · Chưa đạt: {a.failed}</p><p>Điểm trung bình các lượt đã chấm: {a.average_completed_score===null?'Chưa có':a.average_completed_score+'%'}</p></article>)}</section>
    </>}
  </main>
}
