
export const studentOpsTabs = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'students', label: 'Học viên đang hoạt động' },
  { id: 'waiting', label: 'Chờ vào ca dạy' },
  { id: 'teaching-shifts', label: 'Ca dạy' },
  { id: 'schedule', label: 'Lịch học' },
  { id: 'attendance', label: 'Điểm danh' },
  { id: 'reports', label: 'Báo cáo học tập' },
  { id: 'feedback', label: 'Phản hồi buổi học' },
] as const

export type StudentOpsTab = (typeof studentOpsTabs)[number]['id']

export function studentOpsHref(tab: StudentOpsTab, extra?: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  if (tab !== 'overview') query.set('tab', tab)
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) query.set(key, value)
  }
  const text = query.toString()
  return text ? `/admin/students?${text}` : '/admin/students'
}

export function StudentOpsShell({ tab, children }: { tab: StudentOpsTab; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--vibe-navy)]">Học viên</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--vibe-muted)]">
          Quản lý hồ sơ, ca dạy, lịch học, điểm danh và quá trình học tập của học viên.
        </p>
      </header>
      {(['overview', 'students', 'waiting'] as StudentOpsTab[]).includes(tab) && (
        <form action="/admin/students" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-[var(--vibe-navy)]">Danh sách học viên
            <select name="tab" defaultValue={tab} className="ml-3 rounded-lg border border-[var(--vibe-line)] bg-white px-3 py-2">
              <option value="overview">Tổng quan học viên</option>
              <option value="students">Học viên đang hoạt động</option>
              <option value="waiting">Chờ vào ca dạy</option>
            </select>
          </label>
          <button className="vibe-button" type="submit">Xem</button>
        </form>
      )}
      {children}
    </div>
  )
}
