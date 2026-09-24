import Link from 'next/link'

import {
  createStudent,
  setStudentStatus,
} from './actions'

import {
  AppPage,
  PageHeader,
  InlineNotice,
  StatusBadge,
  EmptyState,
  OperationsFilterBar,
  OpsTabs,
  OpsMetricLink,
  OpsStatusBadge,
  buildQuery,
} from '@/app/admin/_components/vibe'
import { businessDate, shiftBusinessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { assignPlacement, cancelPlacement, changePlacement, matchPlacement } from './placement-actions'
import { StudentOpsHub } from './hub'
import { StudentOpsShell, type StudentOpsTab } from './ops-shell'
import { pageNumber, pageSize, uuidPattern } from '@/app/admin/finance/operations'

type StudentsPageProps = {
    searchParams: Promise<{
      error?: string
      success?: string
      q?: string
      branch?: string
      class?: string
      teacher?: string
      status?: string
      view?: string
      filter?: string
      page?: string
      tab?: string
    }>
  }

  const opsTabs = ['overview', 'students', 'teaching-shifts', 'schedule', 'attendance', 'reports', 'feedback'] as const
  
  export default async function StudentsPage({
    searchParams,
  }: StudentsPageProps) {
    const params = await searchParams
    const tab = opsTabs.includes(params.tab as StudentOpsTab) ? params.tab as StudentOpsTab : 'overview'
    if (tab !== 'students') {
      return <StudentOpsHub tab={tab} searchParams={searchParams} />
    }
    const q = (params.q ?? '').trim()
    const branch = (params.branch ?? '').trim()
    const classId = uuidPattern.test(params.class ?? '') ? params.class! : ''
    const teacherId = uuidPattern.test(params.teacher ?? '') ? params.teacher! : ''
    const status = (params.status ?? '').trim()
    const todayInVietnam = businessDate()
    const earliestFutureStart = shiftBusinessDate(todayInVietnam, 1)
    const page = pageNumber(params.page)
  
    const supabase = await createClient()
    const { data: isSuperAdmin } = await supabase.rpc('has_role', { role_code: 'SUPER_ADMIN' })
    const showRecords = params.view === 'records' && isSuperAdmin === true
    const opsView = 'current' as const

    const branchesQuery = showRecords ? supabase
  .from('branches')
  .select('id, code, name, status')
  .order('name') : null

let studentsQuery = showRecords ? supabase
  .from('students')
  .select(`
    id,
    student_code,
    full_name,
    default_branch_id,
    admission_date,
    status,
    created_at
  `)
  .order('created_at', { ascending: false }) : null

  if (studentsQuery && q) {
    const safeQuery = q
      .replace(/[%_,()]/g, ' ')
      .trim()
  
    studentsQuery = studentsQuery.or(
      `full_name.ilike.%${safeQuery}%,student_code.ilike.%${safeQuery}%`
    )
  }
  
  if (studentsQuery && branch) {
    studentsQuery = studentsQuery.eq(
      'default_branch_id',
      branch
    )
  }
  
  if (
    studentsQuery && (
    status === 'ACTIVE' ||
    status === 'INACTIVE'
  )) {
    studentsQuery = studentsQuery.eq(
      'status',
      status
    )
  }
  
  const [{ data: branches }, studentsResult] = showRecords && branchesQuery && studentsQuery
    ? await Promise.all([branchesQuery, studentsQuery])
    : [{ data: [] }, { data: [], error: null }]
  const students = studentsResult.data
  const studentsError = studentsResult.error
  const branchMap = new Map(
    (branches ?? []).map((branch) => [
      branch.id,
      branch.name,
    ])
  )

  const studentsHref = (patch: Record<string, string | undefined> = {}) => {
    const query = buildQuery({
      tab: 'students',
      view: opsView === 'current' ? undefined : opsView,
      branch: branch || undefined,
      class: classId || undefined,
      teacher: teacherId || undefined,
      q: q || undefined,
      filter: params.filter,
      page: undefined,
    }, patch)
    return query ? `/admin/students?${query}` : '/admin/students'
  }

  return (
    <AppPage>
    <StudentOpsShell tab="students">
      <PageHeader
        title="Hồ sơ học viên"
        description="Học viên hiện tại là ghi danh đã bắt đầu theo ngày Việt Nam. Đổi ca dạy nằm trong hồ sơ học viên."
        actions={isSuperAdmin === true ? <Link prefetch={false} href="/admin/students?tab=students&view=records" className="vibe-button">Tạo hồ sơ thủ công</Link> : undefined}
      />
      {params.error && <InlineNotice tone="error">{params.error}</InlineNotice>}
      {!showRecords && (
        <>
          <StudentPlacementBoard
            view={opsView}
            branch={branch}
            classId={classId}
            teacherId={teacherId}
            q={q}
            filter={params.filter ?? 'ALL'}
            page={page}
            canOpenStudent={isSuperAdmin === true}
            earliestStart={earliestFutureStart}
            hrefBuilder={studentsHref}
          />
        </>
      )}

      {params.success && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {params.success}
        </div>
      )}

      {showRecords && <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">
            Add Student
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create a new student record.
          </p>

          <form
            action={createStudent}
            className="mt-6 space-y-5"
          >
            <div>
              <label
                htmlFor="student_code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Student Code *
              </label>

              <input
                id="student_code"
                name="student_code"
                required
                placeholder="HV0001"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="full_name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Full Name *
              </label>

              <input
                id="full_name"
                name="full_name"
                required
                placeholder="Nguyễn Văn A"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="default_branch_id"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Branch *
              </label>

              <select
                id="default_branch_id"
                name="default_branch_id"
                required
                defaultValue=""
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
              >
                <option value="" disabled>
                  Select branch
                </option>

                {(branches ?? [])
                  .filter(
                    (branch) =>
                      branch.status === 'ACTIVE'
                  )
                  .map((branch) => (
                    <option
                      key={branch.id}
                      value={branch.id}
                    >
                      {branch.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
  <label
    htmlFor="admission_date"
    className="mb-2 block text-sm font-medium text-gray-700"
  >
    Ngày đăng ký tại Vibe *
  </label>

  <input
    id="admission_date"
    name="admission_date"
    type="date"
    required
    defaultValue={todayInVietnam}
    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
  />

  <p className="mt-1.5 text-xs text-gray-500">
    Ngày học sinh đăng ký hoặc được tiếp nhận vào Vibe Academy.
    Đây chưa phải là ngày bắt đầu học của từng lớp.
  </p>
</div>
            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Create Student
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-5">
        <form
  method="GET"
  className="flex flex-col gap-3 lg:flex-row"
>
  <input
    type="search"
    name="q"
    defaultValue={q}
    placeholder="Search by student name or code..."
    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
  />

  <select
    name="branch"
    defaultValue={branch}
    className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
  >
    <option value="">All branches</option>

    {(branches ?? []).map((item) => (
      <option
        key={item.id}
        value={item.id}
      >
        {item.name}
      </option>
    ))}
  </select>

  <select
    name="status"
    defaultValue={status}
    className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
  >
    <option value="">All statuses</option>
    <option value="ACTIVE">Active</option>
    <option value="INACTIVE">Inactive</option>
  </select>

  <button
    type="submit"
    className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
  >
    Search
  </button>

  {(q || branch || status) && (
    <Link
      href="/admin/students"
      className="rounded-lg border border-gray-300 px-5 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      Clear
    </Link>
  )}
</form>
</div>
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Student List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {students?.length ?? 0} students
            </p>
          </div>

          {studentsError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load students.
            </div>
          ) : !students ||
            students.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium text-gray-700">
                No students yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create your first student.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
  <tr>
    <th className="px-6 py-3">
      Student
    </th>

    <th className="px-6 py-3">
      Branch
    </th>

    <th className="px-6 py-3">
      Admission
    </th>

    <th className="px-6 py-3">
      Status
    </th>

    <th className="px-6 py-3">
      Actions
    </th>
  </tr>
</thead>
                <tbody className="divide-y">
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900">
                          {student.full_name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {student.student_code}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {branchMap.get(
                          student.default_branch_id
                        ) ?? '—'}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {student.admission_date ?? '—'}
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          {student.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
  <div className="flex gap-2">
  <Link
  href={`/admin/students/${student.id}`}
  prefetch={false}
  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50"
    >
      Edit
    </Link>

    <form action={setStudentStatus}>
      <input
        type="hidden"
        name="id"
        value={student.id}
      />

      <input
        type="hidden"
        name="status"
        value={
          student.status === 'ACTIVE'
            ? 'INACTIVE'
            : 'ACTIVE'
        }
      />

      <button
        type="submit"
        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50"
      >
        {student.status === 'ACTIVE'
          ? 'Deactivate'
          : 'Activate'}
      </button>
    </form>
  </div>
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>}
    </StudentOpsShell>
    </AppPage>
  )
}

type WaitingRow = {
  placement_id: string
  placement_version: number
  student_id: string
  student_name: string
  parent_name: string | null
  branch_id: string
  branch_name: string
  program_name: string | null
  level_name: string | null
  desired_start: string | null
  preferred_schedule: string | null
  placement_status: string
  class_name: string | null
  teacher_name: string | null
  scheduled_start: string | null
  owner_name: string | null
  days_waiting: number
  enrollment_id: string | null
  class_id: string | null
}

type ClassOption = { id: string; name: string; branch_id: string; open_seats: number }

const placementLabels: Record<string, string> = {
  UNASSIGNED: 'Chưa xếp lớp',
  MATCHING: 'Đang tìm lịch phù hợp',
  SCHEDULED_FUTURE: 'Đã xếp lớp – chờ bắt đầu',
}

function placementLabel(status: string) {
  return placementLabels[status] ?? 'Chưa xác định'
}

type CurrentRow = {
  enrollment_id: string
  student_id: string
  student_code: string
  student_name: string
  branch_name: string
  course_name: string
  level_name: string | null
  class_name: string
  teacher_name: string | null
  schedule_label: string | null
  started_on: string
  package_name: string | null
  attendance_marked: number
  class_id?: string
  branch_id?: string
  student_status?: string
  enrollment_status?: string
}

function classChoices(classes: ClassOption[], branchId: string, currentClassId?: string | null) {
  return classes.filter(item => item.branch_id === branchId && (item.open_seats > 0 || item.id === currentClassId))
}

function PlacementActions({ row, canManage, classes, earliestStart }: { row: WaitingRow; canManage: boolean; classes: ClassOption[]; earliestStart: string }) {
  if (!canManage) return 'Chỉ xem'
  const choices = classChoices(classes, row.branch_id, row.class_id)
  if (row.placement_status === 'SCHEDULED_FUTURE' && row.enrollment_id) {
    return (
      <div className="space-y-2">
        <form action={changePlacement} className="space-y-1">
          <input type="hidden" name="placement_id" value={row.placement_id} />
          <input type="hidden" name="version" value={row.placement_version} />
          <input type="hidden" name="enrollment_id" value={row.enrollment_id} />
          <select name="class_id" required className="w-40 rounded border px-2 py-1" defaultValue={row.class_id ?? ''}>
            <option value="">Lớp</option>
            {choices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input name="start_date" type="date" required min={earliestStart} defaultValue={row.scheduled_start ?? earliestStart} className="w-40 rounded border px-2 py-1" />
          <input name="reason" required minLength={1} maxLength={2000} placeholder="Lý do" className="w-40 rounded border px-2 py-1" />
          <button className="rounded border px-2 py-1">Đổi lớp</button>
        </form>
        <form action={cancelPlacement} className="space-y-1">
          <input type="hidden" name="placement_id" value={row.placement_id} />
          <input type="hidden" name="version" value={row.placement_version} />
          <input type="hidden" name="enrollment_id" value={row.enrollment_id} />
          <input name="reason" required minLength={1} maxLength={2000} placeholder="Lý do hủy" className="w-40 rounded border px-2 py-1" />
          <button className="rounded border px-2 py-1">Hủy xếp lớp</button>
        </form>
      </div>
    )
  }
  if (row.placement_status !== 'UNASSIGNED' && row.placement_status !== 'MATCHING') return null
  return (
    <div className="space-y-2">
      {row.placement_status === 'UNASSIGNED' && (
        <form action={matchPlacement}>
          <input type="hidden" name="placement_id" value={row.placement_id} />
          <input type="hidden" name="version" value={row.placement_version} />
          <button className="rounded border px-2 py-1">Đang tìm lịch</button>
        </form>
      )}
      <form action={assignPlacement} className="space-y-1">
        <input type="hidden" name="placement_id" value={row.placement_id} />
        <input type="hidden" name="version" value={row.placement_version} />
        <select name="class_id" required className="w-40 rounded border px-2 py-1">
          <option value="">Lớp</option>
          {classChoices(classes, row.branch_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <input name="start_date" type="date" required className="w-40 rounded border px-2 py-1" />
        <button className="rounded bg-gray-950 px-2 py-1 text-white">Xếp lớp</button>
      </form>
    </div>
  )
}

// Phase 2: Student Class Transfer Workflow.
// A learner who has already started needs a separate transfer that considers
// past attendance, future sessions, the teacher relationship, makeup credits,
// learning journals, academic progress, tuition, and reporting history.
async function StudentPlacementBoard({
  view,
  branch,
  classId,
  teacherId,
  q,
  filter,
  page,
  canOpenStudent,
  earliestStart,
  hrefBuilder,
}: {
  view: 'current' | 'waiting'
  branch: string
  classId: string
  teacherId: string
  q: string
  filter: string
  page: number
  canOpenStudent: boolean
  earliestStart: string
  hrefBuilder: (patch?: Record<string, string | undefined>) => string
}) {
  const db = await createClient()
  let classQuery = db.from('classes').select('id,name,branch_id').eq('status', 'ACTIVE').order('name').limit(200)
  if (branch) classQuery = classQuery.eq('branch_id', branch)
  const [{ data: classRows }, { data: teacherOptions }, { data: branchOptions }, { data: placementClasses }] = await Promise.all([
    classQuery,
    db.from('teachers').select('id,full_name,teacher_code').eq('status', 'ACTIVE').order('teacher_code').limit(200),
    db.from('branches').select('id,name').order('name').limit(200),
    db.rpc('list_placement_class_options', { p_branch: branch || null }),
  ])
  const classes = (placementClasses ?? []) as ClassOption[]
  const classSelect = (classRows ?? []).map(c => ({ id: c.id, name: c.name }))
  const teacherSelect = (teacherOptions ?? []).map(t => ({ id: t.id, name: t.full_name || t.teacher_code }))
  const branchSelect = (branchOptions ?? []).map(b => ({ id: b.id, name: b.name }))

  if (view === 'waiting') {
    const [{ data: rows }, { data: summary }] = await Promise.all([
      db.rpc('list_waiting_placements', {
        p_branch: branch || null,
        p_filter: filter,
        p_search: q,
        p_limit: pageSize + 1,
        p_offset: (page - 1) * pageSize,
      }),
      db.rpc('waiting_placement_summary', { p_branch: branch || null }),
    ])
    const waiting = ((rows ?? []) as WaitingRow[]).slice(0, pageSize)
    const more = ((rows ?? []) as WaitingRow[]).length > pageSize
    const manage = new Map(await Promise.all([...new Set(waiting.map(row => row.branch_id))].map(async id => {
      const result = await db.rpc('registration_can', { p_permission: 'student_placement.manage', p_branch: id })
      return [id, result.data === true] as const
    })))
    const kpi = Array.isArray(summary) ? summary[0] : summary
    return (
      <section className="space-y-4">
        <div className="vibe-metrics">
          <OpsMetricLink href={hrefBuilder({ filter: 'ALL' })} title="Needs Attention" value={kpi?.waiting_count ?? 0} note="Tổng chờ sắp lớp" />
          <OpsMetricLink href={hrefBuilder({ filter: 'UNASSIGNED' })} title="Chưa xếp lớp" value={kpi?.unassigned_count ?? 0} />
          <OpsMetricLink href={hrefBuilder({ filter: 'MATCHING' })} title="Đang tìm lịch" value={kpi?.matching_count ?? 0} />
          <OpsMetricLink href={hrefBuilder({ filter: 'SCHEDULED_FUTURE' })} title="Chờ bắt đầu" value={kpi?.scheduled_count ?? 0} />
        </div>
        <InlineNotice tone="warning">Hệ thống chưa tự động kiểm tra đầy đủ xung đột lịch giáo viên/phòng.</InlineNotice>
        <OperationsFilterBar
          action="/admin/students"
          hidden={{ view: 'waiting', filter }}
          resetHref="/admin/students?view=waiting"
          fields={[
            { name: 'branch', label: 'Chi nhánh', type: 'select', value: branch, options: branchSelect },
            { name: 'q', label: 'Tìm học viên', type: 'search', value: q, placeholder: 'Tên / mã học viên' },
          ]}
        />
        <OpsTabs
          ariaLabel="Lọc chờ sắp lớp"
          tabs={[
            ['ALL', 'Tất cả'],
            ['UNASSIGNED', 'Chưa xếp lớp'],
            ['MATCHING', 'Đang tìm lịch'],
            ['SCHEDULED_FUTURE', 'Đã xếp – chờ bắt đầu'],
          ].map(([id, label]) => ({
            href: hrefBuilder({ view: 'waiting', filter: id }),
            label,
            active: filter === id,
          }))}
        />
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead><tr>{['Học viên', 'Phụ huynh', 'Chi nhánh', 'Bộ môn', 'Cấp độ', 'Lịch mong muốn', 'Trạng thái', 'Lớp', 'Giáo viên', 'Ngày bắt đầu', 'Phụ trách', 'Số ngày chờ', 'Xếp lớp'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {waiting.map(row => (
                <tr key={row.placement_id}>
                  <td>{canOpenStudent ? <Link href={`/admin/students/${row.student_id}`}>{row.student_name}</Link> : row.student_name}</td>
                  <td>{row.parent_name || '—'}</td>
                  <td>{row.branch_name}</td>
                  <td>{row.program_name || '—'}</td>
                  <td>{row.level_name || '—'}</td>
                  <td>{row.preferred_schedule || '—'}</td>
                  <td><StatusBadge tone={row.placement_status === 'SCHEDULED_FUTURE' ? 'info' : 'warning'}>{placementLabel(row.placement_status)}</StatusBadge></td>
                  <td>{row.class_name || '—'}</td>
                  <td>{row.teacher_name || '—'}</td>
                  <td>{row.scheduled_start || row.desired_start || '—'}</td>
                  <td>{row.owner_name || '—'}</td>
                  <td>{row.days_waiting}</td>
                  <td><PlacementActions row={row} canManage={manage.get(row.branch_id) === true} classes={classes} earliestStart={earliestStart} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!waiting.length && <EmptyState>Không tìm thấy học viên phù hợp với bộ lọc.</EmptyState>}
        <div className="vibe-actions">
          {page > 1 && <Link prefetch={false} href={hrefBuilder({ view: 'waiting', page: String(page - 1) })} className="vibe-button">Trang trước</Link>}
          {more && <Link prefetch={false} href={hrefBuilder({ view: 'waiting', page: String(page + 1) })} className="vibe-button">Trang sau</Link>}
        </div>
      </section>
    )
  }

  const [{ data: rows }, { data: activeCount }] = await Promise.all([
    db.rpc('list_current_student_enrollments', {
      p_branch: branch || null,
      p_search: q,
      p_limit: pageSize + 1,
      p_offset: (page - 1) * pageSize,
      p_class: classId || null,
      p_teacher: teacherId || null,
    }),
    db.rpc('count_current_student_enrollments', {
      p_branch: branch || null,
      p_search: q || null,
      p_class: classId || null,
      p_teacher: teacherId || null,
    }),
  ])
  const current = ((rows ?? []) as CurrentRow[]).slice(0, pageSize)
  const more = ((rows ?? []) as CurrentRow[]).length > pageSize

  return (
    <section className="space-y-4">
      <div className="vibe-metrics">
        <OpsMetricLink href={hrefBuilder({})} title="Học viên đang hoạt động" value={activeCount ?? 0} />
        <OpsMetricLink href={hrefBuilder({})} title="Đang học trong ca" value={activeCount ?? 0} note="Ghi danh đã bắt đầu" />
        <section className="vibe-card vibe-metric"><p>Học viên mới</p><strong>—</strong><small>Chưa có KPI canonical riêng</small></section>
        <section className="vibe-card vibe-metric"><p>Đang bảo lưu</p><strong>—</strong><small>Chưa có KPI canonical trên list hiện tại</small></section>
      </div>
      <OperationsFilterBar
        action="/admin/students"
        hidden={{ tab: 'students' }}
        resetHref="/admin/students?tab=students"
        fields={[
          { name: 'branch', label: 'Chi nhánh', type: 'select', value: branch, options: branchSelect },
          { name: 'class', label: 'Ca dạy', type: 'select', value: classId, options: classSelect },
          { name: 'teacher', label: 'Giáo viên', type: 'select', value: teacherId, options: teacherSelect },
          { name: 'q', label: 'Tìm học viên', type: 'search', value: q, placeholder: 'Tên / mã học viên' },
        ]}
      />
      <div className="vibe-table-scroll">
        <table className="vibe-table">
          <thead>
            <tr>{['Học viên', 'Chương trình', 'Grade', 'Lớp', 'Giáo viên', 'Chi nhánh', 'Academic Status', 'Học phí', 'Hành động'].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {current.map(row => (
              <tr key={row.enrollment_id}>
                <td>
                  {canOpenStudent ? <Link href={`/admin/students/${row.student_id}`}>{row.student_name}</Link> : row.student_name}
                  <p className="text-xs text-[var(--vibe-muted)]">{row.student_code}</p>
                </td>
                <td>{row.course_name}</td>
                <td>{row.level_name || '—'}</td>
                <td>{row.class_name}</td>
                <td>{row.teacher_name || '—'}</td>
                <td>{row.branch_name}</td>
                <td><OpsStatusBadge status={row.student_status === 'ACTIVE' ? 'ACTIVE' : row.student_status || 'ACTIVE'} labels={{ ACTIVE: 'Đang học', INACTIVE: 'Ngưng', PAUSED: 'Bảo lưu' }} /></td>
                <td>{row.package_name || '—'}</td>
                <td>
                  {canOpenStudent
                    ? <Link prefetch={false} href={`/admin/students/${row.student_id}`} className="vibe-button">Chi tiết</Link>
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!current.length && <EmptyState>Không tìm thấy học viên phù hợp với bộ lọc.</EmptyState>}
      <div className="vibe-actions">
        {page > 1 && <Link prefetch={false} href={hrefBuilder({ page: String(page - 1) })} className="vibe-button">Trang trước</Link>}
        {more && <Link prefetch={false} href={hrefBuilder({ page: String(page + 1) })} className="vibe-button">Trang sau</Link>}
      </div>
    </section>
  )
}
