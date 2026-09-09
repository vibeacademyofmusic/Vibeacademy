import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

import {
  enrollStudent,
  withdrawStudent,
} from './actions'

type StudentEnrollmentSectionProps = {
  classId: string
  capacity: number
}

export default async function StudentEnrollmentSection({
  classId,
  capacity,
}: StudentEnrollmentSectionProps) {
  const supabase = await createClient()
  const todayInVietnam = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  const { data: classEnrollments } = await supabase
    .from('enrollments')
    .select(`
      id,
      student_id,
      status,
      enrolled_at,
      started_at
    `)
    .eq('class_id', classId)
    .in('status', ['ACTIVE', 'PAUSED'])
    .order('enrolled_at', { ascending: true })

  const { data: students } = await supabase
    .from('students')
    .select(`
      id,
      student_code,
      full_name,
      status
    `)
    .order('full_name', { ascending: true })

  const studentMap = new Map(
    (students ?? []).map((student) => [
      student.id,
      student,
    ])
  )

  const enrolledStudentIds = new Set(
    (classEnrollments ?? []).map(
      (enrollment) => enrollment.student_id
    )
  )

  const availableStudents = (
    students ?? []
  ).filter(
    (student) =>
      student.status === 'ACTIVE' &&
      !enrolledStudentIds.has(student.id)
  )

  const enrolledStudents =
    classEnrollments?.length ?? 0

  const remainingSeats = Math.max(
    capacity - enrolledStudents,
    0
  )

  const isClassFull = remainingSeats === 0

  return (
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
          {enrolledStudents} / {capacity}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-gray-500">
          Remaining seats
        </span>

        <span
          className={`font-semibold ${
            isClassFull
              ? 'text-red-600'
              : 'text-green-700'
          }`}
        >
          {remainingSeats}
        </span>
      </div>

      {classEnrollments &&
      classEnrollments.length > 0 ? (
        <div className="mt-5 space-y-3">
          {classEnrollments.map((enrollment) => {
            const student = studentMap.get(
              enrollment.student_id
            )

            return (
              <div
                key={enrollment.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4"
              >
                <div>
                  <Link
                    href={`/admin/students/${enrollment.student_id}`}
                    className="text-sm font-semibold text-gray-950 hover:underline"
                  >
                    {student?.full_name ??
                      'Unknown Student'}
                  </Link>

                  <p className="mt-1 text-xs text-gray-500">
                    {student?.student_code ?? '—'}
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        enrollment.status === 'ACTIVE'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {enrollment.status}
                    </span>

                    <div className="text-xs text-gray-400">
  <p>
    Ngày ghi danh:{' '}
    <span className="font-medium text-gray-600">
      {enrollment.enrolled_at}
    </span>
  </p>

  <p className="mt-1">
    Ngày bắt đầu học:{' '}
    <span className="font-semibold text-gray-700">
      {enrollment.started_at ?? 'Chưa bắt đầu'}
    </span>
  </p>
</div>
</div>
</div>

                <form action={withdrawStudent}>
                  <input
                    type="hidden"
                    name="enrollment_id"
                    value={enrollment.id}
                  />

                  <input
                    type="hidden"
                    name="class_id"
                    value={classId}
                  />

                  <input
                    type="hidden"
                    name="student_id"
                    value={enrollment.student_id}
                  />

                  <button
                    type="submit"
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Withdraw
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-5 text-center">
          <p className="text-sm font-medium text-gray-700">
            No students enrolled
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-gray-100 pt-5">
        <h3 className="text-sm font-semibold text-gray-950">
          Enroll Student
        </h3>

        {isClassFull ? (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-3 text-sm text-red-700">
            This class is full.
          </div>
        ) : availableStudents.length > 0 ? (
          <form
            action={enrollStudent}
            className="mt-4 space-y-3"
          >
            <input
              type="hidden"
              name="class_id"
              value={classId}
            />

            <select
              name="student_id"
              required
              defaultValue=""
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
            >
              <option value="" disabled>
                Select student
              </option>

              {availableStudents.map((student) => (
                <option
                  key={student.id}
                  value={student.id}
                >
                  {student.full_name ??
                    student.student_code}{' '}
                  ({student.student_code})
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
  <div>
    <label
      htmlFor="enrolled_at"
      className="mb-1.5 block text-sm font-medium text-gray-700"
    >
      Ngày ghi danh lớp *
    </label>

    <input
      id="enrolled_at"
      name="enrolled_at"
      type="date"
      required
      defaultValue={todayInVietnam}
      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
    />

    <p className="mt-1 text-xs text-gray-500">
      Ngày học sinh được đăng ký vào lớp.
    </p>
  </div>

  <div>
    <label
      htmlFor="started_at"
      className="mb-1.5 block text-sm font-medium text-gray-700"
    >
      Ngày bắt đầu học *
    </label>

    <input
      id="started_at"
      name="started_at"
      type="date"
      required
      defaultValue={todayInVietnam}
      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
    />

    <p className="mt-1 text-xs text-gray-500">
      Đây là mốc bắt đầu học và tính học phí.
    </p>
  </div>
</div>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Enroll Student
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-gray-400">
            No additional active students are available.
          </p>
        )}
      </div>
    </section>
  )
}