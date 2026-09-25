import Link from 'next/link'

export const studentOpsTabs = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'students', label: 'Hồ sơ học viên' },
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
        <h1 className="text-3xl font-bold tracking-tight text-gray-950">Học viên</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Quản lý hồ sơ, ca dạy, lịch học, điểm danh và quá trình học tập của học viên.
        </p>
      </header>
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Học viên">
        {studentOpsTabs.map(item => (
          <Link
            key={item.id}
            prefetch={false}
            href={studentOpsHref(item.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === item.id ? 'bg-gray-950 text-white' : 'border border-gray-300 bg-white text-gray-800'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
