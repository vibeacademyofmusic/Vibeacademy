import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { decidePauseRequest } from './actions'

type RequestRow = {
  id: string
  starts_on: string
  ends_on: string
  reason: string
  status: string
  decided_at: string | null
  decided_by: string | null
  decision_note: string | null
  enrollments: {
    id: string
    students: { full_name: string | null; student_code: string | null } | null
    classes: { name: string | null; code: string | null; branches: { name: string | null } | null } | null
  } | null
}

const statuses = ['REQUESTED', 'APPROVED', 'REJECTED'] as const

export default async function PauseRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; success?: string; request?: string }> }) {
  const params = await searchParams
  const status = statuses.includes(params.status as typeof statuses[number]) ? params.status! : 'REQUESTED'
  const db = await createClient()
  const { data, error } = await db.from('enrollment_pause_requests').select('id, starts_on, ends_on, reason, status, decided_at, decision_note, decided_by, enrollments(id, students(full_name, student_code), classes(name, code, branches(name)))').eq('status', status).order('created_at', { ascending: false }).limit(50)
  const rows = (data ?? []) as unknown as RequestRow[]
  const actorIds = [...new Set((data ?? []).map(row => row.decided_by).filter((id): id is string => typeof id === 'string'))]
  const { data: actors } = actorIds.length ? await db.from('profiles').select('id, full_name').in('id', actorIds) : { data: [] }
  const actorName = new Map((actors ?? []).map(actor => [actor.id, actor.full_name]))
  return <div className="min-w-0 space-y-6 text-[var(--vibe-navy)]">
    <div>
      <h1 className="text-3xl font-bold">Duyệt bảo lưu</h1>
      <p className="mt-2 text-sm text-[var(--vibe-muted)]">Chỉ các yêu cầu trong phạm vi được xem. Duyệt hoặc từ chối dùng quy trình hiện có, không tự tạo học phí, hoàn tiền hay điểm danh.</p>
    </div>
    <nav aria-label="Lọc trạng thái" className="flex flex-wrap gap-2">
      {statuses.map(item => <Link key={item} href={'/admin/academic/pause-requests?status=' + item} className={'rounded-full border px-3 py-2 text-sm ' + (item === status ? 'border-[var(--vibe-gold)] bg-white font-semibold' : 'border-[var(--vibe-line)] bg-white')}>{item === 'REQUESTED' ? 'Cần quyết định' : item === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối'}</Link>)}
    </nav>
    {params.error && <p role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{params.error}</p>}
    {params.success && <p role="status" className="rounded-xl border border-[var(--vibe-line)] bg-white p-4 text-sm">{params.success}</p>}
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-white p-4">Không tải được danh sách yêu cầu.</p> : rows.length === 0 ? <p className="rounded-xl border border-[var(--vibe-line)] bg-white p-4">Không có yêu cầu ở trạng thái này.</p> : <ul className="space-y-4">
      {rows.map(row => {
        const student = row.enrollments?.students
        const classItem = row.enrollments?.classes
        return <li key={row.id} className="rounded-2xl border border-[var(--vibe-line)] bg-white p-5">
          <p className="font-semibold">{student?.full_name ?? student?.student_code ?? 'Học viên'} · {classItem?.name ?? classItem?.code ?? 'Lớp'} · {classItem?.branches?.name ?? 'Chi nhánh'}</p>
          <p className="mt-2 text-sm">{row.starts_on} → {row.ends_on}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{row.reason}</p>
          <p className="mt-2 text-sm">{row.status === 'REQUESTED' ? 'Cần quyết định' : row.status === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối'}{row.decided_at ? ` · ${actorName.get(row.decided_by ?? '') ?? 'Người quyết định'} · ${row.decided_at}` : ''}</p>
          {row.decision_note && <p className="mt-1 text-sm text-[var(--vibe-muted)]">{row.decision_note}</p>}
          {row.enrollments?.id && <p className="mt-2 text-sm"><Link className="underline" href={'/admin/enrollments/' + row.enrollments.id + '/pauses'}>Xem ghi danh</Link></p>}
          {row.status === 'REQUESTED' && <form action={decidePauseRequest} className="mt-4 grid gap-3">
            <input type="hidden" name="request_id" value={row.id} />
            <input type="hidden" name="status" value={status} />
            <label className="text-sm font-medium" htmlFor={'note-' + row.id}>Ghi chú quyết định</label>
            <textarea id={'note-' + row.id} name="note" required minLength={1} maxLength={500} rows={3} className="rounded-xl border border-[var(--vibe-line)] p-3" />
            <div className="flex flex-wrap gap-2">
              <button name="decision" value="approve" className="rounded-lg bg-[var(--vibe-navy)] px-4 py-2 text-sm text-white">Duyệt</button>
              <button name="decision" value="reject" className="rounded-lg border border-[var(--vibe-line)] bg-white px-4 py-2 text-sm">Từ chối</button>
            </div>
          </form>}
        </li>
      })}
    </ul>}
  </div>
}
