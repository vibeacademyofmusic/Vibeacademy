import { createClient } from '@/lib/supabase/server'

import {
  createTeacher,
  setTeacherStatus,
} from './actions'

type TeachersPageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function TeachersPage({
  searchParams,
}: TeachersPageProps) {
  const { error, success } = await searchParams

  const supabase = await createClient()

  const {
    data: teachers,
    error: teachersError,
  } = await supabase
    .from('teachers')
    .select(`
      id,
      teacher_code,
      full_name,
      preferred_name,
      phone,
      email,
      qualification,
      hire_date,
      notes,
      status,
      created_at
    `)
    .order('created_at', { ascending: false })

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          People Management
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Teachers
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Create and manage Vibe Academy teachers.
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

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">
            Add Teacher
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create a new teacher profile.
          </p>

          <form
            action={createTeacher}
            className="mt-6 space-y-5"
          >
            <div>
              <label
                htmlFor="teacher_code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Teacher Code *
              </label>

              <input
                id="teacher_code"
                name="teacher_code"
                required
                maxLength={50}
                placeholder="GV001"
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
                htmlFor="preferred_name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Preferred Name
              </label>

              <input
                id="preferred_name"
                name="preferred_name"
                placeholder="Teacher A"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                  placeholder="090..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="hire_date"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Hire Date
                </label>

                <input
                  id="hire_date"
                  name="hire_date"
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Email
              </label>

              <input
                id="email"
                name="email"
                type="email"
                placeholder="teacher@vibeacademy.vn"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="qualification"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Qualification
              </label>

              <input
                id="qualification"
                name="qualification"
                placeholder="Bachelor of Music..."
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
                placeholder="Optional notes..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create Teacher
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Teacher List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {teachers?.length ?? 0} total teachers
            </p>
          </div>

          {teachersError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load teachers.
            </div>
          ) : !teachers || teachers.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No teachers yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first teacher using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {teachers.map((teacher) => (
                <div
                  key={teacher.id}
                  className="px-6 py-5"
                >
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="font-semibold text-gray-950">
                          {teacher.full_name ||
                            'Unnamed Teacher'}
                        </p>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            teacher.status === 'ACTIVE'
                              ? 'bg-green-50 text-green-700'
                              : teacher.status === 'ON_LEAVE'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {teacher.status.replaceAll(
                            '_',
                            ' '
                          )}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-medium text-gray-500">
                        {teacher.teacher_code}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                        {teacher.phone && (
                          <span>
                            Phone: {teacher.phone}
                          </span>
                        )}

                        {teacher.email && (
                          <span>
                            Email: {teacher.email}
                          </span>
                        )}

                        {teacher.hire_date && (
                          <span>
                            Hired: {teacher.hire_date}
                          </span>
                        )}
                      </div>

                      {teacher.qualification && (
                        <p className="mt-2 text-sm text-gray-500">
                          {teacher.qualification}
                        </p>
                      )}
                    </div>

                    <form
                      action={setTeacherStatus}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="hidden"
                        name="id"
                        value={teacher.id}
                      />

                      <select
                        name="status"
                        defaultValue={teacher.status}
                        className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-700"
                      >
                        <option value="ACTIVE">
                          Active
                        </option>

                        <option value="ON_LEAVE">
                          On Leave
                        </option>

                        <option value="INACTIVE">
                          Inactive
                        </option>

                        <option value="ARCHIVED">
                          Archived
                        </option>
                      </select>

                      <button
                        type="submit"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Update
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}