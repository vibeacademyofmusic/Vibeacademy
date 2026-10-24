import Link from 'next/link'
import { notFound } from 'next/navigation'
import { adminClient, uuidPattern } from '../../finance/operations'
type Module={code:string;title:string;lessons:{code:string;title:string;blocks:{type:string;text:string;asset_ref?:string}[]}[]}
export default async function ReviewLearningVersion({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,db=await adminClient()
  if(!uuidPattern.test(id)) notFound()
  const result=await db.from('learning_versions').select('title,version,state,content,source_scope,review_note').eq('id',id).maybeSingle()
  if(result.error) return <p role="alert" className="p-6">Không thể tải nội dung cần duyệt.</p>
  if(!result.data) notFound()
  const v=result.data,modules=(v.content as {modules:Module[]}).modules
  return <main className="space-y-5 p-4 sm:p-6"><Link prefetch={false} className="text-blue-700 underline" href="/admin/elearning">Về danh sách duyệt</Link><h1 className="text-2xl font-semibold">{v.title} · v{v.version}</h1><p>Trạng thái: {v.state}</p><p>Phạm vi nguồn: {v.source_scope}</p>{v.review_note&&<p>Ghi chú duyệt: {v.review_note}</p>}{modules.map(m=><section className="space-y-3" key={m.code}><h2 className="font-semibold">{m.code} — {m.title}</h2>{m.lessons.map(l=><article key={l.code} className="space-y-2 rounded border p-4"><h3>{l.code} — {l.title}</h3>{l.blocks.map((b,i)=><div key={i}><p className="whitespace-pre-wrap break-words">{b.text}</p>{b.asset_ref&&<p className="break-words text-sm">Tham chiếu tư liệu: {b.asset_ref}</p>}</div>)}</article>)}</section>)}</main>
}
