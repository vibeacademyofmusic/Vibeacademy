import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { updateCourse } from '../../actions'

type EditCoursePageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}

export default async function EditCoursePage({
  params,
  searchParams,
}: EditCoursePageProps) {
  const { id } = await params
  const { error } = await searchParams
  const supabase = await createClient()

  const [courseResult, curriculumResult, levelResult] =
    await Promise.all([
      supabase
        .from('courses')
        .select('id, curriculum_id, level_id, code, name, description, status')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('curriculums')
        .select('id, code, name, status')
        .eq('status', 'ACTIVE')
        .order('name'),
      supabase
        .from('curriculum_levels')
        .select('id, curriculum_id, code, name, sequence_no, status')
        .eq('status', 'ACTIVE')
        .order('sequence_no'),
    ])

  const course = courseResult.data

  if (courseResult.error || !course) {
    notFound()
  }

  const curriculums = curriculumResult.data ?? []
  const levels = levelResult.data ?? []

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/courses"
        className="text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        ← Back to Courses
      </Link>

      <div className="mt-6 mb-8">
        <p className="text-sm font-medium text-gray-500">
          Academic Operations
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Edit Course
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Update {course.name} and its academic placement.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <form action={updateCourse} className="space-y-5">
          <input type="hidden" name="id" value={course.id} />

          <label className="block text-sm font-medium text-gray-700">
            Curriculum *
            <select
              name="curriculum_id"
              required
              defaultValue={course.curriculum_id}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 outline-none focus:border-gray-900"
            >
              {curriculums.map((curriculum) => (
                <option key={curriculum.id} value={curriculum.id}>
                  {curriculum.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Grade / Level
            <select
              name="level_id"
              defaultValue={course.level_id ?? ''}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 outline-none focus:border-gray-900"
            >
              <option value="">No specific level</option>
              {curriculums.map((curriculum) => {
                const curriculumLevels = levels.filter(
                  (level) => level.curriculum_id === curriculum.id
                )
                if (curriculumLevels.length === 0) return null
                return (
                  <optgroup key={curriculum.id} label={curriculum.name}>
                    {curriculumLevels.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.name}
                      </option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Course Code *
            <input
              name="code"
              required
              maxLength={50}
              defaultValue={course.code}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Course Name *
            <input
              name="name"
              required
              defaultValue={course.name}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Status *
            <select
              name="status"
              required
              defaultValue={course.status}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 outline-none focus:border-gray-900"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Description
            <textarea
              name="description"
              rows={5}
              defaultValue={course.description ?? ''}
              className="mt-2 w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Save Changes
            </button>
            <Link
              href="/admin/courses"
              className="rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  )
}
