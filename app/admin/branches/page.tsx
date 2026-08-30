import Link from 'next/link'

import { createBranch, setBranchStatus } from './actions'
import { createClient } from '@/lib/supabase/server'

type BranchesPageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function BranchesPage({
  searchParams,
}: BranchesPageProps) {
  const { error, success } = await searchParams

  const supabase = await createClient()

  const { data: branches, error: branchesError } = await supabase
    .from('branches')
    .select(
      'id, code, name, address, phone, timezone, status, created_at'
    )
    .order('created_at', { ascending: true })

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Organization
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Branches
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Manage Vibe Academy locations.
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

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">
            Add Branch
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create a new academy location.
          </p>

          <form action={createBranch} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Branch Code *
              </label>

              <input
                id="code"
                name="code"
                required
                maxLength={20}
                placeholder="CT01"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />

              <p className="mt-1 text-xs text-gray-400">
                Example: CT01, HCM01
              </p>
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Branch Name *
              </label>

              <input
                id="name"
                name="name"
                required
                placeholder="Vibe Academy..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="address"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Address
              </label>

              <textarea
                id="address"
                name="address"
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Phone
              </label>

              <input
                id="phone"
                name="phone"
                type="tel"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create Branch
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  Branch List
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {branches?.length ?? 0} total branches
                </p>
              </div>
            </div>
          </div>

          {branchesError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load branches.
            </div>
          ) : !branches || branches.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No branches yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first Vibe Academy branch using the form.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">
                      Branch
                    </th>

                    <th className="px-6 py-3 font-medium">
                      Contact
                    </th>

                    <th className="px-6 py-3 font-medium">
                      Status
                    </th>

                    <th className="px-6 py-3 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {branches.map((branch) => (
                    <tr key={branch.id}>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900">
                          {branch.name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {branch.code}
                        </p>

                        {branch.address && (
                          <p className="mt-1 max-w-xs text-xs text-gray-400">
                            {branch.address}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {branch.phone || '—'}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            branch.status === 'ACTIVE'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {branch.status}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/branches/${branch.id}`}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </Link>

                          <form action={setBranchStatus}>
                            <input
                              type="hidden"
                              name="id"
                              value={branch.id}
                            />

                            <input
                              type="hidden"
                              name="status"
                              value={
                                branch.status === 'ACTIVE'
                                  ? 'INACTIVE'
                                  : 'ACTIVE'
                              }
                            />

                            <button
                              type="submit"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              {branch.status === 'ACTIVE'
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
      </div>
    </div>
  )
}
