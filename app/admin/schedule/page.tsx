import { createClient } from '@/lib/supabase/server'

import {
  createSchedule,
  setScheduleStatus,
} from './actions'

type SchedulePageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

const DAYS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}

export default async function SchedulePage({
  searchParams,
}: SchedulePageProps) {
  const { error, success } = await searchParams

  const supabase = await createClient()

  const [
    { data: branches },
    { data: classes, error: classesError },
    { data: rooms, error: roomsError },
    { data: schedules, error: schedulesError },
  ] = await Promise.all([
    supabase
      .from('branches')
      .select('id, code, name, status')
      .order('name'),

    supabase
      .from('classes')
      .select(`
        id,
        branch_id,
        course_id,
        code,
        name,
        class_type,
        capacity,
        status
      `)
      .in('status', ['DRAFT', 'ACTIVE'])
      .order('name'),

    supabase
      .from('rooms')
      .select(`
        id,
        branch_id,
        code,
        name,
        capacity,
        status
      `)
      .eq('status', 'ACTIVE')
      .order('name'),

    supabase
      .from('schedules')
      .select(`
        id,
        class_id,
        room_id,
        day_of_week,
        start_time,
        end_time,
        effective_from,
        effective_to,
        timezone,
        notes,
        status
      `)
      .order('day_of_week')
      .order('start_time'),
  ])

  const branchMap = new Map(
    (branches ?? []).map((branch) => [
      branch.id,
      branch,
    ])
  )

  const classMap = new Map(
    (classes ?? []).map((classItem) => [
      classItem.id,
      classItem,
    ])
  )

  const roomMap = new Map(
    (rooms ?? []).map((room) => [
      room.id,
      room,
    ])
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Schedule & Capacity
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Schedule
        </h1>

        <p className="mt-2 max-w-3xl text-sm text-gray-500">
          Create recurring weekly schedules for classes.
          Room and class resources remain scoped to their
          Vibe Academy branch.
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {(classesError ||
        roomsError ||
        schedulesError) && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load schedule management data.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        {/* CREATE SCHEDULE */}
        <section className="h-fit rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">
            Add Weekly Schedule
          </h2>

          <p className="mt-1 text-sm leading-6 text-gray-500">
            Each row represents one recurring weekly
            meeting of a class.
          </p>

          {!classes ||
          classes.length === 0 ? (
            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No active or draft classes are available.
            </div>
          ) : !rooms ||
            rooms.length === 0 ? (
            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              Create at least one active room before
              scheduling classes.
            </div>
          ) : (
            <form
              action={createSchedule}
              className="mt-6 space-y-5"
            >
              {/* Class */}
              <div>
                <label
                  htmlFor="class_id"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Class *
                </label>

                <select
                  id="class_id"
                  name="class_id"
                  required
                  defaultValue=""
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                >
                  <option
                    value=""
                    disabled
                  >
                    Select class
                  </option>

                  {classes.map((classItem) => {
                    const branch =
                      branchMap.get(
                        classItem.branch_id
                      )

                    return (
                      <option
                        key={classItem.id}
                        value={classItem.id}
                      >
                        {classItem.name} (
                        {classItem.code}) —{' '}
                        {branch?.name ??
                          'Unknown branch'}
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Room */}
              <div>
                <label
                  htmlFor="room_id"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Room *
                </label>

                <select
                  id="room_id"
                  name="room_id"
                  required
                  defaultValue=""
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                >
                  <option
                    value=""
                    disabled
                  >
                    Select room
                  </option>

                  {(branches ?? []).map(
                    (branch) => {
                      const branchRooms =
                        rooms.filter(
                          (room) =>
                            room.branch_id ===
                            branch.id
                        )

                      if (
                        branchRooms.length ===
                        0
                      ) {
                        return null
                      }

                      return (
                        <optgroup
                          key={branch.id}
                          label={`${branch.name} (${branch.code})`}
                        >
                          {branchRooms.map(
                            (room) => (
                              <option
                                key={room.id}
                                value={room.id}
                              >
                                {room.name} (
                                {room.code})
                              </option>
                            )
                          )}
                        </optgroup>
                      )
                    }
                  )}
                </select>

                <p className="mt-1 text-xs leading-5 text-gray-400">
                  The system will reject a room from
                  another branch.
                </p>
              </div>

              {/* Day */}
              <div>
                <label
                  htmlFor="day_of_week"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Day *
                </label>

                <select
                  id="day_of_week"
                  name="day_of_week"
                  required
                  defaultValue=""
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                >
                  <option
                    value=""
                    disabled
                  >
                    Select day
                  </option>

                  {Object.entries(
                    DAYS
                  ).map(
                    ([value, label]) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="start_time"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    Start *
                  </label>

                  <input
                    id="start_time"
                    name="start_time"
                    type="time"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="end_time"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    End *
                  </label>

                  <input
                    id="end_time"
                    name="end_time"
                    type="time"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                  />
                </div>
              </div>

              {/* Effective dates */}
              <div>
                <label
                  htmlFor="effective_from"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Effective From *
                </label>

                <input
                  id="effective_from"
                  name="effective_from"
                  type="date"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="effective_to"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Effective To
                </label>

                <input
                  id="effective_to"
                  name="effective_to"
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                />

                <p className="mt-1 text-xs text-gray-400">
                  Leave blank for an open-ended
                  recurring schedule.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label
                  htmlFor="notes"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Notes
                </label>

                <textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Regular Monday session..."
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
              >
                Create Schedule
              </button>
            </form>
          )}
        </section>

        {/* CURRENT SCHEDULE */}
        <section className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Master Schedule
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {schedules?.length ?? 0}{' '}
              recurring schedule records
            </p>
          </div>

          {!schedules ||
          schedules.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No schedules yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first recurring class
                schedule.
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
                        Branch / Room
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Weekly Time
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Effective
                      </th>

                      <th className="px-5 py-3 font-medium">
                        Status
                      </th>

                      <th className="px-5 py-3 text-right font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {schedules.map(
                      (schedule) => {
                        const classItem =
                          classMap.get(
                            schedule.class_id
                          )

                        const room =
                          schedule.room_id
                            ? roomMap.get(
                                schedule.room_id
                              )
                            : null

                        const branch =
                          classItem
                            ? branchMap.get(
                                classItem.branch_id
                              )
                            : null

                        return (
                          <tr key={schedule.id}>
                            <td className="px-5 py-4">
                              <p className="font-semibold text-gray-950">
                                {classItem?.name ??
                                  'Unknown Class'}
                              </p>

                              <p className="mt-1 text-xs text-gray-500">
                                {classItem?.code ??
                                  '—'}
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              <p className="text-sm font-medium text-gray-800">
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
                                {DAYS[
                                  schedule.day_of_week
                                ] ??
                                  `Day ${schedule.day_of_week}`}
                              </p>

                              <p className="mt-1 text-xs text-gray-500">
                                {schedule.start_time.slice(
                                  0,
                                  5
                                )}{' '}
                                –{' '}
                                {schedule.end_time.slice(
                                  0,
                                  5
                                )}
                              </p>
                            </td>

                            <td className="px-5 py-4 text-xs text-gray-600">
                              <p>
                                From:{' '}
                                {
                                  schedule.effective_from
                                }
                              </p>

                              <p className="mt-1">
                                To:{' '}
                                {schedule.effective_to ??
                                  'Open'}
                              </p>
                            </td>

                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  schedule.status ===
                                  'ACTIVE'
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {
                                  schedule.status
                                }
                              </span>
                            </td>

                            <td className="px-5 py-4 text-right">
                              <form
                                action={
                                  setScheduleStatus
                                }
                              >
                                <input
                                  type="hidden"
                                  name="id"
                                  value={
                                    schedule.id
                                  }
                                />

                                <input
                                  type="hidden"
                                  name="status"
                                  value={
                                    schedule.status ===
                                    'ACTIVE'
                                      ? 'INACTIVE'
                                      : 'ACTIVE'
                                  }
                                />

                                <button
                                  type="submit"
                                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  {schedule.status ===
                                  'ACTIVE'
                                    ? 'Deactivate'
                                    : 'Activate'}
                                </button>
                              </form>
                            </td>
                          </tr>
                        )
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}