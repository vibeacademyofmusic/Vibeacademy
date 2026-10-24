import Link from 'next/link'
import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { pageNumber,uuidPattern } from '../admin/finance/operations'
import { learningActivity } from './actions'
import { startAssessment } from './assessments/actions'
import { assessmentStates } from '@/lib/learning/question-types'
type Module={code:string;title:string;lessons:{code:string;title:string;blocks:{type:string;text:string;asset_ref?:string}[]}[]}
export default async function Learn({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const p=await searchParams,db=await createClient(),claims=await db.auth.getClaims()
  if(claims.error||!claims.data?.claims) redirect('/login')
  const page=pageNumber(p.page),version=p.version&&uuidPattern.test(p.version)?p.version:undefined
  const [list,selected,history,assessments,outcomes]=await Promise.all([
    db.from('learning_versions').select('id,title,version').eq('state','PUBLISHED').order('level_id').order('version',{ascending:false}).range((page-1)*25,page*25),
    version?db.from('learning_versions').select('id,title,content').eq('id',version).eq('state','PUBLISHED').maybeSingle():Promise.resolve({data:null,error:null}),
    db.from('learning_lesson_progress').select('version_id,lesson_code,completed_at').order('completed_at',{ascending:false}).limit(25),
    version?db.rpc('available_learning_assessments',{p_version:version}):Promise.resolve({data:[],error:null}),
    db.rpc('learning_assessment_history',{p_offset:0}),
  ])
  const modules=(selected.data?.content as {modules:Module[]}|undefined)?.modules||[]
  return <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6"><Link prefetch={false} className="text-blue-700 underline" href="/my-learning">Về hồ sơ học tập</Link><h1 className="text-2xl font-semibold">Học trực tuyến</h1><p>Hoàn thành bài học ghi nhận việc học, không đồng nghĩa đã đạt Grade.</p>
    {p.success&&<p role="status">Đã lưu tiến độ học.</p>}{p.error&&<p role="alert">Không thể lưu. Quyền học có thể đã hết hạn hoặc dữ liệu không hợp lệ.</p>}
    {[list,selected,history,assessments,outcomes].some(r=>r.error)&&<p role="alert">Không tải được đầy đủ dữ liệu học tập.</p>}
    <ul>{list.data?.slice(0,25).map(v=><li key={v.id}><Link prefetch={false} className="text-blue-700 underline" href={'/learn?version='+v.id}>{v.title} · v{v.version}</Link></li>)}</ul>
    {!list.data?.length&&!list.error&&<p>Hiện chưa có nội dung được cấp quyền. Liên hệ quản trị viên nếu quyền học đã hết hạn.</p>}
    {version&&!selected.data&&!selected.error&&<p>Nội dung chưa xuất bản hoặc quyền truy cập không còn hiệu lực.</p>}
    {selected.data&&<section className="space-y-5"><h2 className="text-xl font-semibold">{selected.data.title}</h2>{modules.map(m=><section className="space-y-3" key={m.code}><h3 className="font-semibold">{m.code} — {m.title}</h3>{m.lessons.map(l=><article className="space-y-3 rounded border p-4" key={l.code}><h4 className="font-semibold">{l.title}</h4>{l.blocks.map((b,i)=><p key={i} className="whitespace-pre-wrap break-words">{b.text}{b.type==='MEDIA_REFERENCE'?' (Tư liệu được quản lý riêng; chưa cung cấp đường tải.)':''}</p>)}
      <form action={learningActivity}><input type="hidden" name="version" value={version}/><input type="hidden" name="lesson" value={l.code}/><input type="hidden" name="kind" value="COMPLETE_LESSON"/><button className="rounded border p-2">Đánh dấu đã học bài này</button></form>
      <form action={learningActivity} className="space-y-2"><input type="hidden" name="version" value={version}/><input type="hidden" name="lesson" value={l.code}/><input type="hidden" name="kind" value="PRACTICE"/><input type="hidden" name="request" value={randomUUID()}/><label>Ghi chú luyện tập (chưa chấm điểm)<textarea name="response" className="block w-full rounded border p-2" required maxLength={10000}/></label><button className="rounded border p-2">Lưu ghi chú luyện tập</button></form>
    </article>)}</section>)}</section>}
    {selected.data&&<section className="space-y-3"><h2 className="font-semibold">Đánh giá</h2>{assessments.data?.map((a:{id:string;title:string;kind:string;pass_threshold:number;attempt_limit:number|null;cooldown_seconds:number})=><form action={startAssessment} key={a.id} className="space-y-2 rounded border p-4"><h3>{a.title}</h3><p>{a.kind} · Ngưỡng đạt {a.pass_threshold}% · {a.attempt_limit??'Không giới hạn'} lượt · Chờ {a.cooldown_seconds/3600} giờ sau lần chưa đạt</p><input type="hidden" name="assessment" value={a.id}/><input type="hidden" name="request" value={randomUUID()}/>{a.kind==='FINAL'&&<label className="flex gap-2"><input name="identity" type="checkbox" required/>Tôi xác nhận tự làm bài bằng tài khoản của mình.</label>}<button className="rounded border p-2">Bắt đầu đánh giá</button></form>)}</section>}
    <section><h2 className="font-semibold">25 kết quả đánh giá gần nhất</h2><ul>{outcomes.data?.map((a:{id:string;kind:string;state:string;score:number|null})=><li key={a.id}><Link prefetch={false} className="text-blue-700 underline" href={'/learn/assessments/'+a.id}>{a.kind} · {assessmentStates[a.state]||a.state}{a.score!==null?' · '+a.score+'%':''}</Link></li>)}</ul></section>
    <section><h2 className="font-semibold">Lịch sử 25 bài đã học gần nhất</h2><ul>{history.data?.map(h=><li key={h.version_id+h.lesson_code}>{h.lesson_code} · {new Date(h.completed_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</li>)}</ul></section>
    <nav className="flex gap-4">{page>1&&<Link prefetch={false} href={'/learn?page='+(page-1)}>Trang trước</Link>}{(list.data?.length||0)>25&&<Link prefetch={false} href={'/learn?page='+(page+1)}>Trang sau</Link>}</nav>
  </main>
}
