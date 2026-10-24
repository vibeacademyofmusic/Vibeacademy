import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { AppPage, PageHeader, SectionCard, InlineNotice, StatusBadge } from '@/app/admin/_components/vibe'
import SubmitButton from '@/app/admin/finance/_components/SubmitButton'
import { postLearningMessage } from '../../actions'
const labels: Record<string,string> = { OPEN:'Mới tiếp nhận', IN_PROGRESS:'Đang xử lý', RESOLVED:'Đã giải quyết' }
type Thread = { version:number;state:string;staff:boolean;assignee_id:string|null;messages:{id:string;body:string;visibility:string;at:string;author:string}[] }
export default async function Conversation({params,searchParams}:{params:Promise<{kind:string;id:string}>;searchParams:Promise<{error?:string;saved?:string}>}) {
  const p=await params,q=await searchParams,kind=p.kind.toUpperCase(),db=await createClient()
  if(!['REPORT','FEEDBACK'].includes(kind)||!/^[0-9a-f-]{36}$/i.test(p.id))notFound()
  const auth=await db.auth.getClaims()
  if(!auth.data?.claims)redirect('/login?next='+encodeURIComponent(`/my-learning/conversations/${p.kind}/${p.id}`))
  const result=await db.rpc('learning_conversation_read',{p_kind:kind,p_entity:p.id})
  if(result.error||!result.data)notFound()
  const t=result.data as Thread
  return <div className="vibe-admin min-h-screen"><main className="mx-auto max-w-4xl p-4 sm:p-8"><AppPage>
    <PageHeader title={kind==='REPORT'?'Trao đổi về báo cáo học tập':'Trao đổi phản hồi buổi học'} description="Nội dung công khai dành cho học viên, phụ huynh liên quan và nhân sự phụ trách."/>
    <Link href="/my-learning">← Hồ sơ học tập</Link>
    {t.staff&&<Link href={kind==='REPORT'?`/admin/reports/learning/${p.id}`:`/admin/feedback/${p.id}`}>Mở hồ sơ quản trị</Link>}
    {q.error&&<InlineNotice tone="error">Chưa lưu được. Nội dung hoặc quyền truy cập đã thay đổi; hãy kiểm tra lịch sử trước khi gửi lại.</InlineNotice>}
    {q.saved&&<InlineNotice tone="success">Đã lưu trao đổi. Trạng thái gửi Zalo được theo dõi riêng.</InlineNotice>}
    <StatusBadge tone={t.state==='RESOLVED'?'success':'warning'}>{labels[t.state]}</StatusBadge>
    {kind==='REPORT'&&<Link className="vibe-button" href={`/my-learning/reports/${p.id}/pdf`}>Mở / tải báo cáo PDF</Link>}
    <SectionCard title="Lịch sử trao đổi">
      {!t.messages.length&&<p>Chưa có trao đổi. Bạn có thể gửi câu hỏi bên dưới.</p>}
      {t.messages.map(m=><article key={m.id} className="space-y-2 border-b border-slate-100 py-4"><p className="text-sm">{m.author} · {new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(m.at))}</p>{m.visibility==='INTERNAL'&&<StatusBadge>Chỉ nội bộ</StatusBadge>}<p className="whitespace-pre-wrap break-words">{m.body}</p></article>)}
    </SectionCard>
    <SectionCard title={t.staff?'Trả lời và xử lý':'Gửi câu hỏi / bổ sung'}><form action={postLearningMessage} className="space-y-4">
      <input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={p.id}/><input type="hidden" name="version" value={t.version}/><input type="hidden" name="request" value={randomUUID()}/>
      <label className="vibe-field"><span>Nội dung</span><textarea name="body" required maxLength={4000} rows={5}/></label>
      {t.staff&&<div className="grid gap-3"><label><input type="checkbox" name="internal" value="yes"/> Ghi chú nội bộ (không gửi cho gia đình)</label><label><input type="checkbox" name="claim" value="yes"/> Tôi nhận phụ trách</label><label><input type="checkbox" name="resolve" value="yes"/> Giải quyết cùng câu trả lời công khai này</label></div>}
      <p className="text-sm">Bổ sung của gia đình sẽ mở lại yêu cầu đã giải quyết và giữ nguyên lịch sử.</p><SubmitButton>Gửi nội dung</SubmitButton>
    </form></SectionCard>
  </AppPage></main></div>
}
