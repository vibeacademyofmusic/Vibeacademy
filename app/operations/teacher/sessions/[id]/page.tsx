import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { displayLabel } from '@/lib/display'

export default async function TeacherAttendance({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params, query = await searchParams, db = await createClient()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  const header = await db.rpc('teacher_portal_session', { p_session: id })
  if (header.error) throw new Error('Không thể tải buổi học.')
  if (!header.data?.length) notFound()
  const session = header.data[0] as { class_name: string; starts_at: string; status: string }
  const page = Math.min(4001, Math.max(1, Number.parseInt(query.page || '1', 10) || 1))
  const result = await db.rpc('teacher_portal_attendance', { p_session: id, p_offset: (page - 1) * 25 })
  if (result.error) throw new Error('Không thể tải điểm danh.')
  const rows = (result.data || []) as { attendance_id: string; student_name: string; status: string }[]
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-4 sm:p-8"><Link prefetch={false} href="/operations/teacher">Không gian giáo viên</Link><h1 className="text-2xl font-bold">Điểm danh — {session.class_name}</h1><p>{new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(session.starts_at))} — {displayLabel(session.status)}</p><p>Chỉ đọc theo quyền hiện có. Hồ sơ hiện tại của học viên được ẩn khi bạn không còn phân công hợp lệ.</p>{!rows.length && <p>Chưa có bản ghi điểm danh.</p>}{rows.slice(0, 25).map(row => <p key={row.attendance_id} className="rounded border p-3">{row.student_name} — {displayLabel(row.status)}</p>)}<nav className="flex gap-4" aria-label="Phân trang">{page > 1 && <Link prefetch={false} href={`?page=${page - 1}`}>Trang trước</Link>}{rows.length > 25 && page < 4001 && <Link prefetch={false} href={`?page=${page + 1}`}>Trang tiếp</Link>}</nav></main>
}
