import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Journey, { type Program } from '@/app/my-learning/Journey'

export default async function TeacherAcademic({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params, query = await searchParams, db = await createClient()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  const role = await db.rpc('has_role', { role_code: 'TEACHER' })
  if (role.error || role.data !== true) redirect('/login?error=Unauthorized')
  const student = await db.rpc('scoped_students', { p_student: id })
  if (student.error) throw new Error('Không thể tải hồ sơ học viên.')
  if (!student.data?.length) notFound()
  const page = Math.min(4001, Math.max(1, Number.parseInt(query.page || '1', 10) || 1))
  const result = await db.rpc('portal_academic_journey', { p_student: id, p_offset: (page - 1) * 25 })
  if (result.error) throw new Error('Không thể tải học bạ.')
  const programs = (result.data || []) as Program[]
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-5 p-4 sm:p-8"><Link prefetch={false} href="/operations">Học viên được phân công</Link><h1 className="text-2xl font-bold">Học bạ — {student.data[0].full_name}</h1><p>Chỉ đọc trong phạm vi phân công còn hiệu lực.</p>{!programs.length && <p>Chưa có chương trình được phép xem.</p>}<Journey programs={programs.slice(0, 25)}/><nav className="flex gap-4" aria-label="Phân trang">{page > 1 && <Link prefetch={false} href={`?page=${page - 1}`}>Trang trước</Link>}{programs.length > 25 && page < 4001 && <Link prefetch={false} href={`?page=${page + 1}`}>Trang tiếp</Link>}</nav></main>
}
