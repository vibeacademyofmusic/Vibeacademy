import { createClient } from '@/lib/supabase/server'

import {
  createRoom,
  setRoomStatus,
} from './actions'

type RoomsPageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function RoomsPage({
  searchParams,
}: RoomsPageProps) {
  const { error, success } = await searchParams
  const supabase = await createClient()

  const [
    { data: branches, error: branchesError },
    { data: rooms, error: roomsError },
  ] = await Promise.all([
    supabase
      .from('branches')
      .select('id, code, name, status')
      .order('name'),

    supabase
      .from('rooms')
      .select(
        'id, branch_id, code, name, capacity, notes, status, created_at'
      )
      .order('code'),
  ])

  const activeBranches =
    branches?.filter(
      (branch) => branch.status === 'ACTIVE'
    ) ?? []

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Schedule & Capacity
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Rooms
        </h1>

        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          Manage teaching rooms separately for each Vibe Academy branch.
        </p>
      </div>

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

      {(branchesError || roomsError) && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load room management data.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="h-fit rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">
            Add Room
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            A room always belongs to one specific branch.
          </p>

          {activeBranches.length === 0 ? (
            <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              No active branches available.
            </div>
          ) : (
            <form
              action={createRoom}
              className="mt-6 space-y-5"
            >
              <div>
                <label
                  htmlFor="branch_id"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Branch *
                </label>

                <select
                  id="branch_id"
                  name="branch_id"
                  required
                  defaultValue=""
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 outline-none focus:border-gray-900"
                >
                  <option value="" disabled>
                    Select branch
                  </option>

                  {activeBranches.map((branch) => (
                    <option
                      key={branch.id}
                      value={branch.id}
                    >
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="code"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Room Code *
                </label>

                <input
                  id="code"
                  name="code"
                  required
                  maxLength={50}
                  placeholder="P01"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="name"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Room Name *
                </label>

                <input
                  id="name"
                  name="name"
                  required
                  placeholder="Piano Room 1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="capacity"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Room Capacity
                </label>

                <input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="5"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>

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
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Create Room
              </button>
            </form>
          )}
        </section>

        <section className="space-y-6">
          {branches?.map((branch) => {
            const branchRooms =
              rooms?.filter(
                (room) => room.branch_id === branch.id
              ) ?? []

            return (
              <div
                key={branch.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
              >
                <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                  <h3 className="font-semibold text-gray-950">
                    {branch.name}
                  </h3>

                  <p className="mt-1 text-xs text-gray-500">
                    {branch.code} · {branchRooms.length} rooms
                  </p>
                </div>

                {branchRooms.length === 0 ? (
                  <div className="px-6 py-8 text-sm text-gray-400">
                    No rooms created for this branch yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-6 py-3">Room</th>
                          <th className="px-6 py-3">Capacity</th>
                          <th className="px-6 py-3">Status</th>
                          <th className="px-6 py-3 text-right">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {branchRooms.map((room) => (
                          <tr
                            key={room.id}
                            className="border-b border-gray-100"
                          >
                            <td className="px-6 py-4">
                              <p className="font-semibold">
                                {room.name}
                              </p>

                              <p className="text-xs text-gray-500">
                                {room.code}
                              </p>
                            </td>

                            <td className="px-6 py-4">
                              {room.capacity ?? '—'}
                            </td>

                            <td className="px-6 py-4">
                              {room.status}
                            </td>

                            <td className="px-6 py-4 text-right">
                              <form
                                action={setRoomStatus}
                              >
                                <input
                                  type="hidden"
                                  name="id"
                                  value={room.id}
                                />

                                <input
                                  type="hidden"
                                  name="status"
                                  value={
                                    room.status === 'ACTIVE'
                                      ? 'INACTIVE'
                                      : 'ACTIVE'
                                  }
                                />

                                <button
                                  type="submit"
                                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"
                                >
                                  {room.status === 'ACTIVE'
                                    ? 'Deactivate'
                                    : 'Activate'}
                                </button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}