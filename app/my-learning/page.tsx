import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { displayLabel } from '@/lib/display'
import { money } from '@/app/admin/payroll/data'
import Journey, { type Program } from './Journey'

const tabs = { journey: 'Hành trình học tập', schedule: 'Lịch học', attendance: 'Điểm danh', reports: 'Báo cáo đã duyệt', debt: 'Công nợ hóa đơn' }
type Tab = keyof typeof tabs
type Student = { id: string; student_code: string; full_name: string }
type Session = { session_id: string; starts_at: string; ends_at: string; class_name: string }
type Attendance = Session & { attendance_id: string; attendance_status: string }
type Debt = { invoice_id: string; invoice_number: string; currency: string; outstanding_balance: number; total_amount: number; allocated_amount: number }
type Report = { report_id: string; period_start: string; period_end: string; snapshot: { teacher_summary?: { general_comment?: string; strengths?: string; improvement_areas?: string; next_focus?: string } } }
function time(value: string) { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }

export default async function MyLearning({ searchParams }: { searchParams: Promise<{ student?: string; tab?: string; page?: string }> }) {
  const params = await searchParams, db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  if (params.student && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.student)) notFound()
  const tab: Tab = params.tab && Object.hasOwn(tabs, params.tab) ? params.tab as Tab : 'journey'
  const page = Math.min(4001, Math.max(1, Number.parseInt(params.page || '1', 10) || 1)), offset = (page - 1) * 25
  const result = await db.rpc('portal_students', { p_student: params.student || null, p_offset: params.student ? 0 : offset })
  if (result.error) throw new Error('Không thể tải hồ sơ học tập. Vui lòng thử lại.')
  const students = (result.data || []) as Student[]
  if (params.student && !students.length) notFound()
  const student = params.student ? students[0] : null
  const href = (nextPage: number, nextTab = tab) => `/my-learning?${new URLSearchParams({ ...(student ? { student: student.id } : {}), tab: nextTab, page: String(nextPage) })}`
  const rpc = { journey: 'portal_academic_journey', schedule: 'portal_upcoming_sessions', attendance: 'student_attendance_history', reports: 'student_approved_reports', debt: 'student_debt_history' }[tab]
  const loaded = student ? await db.rpc(rpc, { p_student: student.id, p_offset: offset, ...(['attendance', 'reports', 'debt'].includes(tab) ? { p_limit: 26 } : {}) }) : null
  if (loaded?.error) throw new Error('Không thể tải nội dung học tập. Vui lòng thử lại.')
  const data = loaded?.data || [], entries = data.slice(0, 25)
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-6 p-4 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Hồ sơ học tập</h1><form action={logout}><button className="rounded border px-4 py-2">Đăng xuất</button></form></header>
    {!student ? <section className="space-y-3"><h2 className="text-xl font-semibold">Học viên của bạn</h2>{!students.length && <p>Chưa có hồ sơ được phép xem.</p>}{students.slice(0, 25).map(s => <Link className="block rounded border p-4" key={s.id} prefetch={false} href={`/my-learning?student=${s.id}`}>{s.full_name} — {s.student_code}</Link>)}</section> : <>
      <Link prefetch={false} href="/my-learning">Chọn học viên khác</Link><h2 className="text-xl font-semibold">{student.full_name} — {student.student_code}</h2>
      <nav aria-label="Hồ sơ học tập" className="flex flex-wrap gap-2">{Object.entries(tabs).map(([key, title]) => <Link key={key} prefetch={false} aria-current={tab === key ? 'page' : undefined} className={`rounded border px-3 py-2 ${tab === key ? 'bg-slate-900 text-white' : ''}`} href={href(1, key as Tab)}>{title}</Link>)}</nav>
      <h2 className="text-xl font-semibold">{tabs[tab]}</h2>
      {!entries.length && <p>Chưa có dữ liệu được phép xem trong mục này.</p>}
      {tab === 'journey' && <Journey programs={entries as Program[]}/>}
      {tab === 'schedule' && (entries as Session[]).map(s => <article key={s.session_id} className="rounded border p-4">{s.class_name}<p>{time(s.starts_at)} – {time(s.ends_at)}</p></article>)}
      {tab === 'attendance' && (entries as Attendance[]).map(s => <article key={s.attendance_id} className="rounded border p-4">{s.class_name}<p>{time(s.starts_at)} — {displayLabel(s.attendance_status)}</p></article>)}
      {tab === 'debt' && <><p className="text-sm">Các hóa đơn đã phát hành mà bạn được phép xem. Đây không phải tổng số dư tài khoản.</p>{(entries as Debt[]).map(d => <article key={d.invoice_id} className="rounded border p-4"><h3>{d.invoice_number}</h3><p>Tổng: {money(d.total_amount, d.currency)} · Đã phân bổ: {money(d.allocated_amount, d.currency)}</p><p>Còn phải trả: {money(d.outstanding_balance, d.currency)}</p></article>)}</>}
      {tab === 'reports' && (entries as Report[]).map(r => <article key={r.report_id} className="space-y-2 rounded border p-4"><h3 className="font-semibold">{r.period_start} – {r.period_end}</h3><p>Đã duyệt</p>{Object.entries(r.snapshot.teacher_summary || {}).map(([key, value]) => <p className="whitespace-pre-wrap" key={key}>{value}</p>)}</article>)}
    </>}
    <nav aria-label="Phân trang" className="flex gap-4">{page > 1 && <Link prefetch={false} href={href(page - 1)}>Trang trước</Link>}{(student ? data.length : students.length) > 25 && page < 4001 && <Link prefetch={false} href={href(page + 1)}>Trang tiếp</Link>}</nav>
  </main>
}
