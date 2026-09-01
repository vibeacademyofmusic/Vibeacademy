import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

import {
  createClass,
  setClassStatus,
} from './actions'

type ClassesPageProps = {
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function ClassesPage({
  searchParams,
}: ClassesPageProps) {
  const { error, success } = await searchParams

  const supabase = await createClient()

  const { data: branches } = await supabase
    .from('branches')
    .select('id, code, name, status')
    .eq('status', 'ACTIVE')
    .order('name', { ascending: true })

  const { data: courses } = await supabase
    .from('courses')
    .select('id, code, name, status')
    .eq('status', 'ACTIVE')
    .order('name', { ascending: true })

  const {
    data: classes,
    error: classesError,
  } = await supabase
    .from('classes')
    .select(
      `
        id,
        branch_id,
        course_id,
        code,
        name,
        class_type,
        capacity,
        start_date,
        end_date,
        notes,
        status,
        created_at
      `
    )
    .order('created_at', { ascending: false })

  const branchMap = new Map(
    (branches ?? []).map((branch) => [
      branch.id,
      branch,
    ])
  )

  const courseMap = new Map(
    (courses ?? []).map((course) => [
      course.id,
      course,
    ])
  )

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Academic Operations
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Classes
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Create and manage actual Vibe Academy classes.
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
            Add Class
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create an actual class from an active course.
          </p>

          <form
            action={createClass}
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="" disabled>
                  Select branch
                </option>

                {(branches ?? []).map((branch) => (
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
                htmlFor="course_id"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Course *
              </label>

              <select
                id="course_id"
                name="course_id"
                required
                defaultValue=""
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="" disabled>
                  Select course
                </option>

                {(courses ?? []).map((course) => (
                  <option
                    key={course.id}
                    value={course.id}
                  >
                    {course.name} ({course.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Class Code *
              </label>

              <input
                id="code"
                name="code"
                required
                maxLength={50}
                placeholder="GUITAR_G1_001"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />

              <p className="mt-1 text-xs text-gray-400">
                Example: GUITAR_G1_001
              </p>
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Class Name *
              </label>

              <input
                id="name"
                name="name"
                required
                placeholder="Guitar Grade 1 - Class 001"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="class_type"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Class Type *
              </label>

              <select
                id="class_type"
                name="class_type"
                required
                defaultValue="ONE_ON_ONE"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="ONE_ON_ONE">
                  1-on-1
                </option>

                <option value="GROUP">
                  Group
                </option>
              </select>
            </div>

            <div>
              <label
                htmlFor="capacity"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Capacity *
              </label>

              <input
                id="capacity"
                name="capacity"
                type="number"
                min={1}
                required
                defaultValue={1}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />

              <p className="mt-1 text-xs text-gray-400">
                1-on-1 must be 1. Group must be at least 2.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="start_date"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Start Date
                </label>

                <input
                  id="start_date"
                  name="start_date"
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="end_date"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  End Date
                </label>

                <input
                  id="end_date"
                  name="end_date"
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
                />
              </div>
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
              Create Class
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Class List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {classes?.length ?? 0} total classes
            </p>
          </div>

          {classesError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load classes.
            </div>
          ) : !classes || classes.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No classes yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first class using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {classes.map((classItem) => {
                const branch =
                  branchMap.get(classItem.branch_id)

                const course =
                  courseMap.get(classItem.course_id)

                return (
                  <div
                    key={classItem.id}
                    className="px-6 py-5"
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="font-semibold text-gray-950">
                            {classItem.name}
                          </p>

                          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                            {classItem.status}
                          </span>
                        </div>

                        <p className="mt-1 text-xs font-medium text-gray-500">
                          {classItem.code}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                          <span>
                            Branch:{' '}
                            {branch?.name ?? 'Unknown'}
                          </span>

                          <span>
                            Course:{' '}
                            {course?.name ?? 'Unknown'}
                          </span>

                          <span>
                            Type:{' '}
                            {classItem.class_type ===
                            'ONE_ON_ONE'
                              ? '1-on-1'
                              : 'Group'}
                          </span>

                          <span>
                            Capacity:{' '}
                            {classItem.capacity}
                          </span>
                        </div>

                        {(classItem.start_date ||
                          classItem.end_date) && (
                          <p className="mt-2 text-xs text-gray-500">
                            {classItem.start_date ??
                              'No start date'}{' '}
                            →{' '}
                            {classItem.end_date ??
                              'No end date'}
                          </p>
                        )}

                        {classItem.notes && (
                          <p className="mt-2 text-sm text-gray-500">
                            {classItem.notes}
                          </p>
                        )}
                      </div>

                      <Link
  href={`/admin/classes/${classItem.id}`}
  className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
>
  Manage
</Link>
<form
  action={setClassStatus}
  className="flex items-center gap-2"
>
                        <input
                          type="hidden"
                          name="id"
                          value={classItem.id}
                        />

                        <select
                          name="status"
                          defaultValue={classItem.status}
                          className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs text-gray-700"
                        >
                          <option value="DRAFT">
                            Draft
                          </option>

                          <option value="ACTIVE">
                            Active
                          </option>

                          <option value="COMPLETED">
                            Completed
                          </option>

                          <option value="CANCELLED">
                            Cancelled
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
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}