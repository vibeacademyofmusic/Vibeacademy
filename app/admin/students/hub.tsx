import Link from 'next/link'
import AttendanceLauncher from '../attendance/Launcher'

import { requestClient, requestOperationalAdmin } from '@/lib/auth/request'
import { businessDate } from '@/app/admin/_lib/business-date'
import { DataTable, OperationsFilterBar, OpsMetricLink } from '@/app/admin/_components/vibe'
import { LoadError } from '../finance/_components/ui'
import ClassOpsWorkspace from '../classes/_ops/Workspace'
import { loadClassOps } from '../classes/_ops/data'
import LearningReportsPage from '../reports/learning/page'
import FeedbackPage from '../feedback/page'
import { loadStudentMovement, type MovementRow } from './movement-data'
import { StudentOpsShell, studentOpsHref, type StudentOpsTab } from './ops-shell'

function movementHref(month: string, branchId: string | null) {
  const query = new URLSearchParams({ month })
  if (branchId) query.set('branch', branchId)
  return `/documents/students/movement?${query.toString()}`
}

function roster(rows: MovementRow[]) {
  return rows.map(row => [row.name, row.code, row.branch, row.when, row.context])
}

async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const db = await requestClient()
  const today = businessDate()
  let report
  try {
    report = await loadStudentMovement(db, params)
  } catch (error) {
    console.error('loadStudentMovement failed', error)
    return <LoadError />
  }
  const scope = { branch: report.branchId ?? undefined }
  const counts = report.counts
  const primary = [
    { label: 'Học viên mới trong tháng', value: counts.newcomers, note: 'Theo ngày nhập học', href: '#hoc-vien-moi' },
    { label: 'Học viên đang hoạt động', value: counts.active, note: 'Đang học trong ca', href: studentOpsHref('students', scope) },
    { label: 'Đang bảo lưu', value: counts.paused, note: 'Kỳ bảo lưu còn hiệu lực hôm nay', href: studentOpsHref('students', { ...scope, lifecycle: 'paused' }) },
    { label: 'Nghỉ khi hết khóa', value: counts.courseEnded, note: 'Hoàn tất khóa trong tháng', href: '#nghi-het-khoa' },
  ]
  const secondary = [
    counts.waiting !== null && { label: 'Chờ vào ca dạy', value: counts.waiting, href: studentOpsHref('waiting', scope) },
    counts.future !== null && { label: 'Đã vào ca dạy – chờ bắt đầu', value: counts.future, href: studentOpsHref('students', { ...scope, lifecycle: 'future' }) },
    counts.sessions !== null && { label: 'Buổi học hôm nay', value: counts.sessions, href: studentOpsHref('attendance', { ...scope, date: today }) },
    counts.reports !== null && { label: 'Báo cáo chờ xử lý', value: counts.reports, href: studentOpsHref('reports', { ...scope, status: 'READY_FOR_REVIEW' }) },
    counts.feedback !== null && { label: 'Phản hồi cần xử lý', value: counts.feedback, note: 'Toàn hệ thống', href: studentOpsHref('feedback', { review: 'yes' }) },
  ].filter(item => item !== false)

  return (
    <div className="vibe-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <OperationsFilterBar
          action="/admin/students"
          submitLabel="Xem"
          resetHref="/admin/students"
          fields={[
            { name: 'month', label: 'Tháng', type: 'month', value: report.month },
            { name: 'branch', label: 'Chi nhánh', type: 'select', value: report.branchId ?? '', allLabel: 'Toàn hệ thống', options: report.branches },
          ]}
        />
        <Link className="vibe-button vibe-button-primary" href={movementHref(report.month, report.branchId)} prefetch={false}>Xuất báo cáo</Link>
      </div>
      <p className="text-sm text-[var(--vibe-muted)]">
        {report.monthText} · {report.branchName}. Học viên mới tính theo ngày nhập học. Nghỉ khi hết khóa là ghi danh đã hoàn tất, tách khỏi nghỉ giữa khóa ({counts.withdrawn}).
      </p>
      <div className="vibe-metrics">
        {primary.map(card => <OpsMetricLink key={card.label} href={card.href} title={card.label} value={card.value ?? '—'} note={card.note} />)}
      </div>
      <div className="vibe-metrics">
        {secondary.map(card => <OpsMetricLink key={card.label} href={card.href} title={card.label} value={card.value} note={'note' in card ? card.note : undefined} />)}
      </div>
      <section className="vibe-card" id="co-cau-mon">
        <h2 className="text-lg font-semibold">Cơ cấu theo môn</h2>
        <p className="text-sm text-[var(--vibe-muted)]">{report.branchName}: {report.enrolledStudents} nhạc sinh đang có hồ sơ. Mỗi người được tính ở môn đang học.</p>
        <DataTable
          headers={['Môn', 'Số nhạc sinh', 'Tỷ lệ']}
          rows={report.instruments.map(row => [row.name, String(row.students), row.share])}
        />
      </section>
      <section className="vibe-card" id="bien-dong">
        <h2 className="text-lg font-semibold">Biến động học viên</h2>
        <DataTable
          headers={['Chỉ tiêu', 'Số học viên']}
          rows={[
            ['Học viên mới trong tháng', String(counts.newcomers)],
            ['Học viên đang hoạt động', counts.active === null ? '—' : String(counts.active)],
            ['Đang bảo lưu', counts.paused === null ? '—' : String(counts.paused)],
            ['Nghỉ khi hết khóa trong tháng', String(counts.courseEnded)],
            ['Nghỉ giữa khóa trong tháng', String(counts.withdrawn)],
          ]}
        />
      </section>
      <section className="vibe-card" id="hoc-vien-moi">
        <h2 className="text-lg font-semibold">Học viên mới trong tháng</h2>
        <DataTable headers={['Học viên', 'Mã', 'Chi nhánh', 'Ngày nhập học', 'Ghi nhận']} rows={roster(report.newcomers)} />
      </section>
      <section className="vibe-card" id="bao-luu">
        <h2 className="text-lg font-semibold">Đang bảo lưu</h2>
        <DataTable headers={['Học viên', 'Mã', 'Chi nhánh', 'Bắt đầu học', 'Ca dạy']} rows={roster(report.paused)} />
      </section>
      <section className="vibe-card" id="nghi-het-khoa">
        <h2 className="text-lg font-semibold">Nghỉ khi hết khóa</h2>
        <DataTable headers={['Học viên', 'Mã', 'Chi nhánh', 'Ngày kết thúc', 'Ca dạy']} rows={roster(report.courseEnded)} />
      </section>
    </div>
  )
}

async function ClassTab({
  searchParams,
  view,
}: {
  searchParams: Promise<Record<string, string | undefined>>
  view: 'classes' | 'schedule' | 'attendance'
}) {
  const params = await searchParams
  const db = await requestClient()
  const selectedView = view === 'classes' && params.view === 'overview' ? 'overview' : view
  const { data: isAdmin } = await requestOperationalAdmin()
  let data
  try {
    data = await loadClassOps(db, params, selectedView)
  } catch (error) {
    console.error('loadClassOps failed', error)
    return <LoadError />
  }
  return <ClassOpsWorkspace params={params} data={data} view={selectedView} embedded canManage={isAdmin === true} />
}

export async function StudentOpsHub({
  tab,
  searchParams,
}: {
  tab: StudentOpsTab
  searchParams: Promise<Record<string, string | undefined>>
}) {
  return (
    <StudentOpsShell tab={tab}>
      {tab === 'overview' && <Overview searchParams={searchParams} />}
      {tab === 'teaching-shifts' && <ClassTab searchParams={searchParams} view="classes" />}
      {tab === 'schedule' && <ClassTab searchParams={searchParams} view="schedule" />}
      {tab === 'attendance' && <AttendanceLauncher searchParams={searchParams} />}
      {tab === 'reports' && <LearningReportsPage searchParams={searchParams} />}
      {tab === 'feedback' && <FeedbackPage searchParams={searchParams} />}
    </StudentOpsShell>
  )
}
