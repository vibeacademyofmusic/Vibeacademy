"use client"
import { useState } from 'react'
import { assignStudentAcademicProgram } from '../actions'

type Props = {
  student: { id: string }
  activeCurriculums: { id: string; name: string }[]
  activeLevels: { id: string; curriculum_id: string; name: string }[]
  academicProgramEnrollments: { curriculum_id: string }[]
  today: string
}
export default function AddAcademicProgramForm({ student, activeCurriculums, activeLevels, academicProgramEnrollments, today }: Props) {
  const [curriculumId, setCurriculumId] = useState('')
  const assignedCurriculumIds = new Set(academicProgramEnrollments.map(item => item.curriculum_id))
  const hasAvailableAcademicProgram = activeCurriculums.some(item => !assignedCurriculumIds.has(item.id))
return (            <div className="rounded-xl border border-gray-200 bg-white p-5">
  <div className="flex flex-col gap-1">
    <p className="text-sm font-semibold text-gray-950">
      Thêm chương trình học
    </p>

    <p className="text-sm text-gray-500">
      Thêm chương trình đào tạo mới. Để lên bậc trong chương trình đang học, dùng Bắt đầu bậc tiếp theo.
    </p>
  </div>

  <form
    action={assignStudentAcademicProgram}
    className="mt-5 grid gap-4 md:grid-cols-2"
  >
    <fieldset
  disabled={!hasAvailableAcademicProgram}
  className="contents"
>
    <input
      type="hidden"
      name="student_id"
      value={student.id}
    />

    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Chương trình đào tạo
      </label>

      <select
        name="curriculum_id"
        value={curriculumId}
        onChange={event => setCurriculumId(event.target.value)}
        required
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">
          Chọn chương trình
        </option>

        {(activeCurriculums ?? []).map((item) => {
  const isAssigned =
    assignedCurriculumIds.has(item.id)


  return (
    <option
      key={item.id}
      value={item.id}
      disabled={isAssigned}
    >
      {item.name}
      {isAssigned ? ' — Đã thêm' : ''}
    </option>
  )
})}
      </select>
    </div>

    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Bậc bắt đầu
      </label>

      <select
        name="level_id"
        key={curriculumId}
        disabled={!curriculumId}
        required
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">
          Chọn bậc học
        </option>

        {activeLevels.filter(level => level.curriculum_id === curriculumId).map((level) => {
  const isAssigned =
    assignedCurriculumIds.has(level.curriculum_id)

  return (
    <option
      key={level.id}
      value={level.id}
      disabled={isAssigned}
    >
      {activeCurriculums?.find(item => item.id === level.curriculum_id)?.name} — {level.name}
      {isAssigned ? " — Đã thêm" : ""}
    </option>
  )
})}
      </select>
    </div>

    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        Ngày bắt đầu học
      </label>

      <input
        type="date"
        name="started_at"
        max={today}
        required
        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
      />
    </div>

    <div className="flex items-end">
      <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700">
        <input
          type="checkbox"
          name="is_primary"
          defaultChecked={
            (academicProgramEnrollments ?? []).length === 0
          }
        />

        Chương trình chính
      </label>
    </div>

    <div className="md:col-span-2">
      <button
        type="submit"
        className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
      >
        Thêm chương trình
      </button>
    </div>
    </fieldset>
  </form>
</div>
)}
