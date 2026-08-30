import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const [
    studentsResult,
    teachersResult,
    branchesResult,
  ] = await Promise.all([
    supabase
      .from('students')
      .select('*', { count: 'exact', head: true }),

    supabase
      .from('teachers')
      .select('*', { count: 'exact', head: true }),

    supabase
    .from('branches')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE'),])

  const studentsCount = studentsResult.count ?? 0
  const teachersCount = teachersResult.count ?? 0
  const branchesCount = branchesResult.count ?? 0

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Overview
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Admin Dashboard
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Overview of Vibe Academy operations.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">
            Students
          </p>

          <p className="mt-3 text-4xl font-bold text-gray-950">
            {studentsCount}
          </p>

          <p className="mt-2 text-xs text-gray-400">
            Total student records
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">
            Teachers
          </p>

          <p className="mt-3 text-4xl font-bold text-gray-950">
            {teachersCount}
          </p>

          <p className="mt-2 text-xs text-gray-400">
            Total teacher records
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm font-medium text-gray-500">
            Branches
          </p>

          <p className="mt-3 text-4xl font-bold text-gray-950">
            {branchesCount}
          </p>

          <p className="mt-2 text-xs text-gray-400">
            Active academy locations
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-950">
          System Foundation
        </h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusItem label="Supabase" status="Connected" />
          <StatusItem label="Authentication" status="Active" />
          <StatusItem label="Authorization" status="SUPER_ADMIN" />
          <StatusItem label="Database" status="Online" />
        </div>
      </div>
    </div>
  )
}

function StatusItem({
  label,
  status,
}: {
  label: string
  status: string
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-xs text-gray-500">{label}</p>

      <p className="mt-1 text-sm font-semibold text-gray-900">
        {status}
      </p>
    </div>
  )
}