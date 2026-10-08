import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
export default async function Inbox({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
 const db=await createClient(),auth=await db.auth.getClaims();if(auth.error||!auth.data?.claims)redirect('/login')
 const params=await searchParams,page=Math.min(4001,Math.max(1,Number.parseInt(params.page||'1',10)||1))
 const r=await db.rpc('own_notifications',{p_offset:(page-1)*25});if(r.error)throw Error('Không thể tải thông báo.')
 const data=(r.data||[]) as {id:string;title:string;href:string;created_at:string}[]
 return <main className="mx-auto w-full min-w-0 max-w-3xl space-y-4 p-4 sm:p-8"><h1 className="text-2xl font-bold">Thông báo của tôi</h1>{!data.length&&<p>Chưa có thông báo được phép xem.</p>}{data.slice(0,25).map(n=><article className="rounded border p-4" key={n.id}><Link prefetch={false} href={n.href==='/'?'/':'/my-learning'}>{n.title}</Link><p>{new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(new Date(n.created_at))}</p></article>)}<nav className="flex gap-3">{page>1&&<Link prefetch={false} href={`/notifications?page=${page-1}`}>Trang trước</Link>}{data.length>25&&page<4001&&<Link prefetch={false} href={`/notifications?page=${page+1}`}>Trang tiếp</Link>}</nav></main>
}
