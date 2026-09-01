import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import {
  assignTeacher,
  removeTeacher,
} from './actions'

type ClassDetailPageProps = {
  params: Promise<{
    id: string
  }>

  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function ClassDetailPage({
  params,
  searchParams,
}: ClassDetailPageProps) {
  const { id } = await params
  const { error, success } = await searchParams

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

  const { data: activeTeachers } = await supabase
    .from('teachers')
    .select(`
      id,
      teacher_code,
      full_name,
      preferred_name,
      status
    `)
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true })

  const { data: teacherAssignments } = await supabase
    .from('class_teachers')
    .select(`
      id,
      teacher_id,
      teacher_role,
      assigned_at,
      is_active
    `)
    .eq('class_id', classItem.id)
    .eq('is_active', true)
    .order('assigned_at', { ascending: true })

  const teacherMap = new Map(
    (activeTeachers ?? []).map((teacher) => [
      teacher.id,
      teacher,
    ])
  )

  const assignedTeacherIds = new Set(
    (teacherAssignments ?? []).map(
      (assignment) => assignment.teacher_id
    )
  )

  const availableTeachers = (
    activeTeachers ?? []
  ).filter(
    (teacher) =>
      !assignedTeacherIds.has(teacher.id)
  )

  const assignedTeachers =
    teacherAssignments?.length ?? 0

  const primaryTeacher =
    teacherAssignments?.find(
      (assignment) =>
        assignment.teacher_role === 'PRIMARY'
    )

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
                      : classItem.status ===
                          'COMPLETED'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                }`}
              >
                {classItem.status}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

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
              {enrolledStudents ?? 0} /{' '}
              {classItem.capacity}
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
                {assignedTeachers} assigned
              </span>
            </div>

            {teacherAssignments &&
            teacherAssignments.length > 0 ? (
              <div className="mt-5 space-y-3">
                {teacherAssignments.map(
                  (assignment) => {
                    const teacher =
                      teacherMap.get(
                        assignment.teacher_id
                      )

                    return (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-gray-950">
                              {teacher?.full_name ??
                                'Unknown Teacher'}
                            </p>

                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                assignment.teacher_role ===
                                'PRIMARY'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {assignment.teacher_role}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-gray-500">
                            {teacher?.teacher_code ??
                              '—'}
                          </p>

                          <p className="mt-1 text-xs text-gray-400">
                            Assigned:{' '}
                            {assignment.assigned_at}
                          </p>
                        </div>

                        <form
                          action={removeTeacher}
                        >
                          <input
                            type="hidden"
                            name="assignment_id"
                            value={assignment.id}
                          />

                          <input
                            type="hidden"
                            name="class_id"
                            value={classItem.id}
                          />

                          <button
                            type="submit"
                            className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </form>
                      </div>
                    )
                  }
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-5 text-center">
                <p className="text-sm font-medium text-gray-700">
                  No teachers assigned
                </p>
              </div>
            )}

            <div className="mt-6 border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-950">
                Assign Teacher
              </h3>

              {availableTeachers.length > 0 ? (
                <form
                  action={assignTeacher}
                  className="mt-4 space-y-3"
                >
                  <input
                    type="hidden"
                    name="class_id"
                    value={classItem.id}
                  />

                  <select
                    name="teacher_id"
                    required
                    defaultValue=""
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                  >
                    <option
                      value=""
                      disabled
                    >
                      Select teacher
                    </option>

                    {availableTeachers.map(
                      (teacher) => (
                        <option
                          key={teacher.id}
                          value={teacher.id}
                        >
                          {teacher.full_name ??
                            teacher.teacher_code}{' '}
                          ({teacher.teacher_code})
                        </option>
                      )
                    )}
                  </select>

                  <select
                    name="teacher_role"
                    required
                    defaultValue={
                      primaryTeacher
                        ? 'ASSISTANT'
                        : 'PRIMARY'
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                  >
                    {!primaryTeacher && (
                      <option value="PRIMARY">
                        Primary Teacher
                      </option>
                    )}

                    <option value="ASSISTANT">
                      Assistant Teacher
                    </option>

                    {primaryTeacher && (
                      <option value="PRIMARY">
                        Replace Primary Teacher
                      </option>
                    )}
                  </select>

                  <button
                    type="submit"
                    className="w-full rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                  >
                    Assign Teacher
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-gray-400">
                  No additional active teachers are
                  available.
                </p>
              )}
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
                No student management UI yet
              </p>

              <p className="mt-1 text-xs text-gray-400">
                Student enrollment will be added next.
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