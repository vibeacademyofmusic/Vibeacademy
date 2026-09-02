import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

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
  }>
}

type StudentSummary = {
  id: string
  student_code: string
  full_name: string | null
  preferred_name: string | null
}

type MakeupCreditSummary = {
  id: string
  enrollment_id: string
  source_occurrence_id: string
  source_reason: string
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

function formatDateTime(
  value: string,
  timezone: string
) {
  return new Intl.DateTimeFormat('en-GB', {
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
  return new Intl.DateTimeFormat('en-GB', {
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
  const { error, success } = await searchParams

  const supabase = await createClient()

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
    .select('id, branch_id, code, name')
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
    { data: attendance, error: attendanceError },
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
          .select('enrollment_id')
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
  ])

  const makeupParticipantIds = new Set(
    (makeupParticipants ?? []).map(
      (participant) => participant.enrollment_id
    )
  )

  const roster = (enrollments ?? []).filter(
    (enrollment) => {
      if (occurrence.occurrence_type === 'MAKEUP') {
        return makeupParticipantIds.has(enrollment.id)
      }

      const startDate =
        enrollment.started_at ??
        enrollment.enrolled_at

      return (
        startDate <= occurrence.occurrence_date &&
        (!enrollment.ended_at ||
          enrollment.ended_at >=
            occurrence.occurrence_date)
      )
    }
  )

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

  for (const credit of availableMakeupCredits) {
    availableCreditCounts.set(
      credit.enrollment_id,
      (availableCreditCounts.get(credit.enrollment_id) ?? 0) +
        1
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

  if (studentIds.length > 0) {
    const studentResult = await supabase
      .from('students')
      .select(
        'id, student_code, full_name, preferred_name'
      )
      .in('id', studentIds)

    students = (studentResult.data ?? []) as StudentSummary[]
    studentsError = studentResult.error
  }

  const loadError =
    roomsError ||
    enrollmentsError ||
    participantsError ||
    attendanceError ||
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
    <div className="max-w-6xl">
      <Link
        href="/admin/attendance"
        className="text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        ← Back to Sessions & Attendance
      </Link>

      <div className="mt-6">
        <p className="text-sm font-medium text-gray-500">
          Session Engine
        </p>

        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-950">
              {classItem.name}
            </h1>

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
                {occurrence.occurrence_type}
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
            {occurrence.status}
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
            Could not load the complete attendance roster.
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
              Branch
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {branch?.name ?? 'Unknown branch'}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {branch?.code ?? '—'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Room
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {room?.name ?? 'No room'}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {room?.code ?? '—'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Time
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
              Attendance
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {attendance?.length ?? 0} /{' '}
              {roster.length} marked
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Session roster
            </p>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
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
                Room

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

        {canCreateMakeup && (
          <section className="mt-6 rounded-2xl border border-purple-200 bg-white p-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Create Makeup Session
              </h2>

              <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
                Create a separate dated session linked to this
                regular source. Only the students selected below
                will appear in its attendance roster.
              </p>
            </div>

            {makeupEligibleEnrollments.length === 0 ? (
              <div className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                No student in this class currently has an
                available makeup credit.
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
                  Room

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
                                'Unknown Student'}
                            </span>

                            <span className="mt-1 block text-xs text-gray-500">
                              {student?.student_code ?? '—'}
                              {' · '}
                              {creditCount}{' '}
                              {creditCount === 1
                                ? 'credit'
                                : 'credits'}{' '}
                              available
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

        <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Attendance Roster
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {occurrence.occurrence_type === 'MAKEUP'
                ? 'Only the students explicitly selected for this makeup session.'
                : 'Students enrolled in this class on the occurrence date.'}
            </p>
          </div>

          {isAttendanceLocked && (
            <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
              Attendance is locked because this session is no
              longer Scheduled.
            </div>
          )}

          {roster.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No students in this session roster
              </p>

              <p className="mt-1 text-sm text-gray-400">
                {occurrence.occurrence_type === 'MAKEUP'
                  ? 'This makeup session has no selected participants.'
                  : 'Check the class enrollment dates for this occurrence.'}
              </p>
            </div>
          ) : (
            <form action={saveAttendance}>
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
                        Student
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Attendance Status
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Notes
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

                      return (
                        <tr key={enrollment.id}>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-gray-950">
                              {student?.preferred_name ||
                                student?.full_name ||
                                'Unknown Student'}
                            </p>

                            <p className="mt-1 text-xs text-gray-500">
                              {student?.student_code ?? '—'}
                            </p>
                          </td>

                          <td className="px-5 py-4">
                            <select
                              name={`status_${enrollment.id}`}
                              defaultValue={
                                record?.status ?? ''
                              }
                              disabled={isAttendanceLocked}
                              className="min-w-40 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900 disabled:bg-gray-100"
                            >
                              <option value="" disabled>
                                Select status
                              </option>

                              <option value="PRESENT">
                                Present
                              </option>

                              <option value="LATE">
                                Late
                              </option>

                              <option value="ABSENT">
                                Absent
                              </option>

                              <option value="EXCUSED">
                                Excused
                              </option>
                            </select>
                          </td>

                          <td className="px-5 py-4">
                            <input
                              name={`notes_${enrollment.id}`}
                              defaultValue={
                                record?.notes ?? ''
                              }
                              disabled={isAttendanceLocked}
                              maxLength={500}
                              placeholder="Optional note"
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
                  disabled={isAttendanceLocked}
                  className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                  Save Attendance
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
