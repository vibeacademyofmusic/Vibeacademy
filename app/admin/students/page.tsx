import Link from 'next/link'

import {
  createStudent,
  setStudentStatus,
} from './actions'

import { InlineNotice, StatusBadge } from '@/app/admin/_components/vibe'
import { businessDate, shiftBusinessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { assignPlacement, cancelPlacement, changePlacement, matchPlacement } from './placement-actions'

type StudentsPageProps = {
    searchParams: Promise<{
      error?: string
      success?: string
      q?: string
      branch?: string
        status?: string
        view?: string
        filter?: string
    }>
  }
  
  export default async function StudentsPage({
    searchParams,
  }: StudentsPageProps) {
    const params = await searchParams
    const q = (params.q ?? '').trim()
    const branch = (params.branch ?? '').trim()
    const status = (params.status ?? '').trim()
    const todayInVietnam = businessDate()
    const earliestFutureStart = shiftBusinessDate(todayInVietnam, 1)
  
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

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Học viên
        </p>

        <h1 className="mt-1 text-3xl font-bold text-gray-950">
          Học viên
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Học viên hiện tại là ghi danh đã bắt đầu. Chờ sắp lớp là hồ sơ chưa vào lớp theo ngày Việt Nam.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/students?view=current" className={`rounded-lg border px-3 py-2 ${params.view === 'waiting' || showRecords ? '' : 'bg-gray-950 text-white'}`}>Học viên hiện tại</Link>
          <Link href="/admin/students?view=waiting" className={`rounded-lg border px-3 py-2 ${params.view === 'waiting' ? 'bg-gray-950 text-white' : ''}`}>Chờ sắp lớp</Link>
          {isSuperAdmin === true && <Link href="/admin/students?view=records" className="rounded-lg border px-3 py-2">+ Tạo hồ sơ học viên thủ công</Link>}
        </div>
      </div>
      {params.error && <div className="mb-4"><InlineNotice tone="error">{params.error}</InlineNotice></div>}
      {!showRecords && (
        <form action="/admin/students" className="mb-4 flex flex-wrap gap-2">
          <input type="hidden" name="view" value={params.view === 'waiting' ? 'waiting' : 'current'} />
          {params.filter && <input type="hidden" name="filter" value={params.filter} />}
          <input name="q" defaultValue={q} placeholder="Tìm học viên" className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <button className="rounded-lg border px-3 py-2 text-sm">Tìm</button>
        </form>
      )}
      {!showRecords && <StudentPlacementBoard view={params.view === 'waiting' ? 'waiting' : 'current'} branch={branch} q={q} filter={params.filter ?? 'ALL'} canOpenStudent={isSuperAdmin === true} earliestStart={earliestFutureStart} />}

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
    </div>
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
async function StudentPlacementBoard({ view, branch, q, filter, canOpenStudent, earliestStart }: { view: 'current' | 'waiting'; branch: string; q: string; filter: string; canOpenStudent: boolean; earliestStart: string }) {
  const db = await createClient()
  if (view === 'waiting') {
    const [{ data: rows }, { data: summary }, { data: classes }] = await Promise.all([
      db.rpc('list_waiting_placements', { p_branch: branch || null, p_filter: filter, p_search: q }),
      db.rpc('waiting_placement_summary', { p_branch: branch || null }),
      db.rpc('list_placement_class_options', { p_branch: branch || null }),
    ])
    const waiting = (rows ?? []) as WaitingRow[]
    const options = (classes ?? []) as ClassOption[]
    const manage = new Map(await Promise.all([...new Set(waiting.map(row => row.branch_id))].map(async id => {
      const result = await db.rpc('registration_can', { p_permission: 'student_placement.manage', p_branch: id })
      return [id, result.data === true] as const
    })))
    const kpi = Array.isArray(summary) ? summary[0] : summary
    return (
      <section className="mb-8">
        <div className="mb-3"><InlineNotice tone="warning">Hệ thống chưa tự động kiểm tra đầy đủ xung đột lịch giáo viên/phòng.</InlineNotice></div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {[
            ['Tổng chờ', kpi?.waiting_count],
            ['Chưa xếp lớp', kpi?.unassigned_count],
            ['Đang tìm lịch', kpi?.matching_count],
            ['Đã xếp lớp – chờ bắt đầu', kpi?.scheduled_count],
            ['Số ngày chờ trung bình', kpi?.average_wait],
            ['Chờ hơn 3 ngày', kpi?.over_3],
            ['Chờ hơn 7 ngày', kpi?.over_7],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-gray-200 bg-white p-3"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold">{value ?? 0}</p></div>)}
        </div>
        <div className="mt-3 flex gap-2 text-sm">
          {[['ALL', 'Tất cả'], ['UNASSIGNED', 'Chưa xếp lớp'], ['MATCHING', 'Đang tìm lịch'], ['SCHEDULED_FUTURE', 'Đã xếp – chờ bắt đầu']].map(([id, label]) => <Link key={id} href={`/admin/students?view=waiting&filter=${id}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className="rounded border px-2 py-1">{label}</Link>)}
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-3 py-2">Học viên</th><th className="px-3 py-2">Phụ huynh</th><th className="px-3 py-2">Chi nhánh</th><th className="px-3 py-2">Bộ môn</th><th className="px-3 py-2">Cấp độ</th><th className="px-3 py-2">Lịch mong muốn</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Lớp</th><th className="px-3 py-2">Giáo viên</th><th className="px-3 py-2">Ngày bắt đầu</th><th className="px-3 py-2">Phụ trách</th><th className="px-3 py-2">Số ngày chờ</th><th className="px-3 py-2">Xếp lớp</th></tr></thead>
            <tbody>{waiting.map(row => <tr key={row.placement_id} className="border-t align-top"><td className="px-3 py-2">{canOpenStudent ? <Link href={`/admin/students/${row.student_id}`}>{row.student_name}</Link> : row.student_name}</td><td className="px-3 py-2">{row.parent_name || '—'}</td><td className="px-3 py-2">{row.branch_name}</td><td className="px-3 py-2">{row.program_name || '—'}</td><td className="px-3 py-2">{row.level_name || '—'}</td><td className="px-3 py-2">{row.preferred_schedule || '—'}</td><td className="px-3 py-2"><StatusBadge tone={row.placement_status === 'SCHEDULED_FUTURE' ? 'info' : 'warning'}>{placementLabel(row.placement_status)}</StatusBadge></td><td className="px-3 py-2">{row.class_name || '—'}</td><td className="px-3 py-2">{row.teacher_name || '—'}</td><td className="px-3 py-2">{row.scheduled_start || row.desired_start || '—'}</td><td className="px-3 py-2">{row.owner_name || '—'}</td><td className="px-3 py-2">{row.days_waiting}</td><td className="px-3 py-2"><PlacementActions row={row} canManage={manage.get(row.branch_id) === true} classes={options} earliestStart={earliestStart} /></td></tr>)}</tbody>
          </table>
          {!rows?.length && <p className="px-4 py-6 text-sm text-gray-500">Không có hồ sơ chờ sắp lớp.</p>}
        </div>
      </section>
    )
  }
  const { data: rows } = await db.rpc('list_current_student_enrollments', { p_branch: branch || null, p_search: q })
  return (
    <section className="mb-8 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm"><thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-3 py-2">Học viên</th><th className="px-3 py-2">Chi nhánh</th><th className="px-3 py-2">Bộ môn</th><th className="px-3 py-2">Cấp độ</th><th className="px-3 py-2">Lớp</th><th className="px-3 py-2">Giáo viên chính</th><th className="px-3 py-2">Lịch học</th><th className="px-3 py-2">Ngày bắt đầu</th><th className="px-3 py-2">Gói học</th><th className="px-3 py-2">Điểm danh đã ghi</th><th className="px-3 py-2">Phân lớp</th></tr></thead>
        <tbody>{((rows ?? []) as CurrentRow[]).map(row => <tr key={row.enrollment_id} className="border-t"><td className="px-3 py-2">{canOpenStudent ? <Link href={`/admin/students/${row.student_id}`}>{row.student_name}</Link> : row.student_name}<p className="text-xs text-gray-500">{row.student_code}</p></td><td className="px-3 py-2">{row.branch_name}</td><td className="px-3 py-2">{row.course_name}</td><td className="px-3 py-2">{row.level_name || '—'}</td><td className="px-3 py-2">{row.class_name}</td><td className="px-3 py-2">{row.teacher_name || '—'}</td><td className="px-3 py-2">{row.schedule_label || '—'}</td><td className="px-3 py-2">{row.started_on}</td><td className="px-3 py-2">{row.package_name || '—'}</td><td className="px-3 py-2">{row.attendance_marked}</td><td className="px-3 py-2"><StatusBadge>Đã bắt đầu học — cần quy trình chuyển lớp</StatusBadge></td></tr>)}</tbody>
      </table>
      {!rows?.length && <p className="px-4 py-6 text-sm text-gray-500">Chưa có học viên đang học.</p>}
    </section>
  )
}
