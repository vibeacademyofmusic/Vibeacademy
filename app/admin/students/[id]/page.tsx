import Link from 'next/link'
import { notFound } from 'next/navigation'

import { updateStudent } from '../actions'
import { createClient } from '@/lib/supabase/server'

type EditStudentPageProps = {
  params: Promise<{
    id: string
  }>

  searchParams: Promise<{
    error?: string
  }>
}

export default async function EditStudentPage({
  params,
  searchParams,
}: EditStudentPageProps) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students')
    .select(`
      id,
      student_code,
      full_name,
      preferred_name,
      default_branch_id,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      admission_date,
      notes,
      status
    `)
    .eq('id', id)
    .single()

  if (!student) {
    notFound()
  }

  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, status')
    .order('name')

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/students"
        className="text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        ← Back to Students
      </Link>

      <div className="mt-6">
        <p className="text-sm font-medium text-gray-500">
          People
        </p>

        <h1 className="mt-1 text-3xl font-bold text-gray-950">
          Edit Student
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Update student profile and contact information.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        action={updateStudent}
        className="mt-8 space-y-5 rounded-2xl border border-gray-200 bg-white p-6"
      >
        <input type="hidden" name="id" value={student.id} />

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Student Code *
            </label>

            <input
              name="student_code"
              required
              defaultValue={student.student_code}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Full Name *
            </label>

            <input
              name="full_name"
              required
              defaultValue={student.full_name ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Preferred Name
          </label>

          <input
            name="preferred_name"
            defaultValue={student.preferred_name ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Branch *
          </label>

          <select
            name="default_branch_id"
            required
            defaultValue={student.default_branch_id}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
          >
            {(branches ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branch.status !== 'ACTIVE'
                  ? ' (Inactive)'
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Date of Birth
            </label>

            <input
              name="date_of_birth"
              type="date"
              defaultValue={student.date_of_birth ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Gender
            </label>

            <select
              name="gender"
              defaultValue={student.gender ?? ''}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
            >
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
              <option value="UNSPECIFIED">
                Unspecified
              </option>
            </select>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Phone
            </label>

            <input
              name="phone"
              defaultValue={student.phone ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Email
            </label>

            <input
              name="email"
              type="email"
              defaultValue={student.email ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Admission Date
          </label>

          <input
            name="admission_date"
            type="date"
            defaultValue={student.admission_date ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Address
          </label>

          <textarea
            name="address"
            rows={3}
            defaultValue={student.address ?? ''}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Notes
          </label>

          <textarea
            name="notes"
            rows={4}
            defaultValue={student.notes ?? ''}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Current Status
          </p>

          <p className="mt-1 font-semibold text-gray-900">
            {student.status}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Save Changes
          </button>

          <Link
            href="/admin/students"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}