import Link from 'next/link'
import { notFound } from 'next/navigation'

import { updateBranch } from '../actions'
import { createClient } from '@/lib/supabase/server'

type EditBranchPageProps = {
  params: Promise<{
    id: string
  }>

  searchParams: Promise<{
    error?: string
  }>
}

export default async function EditBranchPage({
  params,
  searchParams,
}: EditBranchPageProps) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: branch } = await supabase
    .from('branches')
    .select('id, code, name, address, phone, status, timezone')
    .eq('id', id)
    .single()

  if (!branch) {
    notFound()
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/branches"
        className="text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        ← Back to Branches
      </Link>

      <div className="mt-6">
        <p className="text-sm font-medium text-gray-500">
          Organization
        </p>

        <h1 className="mt-1 text-3xl font-bold text-gray-950">
          Edit Branch
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Update branch information.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        action={updateBranch}
        className="mt-8 space-y-5 rounded-2xl border border-gray-200 bg-white p-6"
      >
        <input type="hidden" name="id" value={branch.id} />

        <div>
          <label
            htmlFor="code"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Branch Code
          </label>

          <input
            id="code"
            name="code"
            required
            defaultValue={branch.code}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="name"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Branch Name
          </label>

          <input
            id="name"
            name="name"
            required
            defaultValue={branch.name}
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
            rows={4}
            defaultValue={branch.address ?? ''}
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
            defaultValue={branch.phone ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
          />
        </div>

        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Status</p>

          <p className="mt-1 text-sm font-semibold text-gray-900">
            {branch.status}
          </p>

          <p className="mt-3 text-xs text-gray-500">
            Timezone: {branch.timezone}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Save Changes
          </button>

          <Link
            href="/admin/branches"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}