import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'
import { generateSessions } from './actions'
import {
  attendanceLoadMessage,
  loadVisibleAttendance,
} from './attendance-loader'

type AttendancePageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
    date?: string
    branch?: string
    class?: string
    teacher?: string
    status?: string
    type?: string
    view?: string
    q?: string
  }>
}

type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'EXCUSED'

type AttendanceRecord = {
  session_occurrence_id: string
  enrollment_id: string
  status: AttendanceStatus
}

type EnrollmentRow = {
  id: string
  class_id: string
  student_id: string
  started_at: string | null
  ended_at: string | null
}

type StudentRow = {
  id: string
  student_code: string
  full_name: string | null
  preferred_name: string | null
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const sessionStatusLabel: Record<string, string> = {
  SCHEDULED: 'Đang chờ',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
}

const sessionStatusClass: Record<string, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

const attendanceLabel: Record<string, string> = {
  PRESENT: 'Có mặt',
  ABSENT: 'Vắng',
  LATE: 'Đi muộn',
  EXCUSED: 'Vắng có phép',
}

const attendanceClass: Record<string, string> = {
  PRESENT: 'bg-green-50 text-green-700',
  ABSENT: 'bg-red-50 text-red-700',
  LATE: 'bg-amber-50 text-amber-700',
  EXCUSED: 'bg-sky-50 text-sky-700',
}

function vietnamToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date())
}

function formatTime(value: string, timezone = 'Asia/Ho_Chi_Minh') {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(value))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(`${value}T00:00:00+07:00`))
}

function studentName(student: StudentRow | undefined) {
  return (
    student?.preferred_name ||
    student?.full_name ||
    student?.student_code ||
    'Học viên'
  )
}

export default async function AttendancePage({
  searchParams,
}: AttendancePageProps) {
  const params = await searchParams
  const today = vietnamToday()

  const selectedDate = DATE_PATTERN.test(params.date ?? '')
    ? params.date!
    : today

  const selectedView = [
    'ALL',
    'UNMARKED',
    'ABSENT',
    'MAKEUP',
  ].includes(params.view ?? '')
    ? params.view!
    : 'ALL'

  const selectedStatus = [
    'SCHEDULED',
    'COMPLETED',
    'CANCELLED',
  ].includes(params.status ?? '')
    ? params.status!
    : ''

  const selectedType = ['REGULAR', 'MAKEUP'].includes(
    params.type ?? ''
  )
    ? params.type!
    : ''

  const queryText = (params.q ?? '')
    .trim()
    .slice(0, 100)
    .toLocaleLowerCase('vi')

  const db = await createClient()

  const [
    { data: occurrences, error: occurrencesError },
    { data: schedules, error: schedulesError },
    { data: classes, error: classesError },
    { data: branches, error: branchesError },
    { data: rooms, error: roomsError },
    { data: teachers, error: teachersError },
  ] = await Promise.all([
    db
      .from('session_actual_teachers')
      .select(`
        id:session_id,
        teacher_id,
        assignment_type,
        schedule_id,
        class_id,
        branch_id,
        occurrence_date,
        starts_at,
        ends_at,
        room_id,
        status,
        notes,
        occurrence_type,
        source_occurrence_id
      `)
      .eq('occurrence_date', selectedDate)
      .match({
        ...(params.branch ? { branch_id: params.branch } : {}),
        ...(params.class ? { class_id: params.class } : {}),
        ...(params.teacher
          ? { teacher_id: params.teacher }
          : {}),
      })
      .order('starts_at', { ascending: true })
      .limit(300),

    db.from('schedules').select('id,class_id,timezone'),

    db
      .from('classes')
      .select('id,branch_id,code,name,class_type')
      .order('name'),

    db
      .from('branches')
      .select('id,code,name,status')
      .eq('status', 'ACTIVE')
      .order('name'),

    db
      .from('rooms')
      .select('id,branch_id,code,name,status')
      .eq('status', 'ACTIVE')
      .order('name'),

    db
      .from('teachers')
      .select('id,full_name,teacher_code,status')
      .eq('status', 'ACTIVE')
      .order('full_name'),
  ])

  const visibleOccurrences = occurrencesError
    ? []
    : occurrences ?? []

  const occurrenceIds = visibleOccurrences.map(
    (item) => item.id
  )

  const classIds = Array.from(
    new Set(
      visibleOccurrences
        .map((item) => item.class_id)
        .filter(Boolean)
    )
  )

  const [
    { data: attendance, error: attendanceError },
    { data: enrollments, error: enrollmentsError },
    { data: pauses, error: pausesError },
    { data: makeupParticipants, error: participantsError },
  ] = await Promise.all([
    loadVisibleAttendance(db, occurrenceIds),

    classIds.length
      ? db
          .from('enrollments')
          .select(
            'id,class_id,student_id,started_at,ended_at'
          )
          .in('class_id', classIds)
      : Promise.resolve({ data: [], error: null }),

    classIds.length
      ? db
          .from('enrollment_pauses')
          .select('enrollment_id')
          .eq('status', 'ACTIVE')
          .lte('starts_on', selectedDate)
          .gte('ends_on', selectedDate)
      : Promise.resolve({ data: [], error: null }),

    occurrenceIds.length
      ? db
          .from('session_occurrence_participants')
          .select('session_occurrence_id,enrollment_id')
          .in('session_occurrence_id', occurrenceIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const enrollmentRows =
    (enrollments ?? []) as EnrollmentRow[]

  const studentIds = Array.from(
    new Set(enrollmentRows.map((row) => row.student_id))
  )

  const { data: students, error: studentsError } =
    studentIds.length
      ? await db
          .from('students')
          .select(
            'id,student_code,full_name,preferred_name'
          )
          .in('id', studentIds)
      : { data: [], error: null }

  const sourceErrors = {
    session_actual_teachers: occurrencesError,
    schedules: schedulesError,
    classes: classesError,
    branches: branchesError,
    rooms: roomsError,
    teachers: teachersError,
    attendance_records: attendanceError,
    enrollments: enrollmentsError,
    enrollment_pauses: pausesError,
    session_occurrence_participants: participantsError,
    students: studentsError,
  }

  const loadError = attendanceLoadMessage(sourceErrors)

  for (const [source, failure] of Object.entries(
    sourceErrors
  )) {
    if (failure) {
      console.error('Attendance source failed', {
        source,
        code: failure.code,
      })
    }
  }

  const scheduleMap = new Map(
    (schedules ?? []).map((item) => [item.id, item])
  )
  const classMap = new Map(
    (classes ?? []).map((item) => [item.id, item])
  )
  const branchMap = new Map(
    (branches ?? []).map((item) => [item.id, item])
  )
  const roomMap = new Map(
    (rooms ?? []).map((item) => [item.id, item])
  )
  const teacherMap = new Map(
    (teachers ?? []).map((item) => [item.id, item])
  )
  const studentMap = new Map(
    ((students ?? []) as StudentRow[]).map((item) => [
      item.id,
      item,
    ])
  )

  const pausedEnrollmentIds = new Set(
    (pauses ?? []).map((item) => item.enrollment_id)
  )

  const makeupEnrollmentsByOccurrence = new Map<
    string,
    Set<string>
  >()

  for (const item of makeupParticipants ?? []) {
    const set =
      makeupEnrollmentsByOccurrence.get(
        item.session_occurrence_id
      ) ?? new Set<string>()

    set.add(item.enrollment_id)
    makeupEnrollmentsByOccurrence.set(
      item.session_occurrence_id,
      set
    )
  }

  const attendanceByOccurrence = new Map<
    string,
    Map<string, AttendanceRecord>
  >()

  for (const item of (attendance ?? []) as AttendanceRecord[]) {
    const map =
      attendanceByOccurrence.get(
        item.session_occurrence_id
      ) ?? new Map<string, AttendanceRecord>()

    map.set(item.enrollment_id, item)
    attendanceByOccurrence.set(
      item.session_occurrence_id,
      map
    )
  }

  function rosterForOccurrence(
    occurrence: (typeof visibleOccurrences)[number]
  ) {
    if (occurrence.occurrence_type === 'MAKEUP') {
      const participantIds =
        makeupEnrollmentsByOccurrence.get(
          occurrence.id
        ) ?? new Set<string>()

      return enrollmentRows.filter((enrollment) =>
        participantIds.has(enrollment.id)
      )
    }

    return enrollmentRows.filter((enrollment) => {
      if (enrollment.class_id !== occurrence.class_id) {
        return false
      }

      if (!enrollment.started_at) {
        return false
      }

      return (
        enrollment.started_at <= selectedDate &&
        (!enrollment.ended_at ||
          enrollment.ended_at >= selectedDate) &&
        !pausedEnrollmentIds.has(enrollment.id)
      )
    })
  }

  const cards = visibleOccurrences
    .map((occurrence) => {
      const schedule = scheduleMap.get(
        occurrence.schedule_id
      )
      const classItem =
        classMap.get(occurrence.class_id) ??
        (schedule
          ? classMap.get(schedule.class_id)
          : undefined)
      const branch = branchMap.get(
        occurrence.branch_id ??
          classItem?.branch_id
      )
      const room = occurrence.room_id
        ? roomMap.get(occurrence.room_id)
        : undefined
      const teacher = teacherMap.get(
        occurrence.teacher_id
      )

      const roster = rosterForOccurrence(occurrence)
      const attendanceMap =
        attendanceByOccurrence.get(occurrence.id) ??
        new Map<string, AttendanceRecord>()

      const studentRows = roster.map((enrollment) => ({
        enrollment,
        student: studentMap.get(
          enrollment.student_id
        ),
        attendance: attendanceMap.get(enrollment.id),
      }))

      const marked = studentRows.filter(
        (item) => item.attendance
      ).length
      const present = studentRows.filter(
        (item) =>
          item.attendance?.status === 'PRESENT'
      ).length
      const late = studentRows.filter(
        (item) => item.attendance?.status === 'LATE'
      ).length
      const absent = studentRows.filter(
        (item) =>
          item.attendance?.status === 'ABSENT'
      ).length
      const excused = studentRows.filter(
        (item) =>
          item.attendance?.status === 'EXCUSED'
      ).length
      const unmarked = Math.max(
        0,
        studentRows.length - marked
      )

      const searchableText = [
        classItem?.name,
        classItem?.code,
        branch?.name,
        branch?.code,
        room?.name,
        room?.code,
        teacher?.full_name,
        teacher?.teacher_code,
        ...studentRows.map((item) =>
          studentName(item.student)
        ),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi')

      return {
        occurrence,
        schedule,
        classItem,
        branch,
        room,
        teacher,
        studentRows,
        marked,
        present,
        late,
        absent,
        excused,
        unmarked,
        searchableText,
      }
    })
    .filter((card) => {
      if (
        selectedStatus &&
        card.occurrence.status !== selectedStatus
      ) {
        return false
      }

      if (
        selectedType &&
        card.occurrence.occurrence_type !== selectedType
      ) {
        return false
      }

      if (
        selectedView === 'UNMARKED' &&
        card.unmarked === 0
      ) {
        return false
      }

      if (
        selectedView === 'ABSENT' &&
        card.absent + card.excused === 0
      ) {
        return false
      }

      if (
        selectedView === 'MAKEUP' &&
        card.occurrence.occurrence_type !== 'MAKEUP'
      ) {
        return false
      }

      if (
        queryText &&
        !card.searchableText.includes(queryText)
      ) {
        return false
      }

      return true
    })

  const totals = cards.reduce(
    (summary, card) => {
      summary.sessions += 1
      summary.students += card.studentRows.length
      summary.marked += card.marked
      summary.present += card.present
      summary.late += card.late
      summary.absent += card.absent
      summary.excused += card.excused
      summary.unmarked += card.unmarked

      if (
        card.occurrence.occurrence_type === 'MAKEUP'
      ) {
        summary.makeupSessions += 1
      }

      return summary
    },
    {
      sessions: 0,
      students: 0,
      marked: 0,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      unmarked: 0,
      makeupSessions: 0,
    }
  )

  const queryFor = (
    next: Record<string, string | undefined>
  ) => {
    const query = new URLSearchParams()

    const values = {
      date: selectedDate,
      branch: params.branch,
      class: params.class,
      teacher: params.teacher,
      status: selectedStatus || undefined,
      type: selectedType || undefined,
      view: selectedView,
      q: params.q,
      ...next,
    }

    for (const [key, value] of Object.entries(values)) {
      if (value) query.set(key, value)
    }

    return `/admin/attendance?${query.toString()}`
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <p className="text-sm font-medium text-gray-500">
          Vận hành trong ngày
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Điểm danh hôm nay
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {formatDate(selectedDate)} · Giờ Việt Nam
        </p>
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

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-sm font-medium text-gray-700">
            Ngày
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Chi nhánh
            <select
              name="branch"
              defaultValue={params.branch ?? ''}
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
            Lớp
            <select
              name="class"
              defaultValue={params.class ?? ''}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Tất cả</option>
              {(classes ?? [])
                .filter(
                  (item) =>
                    !params.branch ||
                    item.branch_id === params.branch
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Giáo viên
            <select
              name="teacher"
              defaultValue={params.teacher ?? ''}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Tất cả</option>
              {(teachers ?? []).map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name ||
                    teacher.teacher_code}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Loại buổi
            <select
              name="type"
              defaultValue={selectedType}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="">Tất cả</option>
              <option value="REGULAR">Lịch thường</option>
              <option value="MAKEUP">Học bù</option>
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Tìm nhanh
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Học viên, lớp, phòng..."
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>

          <input
            type="hidden"
            name="view"
            value={selectedView}
          />

          <div className="md:col-span-2 xl:col-span-6 flex flex-wrap gap-2">
            <button className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">
              Lọc điểm danh
            </button>
            <Link
              href={`/admin/attendance?date=${today}`}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
            >
              Hôm nay
            </Link>
          </div>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {[
          ['Buổi hôm nay', totals.sessions],
          ['Học viên dự kiến', totals.students],
          ['Đã điểm danh', totals.marked],
          ['Chưa điểm danh', totals.unmarked],
          ['Vắng', totals.absent + totals.excused],
          ['Buổi học bù', totals.makeupSessions],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-gray-950">
              {value}
            </p>
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2">
        {[
          ['ALL', 'Tất cả'],
          ['UNMARKED', 'Chưa điểm danh'],
          ['ABSENT', 'Vắng'],
          ['MAKEUP', 'Học bù'],
        ].map(([id, label]) => (
          <Link
            key={id}
            href={queryFor({ view: id })}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              selectedView === id
                ? 'bg-gray-950 text-white'
                : 'border border-gray-300 bg-white text-gray-700'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <section className="space-y-4">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
            Không có buổi học phù hợp với bộ lọc.
          </div>
        ) : (
          cards.map((card) => {
            const timezone =
              card.schedule?.timezone ||
              'Asia/Ho_Chi_Minh'

            return (
              <article
                key={card.occurrence.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-4 border-b border-gray-100 p-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    <div className="min-w-20 rounded-xl bg-gray-950 px-3 py-3 text-center text-white">
                      <div className="text-xl font-bold">
                        {formatTime(
                          card.occurrence.starts_at,
                          timezone
                        )}
                      </div>
                      <div className="mt-1 text-xs text-gray-300">
                        {formatTime(
                          card.occurrence.ends_at,
                          timezone
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-950">
                          {card.classItem?.name ||
                            card.classItem?.code ||
                            'Lớp học'}
                        </h2>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            sessionStatusClass[
                              card.occurrence.status
                            ] ||
                            'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {sessionStatusLabel[
                            card.occurrence.status
                          ] ||
                            card.occurrence.status}
                        </span>

                        {card.occurrence.occurrence_type ===
                          'MAKEUP' && (
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            Học bù
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-sm text-gray-600">
                        {card.branch?.name || '—'}
                        {' • '}
                        {card.room?.name ||
                          card.room?.code ||
                          'Chưa xếp phòng'}
                        {' • GV: '}
                        {card.teacher?.full_name ||
                          card.teacher?.teacher_code ||
                          'Chưa xác định'}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-green-50 px-2.5 py-1 font-semibold text-green-700">
                          Có mặt {card.present}
                        </span>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                          Đi muộn {card.late}
                        </span>
                        <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700">
                          Vắng {card.absent}
                        </span>
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
                          Có phép {card.excused}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 font-semibold text-gray-700">
                          Chờ {card.unmarked}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Link
                    prefetch={false}
                    href={`/admin/attendance/${card.occurrence.id}`}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    {card.occurrence.status ===
                    'SCHEDULED'
                      ? card.marked
                        ? 'Tiếp tục điểm danh'
                        : 'Điểm danh'
                      : 'Xem chi tiết'}
                  </Link>
                </div>

                <div className="divide-y divide-gray-100">
                  {card.studentRows.length === 0 ? (
                    <p className="p-5 text-sm text-gray-500">
                      Chưa có học viên trong roster của buổi
                      này.
                    </p>
                  ) : (
                    card.studentRows.map((item) => {
                      const status =
                        item.attendance?.status

                      return (
                        <div
                          key={item.enrollment.id}
                          className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-950">
                              {studentName(item.student)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.student?.student_code ||
                                'Chưa có mã học viên'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {status ? (
                              <span
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                                  attendanceClass[status] ||
                                  'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {attendanceLabel[status] ||
                                  status}
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600">
                                Chưa điểm danh
                              </span>
                            )}

                            <Link
                              prefetch={false}
                              href={`/admin/attendance/${card.occurrence.id}`}
                              className="text-sm font-medium text-blue-700 underline"
                            >
                              Chi tiết
                            </Link>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </article>
            )
          })
        )}
      </section>

      <details className="rounded-2xl border border-gray-200 bg-white p-5">
        <summary className="cursor-pointer font-semibold text-gray-950">
          Công cụ quản trị — tạo buổi học
        </summary>

        <p className="mt-3 text-sm text-gray-600">
          Công cụ này giữ nguyên engine hiện tại. Không dùng
          để thay đổi lịch sử điểm danh.
        </p>

        <form
          action={generateSessions}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <label className="text-sm font-medium text-gray-700">
            Từ ngày
            <input
              type="date"
              name="from_date"
              defaultValue={selectedDate}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
              required
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Đến ngày
            <input
              type="date"
              name="to_date"
              defaultValue={selectedDate}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
              required
            />
          </label>

          <button className="self-end rounded-lg border border-gray-300 px-4 py-2 font-medium">
            Tạo buổi học
          </button>
        </form>
      </details>
    </div>
  )
}
