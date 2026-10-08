import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

import {
  refreshRetentionAlerts,
  updateRetentionAlert,
} from './actions'

type RetentionPageProps = {
  searchParams: Promise<{
    status?: string
    branch?: string
    q?: string
    error?: string
    success?: string
  }>
}

type RetentionAlert = {
  id: string
  student_id: string
  enrollment_id: string
  branch_id: string
  class_id: string
  rule_code: string
  severity: string
  status: string
  first_signal_on: string
  last_signal_on: string
  consecutive_absence_count: number
  evidence_snapshot: unknown
  owner_user_id: string | null
  follow_up_on: string | null
  latest_contact_channel: string | null
  latest_note: string | null
  resolution_code: string | null
  detected_at: string
  last_detected_at: string
  resolved_at: string | null
  created_at: string
  updated_at: string
}

type StudentRow = {
  id: string
  student_code: string
  full_name: string | null
  preferred_name: string | null
}

type ClassRow = {
  id: string
  code: string
  name: string
  branch_id: string
}

type BranchRow = {
  id: string
  code: string
  name: string
}

const OPEN_STATUSES = new Set([
  'NEW',
  'CONTACTED',
  'FOLLOW_UP',
])

const ALL_STATUSES = new Set([
  'NEW',
  'CONTACTED',
  'FOLLOW_UP',
  'RESOLVED',
  'LOST',
  'DISMISSED',
])

const statusLabels: Record<string, string> = {
  NEW: 'Mới',
  CONTACTED: 'Đã liên hệ',
  FOLLOW_UP: 'Cần theo dõi',
  RESOLVED: 'Đã xử lý',
  LOST: 'Mất học viên',
  DISMISSED: 'Bỏ qua',
}

const statusStyles: Record<string, string> = {
  NEW: 'bg-red-50 text-red-700',
  CONTACTED: 'bg-blue-50 text-blue-700',
  FOLLOW_UP: 'bg-amber-50 text-amber-700',
  RESOLVED: 'bg-green-50 text-green-700',
  LOST: 'bg-gray-950 text-white',
  DISMISSED: 'bg-gray-100 text-gray-600',
}

const severityStyles: Record<string, string> = {
  MEDIUM: 'bg-amber-50 text-amber-700',
  HIGH: 'bg-red-50 text-red-700',
  CRITICAL: 'bg-red-100 text-red-900',
}

function formatDate(value: string | null) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(`${value}T00:00:00+07:00`))
}

function formatDateTime(value: string | null) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
}

function studentName(student: StudentRow | undefined) {
  return (
    student?.preferred_name ||
    student?.full_name ||
    student?.student_code ||
    'Học viên'
  )
}

function nextReturnPath(
  params: {
    status?: string
    branch?: string
    q?: string
  }
) {
  const query = new URLSearchParams()

  if (params.status) query.set('status', params.status)
  if (params.branch) query.set('branch', params.branch)
  if (params.q) query.set('q', params.q)

  const suffix = query.toString()
  return suffix
    ? `/admin/attendance/retention?${suffix}`
    : '/admin/attendance/retention'
}

function evidenceDates(snapshot: unknown) {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot)
  ) {
    return []
  }

  const record = snapshot as Record<string, unknown>
  const dates: string[] = []

  for (const key of ['prior', 'latest']) {
    const item = record[key]

    if (
      item &&
      typeof item === 'object' &&
      !Array.isArray(item)
    ) {
      const occurrenceDate = (
        item as Record<string, unknown>
      ).occurrence_date

      if (typeof occurrenceDate === 'string') {
        dates.push(occurrenceDate)
      }
    }
  }

  return dates
}

export default async function RetentionPage({
  searchParams,
}: RetentionPageProps) {
  const params = await searchParams
  const db = await createClient()

  const selectedStatus = ALL_STATUSES.has(
    params.status ?? ''
  )
    ? params.status!
    : ''

  const selectedBranch = params.branch ?? ''
  const queryText = (params.q ?? '')
    .trim()
    .slice(0, 100)
    .toLocaleLowerCase('vi')

  let alertQuery = db
    .from('student_retention_alerts')
    .select('*')
    .order('last_signal_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (selectedStatus) {
    alertQuery = alertQuery.eq('status', selectedStatus)
  }

  if (selectedBranch) {
    alertQuery = alertQuery.eq(
      'branch_id',
      selectedBranch
    )
  }

  const [
    { data: alerts, error: alertsError },
    { data: branches, error: branchesError },
  ] = await Promise.all([
    alertQuery.returns<RetentionAlert[]>(),
    db
      .from('branches')
      .select('id,code,name')
      .eq('status', 'ACTIVE')
      .order('name')
      .returns<BranchRow[]>(),
  ])

  if (alertsError) {
    console.error('Retention alerts load failed', {
      code: alertsError.code,
      message: alertsError.message,
    })
  }

  if (branchesError) {
    console.error('Retention branches load failed', {
      code: branchesError.code,
      message: branchesError.message,
    })
  }

  const baseAlerts = alertsError ? [] : alerts ?? []

  const studentIds = Array.from(
    new Set(baseAlerts.map((item) => item.student_id))
  )
  const classIds = Array.from(
    new Set(baseAlerts.map((item) => item.class_id))
  )

  const [
    { data: students, error: studentsError },
    { data: classes, error: classesError },
  ] = await Promise.all([
    studentIds.length
      ? db
          .from('students')
          .select(
            'id,student_code,full_name,preferred_name'
          )
          .in('id', studentIds)
          .returns<StudentRow[]>()
      : Promise.resolve({ data: [], error: null }),

    classIds.length
      ? db
          .from('classes')
          .select('id,code,name,branch_id')
          .in('id', classIds)
          .returns<ClassRow[]>()
      : Promise.resolve({ data: [], error: null }),
  ])

  if (studentsError) {
    console.error('Retention students load failed', {
      code: studentsError.code,
      message: studentsError.message,
    })
  }

  if (classesError) {
    console.error('Retention classes load failed', {
      code: classesError.code,
      message: classesError.message,
    })
  }

  const studentMap = new Map(
    (students ?? []).map((item) => [item.id, item])
  )
  const classMap = new Map(
    (classes ?? []).map((item) => [item.id, item])
  )
  const branchMap = new Map(
    (branches ?? []).map((item) => [item.id, item])
  )

  const visibleAlerts = baseAlerts.filter((alert) => {
    if (!queryText) return true

    const student = studentMap.get(alert.student_id)
    const classItem = classMap.get(alert.class_id)
    const branch = branchMap.get(alert.branch_id)

    const haystack = [
      studentName(student),
      student?.student_code,
      classItem?.name,
      classItem?.code,
      branch?.name,
      branch?.code,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('vi')

    return haystack.includes(queryText)
  })

  const counts = baseAlerts.reduce(
    (result, alert) => {
      if (alert.status === 'NEW') result.new += 1
      if (alert.status === 'CONTACTED') {
        result.contacted += 1
      }
      if (alert.status === 'FOLLOW_UP') {
        result.followUp += 1
      }
      if (alert.status === 'RESOLVED') {
        result.resolved += 1
      }
      if (alert.status === 'LOST') result.lost += 1
      if (OPEN_STATUSES.has(alert.status)) {
        result.open += 1
      }
      return result
    },
    {
      open: 0,
      new: 0,
      contacted: 0,
      followUp: 0,
      resolved: 0,
      lost: 0,
    }
  )

  const returnTo = nextReturnPath({
    status: selectedStatus || undefined,
    branch: selectedBranch || undefined,
    q: params.q,
  })

  const statLink = (
    status: string,
    label: string,
    value: number
  ) => {
    const query = new URLSearchParams()
    if (status) query.set('status', status)
    if (selectedBranch) {
      query.set('branch', selectedBranch)
    }

    return (
      <Link
        key={status || 'ALL'}
        href={`/admin/attendance/retention?${query.toString()}`}
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <p className="mt-2 text-2xl font-bold text-gray-950">
          {value}
        </p>
      </Link>
    )
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">
            Attendance → CRM
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
            Cảnh báo chuyên cần
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600">
            Phát hiện học viên vắng 2 buổi liên tiếp,
            theo dõi chăm sóc và giữ toàn bộ lịch sử xử
            lý. V1 không tự động gửi tin nhắn cho phụ
            huynh.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/attendance"
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
          >
            ← Điểm danh hôm nay
          </Link>

          <form action={refreshRetentionAlerts}>
            <input
              type="hidden"
              name="branch_id"
              value={selectedBranch}
            />
            <input
              type="hidden"
              name="return_to"
              value={returnTo}
            />
            <button className="rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white">
              Làm mới cảnh báo
            </button>
          </form>
        </div>
      </div>

      {params.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {params.success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {params.success}
        </div>
      )}

      {alertsError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Không thể tải cảnh báo chuyên cần. Kiểm tra RLS
          và quyền SUPER_ADMIN.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statLink('', 'Đang cần xử lý', counts.open)}
        {statLink('NEW', 'Mới', counts.new)}
        {statLink(
          'CONTACTED',
          'Đã liên hệ',
          counts.contacted
        )}
        {statLink(
          'FOLLOW_UP',
          'Cần theo dõi',
          counts.followUp
        )}
        {statLink(
          'RESOLVED',
          'Đã xử lý',
          counts.resolved
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            Trạng thái
            <select
              name="status"
              defaultValue={selectedStatus}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Tất cả</option>
              {Object.entries(statusLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Chi nhánh
            <select
              name="branch"
              defaultValue={selectedBranch}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Tất cả</option>
              {(branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Tìm học viên / lớp
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Tên, mã học viên, lớp..."
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>

          <div className="md:col-span-3 flex flex-wrap gap-2">
            <button className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">
              Lọc danh sách
            </button>
            <Link
              href="/admin/attendance/retention"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Xóa bộ lọc
            </Link>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        {visibleAlerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <h2 className="font-semibold text-gray-950">
              Chưa có cảnh báo phù hợp
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Bấm “Làm mới cảnh báo” để đối chiếu dữ liệu
              Attendance đã hoàn tất.
            </p>
          </div>
        ) : (
          visibleAlerts.map((alert) => {
            const student = studentMap.get(
              alert.student_id
            )
            const classItem = classMap.get(
              alert.class_id
            )
            const branch = branchMap.get(
              alert.branch_id
            )
            const dates = evidenceDates(
              alert.evidence_snapshot
            )
            const isOpen = OPEN_STATUSES.has(
              alert.status
            )

            return (
              <article
                key={alert.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="grid gap-5 p-5 lg:grid-cols-[1.35fr_1fr]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-950">
                        {studentName(student)}
                      </h2>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          statusStyles[alert.status] ||
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {statusLabels[alert.status] ||
                          alert.status}
                      </span>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          severityStyles[
                            alert.severity
                          ] ||
                          'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {alert.severity === 'HIGH'
                          ? 'Nguy cơ cao'
                          : alert.severity}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {student?.student_code || '—'}
                    </p>

                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Lớp
                        </p>
                        <p className="mt-1 font-medium text-gray-950">
                          {classItem?.name ||
                            classItem?.code ||
                            '—'}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Chi nhánh
                        </p>
                        <p className="mt-1 font-medium text-gray-950">
                          {branch?.name || '—'}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Tín hiệu
                        </p>
                        <p className="mt-1 font-medium text-red-700">
                          Vắng{' '}
                          {
                            alert.consecutive_absence_count
                          }{' '}
                          buổi liên tiếp
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Ngày vắng
                        </p>
                        <p className="mt-1 font-medium text-gray-950">
                          {dates.length
                            ? dates
                                .map(formatDate)
                                .join(' · ')
                            : `${formatDate(
                                alert.first_signal_on
                              )} · ${formatDate(
                                alert.last_signal_on
                              )}`}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Theo dõi tiếp
                        </p>
                        <p className="mt-1 font-medium text-gray-950">
                          {formatDate(alert.follow_up_on)}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Cập nhật gần nhất
                        </p>
                        <p className="mt-1 font-medium text-gray-950">
                          {formatDateTime(
                            alert.updated_at
                          )}
                        </p>
                      </div>
                    </div>

                    {alert.latest_note && (
                      <div className="mt-4 rounded-xl bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Ghi chú gần nhất
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                          {alert.latest_note}
                        </p>
                      </div>
                    )}

                    <div className="mt-4">
                      <Link
                        href={`/admin/students/${alert.student_id}`}
                        className="text-sm font-semibold text-blue-700 underline"
                      >
                        Mở hồ sơ học viên
                      </Link>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    {isOpen ? (
                      <>
                        <h3 className="font-semibold text-gray-950">
                          Cập nhật chăm sóc
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Mỗi lần xử lý được ghi thành event
                          mới. Không xóa lịch sử cũ.
                        </p>

                        <form
                          action={updateRetentionAlert}
                          className="mt-4 space-y-3"
                        >
                          <input
                            type="hidden"
                            name="alert_id"
                            value={alert.id}
                          />
                          <input
                            type="hidden"
                            name="return_to"
                            value={returnTo}
                          />

                          <label className="block text-sm font-medium text-gray-700">
                            Kết quả
                            <select
                              name="status"
                              defaultValue={
                                alert.status === 'NEW'
                                  ? 'CONTACTED'
                                  : alert.status
                              }
                              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                            >
                              <option value="CONTACTED">
                                Đã liên hệ
                              </option>
                              <option value="FOLLOW_UP">
                                Hẹn theo dõi
                              </option>
                              <option value="RESOLVED">
                                Tiếp tục học / đã xử lý
                              </option>
                              <option value="LOST">
                                Ngừng học
                              </option>
                              <option value="DISMISSED">
                                Bỏ qua cảnh báo
                              </option>
                            </select>
                          </label>

                          <label className="block text-sm font-medium text-gray-700">
                            Kênh liên hệ
                            <select
                              name="channel"
                              defaultValue={
                                alert.latest_contact_channel ||
                                'PHONE'
                              }
                              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                            >
                              <option value="PHONE">
                                Điện thoại
                              </option>
                              <option value="ZALO">
                                Zalo
                              </option>
                              <option value="SMS">
                                SMS
                              </option>
                              <option value="EMAIL">
                                Email
                              </option>
                              <option value="IN_PERSON">
                                Trao đổi trực tiếp
                              </option>
                              <option value="OTHER">
                                Khác
                              </option>
                            </select>
                          </label>

                          <label className="block text-sm font-medium text-gray-700">
                            Ngày theo dõi tiếp
                            <input
                              type="date"
                              name="follow_up_on"
                              defaultValue={
                                alert.follow_up_on || ''
                              }
                              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                            />
                          </label>

                          <label className="block text-sm font-medium text-gray-700">
                            Ghi chú xử lý
                            <textarea
                              name="note"
                              rows={3}
                              maxLength={4000}
                              required
                              placeholder="Ví dụ: Đã gọi phụ huynh, gia đình xin nghỉ vì..."
                              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                            />
                          </label>

                          <button className="w-full rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white">
                            Lưu kết quả chăm sóc
                          </button>
                        </form>
                      </>
                    ) : (
                      <>
                        <h3 className="font-semibold text-gray-950">
                          Cảnh báo đã đóng
                        </h3>
                        <div className="mt-3 space-y-2 text-sm text-gray-600">
                          <p>
                            Kết quả:{' '}
                            <strong className="text-gray-950">
                              {statusLabels[
                                alert.status
                              ] || alert.status}
                            </strong>
                          </p>
                          <p>
                            Mã kết quả:{' '}
                            {alert.resolution_code || '—'}
                          </p>
                          <p>
                            Đóng lúc:{' '}
                            {formatDateTime(
                              alert.resolved_at
                            )}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-950">
          Quy tắc V1
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Chỉ xét các buổi REGULAR đã COMPLETED. Hai buổi
          gần nhất cùng có trạng thái ABSENT hoặc EXCUSED
          sẽ tạo cảnh báo. Khi buổi REGULAR đã COMPLETED
          tiếp theo được ghi PRESENT hoặc LATE, engine có
          thể tự đóng cảnh báo khi chạy “Làm mới cảnh
          báo”.
        </p>
      </section>
    </div>
  )
}
