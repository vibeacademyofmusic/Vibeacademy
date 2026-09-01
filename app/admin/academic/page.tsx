import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  createCurriculum,
  setCurriculumStatus,
} from './actions'

type AcademicPageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function AcademicPage({
  searchParams,
}: AcademicPageProps) {
  const { error, success } = await searchParams

  const supabase = await createClient()

  const {
    data: curriculums,
    error: curriculumsError,
  } = await supabase
    .from('curriculums')
    .select(
      'id, code, name, description, status, created_at'
    )
    .order('created_at', { ascending: true })

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Academic
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Curriculum Management
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Manage Vibe Academy academic programs and curriculum structures.
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
            Add Curriculum
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create a new academic program.
          </p>

          <form
            action={createCurriculum}
            className="mt-6 space-y-5"
          >
            <div>
              <label
                htmlFor="code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Curriculum Code *
              </label>

              <input
                id="code"
                name="code"
                required
                maxLength={30}
                placeholder="GUITAR"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />

              <p className="mt-1 text-xs text-gray-400">
                Example: GUITAR, PIANO, VOCAL
              </p>
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Curriculum Name *
              </label>

              <input
                id="name"
                name="name"
                required
                placeholder="Guitar"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Description
              </label>

              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="Describe this curriculum..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create Curriculum
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Curriculum List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {curriculums?.length ?? 0} total curriculums
            </p>
          </div>

          {curriculumsError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load curriculums.
            </div>
          ) : !curriculums || curriculums.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No curriculums yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first academic curriculum using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {curriculums.map((curriculum) => (
                <div
                  key={curriculum.id}
                  className="flex items-center justify-between gap-6 px-6 py-5"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-950">
                        {curriculum.name}
                      </p>

                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          curriculum.status === 'ACTIVE'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {curriculum.status}
                      </span>
                    </div>

                    <p className="mt-1 text-xs font-medium text-gray-500">
                      {curriculum.code}
                    </p>

                    {curriculum.description && (
                      <p className="mt-2 max-w-xl text-sm text-gray-500">
                        {curriculum.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
  <Link
    href={`/admin/academic/${curriculum.id}`}
    className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
  >
    Manage
  </Link>

  <form action={setCurriculumStatus}>
    <input
      type="hidden"
      name="id"
      value={curriculum.id}
    />

    <input
      type="hidden"
      name="status"
      value={
        curriculum.status === 'ACTIVE'
          ? 'INACTIVE'
          : 'ACTIVE'
      }
    />

    <button
      type="submit"
      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {curriculum.status === 'ACTIVE'
        ? 'Deactivate'
        : 'Activate'}
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