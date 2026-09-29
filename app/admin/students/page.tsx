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
  buildQuery,
} from '@/app/admin/_components/vibe'
import { businessDate, shiftBusinessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { assignPlacement, cancelPlacement, changePlacement } from './placement-actions'
import { placementLabel } from '@/app/admin/business/crm/model'
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
      curriculum?: string
      teacher?: string
      status?: string
      view?: string
      filter?: string
      page?: string
      class_page?: string
      tab?: string
      lifecycle?: string
    }>
  }

  const opsTabs = ['overview', 'students', 'waiting', 'teaching-shifts', 'schedule', 'attendance', 'reports', 'feedback'] as const
  
  export default async function StudentsPage({
    searchParams,
  }: StudentsPageProps) {
    const params = await searchParams
    const curriculumId = uuidPattern.test(params.curriculum ?? '') ? params.curriculum! : ''
    const tab = opsTabs.includes(params.tab as StudentOpsTab) ? params.tab as StudentOpsTab : params.view === 'waiting' ? 'waiting' : 'overview'
    if (tab === 'waiting') {
      const waitingHref = (patch: Record<string, string | undefined> = {}) => {
        const query = buildQuery({
          tab: 'waiting',
          curriculum: curriculumId || undefined,
          branch: (params.branch ?? '').trim() || undefined,
          q: (params.q ?? '').trim() || undefined,
          filter: params.filter || 'ALL',
          class_page: params.class_page,
          page: undefined,
        }, patch)
        return `/admin/students?${query}`
      }
      return (
        <AppPage>
          <StudentOpsShell tab="waiting">
            <PageHeader
              title="Chờ vào ca dạy"
              description="Sau khi thanh toán, học viên chờ được chọn một ca dạy đang hoạt động và ngày bắt đầu."
            />
            {params.error && <InlineNotice tone="error">{params.error}</InlineNotice>}
            <StudentPlacementBoard
              curriculumId={curriculumId}
              view="waiting"
              branch={(params.branch ?? '').trim()}
              classId=""
              teacherId=""
              q={(params.q ?? '').trim()}
              filter={params.filter ?? 'ALL'}
              page={pageNumber(params.page)}
              shiftPage={pageNumber(params.class_page)}
              canOpenStudent={(await (await createClient()).rpc('has_role', { role_code: 'SUPER_ADMIN' })).data === true}
              earliestStart={shiftBusinessDate(businessDate(), 1)}
              hrefBuilder={waitingHref}
            />
          </StudentOpsShell>
        </AppPage>
      )
    }
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
    const lifecycle = params.lifecycle === 'future' || params.lifecycle === 'paused' ? params.lifecycle : 'active'
  
    const supabase = await createClient()
    const { data: isSuperAdmin } = await supabase.rpc('has_role', { role_code: 'SUPER_ADMIN' })
    const showRecords = params.view === 'records' && isSuperAdmin === true

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
      curriculum: curriculumId || undefined,
      lifecycle: lifecycle === 'active' ? undefined : lifecycle,
      class_page: params.class_page,
      branch: branch || undefined,
      class: classId || undefined,
      teacher: teacherId || undefined,
      q: q || undefined,
      page: undefined,
    }, patch)
    return query ? `/admin/students?${query}` : '/admin/students'
  }
  const lifecycleCopy = {
    active: ['Học viên đang hoạt động', 'Ghi danh đã vào ca dạy và đã tới ngày bắt đầu theo ngày Việt Nam.'],
    future: ['Đã vào ca dạy – chờ bắt đầu', 'Ca dạy đã xác nhận. Học viên chưa tính là đang học cho đến ngày bắt đầu.'],
    paused: ['Đang bảo lưu', 'Ghi danh đang trong kỳ bảo lưu theo ngày Việt Nam.'],
  } as const

  return (
    <AppPage>
    <StudentOpsShell tab="students">
      <PageHeader
        title={showRecords ? 'Hồ sơ học viên' : lifecycleCopy[lifecycle][0]}
        description={showRecords ? 'Tạo hồ sơ thủ công khi chưa có đăng ký.' : lifecycleCopy[lifecycle][1]}
        actions={isSuperAdmin === true ? <Link prefetch={false} href="/admin/students?tab=students&view=records" className="vibe-button">Tạo hồ sơ thủ công</Link> : undefined}
      />
      {params.error && <InlineNotice tone="error">{params.error}</InlineNotice>}
      {!showRecords && (
        <>
          <StudentPlacementBoard
            curriculumId={curriculumId}
            view={lifecycle}
            branch={branch}
            classId={classId}
            teacherId={teacherId}
            q={q}
            filter={params.filter ?? 'ALL'}
            page={page}
            shiftPage={pageNumber(params.class_page)}
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
  course_id: string | null
}

type ClassOption = {
  id: string
  name: string
  branch_id: string
  open_seats: number
  code: string | null
  branch_name: string | null
  course_id: string | null
  curriculum_name: string | null
  level_label: string | null
  teacher_name: string | null
  room_name: string | null
  schedule_label: string | null
  duration_minutes: number | null
  enrolled_count: number | null
  capacity: number | null
  status: string | null
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

function compatibleShifts(classes: Map<string, ClassOption[]>, row: WaitingRow, allowed: Set<string>) {
  return [...classes.values()].flat().filter(item =>
    item.branch_id === row.branch_id
    && allowed.has(`${row.placement_id}:${item.id}`)
    && item.status === 'ACTIVE'
    && Boolean(item.schedule_label)
    && (item.open_seats > 0 || item.id === row.class_id)
  )
}

function ShiftChoices({ shifts, current }: { shifts: ClassOption[]; current?: string | null }) {
  if (!shifts.length) {
    return (
      <p className="max-w-xs text-xs text-[var(--vibe-muted)]">
        Chưa có ca dạy phù hợp trong trang lựa chọn này. Nếu có trang ca tiếp theo, hãy kiểm tra trước khi <Link href="/admin/students?tab=teaching-shifts">tạo ca dạy mới</Link>. Hồ sơ giữ trạng thái Chờ vào ca dạy.
      </p>
    )
  }
  return (
    <div className="max-w-sm space-y-2">
      {shifts.map(item => (
        <label key={item.id} className="block rounded-lg border border-[var(--vibe-line)] bg-white p-2 text-xs">
          <span className="flex items-center gap-2 font-semibold text-[var(--vibe-navy)]">
            <input type="radio" name="class_id" value={item.id} required defaultChecked={item.id === current || (!current && shifts.length === 1)} />
            {item.code} · {item.name}
          </span>
          <span className="mt-1 block text-[var(--vibe-muted)]">
            Giáo viên hôm nay: {item.teacher_name || 'Kiểm tra theo ngày bắt đầu'} · {item.branch_name} · Phòng: {item.room_name || 'Chưa có phòng'}
          </span>
          <span className="block text-[var(--vibe-muted)]">
            {item.schedule_label} · {item.duration_minutes ?? '—'} phút · {item.curriculum_name} · {item.level_label}
          </span>
          <span className="block text-[var(--vibe-muted)]">
            {item.enrolled_count ?? 0}/{item.capacity ?? '—'} học viên · {item.status === 'ACTIVE' ? 'Đang hoạt động' : 'Ngưng'}
          </span>
        </label>
      ))}
    </div>
  )
}

function PlacementActions({ row, canManage, classes, allowed, earliestStart }: { row: WaitingRow; canManage: boolean; classes: Map<string, ClassOption[]>; allowed: Set<string>; earliestStart: string }) {
  if (!canManage) return 'Chỉ xem'
  const shifts = compatibleShifts(classes, row, allowed)
  if (row.placement_status === 'SCHEDULED_FUTURE' && row.enrollment_id) {
    return (
      <div className="space-y-2">
        <form action={changePlacement} className="space-y-2">
          <input type="hidden" name="request_id" value={crypto.randomUUID()} />
          <input type="hidden" name="placement_id" value={row.placement_id} />
          <input type="hidden" name="version" value={row.placement_version} />
          <input type="hidden" name="enrollment_id" value={row.enrollment_id} />
          <ShiftChoices shifts={shifts} current={row.class_id} />
          <input name="start_date" type="date" required min={earliestStart} defaultValue={row.scheduled_start ?? earliestStart} aria-label="Ngày bắt đầu" className="w-40 rounded border px-2 py-1" />
          <input name="reason" required minLength={1} maxLength={2000} placeholder="Lý do" className="w-40 rounded border px-2 py-1" />
          <button className="vibe-button">Đổi ca dạy</button>
        </form>
        <form action={cancelPlacement} className="space-y-1">
          <input type="hidden" name="placement_id" value={row.placement_id} />
          <input type="hidden" name="version" value={row.placement_version} />
          <input type="hidden" name="enrollment_id" value={row.enrollment_id} />
          <input name="reason" required minLength={1} maxLength={2000} placeholder="Lý do hủy" className="w-40 rounded border px-2 py-1" />
          <button className="vibe-button">Hủy vào ca dạy</button>
        </form>
      </div>
    )
  }
  if (row.placement_status !== 'UNASSIGNED' && row.placement_status !== 'MATCHING') return null
  return (
    <form action={assignPlacement} className="space-y-2">
      <input type="hidden" name="request_id" value={crypto.randomUUID()} />
      <input type="hidden" name="placement_id" value={row.placement_id} />
      <input type="hidden" name="version" value={row.placement_version} />
      <p className="text-xs font-semibold text-[var(--vibe-navy)]">{row.program_name || 'Chương trình'} · {row.level_name || 'Trình độ'}</p>
      <ShiftChoices shifts={shifts} />
      <label className="block text-xs">Ngày vào ca
        <input name="start_date" type="date" required defaultValue={row.desired_start ?? earliestStart} className="mt-1 w-40 rounded border px-2 py-1" />
      </label>
      <button className="vibe-button vibe-button-primary" disabled={!shifts.length}>Sắp vào ca dạy</button>
    </form>
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
  curriculumId,
  q,
  filter,
  page,
  shiftPage,
  canOpenStudent,
  earliestStart,
  hrefBuilder,
}: {
  view: 'active' | 'future' | 'paused' | 'waiting'
  branch: string
  classId: string
  teacherId: string
  curriculumId: string
  q: string
  filter: string
  page: number
  shiftPage: number
  canOpenStudent: boolean
  earliestStart: string
  hrefBuilder: (patch?: Record<string, string | undefined>) => string
}) {
  const db = await createClient()
  let classQuery = db.from('classes').select('id,name,branch_id').eq('status', 'ACTIVE').order('name').limit(200)
  if (branch) classQuery = classQuery.eq('branch_id', branch)
  const [{ data: classRows }, { data: teacherOptions }, { data: branchOptions }, { data: placementClasses }, { data: curriculumOptions }] = await Promise.all([
    view === 'active' || view === 'paused' ? classQuery : Promise.resolve({ data: [] }),
    view === 'active' || view === 'paused' ? db.from('teachers').select('id,full_name,teacher_code').eq('status', 'ACTIVE').order('teacher_code').limit(200) : Promise.resolve({ data: [] }),
    db.from('branches').select('id,name').order('name').limit(200),
    view === 'waiting' || view === 'future'
      ? db.rpc('list_placement_class_options', { p_branch: branch || null }).range((shiftPage - 1) * 100, shiftPage * 100)
      : Promise.resolve({ data: [] }),
    db.from('curriculums').select('id,name').order('name'),
  ])
  const classes = new Map<string, ClassOption[]>()
  for (const item of ((placementClasses ?? []) as ClassOption[]).slice(0, 100)) {
    const key = `${item.branch_id}:${item.course_id}`
    const group = classes.get(key) ?? []
    group.push(item)
    classes.set(key, group)
  }
  const shiftPager = (shiftPage > 1 || (placementClasses?.length ?? 0) > 100) && <div className="vibe-actions" aria-label="Phân trang ca có thể chọn">
    {shiftPage > 1 && <Link prefetch={false} className="vibe-button" href={hrefBuilder({ page: String(page), class_page: String(shiftPage - 1) })}>Trang ca trước</Link>}
    <span className="text-sm text-[var(--vibe-muted)]">Danh sách chọn ca · Trang {shiftPage} · tối đa 100 ca/trang</span>
    {(placementClasses?.length ?? 0) > 100 && <Link prefetch={false} className="vibe-button" href={hrefBuilder({ page: String(page), class_page: String(shiftPage + 1) })}>Trang ca sau</Link>}
  </div>
  const classSelect = (classRows ?? []).map(c => ({ id: c.id, name: c.name }))
  const teacherSelect = (teacherOptions ?? []).map(t => ({ id: t.id, name: t.full_name || t.teacher_code }))
  const branchSelect = (branchOptions ?? []).map(b => ({ id: b.id, name: b.name }))

  if (view === 'waiting') {
    const waitingFilter = filter === 'MATCHING' || filter === 'UNASSIGNED' ? filter : 'ALL'
    const [{ data: rows }, { data: summary }, { data: waitingCount }, { data: unassignedCount }, { data: matchingCount }, { data: futureCount }] = await Promise.all([
      db.rpc('list_waiting_placements_by_curriculum', { p_curriculum: curriculumId || null,
        p_branch: branch || null,
        p_filter: waitingFilter,
        p_search: q,
        p_limit: pageSize + 1,
        p_offset: (page - 1) * pageSize,
      }),
      db.rpc('waiting_placement_summary', { p_branch: branch || null }),
      db.rpc('count_waiting_placements_by_curriculum', { p_curriculum: curriculumId || null, p_branch: branch || null, p_filter: 'ALL', p_search: q || null }),
      db.rpc('count_waiting_placements_by_curriculum', { p_curriculum: curriculumId || null, p_branch: branch || null, p_filter: 'UNASSIGNED', p_search: q || null }),
      db.rpc('count_waiting_placements_by_curriculum', { p_curriculum: curriculumId || null, p_branch: branch || null, p_filter: 'MATCHING', p_search: q || null }),
      db.rpc('count_future_start_placements_by_curriculum', { p_curriculum: curriculumId || null, p_branch: branch || null, p_search: q || null }),
    ])
    const waiting = ((rows ?? []) as WaitingRow[]).slice(0, pageSize)
    const eligibility = waiting.length ? await db.rpc('placement_compatible_classes', { p_cases: waiting.map(row => row.placement_id) }) : { data: [] }
    const allowed = new Set<string>((eligibility.data ?? []).map((item: { placement_id: string; class_id: string }) => `${item.placement_id}:${item.class_id}`))
    const more = ((rows ?? []) as WaitingRow[]).length > pageSize
    const manage = new Map(await Promise.all([...new Set(waiting.map(row => row.branch_id))].map(async id => {
      const result = await db.rpc('registration_can', { p_permission: 'student_placement.manage', p_branch: id })
      return [id, result.data === true] as const
    })))
    const kpi = Array.isArray(summary) ? summary[0] : summary
    return (
      <section className="space-y-4">
        <div className="vibe-metrics">
          <OpsMetricLink href={hrefBuilder({ filter: 'ALL' })} title="Chờ vào ca dạy" value={waitingCount ?? 0} />
          <OpsMetricLink href={hrefBuilder({ filter: 'UNASSIGNED' })} title="Chưa vào ca dạy" value={unassignedCount ?? 0} />
          <OpsMetricLink href={hrefBuilder({ filter: 'MATCHING' })} title="Đang tìm ca phù hợp" value={matchingCount ?? 0} />
          <OpsMetricLink href={`/admin/students?tab=students&lifecycle=future${curriculumId ? `&curriculum=${curriculumId}` : ''}${branch ? `&branch=${branch}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`} title="Đã vào ca dạy – chờ bắt đầu" value={futureCount ?? 0} />
          <section className="vibe-card vibe-metric"><p>Số ngày chờ trung bình</p><strong>{kpi?.average_wait ?? 0}</strong></section>
          <OpsMetricLink href={hrefBuilder({ filter: 'ALL' })} title="Chờ hơn 3 ngày" value={kpi?.over_3 ?? 0} />
          <OpsMetricLink href={hrefBuilder({ filter: 'ALL' })} title="Chờ hơn 7 ngày" value={kpi?.over_7 ?? 0} />
        </div>
        <InlineNotice tone="info">Hành trình học thuật đã được ghi từ lúc đăng ký. Thao tác còn lại là sắp học viên vào một ca dạy cùng chương trình và trình độ.</InlineNotice>
        <OperationsFilterBar
          action="/admin/students"
          hidden={{ tab: 'waiting', filter }}
          resetHref="/admin/students?tab=waiting"
          fields={[
            { name: 'curriculum', label: 'Bộ môn', type: 'select', value: curriculumId, options: curriculumOptions ?? [], allLabel: 'Tất cả bộ môn' },
            { name: 'branch', label: 'Chi nhánh', type: 'select', value: branch, options: branchSelect },
            { name: 'q', label: 'Tìm học viên', type: 'search', value: q, placeholder: 'Tên / mã học viên' },
          ]}
        />
        <OpsTabs
          ariaLabel="Lọc chờ vào ca dạy"
          tabs={[
            ['ALL', 'Tất cả'],
            ['UNASSIGNED', 'Chưa vào ca dạy'],
            ['MATCHING', 'Đang tìm ca phù hợp'],
          ].map(([id, label]) => ({
            href: hrefBuilder({ view: 'waiting', filter: id }),
            label,
            active: waitingFilter === id,
          }))}
        />
        {shiftPager}
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead><tr>{['Học viên', 'Phụ huynh', 'Chi nhánh', 'Chương trình', 'Trình độ', 'Lịch mong muốn', 'Trạng thái', 'Ca dạy hiện tại', 'Giáo viên', 'Ngày vào ca', 'Người phụ trách', 'Số ngày chờ', 'Hành động'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {waiting.map(row => (
                <tr key={row.placement_id}>
                  <td>{canOpenStudent ? <Link href={`/admin/students/${row.student_id}`}>{row.student_name}</Link> : row.student_name}</td>
                  <td>{row.parent_name || '—'}</td>
                  <td>{row.branch_name}</td>
                  <td>{row.program_name || '—'}</td>
                  <td>{row.level_name || '—'}</td>
                  <td>{row.preferred_schedule || '—'}</td>
                  <td><StatusBadge tone="warning">{placementLabel(row.placement_status)}</StatusBadge></td>
                  <td>{row.class_name || '—'}</td>
                  <td>{row.teacher_name || '—'}</td>
                  <td>{row.scheduled_start || row.desired_start || '—'}</td>
                  <td>{row.owner_name || '—'}</td>
                  <td>{row.days_waiting}</td>
                  <td><PlacementActions row={row} canManage={manage.get(row.branch_id) === true} classes={classes} allowed={allowed} earliestStart={earliestStart} /></td>
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

  const listArgs = {
    p_curriculum: curriculumId || null,
    p_branch: branch || null,
    p_search: q || null,
    p_limit: pageSize + 1,
    p_offset: (page - 1) * pageSize,
    p_class: classId || null,
    p_teacher: teacherId || null,
  }
  const [{ data: activeCount }, { data: pausedCount }, { data: futureCount }, { data: waitingCount }, listResult] = await Promise.all([
    db.rpc('count_current_student_enrollments_by_curriculum', { p_curriculum: curriculumId || null,
      p_branch: branch || null,
      p_search: q || null,
      p_class: classId || null,
      p_teacher: teacherId || null,
    }),
    db.rpc('count_paused_student_enrollments_by_curriculum', { p_curriculum: curriculumId || null,
      p_branch: branch || null,
      p_search: q || null,
      p_class: classId || null,
      p_teacher: teacherId || null,
    }),
    db.rpc('count_future_start_placements_by_curriculum', { p_curriculum: curriculumId || null, p_branch: branch || null, p_search: q || null }),
    db.rpc('count_waiting_placements_by_curriculum', { p_curriculum: curriculumId || null, p_branch: branch || null, p_filter: 'ALL', p_search: q || null }),
    view === 'future'
      ? db.rpc('list_future_start_placements_by_curriculum', { p_curriculum: curriculumId || null,
          p_branch: branch || null,
          p_filter: 'ALL',
          p_search: q || null,
          p_limit: pageSize + 1,
          p_offset: (page - 1) * pageSize,
        })
      : db.rpc(view === 'paused' ? 'list_paused_student_enrollments_by_curriculum' : 'list_current_student_enrollments_by_curriculum', listArgs),
  ])
  const metrics = (
    <div className="vibe-metrics">
      <OpsMetricLink href={hrefBuilder({ lifecycle: undefined })} title="Học viên đang hoạt động" value={activeCount ?? 0} />
      <OpsMetricLink href={`/admin/students?tab=waiting${curriculumId ? `&curriculum=${curriculumId}` : ''}${branch ? `&branch=${branch}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`} title="Chờ vào ca dạy" value={waitingCount ?? 0} />
      <OpsMetricLink href={hrefBuilder({ lifecycle: 'future' })} title="Đã vào ca dạy – chờ bắt đầu" value={futureCount ?? 0} />
      <OpsMetricLink href={hrefBuilder({ lifecycle: 'paused' })} title="Đang bảo lưu" value={pausedCount ?? 0} />
    </div>
  )

  if (view === 'future') {
    const future = ((listResult.data ?? []) as WaitingRow[]).slice(0, pageSize)
    const eligibility = future.length ? await db.rpc('placement_compatible_classes', { p_cases: future.map(row => row.placement_id) }) : { data: [] }
    const allowed = new Set<string>((eligibility.data ?? []).map((item: { placement_id: string; class_id: string }) => `${item.placement_id}:${item.class_id}`))
    const more = ((listResult.data ?? []) as WaitingRow[]).length > pageSize
    const manage = new Map(await Promise.all([...new Set(future.map(row => row.branch_id))].map(async id => {
      const result = await db.rpc('registration_can', { p_permission: 'student_placement.manage', p_branch: id })
      return [id, result.data === true] as const
    })))
    return (
      <section className="space-y-4">
        {metrics}
        <OperationsFilterBar
          action="/admin/students"
          hidden={{ tab: 'students', lifecycle: 'future' }}
          resetHref="/admin/students?tab=students&lifecycle=future"
          fields={[
            { name: 'curriculum', label: 'Bộ môn', type: 'select', value: curriculumId, options: curriculumOptions ?? [], allLabel: 'Tất cả bộ môn' },
            { name: 'branch', label: 'Chi nhánh', type: 'select', value: branch, options: branchSelect },
            { name: 'q', label: 'Tìm học viên', type: 'search', value: q, placeholder: 'Tên / mã học viên' },
          ]}
        />
        {shiftPager}
        <div className="vibe-table-scroll">
          <table className="vibe-table">
            <thead>
              <tr>{['Học viên', 'Chi nhánh', 'Chương trình / Bộ môn', 'Grade', 'Ca dạy', 'Giáo viên chính', 'Ngày bắt đầu', 'Trạng thái', 'Hành động'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {future.map(row => (
                <tr key={row.placement_id}>
                  <td>{canOpenStudent ? <Link href={`/admin/students/${row.student_id}`}>{row.student_name}</Link> : row.student_name}</td>
                  <td>{row.branch_name}</td>
                  <td>{row.program_name || '—'}</td>
                  <td>{row.level_name || '—'}</td>
                  <td>{row.class_name || '—'}</td>
                  <td>{row.teacher_name || '—'}</td>
                  <td>{row.scheduled_start || '—'}</td>
                  <td><StatusBadge tone="info">{placementLabel(row.placement_status)}</StatusBadge></td>
                  <td><PlacementActions row={row} canManage={manage.get(row.branch_id) === true} classes={classes} allowed={allowed} earliestStart={earliestStart} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!future.length && <EmptyState>Không có học viên đã vào ca dạy mà chưa tới ngày bắt đầu.</EmptyState>}
        <div className="vibe-actions">
          {page > 1 && <Link prefetch={false} href={hrefBuilder({ lifecycle: 'future', page: String(page - 1) })} className="vibe-button">Trang trước</Link>}
          {more && <Link prefetch={false} href={hrefBuilder({ lifecycle: 'future', page: String(page + 1) })} className="vibe-button">Trang sau</Link>}
        </div>
      </section>
    )
  }

  const current = ((listResult.data ?? []) as CurrentRow[]).slice(0, pageSize)
  const more = ((listResult.data ?? []) as CurrentRow[]).length > pageSize
  const statusLabel = view === 'paused' ? 'Đang bảo lưu' : 'Đang học'

  return (
    <section className="space-y-4">
      {metrics}
      <OperationsFilterBar
        action="/admin/students"
        hidden={{ tab: 'students', lifecycle: view === 'paused' ? 'paused' : undefined }}
        resetHref={view === 'paused' ? '/admin/students?tab=students&lifecycle=paused' : '/admin/students?tab=students'}
        fields={[
          { name: 'curriculum', label: 'Bộ môn', type: 'select', value: curriculumId, options: curriculumOptions ?? [], allLabel: 'Tất cả bộ môn' },
            { name: 'branch', label: 'Chi nhánh', type: 'select', value: branch, options: branchSelect },
          { name: 'class', label: 'Ca dạy', type: 'select', value: classId, options: classSelect },
          { name: 'teacher', label: 'Giáo viên', type: 'select', value: teacherId, options: teacherSelect },
          { name: 'q', label: 'Tìm học viên', type: 'search', value: q, placeholder: 'Tên / mã học viên' },
        ]}
      />
      <div className="vibe-table-scroll">
        <table className="vibe-table">
          <thead>
            <tr>{['Học viên', 'Chi nhánh', 'Chương trình / Bộ môn', 'Grade', 'Ca dạy', 'Giáo viên chính', 'Lịch học', 'Ngày bắt đầu', 'Gói học', 'Điểm danh đã ghi', 'Trạng thái'].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {current.map(row => (
              <tr key={row.enrollment_id}>
                <td>
                  {canOpenStudent ? <Link href={`/admin/students/${row.student_id}`}>{row.student_name}</Link> : row.student_name}
                  <p className="text-xs text-[var(--vibe-muted)]">{row.student_code}</p>
                </td>
                <td>{row.branch_name}</td>
                <td>{row.course_name}</td>
                <td>{row.level_name || '—'}</td>
                <td>{row.class_id ? <Link href={`/admin/classes/${row.class_id}`}>{row.class_name}</Link> : row.class_name}</td>
                <td>{row.teacher_name || '—'}</td>
                <td>{row.schedule_label || '—'}</td>
                <td>{row.started_on}</td>
                <td>{row.package_name || '—'}</td>
                <td>{row.attendance_marked}</td>
                <td><StatusBadge tone={view === 'paused' ? 'warning' : 'success'}>{statusLabel}</StatusBadge></td>
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
