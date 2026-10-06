import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { displayLabel } from '@/lib/display'

const tabs = { schedule: 'Lịch dạy', classes: 'Lớp đang phụ trách', history: 'Buổi đã thực dạy', journals: 'Nhật ký được phép xem', feedback: 'Tổng hợp phản hồi' }
type Tab = keyof typeof tabs
type Session = { session_id: string; class_name: string; starts_at: string; ends_at: string; status: string; room_name: string | null; roster_count: number }
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
  const dayKey = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
  const todayKey = dayKey(new Date().toISOString())
  const dayLabel = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date(value))
  const hour = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  const sessions = ['schedule', 'history'].includes(tab) ? entries as Session[] : []
  const todayCount = tab === 'schedule' ? sessions.filter(s => dayKey(s.starts_at) === todayKey).length : 0
  const groups = new Map<string, Session[]>()
  for (const item of sessions) { const key = dayKey(item.starts_at); groups.set(key, [...(groups.get(key) ?? []), item]) }
  const card = 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm'
  const button = 'inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold !text-white !no-underline hover:bg-slate-700'
  const actions = [
    { href: '/my-attendance', title: 'Chấm công', text: 'Quét mã vào ca, ra ca hôm nay' },
    { href: '/my-expenses', title: 'Công tác phí', text: 'Tạo bảng kê từ chuyến công tác đã duyệt' },
    { href: '/my-payroll', title: 'Bảng lương', text: 'Xem phiếu lương và điều chỉnh đã duyệt' },
    { href: '/operations', title: 'Học viên & lớp', text: 'Danh sách học viên trong phân công, mở học bạ' },
  ]
  return <main className="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-8">
    <div><p className="text-sm text-gray-500">{new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full' }).format(new Date())}</p><h1 className="text-2xl font-bold">Không gian giáo viên</h1></div>
    <section aria-label="Việc cần làm" className="grid gap-4 sm:grid-cols-3">
      <div className={card}><p className="text-sm text-gray-500">Buổi dạy hôm nay</p><p className="mt-1 text-3xl font-bold">{todayCount}</p></div>
      <div className={card}><p className="text-sm text-gray-500">Buổi sắp tới</p><p className="mt-1 text-3xl font-bold">{tab === 'schedule' ? sessions.length : '—'}</p></div>
      <div className={card}><p className="text-sm text-gray-500">Điểm danh và nhật ký</p><p className="mt-1 text-sm">Mở một buổi dạy bên dưới để điểm danh từng học viên, ghi nhật ký và cập nhật tiến độ.</p></div>
    </section>
    <section aria-label="Lối tắt" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map(action => <Link key={action.href} prefetch={false} href={action.href} className={`${card} block !no-underline hover:border-slate-400`}><span className="block font-semibold !text-gray-900">{action.title}</span><span className="mt-1 block text-sm !text-gray-600">{action.text}</span></Link>)}
    </section>
    <nav aria-label="Giáo viên" className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">{Object.entries(tabs).map(([key, title]) => <Link key={key} prefetch={false} href={href(1, key as Tab)} aria-current={tab === key ? 'page' : undefined} className={`rounded-lg border px-3 py-2 text-sm font-medium !no-underline ${tab === key ? 'border-slate-900 bg-slate-900 !text-white' : 'border-gray-300 bg-white !text-gray-700 hover:bg-gray-50'}`}>{title}</Link>)}</nav>
    <h2 className="text-xl font-semibold">{tabs[tab]}</h2>
    {tab === 'schedule' && <p className="text-sm text-gray-600">Lịch và lịch sử dựa trên giáo viên thực dạy. Khi kết thúc phân công, bạn chỉ giữ quyền xem buổi đã thực dạy và nhật ký mình viết.</p>}
    {!entries.length && <div className={`${card} text-center text-gray-600`}>{tab === 'schedule' ? 'Bạn chưa có buổi dạy nào sắp tới. Khi quản lý xếp lịch, buổi dạy sẽ hiện ở đây.' : 'Chưa có dữ liệu được phép xem trong mục này.'}</div>}
    {[...groups.entries()].map(([key, list]) => <section key={key} className="space-y-3"><h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{key === todayKey ? 'Hôm nay · ' : ''}{dayLabel(list[0].starts_at)}</h3>
      {list.map(s => <article key={s.session_id} className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div><h3 className="text-lg font-semibold">{s.class_name}</h3><p className="text-sm text-gray-600">{hour(s.starts_at)} – {hour(s.ends_at)} · {s.room_name ?? 'Chưa xếp phòng'} · {s.roster_count} học viên</p><p className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{displayLabel(s.status)}</p></div>
        <Link prefetch={false} href={`/operations/teacher/sessions/${s.session_id}`} className={button}>{s.status === 'SCHEDULED' ? 'Mở ca dạy: điểm danh & ghi nhật ký' : 'Mở ca dạy'}</Link>
      </article>)}</section>)}
    {tab === 'classes' && (entries as Class[]).map(c => <article key={c.class_id} className={card}><span className="font-semibold">{c.code}</span> — {c.name}</article>)}
    {tab === 'journals' && (entries as Journal[]).map(j => <article key={j.journal_id} className={`${card} space-y-2`}><h3 className="font-semibold">{j.class_name} — {time(j.starts_at)}</h3>{j.is_author && <p className="text-sm text-gray-500">Nhật ký do bạn viết</p>}<p className="whitespace-pre-wrap">{j.content}</p>{j.repertoire && <p>Tác phẩm: {j.repertoire}</p>}{j.skills && <p>Kỹ năng: {j.skills}</p>}{j.homework && <p>Bài tập: {j.homework}</p>}</article>)}
    {tab === 'feedback' && <><p className="text-sm text-gray-600">Tổng hợp phản hồi về buổi bạn thực dạy. Phản hồi không tự động thay đổi lương.</p>{(entries as Feedback[]).map(f => <article key={f.month} className={card}>{f.month.slice(0, 7)} — {f.response_count} phản hồi · Trung bình {f.overall_average}/5</article>)}</>}
    <nav aria-label="Phân trang" className="flex gap-4">{page > 1 && <Link prefetch={false} href={href(page - 1)}>Trang trước</Link>}{data.length > 25 && page < 4001 && <Link prefetch={false} href={href(page + 1)}>Trang tiếp</Link>}</nav>
  </main>
}
