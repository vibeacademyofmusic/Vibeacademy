import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireOperationsStaff } from '../../lib/authorization'
import { logout } from '../login/actions'
import { updateStudentBasic } from '../admin/students/actions'

type Student = { id: string; student_code: string; full_name: string; preferred_name: string | null }
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ student?: string; error?: string; success?: string }> }) {
  const params = await searchParams
  const db = await requireOperationsStaff()
  if (params.student && !/^[0-9a-f-]{36}$/i.test(params.student)) notFound()
  const [students, classes, sessions] = await Promise.all([
    db.rpc('scoped_students', { p_student: params.student || null }),
    db.from('classes').select('id,code,name,branch_id,branches(name)').order('code').limit(100),
    db.from('session_occurrences').select('id,occurrence_date,status,starts_at').order('occurrence_date', { ascending: false }).limit(100),
  ])
  if (students.error || classes.error || sessions.error) throw new Error('Không thể tải dữ liệu thao tác')
  const roster = (students.data ?? []) as Student[]
  if (params.student && roster.length === 0) notFound()
  const edit = params.student ? await db.rpc('student_branch_permission', { p_student: params.student, p_permission: 'students.update_basic' }) : null
  const teacher = await db.rpc('has_role', { role_code: 'TEACHER' })
  return <main className="mx-auto w-full min-w-0 max-w-5xl space-y-6 p-6">
    <header className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-bold">Thao tác đào tạo</h1><form action={logout}><button className="rounded border px-4 py-2">Đăng xuất</button></form></header>
    <p>Dữ liệu theo chi nhánh và phân công hiện tại của bạn. Giáo viên dạy thay chỉ xem các buổi được phân công và học viên liên quan.</p>
    {!teacher.error && teacher.data === true && <Link prefetch={false} href="/operations/teacher">Không gian giáo viên: lịch dạy, nhật ký và bảng lương</Link>}
    {params.error && <p role="alert">{params.error}</p>}{params.success && <p role="status">{params.success}</p>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Học viên</h2>
      {roster.length === 0 && <p>Không có học viên trong phạm vi của bạn.</p>}
      {roster.map(student => <div key={student.id} className="rounded border p-3"><Link prefetch={false} href={`/operations?student=${student.id}`}>{student.student_code} — {student.full_name}</Link>
        {!teacher.error && teacher.data === true && <Link className="ml-3" prefetch={false} href={`/operations/teacher/students/${student.id}`}>Xem học bạ</Link>}
        {edit?.data === true && !edit.error && <form action={updateStudentBasic} className="mt-3 flex flex-wrap gap-3">
          <input type="hidden" name="id" value={student.id}/><label>Họ tên<input className="block rounded border p-2" name="full_name" required maxLength={200} defaultValue={student.full_name}/></label><label>Tên thường gọi<input className="block rounded border p-2" name="preferred_name" maxLength={200} defaultValue={student.preferred_name ?? ''}/></label><button className="rounded border px-4 py-2">Lưu tên học viên</button>
        </form>}</div>)}
      {params.student && <Link href="/operations" prefetch={false}>Tất cả học viên được phép xem</Link>}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Lớp học</h2><p>Tối đa 100 lớp trong phạm vi được phép.</p>
      {classes.data?.map(item => <p key={item.id}>{item.code} — {item.name} — {Array.isArray(item.branches) ? item.branches.map(branch => branch.name).join(', ') : (item.branches as { name: string } | null)?.name}</p>)}
    </section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Buổi học</h2><p>Tối đa 100 buổi gần nhất trong phạm vi được phép.</p>
      {sessions.data?.map(item => <p key={item.id}>{item.occurrence_date} — {item.status}</p>)}
    </section>
  </main>
}
