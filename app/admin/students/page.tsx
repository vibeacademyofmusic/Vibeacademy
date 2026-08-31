import Link from 'next/link'

import {
  createStudent,
  setStudentStatus,
} from './actions'

import { createClient } from '@/lib/supabase/server'

type StudentsPageProps = {
    searchParams: Promise<{
      error?: string
      success?: string
      q?: string
      branch?: string
        status?: string
    }>
  }
  
  export default async function StudentsPage({
    searchParams,
  }: StudentsPageProps) {
    const params = await searchParams
    const q = (params.q ?? '').trim()
    const branch = (params.branch ?? '').trim()
    const status = (params.status ?? '').trim()
  
    const supabase = await createClient()
  
    const { data: branches } = await supabase
    .from('branches')
    .select('id, code, name, status')
    .order('name')

    let studentsQuery = supabase
    .from('students')
    .select(`
      id,
      student_code,
      full_name,
      default_branch_id,
      admission_date,
      status,
      created_at
    `)
    .order('created_at', { ascending: false })
  
  if (q) {
    if (branch) {
        studentsQuery = studentsQuery.eq(
          'default_branch_id',
          branch
        )
      }
      
      if (
        status === 'ACTIVE' ||
        status === 'INACTIVE'
      ) {
        studentsQuery = studentsQuery.eq(
          'status',
          status
        )
      }
    const safeQuery = q
      .replace(/[%_,()]/g, ' ')
      .trim()
  
    studentsQuery = studentsQuery.or(
      `full_name.ilike.%${safeQuery}%,student_code.ilike.%${safeQuery}%`
    )
  }
  
  const {
    data: students,
    error: studentsError,
  } = await studentsQuery 
  const branchMap = new Map(
    (branches ?? []).map((branch) => [
      branch.id,
      branch.name,
    ])
  )

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          People
        </p>

        <h1 className="mt-1 text-3xl font-bold text-gray-950">
          Students
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Manage Vibe Academy students.
        </p>
      </div>

      {params.error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {params.success && (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {params.success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">
            Add Student
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create a new student record.
          </p>

          <form
            action={createStudent}
            className="mt-6 space-y-5"
          >
            <div>
              <label
                htmlFor="student_code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Student Code *
              </label>

              <input
                id="student_code"
                name="student_code"
                required
                placeholder="HV0001"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="full_name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Full Name *
              </label>

              <input
                id="full_name"
                name="full_name"
                required
                placeholder="Nguyễn Văn A"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="default_branch_id"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Branch *
              </label>

              <select
                id="default_branch_id"
                name="default_branch_id"
                required
                defaultValue=""
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
              >
                <option value="" disabled>
                  Select branch
                </option>

                {(branches ?? [])
                  .filter(
                    (branch) =>
                      branch.status === 'ACTIVE'
                  )
                  .map((branch) => (
                    <option
                      key={branch.id}
                      value={branch.id}
                    >
                      {branch.name}
                    </option>
                  ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Create Student
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-5">
        <form
  method="GET"
  className="flex flex-col gap-3 lg:flex-row"
>
  <input
    type="search"
    name="q"
    defaultValue={q}
    placeholder="Search by student name or code..."
    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-900"
  />

  <select
    name="branch"
    defaultValue={branch}
    className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
  >
    <option value="">All branches</option>

    {(branches ?? []).map((item) => (
      <option
        key={item.id}
        value={item.id}
      >
        {item.name}
      </option>
    ))}
  </select>

  <select
    name="status"
    defaultValue={status}
    className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-900"
  >
    <option value="">All statuses</option>
    <option value="ACTIVE">Active</option>
    <option value="INACTIVE">Inactive</option>
  </select>

  <button
    type="submit"
    className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
  >
    Search
  </button>

  {(q || branch || status) && (
    <Link
      href="/admin/students"
      className="rounded-lg border border-gray-300 px-5 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      Clear
    </Link>
  )}
</form>
</div>
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Student List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {students?.length ?? 0} students
            </p>
          </div>

          {studentsError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load students.
            </div>
          ) : !students ||
            students.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium text-gray-700">
                No students yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create your first student.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
  <tr>
    <th className="px-6 py-3">
      Student
    </th>

    <th className="px-6 py-3">
      Branch
    </th>

    <th className="px-6 py-3">
      Admission
    </th>

    <th className="px-6 py-3">
      Status
    </th>

    <th className="px-6 py-3">
      Actions
    </th>
  </tr>
</thead>
                <tbody className="divide-y">
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-900">
                          {student.full_name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {student.student_code}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {branchMap.get(
                          student.default_branch_id
                        ) ?? '—'}
                      </td>

                      <td className="px-6 py-4 text-gray-600">
                        {student.admission_date ?? '—'}
                      </td>

                      <td className="px-6 py-4">
                        <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
                          {student.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
  <div className="flex gap-2">
    <Link
      href={`/admin/students/${student.id}`}
      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50"
    >
      Edit
    </Link>

    <form action={setStudentStatus}>
      <input
        type="hidden"
        name="id"
        value={student.id}
      />

      <input
        type="hidden"
        name="status"
        value={
          student.status === 'ACTIVE'
            ? 'INACTIVE'
            : 'ACTIVE'
        }
      />

      <button
        type="submit"
        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50"
      >
        {student.status === 'ACTIVE'
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