import { attendanceReturn } from '../launcher-model'
import styles from '../attendance.module.css'
import SessionTeacher from '@/app/admin/session-teachers/SessionTeacher'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import SessionJournals from '@/app/admin/learning-journals/SessionJournals'
import {
  createMakeupSession,
  rescheduleSession,
  saveAttendance,
  setSessionStatus,
} from '../actions'

type SessionDetailPageProps = {
  params: Promise<{
    id: string
  }>

  searchParams: Promise<{
    error?: string
    success?: string
    return_to?: string
  }>
}

type StudentSummary = {
  id: string
  student_code: string
  full_name: string | null
  preferred_name: string | null
}

type BranchRosterRow = StudentSummary & {
  student_id: string
  enrollment_id: string
  attendance_id: string | null
  status: string | null
  notes: string | null
}

type MakeupCreditSummary = {
  id: string
  enrollment_id: string
  source_occurrence_id: string
  source_reason: 'EXCUSED' | 'SESSION_CANCELLED'
  created_at: string
}

const SESSION_STATUS_STYLES: Record<
  string,
  string
> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-700',
}

const CREDIT_STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-blue-50 text-blue-700',
  RESERVED: 'bg-amber-50 text-amber-700',
  USED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

const CREDIT_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Còn dùng được',
  RESERVED: 'Đã đặt',
  USED: 'Đã học',
  CANCELLED: 'Đã thu hồi',
}

function formatDateTime(
  value: string,
  timezone: string
) {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(value))
}

function formatTime(
  value: string,
  timezone: string
) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(value))
}

function formatDateTimeLocal(
  value: string,
  timezone: string
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  }).formatToParts(new Date(value))

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: SessionDetailPageProps) {
  const { id } = await params
  const { error, success, return_to } = await searchParams

  const supabase = await createClient()
  const [{ data: mayRead, error: accessError }, { data: isSuperAdmin }] = await Promise.all([
    supabase.rpc('can_access_session', { p_session: id }),
    supabase.rpc('has_role', { role_code: 'SUPER_ADMIN' }),
  ])
  if (accessError || mayRead !== true) notFound()
  // Branch readers use existing RLS. Mutations retain the established admin gate.
  const canManage = isSuperAdmin === true


  const {
    data: occurrence,
    error: occurrenceError,
  } = await supabase
    .from('session_occurrences')
    .select(`
      id,
      schedule_id,
      occurrence_date,
      starts_at,
      ends_at,
      room_id,
      status,
      notes,
      original_starts_at,
      original_ends_at,
      original_room_id,
      rescheduled_at,
      reschedule_reason,
      occurrence_type,
      source_occurrence_id
    `)
    .eq('id', id)
    .maybeSingle()

  if (occurrenceError || !occurrence) {
    notFound()
  }

  const { data: schedule } = await supabase
    .from('schedules')
    .select('id, class_id, timezone')
    .eq('id', occurrence.schedule_id)
    .maybeSingle()

  if (!schedule) {
    notFound()
  }

  const { data: classItem } = await supabase
    .from('classes')
    .select('id, branch_id, code, name, course_id')
    .eq('id', schedule.class_id)
    .maybeSingle()

  if (!classItem) {
    notFound()
  }

  const [
    { data: branch },
    { data: room },
    { data: availableRooms, error: roomsError },
    { data: enrollments, error: enrollmentsError },
    {
      data: makeupParticipants,
      error: participantsError,
    },
    { data: rawAttendance, error: attendanceError },
    {
      data: relatedMakeupSessions,
      error: relatedMakeupSessionsError,
    },
  ] = await Promise.all([
    supabase
      .from('branches')
      .select('id, code, name')
      .eq('id', classItem.branch_id)
      .maybeSingle(),

    occurrence.room_id
      ? supabase
          .from('rooms')
          .select('id, code, name')
          .eq('id', occurrence.room_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),

    supabase
      .from('rooms')
      .select('id, code, name')
      .eq('branch_id', classItem.branch_id)
      .eq('status', 'ACTIVE')
      .order('name'),

    supabase
      .from('enrollments')
      .select(`
        id,
        student_id,
        enrolled_at,
        started_at,
        ended_at,
        status
      `)
      .eq('class_id', classItem.id),

    occurrence.occurrence_type === 'MAKEUP'
      ? supabase
          .from('session_occurrence_participants')
          .select(`
            enrollment_id,
            makeup_credit:makeup_credits!makeup_credit_id(
              status,
              source_reason,
              source_occurrence_id
            )
          `)
          .eq('session_occurrence_id', occurrence.id)
      : Promise.resolve({
          data: [],
          error: null,
        }),

    supabase
      .from('attendance_records')
      .select(`
        id,
        enrollment_id,
        status,
        notes,
        marked_at
      `)
      .eq('session_occurrence_id', occurrence.id),

    occurrence.occurrence_type === 'REGULAR'
      ? supabase
          .from('session_occurrences')
          .select('id, starts_at, status')
          .eq('source_occurrence_id', occurrence.id)
          .order('starts_at', { ascending: true })
      : Promise.resolve({
          data: [],
          error: null,
        }),
  ])

  let attendance: { id: string | null; enrollment_id: string; status: string | null; notes: string | null }[] | null = rawAttendance
  let branchRoster: BranchRosterRow[] | null = null

  const makeupParticipantIds = new Set(
    (makeupParticipants ?? []).map(
      (participant) => participant.enrollment_id
    )
  )
  let pausedEnrollmentIds = new Set<string>()

if (
  occurrence.occurrence_type === 'REGULAR' &&
  (enrollments?.length ?? 0) > 0
) {
  const { data: activePauses, error: pausesError } = await supabase
    .from('enrollment_pauses')
    .select('enrollment_id')
    .eq('status', 'ACTIVE')
    .lte('starts_on', occurrence.occurrence_date)
    .gte('ends_on', occurrence.occurrence_date)
    .in(
      'enrollment_id',
      (enrollments ?? []).map((enrollment) => enrollment.id)
    )

  if (pausesError) {
    throw new Error('Không thể kiểm tra trạng thái bảo lưu của học viên')
  }

  pausedEnrollmentIds = new Set(
    (activePauses ?? []).map((pause) => pause.enrollment_id)
  )
}

  const makeupCreditByEnrollment = new Map(
    (makeupParticipants ?? []).map((participant) => [
      participant.enrollment_id,
      participant.makeup_credit[0] ?? null,
    ])
  )

  let roster: { id: string; student_id: string }[] = (enrollments ?? []).filter(
    (enrollment) => {
      if (occurrence.occurrence_type === 'MAKEUP') {
        return makeupParticipantIds.has(enrollment.id)
      }

      if (!enrollment.started_at) {
        return false
      }

      return (
        enrollment.started_at <= occurrence.occurrence_date &&
        (!enrollment.ended_at ||
          enrollment.ended_at >= occurrence.occurrence_date) &&
        !pausedEnrollmentIds.has(enrollment.id)
      )
    }
  )
  if (!canManage) {
    const result = await supabase.rpc('attendance_roster_read', { p_session: id })
    if (result.error || !Array.isArray(result.data)) {
      throw new Error('Không thể tải sổ điểm danh trong phạm vi được phép')
    }
    branchRoster = result.data as BranchRosterRow[]
    roster = branchRoster.map(row => ({ id: row.enrollment_id, student_id: row.student_id }))
    attendance = branchRoster.filter(row => row.attendance_id).map(row => ({
      id: row.attendance_id, enrollment_id: row.enrollment_id, status: row.status, notes: row.notes,
    }))
  }
  const canCreateMakeup =
    occurrence.occurrence_type === 'REGULAR' &&
    ['COMPLETED', 'CANCELLED'].includes(
      occurrence.status
    )

  let availableMakeupCredits: MakeupCreditSummary[] = []
  let makeupCreditsError: unknown = null

  if (canCreateMakeup && (enrollments?.length ?? 0) > 0) {
    const creditResult = await supabase
      .from('makeup_credits')
      .select(`
        id,
        enrollment_id,
        source_occurrence_id,
        source_reason,
        created_at
      `)
      .eq('status', 'AVAILABLE')
      .in(
        'enrollment_id',
        (enrollments ?? []).map(
          (enrollment) => enrollment.id
        )
      )
      .order('created_at', { ascending: true })

    availableMakeupCredits =
      (creditResult.data ?? []) as MakeupCreditSummary[]
    makeupCreditsError = creditResult.error
  }

  const availableCreditCounts = new Map<string, number>()
  const availableCreditReasons = new Map<
    string,
    {
      excused: number
      sessionCancelled: number
    }
  >()

  for (const credit of availableMakeupCredits) {
    availableCreditCounts.set(
      credit.enrollment_id,
      (availableCreditCounts.get(credit.enrollment_id) ?? 0) + 1
    )

    const reasons = availableCreditReasons.get(
      credit.enrollment_id
    ) ?? {
      excused: 0,
      sessionCancelled: 0,
    }

    if (credit.source_reason === 'EXCUSED') {
      reasons.excused += 1
    } else {
      reasons.sessionCancelled += 1
    }

    availableCreditReasons.set(
      credit.enrollment_id,
      reasons
    )
  }

  const makeupEligibleEnrollments = (
    enrollments ?? []
  ).filter((enrollment) =>
    availableCreditCounts.has(enrollment.id)
  )

  let students: StudentSummary[] = []
  let studentsError = null

  const studentIds = Array.from(
    new Set(
      [...roster, ...makeupEligibleEnrollments].map(
        (enrollment) => enrollment.student_id
      )
    )
  )

  if (branchRoster) {
    students = branchRoster.map(row => ({ ...row, id: row.student_id }))
  } else if (studentIds.length > 0) {
    const studentResult = await supabase
      .from('students')
      .select(
        'id, student_code, full_name, preferred_name'
      )
      .in('id', studentIds)

    students = (studentResult.data ?? []) as StudentSummary[]
    studentsError = studentResult.error
  }

  const levelByStudent = new Map<string, string>()
  await Promise.all(
    studentIds.map(async studentId => {
      const { data: levelRows } = await supabase.rpc('class_student_current_level', {
        p_class: classItem.id,
        p_student: studentId,
      })
      const level = Array.isArray(levelRows) ? levelRows[0] : levelRows
      if (level?.level_name) levelByStudent.set(studentId, level.level_name)
    })
  )

  const loadError =
    roomsError ||
    enrollmentsError ||
    participantsError ||
    attendanceError ||
    relatedMakeupSessionsError ||
    makeupCreditsError ||
    studentsError

  const studentMap = new Map(
    students.map((student) => [
      student.id,
      student,
    ])
  )

  const attendanceMap = new Map(
    (attendance ?? []).map((record) => [
      record.enrollment_id,
      record,
    ])
  )

  const returnTo = attendanceReturn(return_to, occurrence.occurrence_date)
  const { data: nextSession } = await supabase.from('session_occurrences')
    .select('id').eq('schedule_id', occurrence.schedule_id).eq('status', 'SCHEDULED')
    .gt('starts_at', occurrence.starts_at).order('starts_at').limit(1).maybeSingle()

  const timezone =
    schedule.timezone ?? 'Asia/Ho_Chi_Minh'

  const isAttendanceLocked =
    occurrence.status !== 'SCHEDULED'

  const isFullyMarked =
    (occurrence.occurrence_type !== 'MAKEUP' ||
      roster.length > 0) &&
    (attendance?.length ?? 0) === roster.length

  const hasAttendance =
    (attendance?.length ?? 0) > 0

  const canReschedule =
    occurrence.status === 'SCHEDULED' &&
    !hasAttendance

  return (
    <div className="vibe-page min-w-0 max-w-6xl">
      <Link
        href={returnTo}
        className="text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        ← Quay lại danh sách điểm danh
      </Link>

      <div className="mt-6">
        <p className="text-sm font-medium text-gray-500">
          Điểm danh buổi học
        </p>

        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-950">
              {classItem.name}
            </h1>
            {canManage && <Link href={`/admin/classes/${classItem.id}`} className="vibe-button">Xem ca dạy</Link>}

            <p className="mt-2 text-sm text-gray-500">
              {classItem.code} ·{' '}
              {formatDateTime(
                occurrence.starts_at,
                timezone
              )}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  occurrence.occurrence_type === 'MAKEUP'
                    ? 'bg-purple-50 text-purple-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {occurrence.occurrence_type === 'MAKEUP' ? 'Học bù' : 'Buổi thường'}
              </span>

              {occurrence.source_occurrence_id && (
                <Link
                  href={`/admin/attendance/${occurrence.source_occurrence_id}`}
                  className="text-xs font-semibold text-purple-700 hover:text-purple-900"
                >
                  View source session →
                </Link>
              )}
            </div>
          </div>

          <span
            className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${
              SESSION_STATUS_STYLES[
                occurrence.status
              ] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {{ SCHEDULED: 'Chờ diễn ra', COMPLETED: 'Đã kết thúc', CANCELLED: 'Đã hủy' }[occurrence.status as string] ?? occurrence.status}
          </span>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        {loadError && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Không thể tải đầy đủ sổ điểm danh. Vui lòng thử lại.
          </div>
        )}

        {occurrence.rescheduled_at && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Originally scheduled for{' '}
            {formatDateTime(
              occurrence.original_starts_at,
              timezone
            )}
            {occurrence.reschedule_reason
              ? ` · ${occurrence.reschedule_reason}`
              : ''}
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Chi nhánh
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {branch?.name ?? 'Chưa có chi nhánh'}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {branch?.code ?? '—'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Phòng
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {room?.name ?? 'Chưa có phòng'}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {room?.code ?? '—'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Giờ
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {formatTime(
                occurrence.starts_at,
                timezone
              )}{' '}
              –{' '}
              {formatTime(
                occurrence.ends_at,
                timezone
              )}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {timezone}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Điểm danh
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {attendance?.length ?? 0} /{' '}
              {roster.length} đã điểm danh
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Danh sách buổi học
            </p>
          </div>
        </div>

        <section id="attendance-roster" className={`vibe-card mt-6 ${styles.roster}`}>
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Sổ điểm danh
            </h2>

            <p className="mt-1 text-sm leading-6 text-gray-500">
              {occurrence.occurrence_type === 'MAKEUP'
                ? 'Học viên đã được chọn tham gia buổi học bù này. Có phép đã xác nhận không thu quyền: hủy chỗ được phép hoặc chốt buổi sẽ trả lại chính quyền đã đặt. Không tạo quyền mới. Chỗ cũ, điểm danh và ghi nhận đối soát vẫn được giữ.'
                : 'Học viên đủ điều kiện tham gia vào ngày diễn ra buổi học. Buổi thường đã chốt với Có phép đã xác nhận cấp đúng một quyền học bù cho buổi và ghi danh đó. Báo vắng đang chờ chưa cấp quyền. Ngày bảo lưu đã duyệt không có trong danh sách này và không được cấp thêm quyền.'}
            </p>
          </div>

          {isAttendanceLocked && (
            <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
              Điểm danh đã khóa vì buổi học không còn ở trạng thái chờ diễn ra.
            </div>
          )}

          {roster.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                Buổi học chưa có học viên đủ điều kiện
              </p>

              <p className="mt-1 text-sm text-gray-400">
                {occurrence.occurrence_type === 'MAKEUP'
                  ? 'Buổi học bù chưa có học viên được chọn.'
                  : 'Kiểm tra thời gian xếp lớp của học viên cho buổi học này.'}
              </p>
            </div>
          ) : (
            <>
            {!canManage && <p className="vibe-notice mb-4">Bạn đang xem sổ điểm danh theo phạm vi chi nhánh. Giáo viên được phân công hoặc quản trị cấp cao thực hiện ghi điểm danh.</p>}
            <form action={saveAttendance}>
              <input type="hidden" name="return_to" value={returnTo} />
              <input
                type="hidden"
                name="occurrence_id"
                value={occurrence.id}
              />

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">
                        Học viên
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Trình độ hiện tại
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Trạng thái điểm danh
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Ghi chú
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {roster.map((enrollment) => {
                      const student = studentMap.get(
                        enrollment.student_id
                      )

                      const record = attendanceMap.get(
                        enrollment.id
                      )

                      const makeupCredit =
                        makeupCreditByEnrollment.get(
                          enrollment.id
                        )

                      return (
                        <tr key={enrollment.id}>
                          <td data-label="Học viên" className="px-5 py-4">
                            <p className="font-semibold text-gray-950">
                              {student?.preferred_name ||
                                student?.full_name ||
                                'Chưa có tên học viên'}
                            </p>

                            <p className="mt-1 text-xs text-gray-500">
                              {student?.student_code ?? '—'}
                            </p>

                            {makeupCredit && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    CREDIT_STATUS_STYLES[
                                      makeupCredit.status
                                    ] ??
                                    'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {CREDIT_STATUS_LABELS[makeupCredit.status] ?? makeupCredit.status}
                                </span>

                                <Link
                                  href={`/admin/attendance/${makeupCredit.source_occurrence_id}`}
                                  className="text-xs font-medium text-purple-700 hover:text-purple-900"
                                >
                                  {makeupCredit.source_reason ===
                                  'EXCUSED'
                                    ? 'Nguồn: nghỉ có phép'
                                    : 'Nguồn: buổi thường bị hủy'}{' '}
                                  →
                                </Link>
                              </div>
                            )}
                          </td>

                          <td data-label="Trình độ hiện tại" className="px-5 py-4 text-sm text-gray-700">
                            {levelByStudent.get(enrollment.student_id) ?? '—'}
                          </td>

                          <td data-label="Trạng thái điểm danh" className="px-5 py-4">
                            <select
                              aria-label={`Điểm danh ${student?.full_name ?? student?.student_code}`}
                              name={`status_${enrollment.id}`}
                              defaultValue={
                                record?.status ?? ''
                              }
                              disabled={!canManage || isAttendanceLocked || Boolean(loadError)}
                              className="min-w-40 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900 disabled:bg-gray-100"
                            >
                              <option value="" disabled>
                                Chọn trạng thái
                              </option>

                              <option value="PRESENT">
                                Có mặt
                              </option>

                              <option value="LATE">
                                Đi muộn
                              </option>

                              <option value="ABSENT">
                                Vắng
                              </option>

                              <option value="EXCUSED">
                                Có phép
                              </option>
                            </select>
                          </td>

                          <td data-label="Ghi chú" className="px-5 py-4">
                            <input
                              aria-label={`Ghi chú ${student?.full_name ?? student?.student_code}`}
                              name={`notes_${enrollment.id}`}
                              defaultValue={
                                record?.notes ?? ''
                              }
                              disabled={!canManage || isAttendanceLocked || Boolean(loadError)}
                              maxLength={500}
                              placeholder="Ghi chú (không bắt buộc)"
                              className="w-full min-w-64 rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900 disabled:bg-gray-100"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-4">
                <button
                  type="submit"
                  disabled={!canManage || isAttendanceLocked || Boolean(loadError)}
                  className="vibe-button vibe-button-primary disabled:opacity-50"
                >
                  Lưu điểm danh
                </button>
              </div>
            </form>
            </>
          )}
                </section>

<div className="vibe-actions mt-4"><Link href={returnTo} className="vibe-button vibe-button-primary">Quay lại danh sách điểm danh</Link>{nextSession && <Link className="vibe-button" href={`/admin/attendance/${nextSession.id}?return_to=${encodeURIComponent(returnTo)}#attendance-roster`}>Buổi tiếp theo</Link>}{canManage && <Link className="vibe-button" href={`/admin/classes/${classItem.id}`}>Xem ca dạy</Link>}</div>
{canManage && <details className="mt-6"><summary className="cursor-pointer text-sm font-semibold">Quản lý buổi học</summary><SessionTeacher id={id} />        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">
              Reschedule Session
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
              Change only this dated session. The recurring
              master schedule and original session snapshot
              stay unchanged.
            </p>
          </div>

          {canReschedule ? (
            <form
              action={rescheduleSession}
              className="mt-5 grid gap-4 lg:grid-cols-2"
            >
              <input
                type="hidden"
                name="occurrence_id"
                value={occurrence.id}
              />

              <label className="text-sm font-medium text-gray-700">
                New start

                <input
                  type="datetime-local"
                  name="starts_at_local"
                  defaultValue={formatDateTimeLocal(
                    occurrence.starts_at,
                    timezone
                  )}
                  required
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                />
              </label>

              <label className="text-sm font-medium text-gray-700">
                New end

                <input
                  type="datetime-local"
                  name="ends_at_local"
                  defaultValue={formatDateTimeLocal(
                    occurrence.ends_at,
                    timezone
                  )}
                  required
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                />
              </label>

              <label className="text-sm font-medium text-gray-700">
                Phòng

                <select
                  name="room_id"
                  defaultValue={occurrence.room_id ?? ''}
                  required
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                >
                  <option value="" disabled>
                    Select room
                  </option>

                  {(availableRooms ?? []).map(
                    (availableRoom) => (
                      <option
                        key={availableRoom.id}
                        value={availableRoom.id}
                      >
                        {availableRoom.name} ·{' '}
                        {availableRoom.code}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="text-sm font-medium text-gray-700 lg:row-span-2">
                Reason

                <textarea
                  name="reason"
                  required
                  maxLength={500}
                  rows={4}
                  placeholder="Why is this session moving?"
                  className="mt-2 w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                />
              </label>

              <p className="text-xs text-gray-500">
                Times use {timezone}.
              </p>

              <div className="flex justify-end lg:col-span-2">
                <button
                  type="submit"
                  className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                >
                  Reschedule Session
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {hasAttendance
                ? 'This session already has attendance and cannot be rescheduled.'
                : 'Restore this session to Scheduled before rescheduling it.'}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Session Status
              </h2>

              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
                Complete a fully marked session, cancel a
                session without attendance, or restore it to
                Scheduled when corrections are needed.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {occurrence.status === 'SCHEDULED' && (
                <>
                  <form action={setSessionStatus}>
                    <input
                      type="hidden"
                      name="occurrence_id"
                      value={occurrence.id}
                    />

                    <input
                      type="hidden"
                      name="target_status"
                      value="COMPLETED"
                    />

                    <button
                      type="submit"
                      disabled={!isFullyMarked}
                      title={
                        isFullyMarked
                          ? undefined
                          : 'Mark every student first'
                      }
                      className="rounded-lg bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      Complete Session
                    </button>
                  </form>

                  <form action={setSessionStatus}>
                    <input
                      type="hidden"
                      name="occurrence_id"
                      value={occurrence.id}
                    />

                    <input
                      type="hidden"
                      name="target_status"
                      value="CANCELLED"
                    />

                    <button
                      type="submit"
                      disabled={hasAttendance}
                      title={
                        hasAttendance
                          ? 'Attendance already exists'
                          : undefined
                      }
                      className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                    >
                      Cancel Session
                    </button>
                  </form>
                </>
              )}

              {occurrence.status === 'COMPLETED' &&
                occurrence.occurrence_type === 'REGULAR' && (
                <form action={setSessionStatus}>
                  <input
                    type="hidden"
                    name="occurrence_id"
                    value={occurrence.id}
                  />

                  <input
                    type="hidden"
                    name="target_status"
                    value="SCHEDULED"
                  />

                  <button
                    type="submit"
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    Reopen Session
                  </button>
                </form>
                )}

              {occurrence.status === 'CANCELLED' &&
                occurrence.occurrence_type === 'REGULAR' && (
                <form action={setSessionStatus}>
                  <input
                    type="hidden"
                    name="occurrence_id"
                    value={occurrence.id}
                  />

                  <input
                    type="hidden"
                    name="target_status"
                    value="SCHEDULED"
                  />

                  <button
                    type="submit"
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    Restore Session
                  </button>
                </form>
                )}

              {occurrence.occurrence_type === 'MAKEUP' &&
                ['COMPLETED', 'CANCELLED'].includes(
                  occurrence.status
                ) && (
                  <span className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600">
                    Final makeup status
                  </span>
                )}
            </div>
          </div>
        </section>

        {occurrence.occurrence_type === 'REGULAR' &&
          (relatedMakeupSessions?.length ?? 0) > 0 && (
            <section className="mt-6 rounded-2xl border border-purple-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-950">
                Related Makeup Sessions
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Makeup sessions created from this source
                session.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(relatedMakeupSessions ?? []).map(
                  (makeupSession) => (
                    <Link
                      key={makeupSession.id}
                      href={`/admin/attendance/${makeupSession.id}`}
                      className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 px-4 py-3 transition hover:border-purple-300 hover:bg-purple-50/40"
                    >
                      <span className="text-sm font-medium text-gray-900">
                        {formatDateTime(
                          makeupSession.starts_at,
                          timezone
                        )}
                      </span>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          SESSION_STATUS_STYLES[
                            makeupSession.status
                          ] ??
                          'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {makeupSession.status}
                      </span>
                    </Link>
                  )
                )}
              </div>
            </section>
          )}

        {canCreateMakeup && (
          <section className="mt-6 rounded-2xl border border-purple-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Create Makeup Session
              </h2>

              <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
                Tạo một buổi học bù riêng, gắn với buổi thường này. Chỉ học viên được chọn mới vào sổ điểm danh. Mỗi chỗ đang hiệu lực giữ đúng một quyền. Nghỉ có phép của buổi bù trả lại chính quyền đó, không cấp quyền thứ hai.
              </p>
            </div>

            {makeupEligibleEnrollments.length === 0 ? (
              <div className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Chưa có học viên nào trong lớp đang còn quyền học bù.
              </div>
            ) : (
              <form
                action={createMakeupSession}
                className="mt-5 grid gap-4 lg:grid-cols-2"
              >
                <input
                  type="hidden"
                  name="source_occurrence_id"
                  value={occurrence.id}
                />

                <label className="text-sm font-medium text-gray-700">
                  Makeup start

                  <input
                    type="datetime-local"
                    name="starts_at_local"
                    required
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-purple-700"
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Makeup end

                  <input
                    type="datetime-local"
                    name="ends_at_local"
                    required
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-purple-700"
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Phòng

                  <select
                    name="room_id"
                    defaultValue={occurrence.room_id ?? ''}
                    required
                    className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-700"
                  >
                    <option value="" disabled>
                      Select room
                    </option>

                    {(availableRooms ?? []).map(
                      (availableRoom) => (
                        <option
                          key={availableRoom.id}
                          value={availableRoom.id}
                        >
                          {availableRoom.name} ·{' '}
                          {availableRoom.code}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Reason

                  <textarea
                    name="reason"
                    required
                    maxLength={500}
                    rows={3}
                    placeholder="Why is this makeup session needed?"
                    className="mt-2 w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-purple-700"
                  />
                </label>

                <fieldset className="lg:col-span-2">
                  <legend className="text-sm font-medium text-gray-700">
                    Makeup participants
                  </legend>

                  <p className="mt-1 text-xs text-gray-500">
                    Select at least one student. Times use{' '}
                    {timezone}.
                  </p>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {makeupEligibleEnrollments.map((enrollment) => {
                      const student = studentMap.get(
                        enrollment.student_id
                      )

                      const creditCount =
                        availableCreditCounts.get(
                          enrollment.id
                        ) ?? 0

                      const creditReasons =
                        availableCreditReasons.get(
                          enrollment.id
                        ) ?? {
                          excused: 0,
                          sessionCancelled: 0,
                        }

                      return (
                        <label
                          key={enrollment.id}
                          className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 transition hover:border-purple-300 hover:bg-purple-50/40"
                        >
                          <input
                            type="checkbox"
                            name="enrollment_id"
                            value={enrollment.id}
                            className="mt-1 h-4 w-4 rounded border-gray-300 accent-purple-700"
                          />

                          <span className="min-w-0">
                            <span className="block font-semibold text-gray-950">
                              {student?.preferred_name ||
                                student?.full_name ||
                                'Chưa có tên học viên'}
                            </span>

                            <span className="mt-1 block text-xs text-gray-500">
                              {student?.student_code ?? '—'}
                              {' · '}
                              {creditCount} quyền còn dùng được
                            </span>

                            <span className="mt-1 block text-xs text-gray-500">
                              {creditReasons.excused > 0 && (
                                <>
                                  {creditReasons.excused} từ nghỉ có phép
                                </>
                              )}
                              {creditReasons.excused > 0 &&
                                creditReasons.sessionCancelled > 0 &&
                                ' · '}
                              {creditReasons.sessionCancelled > 0 && (
                                <>
                                  {creditReasons.sessionCancelled} từ buổi thường bị hủy
                                </>
                              )}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="flex justify-end lg:col-span-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-800"
                  >
                    Create Makeup Session
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

</details>}
<div className="mt-6">
  {canManage && <SessionJournals occurrenceId={occurrence.id} />}
</div>
</div>
</div>
)
}
