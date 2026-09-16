import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { displayLabel } from '@/lib/display'
import { logout } from '@/app/login/actions'

const tabs = { schedule: 'Lịch dạy', classes: 'Lớp đang phụ trách', history: 'Buổi đã thực dạy', journals: 'Nhật ký được phép xem', feedback: 'Tổng hợp phản hồi' }
type Tab = keyof typeof tabs
type Session = { session_id: string; class_name: string; starts_at: string; ends_at: string; status: string }
type Class = { class_id: string; code: string; name: string }
type Journal = { journal_id: string; class_name: string; starts_at: string; content: string; repertoire: string; skills: string; homework: string; observation: string; is_author: boolean }
type Feedback = { month: string; response_count: number; overall_average: number }
function time(value: string) { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }

export default async function TeacherPortal({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  const params = await searchParams, db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  const role = await db.rpc('has_role', { role_code: 'TEACHER' })
  if (role.error || role.data !== true) redirect('/login?error=Unauthorized')
  const tab: Tab = params.tab && Object.hasOwn(tabs, params.tab) ? params.tab as Tab : 'schedule'
  const page = Math.min(4001, Math.max(1, Number.parseInt(params.page || '1', 10) || 1))
  const rpc = { schedule: 'teacher_portal_sessions', history: 'teacher_portal_sessions', classes: 'teacher_portal_classes', journals: 'teacher_portal_journals', feedback: 'teacher_feedback_summary' }[tab]
  const result = await db.rpc(rpc, { p_offset: (page - 1) * 25, ...(['schedule', 'history'].includes(tab) ? { p_history: tab === 'history' } : {}) })
  if (result.error) throw new Error('Không thể tải dữ liệu giáo viên. Vui lòng thử lại.')
  const data = result.data || [], entries = data.slice(0, 25)
  const href = (nextPage: number, nextTab = tab) => `/operations/teacher?${new URLSearchParams({ tab: nextTab, page: String(nextPage) })}`
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-4 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Không gian giáo viên</h1><form action={logout}><button className="rounded border px-4 py-2">Đăng xuất</button></form></header>
    <Link prefetch={false} href="/notifications">Thông báo của tôi</Link>
    <div className="flex flex-wrap gap-4"><Link prefetch={false} href="/operations">Học viên trong phân công hiện tại</Link><Link prefetch={false} href="/my-payroll">Bảng lương của tôi</Link></div>
    <p className="text-sm">Lịch và lịch sử dựa trên giáo viên thực dạy. Khi kết thúc phân công, bạn chỉ giữ quyền xem buổi đã thực dạy và nhật ký mình viết.</p>
    <nav aria-label="Giáo viên" className="flex flex-wrap gap-2">{Object.entries(tabs).map(([key, title]) => <Link key={key} prefetch={false} href={href(1, key as Tab)} aria-current={tab === key ? 'page' : undefined} className={`rounded border px-3 py-2 ${tab === key ? 'bg-slate-900 text-white' : ''}`}>{title}</Link>)}</nav>
    <h2 className="text-xl font-semibold">{tabs[tab]}</h2>
    {!entries.length && <p>Chưa có dữ liệu được phép xem trong mục này.</p>}
    {['schedule', 'history'].includes(tab) && (entries as Session[]).map(s => <article key={s.session_id} className="rounded border p-4"><h3>{s.class_name}</h3><p>{time(s.starts_at)} – {time(s.ends_at)}</p><p>{displayLabel(s.status)}</p><Link prefetch={false} href={`/operations/teacher/sessions/${s.session_id}`}>Xem điểm danh</Link></article>)}
    {tab === 'classes' && (entries as Class[]).map(c => <article key={c.class_id} className="rounded border p-4">{c.code} — {c.name}</article>)}
    {tab === 'journals' && (entries as Journal[]).map(j => <article key={j.journal_id} className="space-y-2 rounded border p-4"><h3 className="font-semibold">{j.class_name} — {time(j.starts_at)}</h3>{j.is_author && <p>Nhật ký do bạn viết</p>}<p className="whitespace-pre-wrap">{j.content}</p>{j.repertoire && <p>Tác phẩm: {j.repertoire}</p>}{j.skills && <p>Kỹ năng: {j.skills}</p>}{j.homework && <p>Bài tập: {j.homework}</p>}</article>)}
    {tab === 'feedback' && <><p className="text-sm">Tổng hợp phản hồi về buổi bạn thực dạy. Phản hồi không tự động thay đổi lương.</p>{(entries as Feedback[]).map(f => <article key={f.month} className="rounded border p-4">{f.month.slice(0, 7)} — {f.response_count} phản hồi · Trung bình {f.overall_average}/5</article>)}</>}
    <nav aria-label="Phân trang" className="flex gap-4">{page > 1 && <Link prefetch={false} href={href(page - 1)}>Trang trước</Link>}{data.length > 25 && page < 4001 && <Link prefetch={false} href={href(page + 1)}>Trang tiếp</Link>}</nav>
  </main>
}
