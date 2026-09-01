import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

type ClassDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

export default async function ClassDetailPage({
  params,
}: ClassDetailPageProps) {
  const { id } = await params

  const supabase = await createClient()

  const { data: classItem } = await supabase
    .from('classes')
    .select(`
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
      status
    `)
    .eq('id', id)
    .maybeSingle()

  if (!classItem) {
    notFound()
  }

  const { data: branch } = await supabase
    .from('branches')
    .select('id, code, name')
    .eq('id', classItem.branch_id)
    .maybeSingle()

  const { data: course } = await supabase
    .from('courses')
    .select('id, code, name')
    .eq('id', classItem.course_id)
    .maybeSingle()

  const { count: enrolledStudents } = await supabase
    .from('enrollments')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('class_id', classItem.id)
    .in('status', ['ACTIVE', 'PAUSED'])

  const { count: assignedTeachers } = await supabase
    .from('class_teachers')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('class_id', classItem.id)
    .eq('is_active', true)

  return (
    <div className="max-w-6xl">
      <Link
        href="/admin/classes"
        className="text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        ← Back to Classes
      </Link>

      <div className="mt-6">
        <p className="text-sm font-medium text-gray-500">
          Class Management
        </p>

        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-950">
              {classItem.name}
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span>{classItem.code}</span>

              <span>•</span>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  classItem.status === 'ACTIVE'
                    ? 'bg-green-50 text-green-700'
                    : classItem.status === 'DRAFT'
                      ? 'bg-amber-50 text-amber-700'
                      : classItem.status === 'COMPLETED'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                }`}
              >
                {classItem.status}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Course
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {course?.name ?? 'Not found'}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {course?.code ?? '—'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Branch
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {branch?.name ?? 'Not found'}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {branch?.code ?? '—'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Class Type
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {classItem.class_type === 'ONE_ON_ONE'
                ? '1-on-1'
                : 'Group'}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Capacity: {classItem.capacity}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Enrollment
            </p>

            <p className="mt-2 font-semibold text-gray-950">
              {enrolledStudents ?? 0} / {classItem.capacity}
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Active / paused students
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  Teachers
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Primary and assistant teachers.
                </p>
              </div>

              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                {assignedTeachers ?? 0} assigned
              </span>
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center">
              <p className="text-sm font-medium text-gray-700">
                No teacher management UI yet
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Teacher assignment will be added next.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  Students
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Students enrolled in this class.
                </p>
              </div>

              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                {enrolledStudents ?? 0} enrolled
              </span>
            </div>

            <div className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center">
              <p className="text-sm font-medium text-gray-700">
                No students enrolled yet
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Student enrollment will be added after teacher assignment.
              </p>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">
            Class Information
          </h2>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Start Date
              </p>

              <p className="mt-1 text-sm font-medium text-gray-900">
                {classItem.start_date ?? 'Not set'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                End Date
              </p>

              <p className="mt-1 text-sm font-medium text-gray-900">
                {classItem.end_date ?? 'Not set'}
              </p>
            </div>
          </div>

          {classItem.notes && (
            <div className="mt-5 border-t border-gray-100 pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Notes
              </p>

              <p className="mt-2 text-sm text-gray-600">
                {classItem.notes}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}