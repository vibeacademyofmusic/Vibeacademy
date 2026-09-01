import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import {
  createCurriculumLevel,
  setCurriculumLevelStatus,
} from '../actions'

type CurriculumDetailPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function CurriculumDetailPage({
  params,
  searchParams,
}: CurriculumDetailPageProps) {
  const { id } = await params
  const { error, success } = await searchParams

  const supabase = await createClient()

  const {
    data: curriculum,
    error: curriculumError,
  } = await supabase
    .from('curriculums')
    .select('id, code, name, description, status')
    .eq('id', id)
    .maybeSingle()

  if (curriculumError || !curriculum) {
    notFound()
  }

  const {
    data: levels,
    error: levelsError,
  } = await supabase
    .from('curriculum_levels')
    .select(
      'id, code, name, sequence_no, level_number, level_type, completion_rule, status'
    )
    .eq('curriculum_id', curriculum.id)
    .order('sequence_no', { ascending: true })

  const nextSequence = (levels?.length ?? 0) + 1

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/academic"
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          ← Back to Academic
        </Link>
      </div>

      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          {curriculum.code}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-3">
  <h1 className="text-3xl font-bold tracking-tight text-gray-950">
    {curriculum.name}
  </h1>

  <span
    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
      curriculum.status === 'ACTIVE'
        ? 'bg-green-50 text-green-700'
        : 'bg-gray-100 text-gray-600'
    }`}
  >
    {curriculum.status}
  </span>

  <Link
    href={`/admin/academic/${curriculum.id}/edit`}
    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
  >
    Edit Curriculum
  </Link>
</div>

        {curriculum.description && (
          <p className="mt-3 max-w-2xl text-sm text-gray-500">
            {curriculum.description}
          </p>
        )}
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
            Add Grade / Level
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Add a new level to {curriculum.name}.
          </p>

          <form
            action={createCurriculumLevel}
            className="mt-6 space-y-5"
          >
            <input
              type="hidden"
              name="curriculum_id"
              value={curriculum.id}
            />

            <div>
              <label
                htmlFor="code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Level Code *
              </label>

              <input
                id="code"
                name="code"
                required
                placeholder="GRADE_1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />

              <p className="mt-1 text-xs text-gray-400">
                Example: FOUNDATION, GRADE_1, GRADE_2
              </p>
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Level Name *
              </label>

              <input
                id="name"
                name="name"
                required
                placeholder="Grade 1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="level_type"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Level Type *
              </label>

              <select
                id="level_type"
                name="level_type"
                defaultValue="GRADE"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="FOUNDATION">
                  Foundation
                </option>

                <option value="GRADE">
                  Grade
                </option>

                <option value="DIPLOMA">
                  Diploma
                </option>

                <option value="OTHER">
                  Other
                </option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="sequence_no"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Sequence *
                </label>

                <input
                  id="sequence_no"
                  name="sequence_no"
                  type="number"
                  min="1"
                  required
                  defaultValue={nextSequence}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="level_number"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Grade No.
                </label>

                <input
                  id="level_number"
                  name="level_number"
                  type="number"
                  min="0"
                  placeholder="1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="completion_rule"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Completion Rule
              </label>

              <select
                id="completion_rule"
                name="completion_rule"
                defaultValue="ALL_REQUIRED_SUBJECTS"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="ALL_REQUIRED_SUBJECTS">
                  All Required Subjects
                </option>

                <option value="MANUAL">
                  Manual
                </option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create Level
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Grade / Level Structure
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {levels?.length ?? 0} levels in this curriculum
            </p>
          </div>

          {levelsError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load curriculum levels.
            </div>
          ) : !levels || levels.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No levels yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first grade or level using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {levels.map((level) => (
                <div
                  key={level.id}
                  className="flex items-center justify-between gap-6 px-6 py-5"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-950">
                        {level.name}
                      </p>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          level.status === 'ACTIVE'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {level.status}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                      <span>
                        Code: {level.code}
                      </span>

                      <span>
                        Type: {level.level_type}
                      </span>

                      <span>
                        Sequence: {level.sequence_no}
                      </span>

                      {level.level_number !== null && (
                        <span>
                          Grade: {level.level_number}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-xs text-gray-400">
                      Completion: {level.completion_rule}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
  <Link
    href={`/admin/academic/${curriculum.id}/levels/${level.id}`}
    className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
  >
    Manage
  </Link>

  <Link
    href={`/admin/academic/${curriculum.id}/levels/${level.id}/edit`}
    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
  >
    Edit
  </Link>

  <form action={setCurriculumLevelStatus}>
    <input
      type="hidden"
      name="curriculum_id"
      value={curriculum.id}
    />

    <input
      type="hidden"
      name="level_id"
      value={level.id}
    />

    <input
      type="hidden"
      name="status"
      value={
        level.status === 'ACTIVE'
          ? 'INACTIVE'
          : 'ACTIVE'
      }
    />

    <button
      type="submit"
      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {level.status === 'ACTIVE'
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