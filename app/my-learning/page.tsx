import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/login/actions'
import { displayLabel } from '@/lib/display'
import { money } from '@/app/admin/payroll/data'
import Journey, { type Program } from './Journey'
import { submitFeedback } from './actions'
import ApprovedReport from './ApprovedReport'
import type { Snapshot } from '@/app/admin/reports/learning/data'

const tabs = { journey: 'Hành trình học tập', schedule: 'Lịch học', attendance: 'Điểm danh', reports: 'Báo cáo đã duyệt', debt: 'Công nợ hóa đơn', opening: 'Công nợ chuyển sang', credit: 'Tiền còn dư' }
type Tab = keyof typeof tabs
type Student = { id: string; student_code: string; full_name: string }
type Session = { session_id: string; starts_at: string; ends_at: string; class_name: string }
type Attendance = Session & { attendance_id: string; attendance_status: string; session_status: string }
type Debt = { invoice_id: string; invoice_number: string; currency: string; outstanding_balance: number; total_amount: number; allocated_amount: number }
type Opening = { receivable_id: string; opening_as_of_date: string; currency: string; outstanding_balance: number }
type Credit = { credit_id: string; currency: string; original_amount: number; applied_amount: number; refunded_amount: number; remaining_credit: number; voided_amount: number }
type Report = { report_id: string; period_start: string; period_end: string; snapshot: Partial<Omit<Snapshot, 'admin_note'>> }
function time(value: string) { return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }

async function feedbackContext(db: Awaited<ReturnType<typeof createClient>>) {
  const roles = await Promise.all(['STUDENT', 'PARENT'].map(async role => {
    const result = await db.rpc('has_role', { role_code: role })
    return !result.error && result.data === true ? role : null
  }))
  return { roles: roles.filter((role): role is string => role !== null), asOf: Date.now() }
}

export default async function MyLearning({ searchParams }: { searchParams: Promise<{ student?: string; tab?: string; page?: string; error?: string; success?: string }> }) {
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
  const rpc = { journey: 'portal_academic_journey', schedule: 'portal_upcoming_sessions', attendance: 'student_attendance_history', reports: 'student_approved_reports', debt: 'student_debt_history', opening: 'student_opening_balances', credit: 'student_customer_credits' }[tab]
  const loaded = student ? await db.rpc(rpc, { p_student: student.id, p_offset: offset, ...(['attendance', 'reports', 'debt'].includes(tab) ? { p_limit: 26 } : {}) }) : null
  if (loaded?.error) throw new Error('Không thể tải nội dung học tập. Vui lòng thử lại.')
  const data = loaded?.data || [], entries = data.slice(0, 25)
  const feedback = student && tab === 'attendance' ? await feedbackContext(db) : { roles: [], asOf: 0 }
  const respondents = feedback.roles
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-6 p-4 sm:p-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Hồ sơ học tập</h1><form action={logout}><button className="rounded border px-4 py-2">Đăng xuất</button></form></header>
    {params.success === 'feedback' && <p role="status">Đã gửi phản hồi buổi học.</p>}
    {params.error && <p role="alert">{params.error === 'feedback_duplicate' ? 'Bạn đã gửi phản hồi cho buổi học này.' : params.error === 'feedback_invalid' ? 'Vui lòng chọn vai trò, điểm từ 1–5 và nhận xét tối đa 4.000 ký tự.' : 'Không thể gửi phản hồi. Hãy kiểm tra quyền tài khoản và điều kiện buổi học.'}</p>}
    {!student ? <section className="space-y-3"><h2 className="text-xl font-semibold">Học viên của bạn</h2>{!students.length && <p>Chưa có hồ sơ được phép xem.</p>}{students.slice(0, 25).map(s => <Link className="block rounded border p-4" key={s.id} prefetch={false} href={`/my-learning?student=${s.id}`}>{s.full_name} — {s.student_code}</Link>)}</section> : <>
      <Link prefetch={false} href="/my-learning">Chọn học viên khác</Link><h2 className="text-xl font-semibold">{student.full_name} — {student.student_code}</h2>
      <nav aria-label="Hồ sơ học tập" className="flex flex-wrap gap-2">{Object.entries(tabs).map(([key, title]) => <Link key={key} prefetch={false} aria-current={tab === key ? 'page' : undefined} className={`rounded border px-3 py-2 ${tab === key ? 'bg-slate-900 text-white' : ''}`} href={href(1, key as Tab)}>{title}</Link>)}</nav>
      <h2 className="text-xl font-semibold">{tabs[tab]}</h2>
      {!entries.length && <p>Chưa có dữ liệu được phép xem trong mục này.</p>}
      {tab === 'journey' && <Journey programs={entries as Program[]}/>}
      {tab === 'schedule' && (entries as Session[]).map(s => <article key={s.session_id} className="rounded border p-4">{s.class_name}<p>{time(s.starts_at)} – {time(s.ends_at)}</p></article>)}
      {tab === 'attendance' && (entries as Attendance[]).map(s => <article key={s.attendance_id} className="space-y-3 rounded border p-4">{s.class_name}<p>{time(s.starts_at)} — {displayLabel(s.attendance_status)}</p>{respondents.length > 0 && s.session_status === 'COMPLETED' && ['PRESENT', 'LATE'].includes(s.attendance_status) && Date.parse(s.ends_at) <= feedback.asOf && <details><summary className="cursor-pointer">Phản hồi buổi học</summary><form action={submitFeedback} className="mt-3 space-y-3"><input type="hidden" name="student" value={student.id}/><input type="hidden" name="session" value={s.session_id}/><label className="block">Người gửi<select className="ml-2 rounded border p-2" name="respondent">{respondents.map(role => <option key={role} value={role}>{role === 'STUDENT' ? 'Học viên' : 'Phụ huynh'}</option>)}</select></label><label className="block">Đánh giá chung<select className="ml-2 rounded border p-2" name="rating" required defaultValue=""><option value="" disabled>Chọn điểm</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}/5</option>)}</select></label><label className="block">Nhận xét<textarea name="comment" maxLength={4000} className="mt-1 block w-full rounded border p-2" rows={3}/></label><button className="rounded border px-4 py-2">Gửi phản hồi</button></form></details>}</article>)}
      {tab === 'debt' && <><p className="text-sm">Các hóa đơn đã phát hành mà bạn được phép xem. Đây không phải tổng số dư tài khoản.</p>{(entries as Debt[]).map(d => <article key={d.invoice_id} className="rounded border p-4"><h3>{d.invoice_number}</h3><p>Tổng: {money(d.total_amount, d.currency)} · Đã phân bổ: {money(d.allocated_amount, d.currency)}</p><p>Còn phải trả: {money(d.outstanding_balance, d.currency)}</p></article>)}</>}
      {tab === 'reports' && (entries as Report[]).map(r => <article key={r.report_id} className="space-y-2 rounded border p-4"><h3 className="font-semibold">{r.period_start} – {r.period_end}</h3><p>Đã duyệt</p><ApprovedReport snapshot={r.snapshot}/></article>)}
      {tab === 'opening' && (entries as Opening[]).map(o => <article key={o.receivable_id} className="rounded border p-4"><p>Công nợ chuyển sang ngày {o.opening_as_of_date}</p><p>Còn phải trả: {money(o.outstanding_balance, o.currency)}</p></article>)}
      {tab === 'credit' && <><p className="text-sm">Tiền đang giữ cho học viên, chưa tự động phân bổ sang học phí khác. Liên hệ quản lý để yêu cầu sử dụng hoặc hoàn tiền theo quy trình.</p>{(entries as Credit[]).map(c => <article key={c.credit_id} className="space-y-1 rounded border p-4"><p>Ban đầu: {money(c.original_amount, c.currency)}</p><p>Đã sử dụng: {money(c.applied_amount, c.currency)} · Đã hoàn: {money(c.refunded_amount, c.currency)}</p>{c.voided_amount > 0 && <p>Đã vô hiệu: {money(c.voided_amount, c.currency)}</p>}<p className="font-semibold">Còn dư: {money(c.remaining_credit, c.currency)}</p></article>)}</>}
    </>}
    <nav aria-label="Phân trang" className="flex gap-4">{page > 1 && <Link prefetch={false} href={href(page - 1)}>Trang trước</Link>}{(student ? data.length : students.length) > 25 && page < 4001 && <Link prefetch={false} href={href(page + 1)}>Trang tiếp</Link>}</nav>
  </main>
}
