import { createClient } from '@/lib/supabase/server'

import {
  createCourse,
  setCourseStatus,
} from './actions'

type CoursesPageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function CoursesPage({
  searchParams,
}: CoursesPageProps) {
  const { error, success } = await searchParams

  const supabase = await createClient()

  const { data: curriculums } = await supabase
    .from('curriculums')
    .select('id, code, name, status')
    .eq('status', 'ACTIVE')
    .order('name', { ascending: true })

  const { data: levels } = await supabase
    .from('curriculum_levels')
    .select(
      'id, curriculum_id, code, name, sequence_no, status'
    )
    .eq('status', 'ACTIVE')
    .order('sequence_no', { ascending: true })

  const {
    data: courses,
    error: coursesError,
  } = await supabase
    .from('courses')
    .select(
      'id, curriculum_id, level_id, code, name, description, status, created_at'
    )
    .order('created_at', { ascending: true })

  const curriculumMap = new Map(
    (curriculums ?? []).map((curriculum) => [
      curriculum.id,
      curriculum,
    ])
  )

  const levelMap = new Map(
    (levels ?? []).map((level) => [
      level.id,
      level,
    ])
  )

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Academic Operations
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Courses
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Create course offerings from Vibe Academy curricula and levels.
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
            Add Course
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Connect an academic curriculum to an actual course offering.
          </p>

          <form
            action={createCourse}
            className="mt-6 space-y-5"
          >
            <div>
              <label
                htmlFor="curriculum_id"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Curriculum *
              </label>

              <select
                id="curriculum_id"
                name="curriculum_id"
                required
                defaultValue=""
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="" disabled>
                  Select curriculum
                </option>

                {(curriculums ?? []).map((curriculum) => (
                  <option
                    key={curriculum.id}
                    value={curriculum.id}
                  >
                    {curriculum.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="level_id"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Grade / Level
              </label>

              <select
                id="level_id"
                name="level_id"
                defaultValue=""
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="">
                  No specific level
                </option>

                {(curriculums ?? []).map((curriculum) => {
                  const curriculumLevels =
                    (levels ?? []).filter(
                      (level) =>
                        level.curriculum_id === curriculum.id
                    )

                  if (curriculumLevels.length === 0) {
                    return null
                  }

                  return (
                    <optgroup
                      key={curriculum.id}
                      label={curriculum.name}
                    >
                      {curriculumLevels.map((level) => (
                        <option
                          key={level.id}
                          value={level.id}
                        >
                          {level.name}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>

              <p className="mt-1 text-xs text-gray-400">
                Choose a level belonging to the selected curriculum.
              </p>
            </div>

            <div>
              <label
                htmlFor="code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Course Code *
              </label>

              <input
                id="code"
                name="code"
                required
                maxLength={50}
                placeholder="GUITAR_G1"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />

              <p className="mt-1 text-xs text-gray-400">
                Example: GUITAR_G1, PIANO_FOUNDATION
              </p>
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Course Name *
              </label>

              <input
                id="name"
                name="name"
                required
                placeholder="Guitar Grade 1"
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
                placeholder="Course description..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create Course
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Course List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {courses?.length ?? 0} total courses
            </p>
          </div>

          {coursesError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load courses.
            </div>
          ) : !courses || courses.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No courses yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first course using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {courses.map((course) => {
                const curriculum =
                  curriculumMap.get(course.curriculum_id)

                const level = course.level_id
                  ? levelMap.get(course.level_id)
                  : null

                return (
                  <div
                    key={course.id}
                    className="flex items-center justify-between gap-6 px-6 py-5"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="font-semibold text-gray-950">
                          {course.name}
                        </p>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            course.status === 'ACTIVE'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {course.status}
                        </span>
                      </div>

                      <p className="mt-1 text-xs font-medium text-gray-500">
                        {course.code}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                        <span>
                          Curriculum:{' '}
                          {curriculum?.name ?? 'Unknown'}
                        </span>

                        <span>
                          Level:{' '}
                          {level?.name ?? 'General'}
                        </span>
                      </div>

                      {course.description && (
                        <p className="mt-2 max-w-xl text-sm text-gray-500">
                          {course.description}
                        </p>
                      )}
                    </div>

                    <form action={setCourseStatus}>
                      <input
                        type="hidden"
                        name="id"
                        value={course.id}
                      />

                      <input
                        type="hidden"
                        name="status"
                        value={
                          course.status === 'ACTIVE'
                            ? 'INACTIVE'
                            : 'ACTIVE'
                        }
                      />

                      <button
                        type="submit"
                        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        {course.status === 'ACTIVE'
                          ? 'Deactivate'
                          : 'Activate'}
                      </button>
                    </form>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}