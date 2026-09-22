import { businessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { cohortRate, formatRate } from '../reports/model'
import { refreshReactivation, transitionReactivation } from './actions'

const reasonLabel: Record<string, string> = {
  INACTIVE_STUDENT: 'Học viên đã ngừng',
  PAUSE_ENDED_NOT_RETURNED: 'Hết bảo lưu nhưng chưa quay lại',
}
const statusLabel: Record<string, string> = {
  NEW_REACTIVATION: 'Mới',
  CONTACTED: 'Đã liên hệ',
  INTERESTED: 'Quan tâm quay lại',
  TRIAL_OR_PLACEMENT: 'Hẹn đánh giá / học thử',
  OFFER_SENT: 'Đã gửi đề xuất',
  RETURNED: 'Đã quay lại',
  NOT_INTERESTED: 'Không quan tâm',
  LOST: 'Mất',
}
const nextStatus: Record<string, { status: string; label: string; note?: boolean }[]> = {
  NEW_REACTIVATION: [{ status: 'CONTACTED', label: 'Đã liên hệ' }, { status: 'NOT_INTERESTED', label: 'Không quan tâm', note: true }, { status: 'LOST', label: 'Mất', note: true }],
  CONTACTED: [{ status: 'INTERESTED', label: 'Quan tâm quay lại' }, { status: 'NOT_INTERESTED', label: 'Không quan tâm', note: true }, { status: 'LOST', label: 'Mất', note: true }],
  INTERESTED: [{ status: 'TRIAL_OR_PLACEMENT', label: 'Hẹn đánh giá / học thử' }, { status: 'NOT_INTERESTED', label: 'Không quan tâm', note: true }, { status: 'LOST', label: 'Mất', note: true }],
  TRIAL_OR_PLACEMENT: [{ status: 'OFFER_SENT', label: 'Gửi đề xuất' }, { status: 'NOT_INTERESTED', label: 'Không quan tâm', note: true }, { status: 'LOST', label: 'Mất', note: true }],
  OFFER_SENT: [{ status: 'RETURNED', label: 'Đã quay lại' }, { status: 'NOT_INTERESTED', label: 'Không quan tâm', note: true }, { status: 'LOST', label: 'Mất', note: true }],
}

export default async function ReactivationPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; branch?: string; reason?: string; status?: string }> }) {
  const filters = await searchParams
  const today = businessDate()
  const db = await createClient()
  let query = db.from('crm_reactivation_cases').select('id, student_id, branch_id, source_reason, status, program_name, reference_on, last_contact_at, next_follow_up_on, latest_note, version, owner_user_id').order('opened_at', { ascending: false }).limit(100)
  if (filters.branch) query = query.eq('branch_id', filters.branch)
  if (filters.reason) query = query.eq('source_reason', filters.reason)
  if (filters.status) query = query.eq('status', filters.status)
  const [{ data: rows }, { data: branches }, { data: report }] = await Promise.all([
    query,
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.rpc('crm_reactivation_report', { p_from: `${today.slice(0, 7)}-01`, p_to: today, p_branch: filters.branch || null, p_reason: filters.reason || null, p_owner: null }),
  ])
  const cases = (rows ?? []) as { id: string; student_id: string; branch_id: string; source_reason: string; status: string; program_name: string | null; reference_on: string | null; last_contact_at: string | null; next_follow_up_on: string | null; latest_note: string | null; version: number; owner_user_id: string | null }[]
  const studentIds = [...new Set(cases.map(row => row.student_id))]
  const { data: students } = studentIds.length ? await db.from('students').select('id, full_name').in('id', studentIds) : { data: [] }
  const studentName = new Map((students ?? []).map(student => [student.id, student.full_name]))
  const branchName = new Map((branches ?? []).map(branch => [branch.id, branch.name]))
  const reportRows = (report ?? []) as { metric: string; value: number }[]
  const opened = Number(reportRows.find(row => row.metric === 'opened')?.value ?? 0)
  const returned = Number(reportRows.find(row => row.metric === 'returned')?.value ?? 0)

  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">Khách hàng cũ</h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">Chỉ mở hồ sơ khi học viên đã ngừng, hoặc bảo lưu đã kết thúc và học viên chưa có ghi danh đang học. Bảo lưu còn hạn không được tính quá hạn.</p>
      {filters.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{filters.error}</div>}
      {filters.success && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{filters.success}</div>}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Đã mở trong tháng</h2><p className="mt-2 text-2xl font-semibold">{opened}</p></article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Đã quay lại</h2><p className="mt-2 text-2xl font-semibold">{returned}</p></article>
        <article className="rounded-2xl border border-gray-200 bg-white p-4"><h2 className="text-sm text-gray-500">Tỷ lệ quay lại</h2><p className="mt-2 text-2xl font-semibold">{formatRate(cohortRate(returned, opened))}</p></article>
      </div>
      <form className="mt-6 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-4">
        <select name="branch" defaultValue={filters.branch || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi chi nhánh</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select name="reason" defaultValue={filters.reason || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi lý do</option>{Object.entries(reasonLabel).map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}</select>
        <select name="status" defaultValue={filters.status || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi trạng thái</option>{Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>
        <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Lọc</button>
      </form>
      <form action={refreshReactivation} className="mt-4 flex gap-2">
        <select name="branch_id" defaultValue={filters.branch || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Làm mới mọi chi nhánh được phép</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Làm mới danh sách</button>
      </form>
      <div className="mt-6 space-y-4">
        {cases.map(row => {
          const overdue = row.reference_on ? Math.floor((Date.parse(today) - Date.parse(row.reference_on)) / 86400000) : null
          return (
            <section key={row.id} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{studentName.get(row.student_id) || 'Học viên'}</h2>
                  <p className="mt-1 text-sm text-gray-500">{branchName.get(row.branch_id) || ''} · {row.program_name || 'Chưa có bộ môn'} · {reasonLabel[row.source_reason] || row.source_reason}</p>
                </div>
                <p className="text-sm">{statusLabel[row.status] || row.status}</p>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <div><dt className="text-gray-500">Ngày dừng / hết bảo lưu</dt><dd>{row.reference_on || '—'}</dd></div>
                <div><dt className="text-gray-500">Số ngày quá hạn</dt><dd>{overdue == null ? '—' : overdue}</dd></div>
                <div><dt className="text-gray-500">Liên hệ cuối</dt><dd>{row.last_contact_at ? new Date(row.last_contact_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</dd></div>
                <div><dt className="text-gray-500">Follow-up</dt><dd>{row.next_follow_up_on || '—'}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {(nextStatus[row.status] ?? []).map(step => (
                  <form key={step.status} action={transitionReactivation} className="flex gap-2">
                    <input type="hidden" name="case_id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <input type="hidden" name="to_status" value={step.status} />
                    {step.note && <input name="note" required placeholder="Ghi chú" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />}
                    <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">{step.label}</button>
                  </form>
                ))}
              </div>
            </section>
          )
        })}
        {cases.length === 0 && <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Chưa có hồ sơ. Dùng làm mới danh sách để phát hiện học viên đủ điều kiện.</p>}
      </div>
    </div>
  )
}
