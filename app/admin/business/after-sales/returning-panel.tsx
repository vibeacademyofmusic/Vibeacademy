import { businessDate } from '@/app/admin/_lib/business-date'
import { EmptyState, InlineNotice, MetricCard, SectionCard, SelectField } from '@/app/admin/_components/vibe'
import { createClient } from '@/lib/supabase/server'

import { cohortRate, formatRate } from '../reports/model'
import { afterSalesPath } from '../workspaces'
import { refreshReactivation, transitionReactivation } from '../reactivation/actions'

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

export async function ReturningCustomersPanel({
  filters,
  canManage,
}: {
  filters: { error?: string; success?: string; branch?: string; reason?: string; status?: string }
  canManage: boolean
}) {
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
    <>
      {filters.error && <InlineNotice tone="error">{filters.error}</InlineNotice>}
      {filters.success && <InlineNotice>{filters.success}</InlineNotice>}
      <div className="vibe-metrics">
        <MetricCard title="Đã mở trong tháng" value={opened} />
        <MetricCard title="Đã quay lại" value={returned} />
        <MetricCard title="Tỷ lệ quay lại" value={formatRate(cohortRate(returned, opened))} />
      </div>
      <form className="vibe-filter" action={afterSalesPath} method="get">
        <input type="hidden" name="tab" value="returning" />
        <SelectField label="Chi nhánh" name="branch" defaultValue={filters.branch || ''}><option value="">Mọi chi nhánh</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
        <SelectField label="Lý do" name="reason" defaultValue={filters.reason || ''}><option value="">Mọi lý do</option>{Object.entries(reasonLabel).map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}</SelectField>
        <SelectField label="Trạng thái" name="status" defaultValue={filters.status || ''}><option value="">Mọi trạng thái</option>{Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</SelectField>
        <button className="vibe-button vibe-button-primary" type="submit">Lọc</button>
      </form>
      {canManage && (
        <form action={refreshReactivation} className="vibe-filter">
          <SelectField label="Phạm vi làm mới" name="branch_id" defaultValue={filters.branch || ''}><option value="">Làm mới mọi chi nhánh được phép</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
          <button className="vibe-button" type="submit">Làm mới danh sách</button>
        </form>
      )}
      {cases.map(row => {
        const overdue = row.reference_on ? Math.floor((Date.parse(today) - Date.parse(row.reference_on)) / 86400000) : null
        return (
          <SectionCard key={row.id} title={studentName.get(row.student_id) || 'Học viên'}>
            <p>{branchName.get(row.branch_id) || 'Chi nhánh'} · {row.program_name || 'Chưa có bộ môn'} · {reasonLabel[row.source_reason] || row.source_reason} · {statusLabel[row.status] || row.status}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-4">
              <div><dt>Ngày dừng / hết bảo lưu</dt><dd>{row.reference_on || '—'}</dd></div>
              <div><dt>Số ngày quá hạn</dt><dd>{overdue == null ? '—' : overdue}</dd></div>
              <div><dt>Liên hệ cuối</dt><dd>{row.last_contact_at ? new Date(row.last_contact_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}</dd></div>
              <div><dt>Follow-up</dt><dd>{row.next_follow_up_on || '—'}</dd></div>
            </dl>
            {canManage && (
              <div className="vibe-actions">
                {(nextStatus[row.status] ?? []).map(step => (
                  <form key={step.status} action={transitionReactivation} className="vibe-filter">
                    <input type="hidden" name="case_id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <input type="hidden" name="to_status" value={step.status} />
                    {step.note && <input name="note" required placeholder="Ghi chú" aria-label="Ghi chú" className="rounded-lg border px-3 py-2 text-sm" />}
                    <button className="vibe-button" type="submit">{step.label}</button>
                  </form>
                ))}
              </div>
            )}
          </SectionCard>
        )
      })}
      {cases.length === 0 && <EmptyState>{canManage ? 'Chưa có hồ sơ. Dùng làm mới danh sách để phát hiện học viên đủ điều kiện.' : 'Chưa có hồ sơ trong phạm vi được xem.'}</EmptyState>}
    </>
  )
}
