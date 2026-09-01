import { createClient } from '@/lib/supabase/server'

const SESSION_STATUS_STYLES: Record<
  string,
  string
> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-green-50 text-green-700',
  CANCELLED: 'bg-red-50 text-red-700',
}

function formatSessionDate(
  value: string,
  timezone: string
) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(value))
}

function formatSessionTime(
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

export default async function AttendancePage() {
  const supabase = await createClient()

  const [
    { data: occurrences, error: occurrencesError },
    { data: schedules, error: schedulesError },
    { data: classes, error: classesError },
    { data: branches, error: branchesError },
    { data: rooms, error: roomsError },
    { data: attendance, error: attendanceError },
  ] = await Promise.all([
    supabase
      .from('session_occurrences')
      .select(`
        id,
        schedule_id,
        occurrence_date,
        starts_at,
        ends_at,
        room_id,
        status,
        notes
      `)
      .order('starts_at', { ascending: true })
      .limit(200),

    supabase
      .from('schedules')
      .select('id, class_id, timezone'),

    supabase
      .from('classes')
      .select('id, branch_id, code, name'),

    supabase
      .from('branches')
      .select('id, code, name'),

    supabase
      .from('rooms')
      .select('id, code, name'),

    supabase
      .from('attendance_records')
      .select('session_occurrence_id, status'),
  ])

  const loadError =
    occurrencesError ||
    schedulesError ||
    classesError ||
    branchesError ||
    roomsError ||
    attendanceError

  const scheduleMap = new Map(
    (schedules ?? []).map((schedule) => [
      schedule.id,
      schedule,
    ])
  )

  const classMap = new Map(
    (classes ?? []).map((classItem) => [
      classItem.id,
      classItem,
    ])
  )

  const branchMap = new Map(
    (branches ?? []).map((branch) => [
      branch.id,
      branch,
    ])
  )

  const roomMap = new Map(
    (rooms ?? []).map((room) => [
      room.id,
      room,
    ])
  )

  const attendanceSummary = new Map<
    string,
    {
      total: number
      present: number
      absent: number
      late: number
      excused: number
    }
  >()

  for (const record of attendance ?? []) {
    const summary = attendanceSummary.get(
      record.session_occurrence_id
    ) ?? {
      total: 0,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
    }

    summary.total += 1

    if (record.status === 'PRESENT') {
      summary.present += 1
    } else if (record.status === 'ABSENT') {
      summary.absent += 1
    } else if (record.status === 'LATE') {
      summary.late += 1
    } else if (record.status === 'EXCUSED') {
      summary.excused += 1
    }

    attendanceSummary.set(
      record.session_occurrence_id,
      summary
    )
  }

  const statusCounts = (occurrences ?? []).reduce(
    (counts, occurrence) => {
      if (occurrence.status === 'SCHEDULED') {
        counts.scheduled += 1
      } else if (
        occurrence.status === 'COMPLETED'
      ) {
        counts.completed += 1
      } else if (
        occurrence.status === 'CANCELLED'
      ) {
        counts.cancelled += 1
      }

      return counts
    },
    {
      scheduled: 0,
      completed: 0,
      cancelled: 0,
    }
  )

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Session Engine
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Sessions & Attendance
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-gray-500">
          Review dated class sessions generated from the
          recurring master schedule. Attendance belongs to
          each concrete session shown here.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load session and attendance data.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Total Sessions
          </p>

          <p className="mt-2 text-3xl font-bold text-gray-950">
            {occurrences?.length ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Scheduled
          </p>

          <p className="mt-2 text-3xl font-bold text-blue-700">
            {statusCounts.scheduled}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Completed
          </p>

          <p className="mt-2 text-3xl font-bold text-green-700">
            {statusCounts.completed}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Cancelled
          </p>

          <p className="mt-2 text-3xl font-bold text-red-700">
            {statusCounts.cancelled}
          </p>
        </div>
      </div>

      {!occurrences || occurrences.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-gray-800">
            No dated sessions yet
          </p>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Master schedules do not appear here until session
            occurrences are generated for a date range.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-medium">
                    Class
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Date & Time
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Branch / Room
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Attendance
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Session Status
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {occurrences.map((occurrence) => {
                  const schedule = scheduleMap.get(
                    occurrence.schedule_id
                  )

                  const classItem = schedule
                    ? classMap.get(schedule.class_id)
                    : null

                  const branch = classItem
                    ? branchMap.get(classItem.branch_id)
                    : null

                  const room = occurrence.room_id
                    ? roomMap.get(occurrence.room_id)
                    : null

                  const timezone =
                    schedule?.timezone ??
                    'Asia/Ho_Chi_Minh'

                  const summary =
                    attendanceSummary.get(
                      occurrence.id
                    )

                  return (
                    <tr key={occurrence.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-950">
                          {classItem?.name ??
                            'Unknown Class'}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {classItem?.code ?? '—'}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">
                          {formatSessionDate(
                            occurrence.starts_at,
                            timezone
                          )}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {formatSessionTime(
                            occurrence.starts_at,
                            timezone
                          )}{' '}
                          –{' '}
                          {formatSessionTime(
                            occurrence.ends_at,
                            timezone
                          )}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800">
                          {branch?.name ??
                            'Unknown branch'}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {room
                            ? `${room.name} (${room.code})`
                            : 'No room'}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-900">
                          {summary?.total ?? 0} marked
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {summary
                            ? `${summary.present} present · ${summary.late} late · ${summary.absent} absent · ${summary.excused} excused`
                            : 'No attendance recorded'}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            SESSION_STATUS_STYLES[
                              occurrence.status
                            ] ??
                            'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {occurrence.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
