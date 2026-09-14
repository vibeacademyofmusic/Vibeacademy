import { displayLabel } from '@/lib/display'
import { createClient } from '@/lib/supabase/server'
import { updateComponentProgressStatus, updateDirectSubjectProgressStatus, startStudentAcademicLevel } from '../actions'
import { gradeProgressPercent } from './academic-progress'
import AddAcademicProgramForm from './AddAcademicProgramForm'

function vietnamToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

type Enrollment = { id: string; curriculum_id: string; current_level_id: string | null; status: string; is_primary: boolean; started_at: string }
function getProgressStatusClasses(status: string) {
  switch (status) {
    case 'PASS':
      return 'border-green-200 bg-green-50 text-green-700'

    case 'IN_PROGRESS':
      return 'border-amber-200 bg-amber-50 text-amber-700'

    case 'NOT_PASSED':
      return 'border-red-200 bg-red-50 text-red-700'

    case 'EXEMPT':
      return 'border-blue-200 bg-blue-50 text-blue-700'

    case 'NOT_STARTED':
    default:
      return 'border-gray-200 bg-gray-100 text-gray-600'
  }
}

export default async function AcademicPrograms({ studentId }: { studentId: string }) {
  const supabase = await createClient()
  const { data: enrollments, error } = await supabase.from('student_curriculum_enrollments')
    .select('id, curriculum_id, current_level_id, status, is_primary, started_at')
    .eq('student_id', studentId).order('is_primary', { ascending: false }).order('started_at').order('id')
  if (error) throw error
  return <div className="mt-5 space-y-5">
    <AddProgram student={{ id: studentId }} />
    {!enrollments?.length && <p className="text-sm text-gray-500">Chưa có chương trình học.</p>}
    {(enrollments ?? []).map(enrollment => <ProgramJourney key={enrollment.id} student={{ id: studentId }} enrollment={enrollment} />)}
  </div>
}
async function AddProgram({ student }: { student: { id: string } }) {
  const supabase = await createClient()
  const { data: academicProgramEnrollments, error: academicProgramEnrollmentsError } = await supabase
  .from('student_curriculum_enrollments')
  .select('curriculum_id, status')
  .eq('student_id', student.id)
  if (academicProgramEnrollmentsError) throw academicProgramEnrollmentsError



  const { data: activeCurriculums, error: activeCurriculumsError } = await supabase
  .from('curriculums')
  .select('id, code, name')
  .eq('status', 'ACTIVE')
  .order('name')
  if (activeCurriculumsError) throw activeCurriculumsError


const { data: activeLevels, error: activeLevelsError } = await supabase
  .from('curriculum_levels')
  .select("id, curriculum_id, code, name, sequence_no")
  .eq('status', 'ACTIVE')
  .order('sequence_no')
  if (activeLevelsError) throw activeLevelsError


return <AddAcademicProgramForm student={student} activeCurriculums={activeCurriculums ?? []} activeLevels={activeLevels ?? []} academicProgramEnrollments={academicProgramEnrollments ?? []} today={vietnamToday()} />
}
async function ProgramJourney({ student, enrollment }: { student: { id: string }; enrollment: Enrollment }) {
  const supabase = await createClient()
  const { data: curriculum, error: curriculumError } = await supabase
  .from('curriculums')
  .select('id, code, name')
  .eq('id', enrollment.curriculum_id)
  .maybeSingle()
  if (curriculumError) throw curriculumError

  const { data: currentLevel, error: currentLevelError } = enrollment.current_level_id ? await supabase
  .from('curriculum_levels')
  .select('id, code, name, sequence_no')
  .eq('id', enrollment.current_level_id)
  .maybeSingle() : { data: null, error: null }
  if (currentLevelError) throw currentLevelError

  const { data: currentLevelProgress, error: currentLevelProgressError } = currentLevel ? await supabase
    .from('student_level_progress')
    .select('id, status')
    .eq('enrollment_id', enrollment.id)
    .eq('level_id', currentLevel.id)
    .maybeSingle() : { data: null, error: null }
  if (currentLevelProgressError) throw currentLevelProgressError

    const { data: availableLevelProgress, error: availableLevelProgressError } = enrollment?.id
  ? await supabase
      .from('student_level_progress')
      .select('id, level_id, status, unlocked_at')
      .eq('enrollment_id', enrollment.id)
      .eq('status', 'AVAILABLE')
      .order('unlocked_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  : { data: null, error: null }
  if (availableLevelProgressError) throw availableLevelProgressError


const { data: availableLevel, error: availableLevelError } =
  availableLevelProgress?.level_id
    ? await supabase
        .from('curriculum_levels')
        .select('id, code, name, sequence_no')
        .eq('id', availableLevelProgress.level_id)
        .maybeSingle()
    : { data: null, error: null }
  if (availableLevelError) throw availableLevelError

  // ============================================================
// Academic Record
// Read-only academic history for the current academic program
// ============================================================

const { data: academicRecordLevelProgress, error: academicRecordLevelProgressError } = enrollment?.id
  ? await supabase
      .from("student_level_progress")
      .select(
        "id, level_id, status, unlocked_at, started_at, completed_at"
      )
      .eq("enrollment_id", enrollment.id)
  : { data: [], error: null }
  if (academicRecordLevelProgressError) throw academicRecordLevelProgressError


const academicRecordLevelIds =
  (academicRecordLevelProgress ?? []).map(
    (item) => item.id
  )

const academicRecordDefinitionLevelIds =
  (academicRecordLevelProgress ?? []).map(
    (item) => item.level_id
  )

const { data: academicRecordLevels, error: academicRecordLevelsError } =
  academicRecordDefinitionLevelIds.length > 0
    ? await supabase
        .from("curriculum_levels")
        .select(
          "id, code, name, sequence_no, level_number, level_type"
        )
        .in("id", academicRecordDefinitionLevelIds)
    : { data: [], error: null }
  if (academicRecordLevelsError) throw academicRecordLevelsError


const { data: academicRecordSubjectProgress, error: academicRecordSubjectProgressError } =
  academicRecordLevelIds.length > 0
    ? await supabase
        .from("student_subject_progress")
        .select(
          "id, level_progress_id, subject_id, status, score, started_at, passed_at"
        )
        .in(
          "level_progress_id",
          academicRecordLevelIds
        )
    : { data: [], error: null }
  if (academicRecordSubjectProgressError) throw academicRecordSubjectProgressError


const academicRecordSubjectIds =
  (academicRecordSubjectProgress ?? []).map(
    (item) => item.subject_id
  )

const { data: academicRecordSubjects, error: academicRecordSubjectsError } =
  academicRecordSubjectIds.length > 0
    ? await supabase
        .from("curriculum_subjects")
        .select(
          "id, level_id, code, name, sort_order, is_required, completion_rule"
        )
        .in("id", academicRecordSubjectIds)
    : { data: [], error: null }
  if (academicRecordSubjectsError) throw academicRecordSubjectsError

    const academicRecordSubjectProgressIds =
  (academicRecordSubjectProgress ?? []).map(
    (item) => item.id
  )

const { data: academicRecordComponentProgress, error: academicRecordComponentProgressError } =
  academicRecordSubjectProgressIds.length > 0
    ? await supabase
        .from("student_component_progress")
        .select(
          "id, subject_progress_id, component_id, status, score, started_at, passed_at"
        )
        .in(
          "subject_progress_id",
          academicRecordSubjectProgressIds
        )
    : { data: [], error: null }
  if (academicRecordComponentProgressError) throw academicRecordComponentProgressError


const academicRecordComponentIds =
  (academicRecordComponentProgress ?? []).map(
    (item) => item.component_id
  )

const { data: academicRecordComponents, error: academicRecordComponentsError } =
  academicRecordComponentIds.length > 0
    ? await supabase
        .from("curriculum_subject_components")
        .select(
          "id, subject_id, code, name, sort_order, is_required"
        )
        .in("id", academicRecordComponentIds)
    : { data: [], error: null }
  if (academicRecordComponentsError) throw academicRecordComponentsError

  const { data: subjectProgressRows, error: subjectProgressRowsError } = currentLevelProgress?.id
    ? await supabase
        .from('student_subject_progress')
        .select('id, subject_id, status')
        .eq('level_progress_id', currentLevelProgress.id)
    : { data: [], error: null }
  if (subjectProgressRowsError) throw subjectProgressRowsError


  const { data: subjectDefinitions, error: subjectError } = currentLevel
    ? await supabase.from('curriculum_subjects')
      .select('id, name, sort_order, is_required, status, completion_rule')
      .eq('level_id', currentLevel.id).eq('status', 'ACTIVE')
    : { data: [], error: null }
  if (subjectError) throw subjectError
  const subjectProgress = (subjectDefinitions ?? []).map((subject) => {
    const row = (subjectProgressRows ?? []).find(row => row.subject_id === subject.id)
    return { id: row?.id ?? subject.id, hasProgress: !!row, status: row?.status ?? 'NOT_STARTED', subject }
  })
  const subjectProgressIds = subjectProgress.map(
    (item) => item.id
  )

  const { data: componentProgressRows, error: componentProgressRowsError } =
    subjectProgressIds.length > 0
      ? await supabase
          .from('student_component_progress')
          .select('id, subject_progress_id, component_id, status')
          .in('subject_progress_id', subjectProgressIds)
      : { data: [], error: null }
  if (componentProgressRowsError) throw componentProgressRowsError


  const { data: componentDefinitions, error: componentError } = subjectProgress.length
    ? await supabase.from('curriculum_subject_components')
      .select('id, subject_id, name, sort_order, is_required, status')
      .in('subject_id', subjectProgress.map(item => item.subject.id)).eq('status', 'ACTIVE')
    : { data: [], error: null }
  if (componentError) throw componentError
  const componentsBySubjectProgressId = new Map(subjectProgress.map(item => [item.id,
    (componentDefinitions ?? []).filter(component => component.subject_id === item.subject.id)
      .sort((a, b) => a.sort_order - b.sort_order).map(component => {
        const row = (componentProgressRows ?? []).find(row => row.subject_progress_id === item.id && row.component_id === component.id)
        return { id: row?.id ?? component.id, hasProgress: !!row, status: row?.status ?? 'NOT_STARTED', component }
      })
  ]))
      const subjectProgressWithComponents = subjectProgress.map(
        (item) => ({
          ...item,
          components:
            componentsBySubjectProgressId.get(item.id) ?? [],
        })
      )
      const sortedSubjectProgress = [...subjectProgressWithComponents].sort(
    (a, b) =>
      (a.subject?.sort_order ?? 0) -
      (b.subject?.sort_order ?? 0)
  )


  const gradePercent = gradeProgressPercent(currentLevelProgress?.status ?? 'NOT_STARTED',
    sortedSubjectProgress.map(item => ({ ...item.subject, progressStatus: item.status,
      components: item.components.map(c => ({ ...c.component, progressStatus: c.status })) })))
  const inProgressLevels = (academicRecordLevelProgress ?? []).filter(row => row.status === 'IN_PROGRESS')
  const inconsistent = inProgressLevels.length > 1 || (inProgressLevels.length === 1 && inProgressLevels[0].level_id !== enrollment.current_level_id)
  const canEdit = !inconsistent && enrollment.status === 'ACTIVE' && currentLevelProgress?.status === 'IN_PROGRESS'
return (<div className="space-y-5">            <div className="rounded-xl border border-gray-200 bg-white p-5">
  <p className="text-sm font-semibold text-gray-950">
    Lộ trình học tập — {curriculum?.name} {enrollment.is_primary ? "· Chương trình chính" : ""}
    <span className="ml-2 text-sm text-gray-500">{displayLabel(enrollment.status)}</span>
  </p>
  {availableLevel && availableLevelProgress && (
  <div className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-gray-950">
          Bậc tiếp theo
        </p>

        <p className="mt-1 text-sm text-gray-500">
          {availableLevel.name}
        </p>
      </div>

      <span className="mt-2 w-fit rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 sm:mt-0">
        Sẵn sàng bắt đầu
      </span>
    </div>

    {enrollment.status === 'ACTIVE' && !inconsistent && inProgressLevels.length === 0 && <form
      action={startStudentAcademicLevel}
      className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <input
        type="hidden"
        name="student_id"
        value={student.id}
      />

      <input
        type="hidden"
        name="enrollment_id"
        value={enrollment.id}
      />

      <input
        type="hidden"
        name="level_id"
        value={availableLevel.id}
      />

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Ngày bắt đầu
        </label>

        <input
          type="date"
          name="started_at"
          max={vietnamToday()}
          required
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
        />
      </div>

      <button
        type="submit"
        className="rounded-lg bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
      >
        Bắt đầu {availableLevel.name}
      </button>
    </form>}
  </div>
)}
  <p className="mt-2 text-sm text-gray-500">
    {curriculum?.name ?? "Chưa có chương trình"} •{' '}
    {currentLevel?.name ?? "Chưa có bậc học"} — {displayLabel(currentLevelProgress?.status ?? "NOT_STARTED")}
  </p>

  {inconsistent && <p role="alert" className="mt-2 text-sm text-red-700">Dữ liệu bậc đang học không khớp. Cần kiểm tra trước khi cập nhật.</p>}
  <div className="mt-4">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-gray-700">
        Tiến độ bậc học
      </p>

      <p className="text-sm font-semibold text-gray-950">
      {gradePercent === null ? "Chưa xác nhận hoàn thành" : `${gradePercent}%`}
      </p>
    </div>

    {gradePercent !== null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-gray-900"
        style={{
          width: `${gradePercent}%`,
        }}
      />
    </div>}
  </div>

  <details className="group mt-5">
  <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
    <span>Môn học & Học phần</span>

    <span className="text-xs font-medium text-gray-500">
      <span className="group-open:hidden">
        Mở rộng ▼
      </span>

      <span className="hidden group-open:inline">
        Thu gọn ▲
      </span>
    </span>
  </summary>

  <div className="mt-3 space-y-2">
    {sortedSubjectProgress.map((item) => (
  <div
    key={item.id}
    className="overflow-hidden rounded-lg border border-gray-200"
  >
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <p className="text-sm font-medium text-gray-800">
        {item.subject.name}{!item.subject.is_required && " (Tùy chọn)"}
      </p>

      {canEdit && item.hasProgress && item.subject.completion_rule !== 'ALL_REQUIRED_COMPONENTS' ? (
  <form
    action={updateDirectSubjectProgressStatus}
    className="flex items-center gap-2"
  >
    <input
      type="hidden"
      name="progress_id"
      value={item.id}
    />

    <input
      type="hidden"
      name="student_id"
      value={student.id}
    />

    <select
      key={`${item.id}-${item.status}`}
      name="status"
      defaultValue={item.status}
      className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${getProgressStatusClasses(
        item.status
      )}`}
    >
      <option value="NOT_STARTED">Chưa bắt đầu</option>
      <option value="IN_PROGRESS">Đang học</option>
      <option value="PASS">Đạt</option>
      <option value="NOT_PASSED">Chưa đạt</option>
      <option value="EXEMPT">Được miễn</option>
    </select>

    <button
      type="submit"
      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      Lưu
    </button>
  </form>
) : (

  <span
    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
      item.status === 'PASS' || item.status === 'EXEMPT'
        ? 'bg-green-50 text-green-700'
        : item.status === 'IN_PROGRESS'
          ? 'bg-amber-50 text-amber-700'
          : item.status === 'NOT_PASSED'
            ? 'bg-red-50 text-red-700'
            : 'bg-gray-100 text-gray-600'
    }`}
  >
    {displayLabel(item.status)}
  </span>
)}
    </div>

    {item.components.length > 0 && (
  <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
    <div className="space-y-1.5">
      {item.components.map((componentItem) => (
        <div
          key={componentItem.id}
          className="flex items-center justify-between gap-4 rounded-md px-3 py-2"
        >
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />

            <p className="text-sm text-gray-600">
              {componentItem.component?.name ??
                "Học phần chưa có tên"}{!componentItem.component.is_required && " (Tùy chọn)"}
            </p>
          </div>

          {canEdit && componentItem.hasProgress && item.subject.completion_rule === 'ALL_REQUIRED_COMPONENTS' ? <form
            action={updateComponentProgressStatus}
            className="flex items-center gap-2"
          >
            <input
              type="hidden"
              name="progress_id"
              value={componentItem.id}
            />

            <input
              type="hidden"
              name="student_id"
              value={student.id}
            />


              <select
              key={`${componentItem.id}-${componentItem.status}`}
              name="status"
              defaultValue={componentItem.status}
              className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${getProgressStatusClasses(
                componentItem.status
              )}`}
            >
              <option value="NOT_STARTED">
                Chưa bắt đầu
              </option>
              <option value="IN_PROGRESS">
                Đang học
              </option>
              <option value="PASS">
                Đạt
              </option>
              <option value="NOT_PASSED">
                Chưa đạt
              </option>
              <option value="EXEMPT">
                Được miễn
              </option>
            </select>

            <button
              type="submit"
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Lưu
            </button>
          </form> : <span className="text-xs">{displayLabel(componentItem.status)}</span>}
        </div>
      ))}
    </div>
  </div>
)}
  </div>
))}
</div>
</details>
</div>

<div className="rounded-xl border border-gray-200 bg-white p-5">
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-gray-950">
        Hồ sơ học tập
      </p>

      <p className="mt-1 text-sm text-gray-500">
        {curriculum?.name ?? "Chương trình học"}
      </p>
    </div>

    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">
      Chỉ xem
    </span>
  </div>

  <div className="mt-5 space-y-4">
    {(academicRecordLevelProgress ?? [])
      .filter((levelProgress) =>
        ["IN_PROGRESS", "COMPLETED"].includes(
          levelProgress.status
        )
      )
      .sort((a, b) => {
        const levelA = (academicRecordLevels ?? []).find(
          (level) => level.id === a.level_id
        )

        const levelB = (academicRecordLevels ?? []).find(
          (level) => level.id === b.level_id
        )

        return (
          (levelA?.sequence_no ?? 0) -
          (levelB?.sequence_no ?? 0)
        )
      })
      .map((levelProgress) => {
        const level = (academicRecordLevels ?? []).find(
          (item) => item.id === levelProgress.level_id
        )

        const subjectRows =
        (academicRecordSubjectProgress ?? [])
          .filter(
            (subjectProgress) =>
              subjectProgress.level_progress_id ===
              levelProgress.id
          )
          .sort((a, b) => {
            const subjectA = (
              academicRecordSubjects ?? []
            ).find(
              (subject) =>
                subject.id === a.subject_id
            )

            const subjectB = (
              academicRecordSubjects ?? []
            ).find(
              (subject) =>
                subject.id === b.subject_id
            )



              return (
                (subjectA?.sort_order ?? 0) -
                (subjectB?.sort_order ?? 0)
              )
            })

        return (
          <details
            key={levelProgress.id}
            open={levelProgress.status === "IN_PROGRESS"}
            className="rounded-lg border border-gray-200"
          >
            <summary className="cursor-pointer list-none px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-950">
                    {level?.name ?? "Bậc học"}
                  </p>

                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {levelProgress.started_at && (
                      <span>
                        Bắt đầu:{" "}
                        {new Date(
                          levelProgress.started_at
                        ).toLocaleDateString("vi-VN", {
                          timeZone:
                            "Asia/Ho_Chi_Minh",
                        })}
                      </span>
                    )}

                    {levelProgress.completed_at && (
                      <span>
                        Hoàn thành:{" "}
                        {new Date(
                          levelProgress.completed_at
                        ).toLocaleDateString("vi-VN", {
                          timeZone:
                            "Asia/Ho_Chi_Minh",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <span
                  className={
                    levelProgress.status === "COMPLETED"
                      ? "w-fit rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700"
                      : "w-fit rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
                  }
                >
                  {levelProgress.status === "COMPLETED"
                    ? "Đã hoàn thành"
                    : "Đang học"}
                </span>
              </div>
            </summary>

            <div className="border-t border-gray-100 px-4 py-3">
  {subjectRows.length > 0 ? (
    <div className="divide-y divide-gray-100">
      {subjectRows.map((subjectProgress) => {
        const subject = (
          academicRecordSubjects ?? []
        ).find(
          (item) =>
            item.id === subjectProgress.subject_id
        )

        const componentRows =
          (academicRecordComponentProgress ?? [])
            .filter(
              (componentProgress) =>
                componentProgress.subject_progress_id ===
                subjectProgress.id
            )
            .sort((a, b) => {
              const componentA = (
                academicRecordComponents ?? []
              ).find(
                (component) =>
                  component.id === a.component_id
              )

              const componentB = (
                academicRecordComponents ?? []
              ).find(
                (component) =>
                  component.id === b.component_id
              )

              return (
                (componentA?.sort_order ?? 0) -
                (componentB?.sort_order ?? 0)
              )
            })

        return (
          <div
            key={subjectProgress.id}
            className="py-3"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {subject?.name ?? "Môn học"}
                </p>

                {subjectProgress.score != null && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    Điểm: {subjectProgress.score}
                  </p>
                )}
              </div>

              <span
                className={
                  subjectProgress.status === "PASS"
                    ? "text-xs font-semibold text-green-700"
                    : subjectProgress.status === "IN_PROGRESS"
                      ? "text-xs font-semibold text-amber-700"
                      : subjectProgress.status === "NOT_PASSED"
                        ? "text-xs font-semibold text-red-700"
                        : subjectProgress.status === "EXEMPT"
                          ? "text-xs font-semibold text-blue-700"
                          : "text-xs font-semibold text-gray-500"
                }
              >
                {displayLabel(subjectProgress.status)}
              </span>
            </div>

            {componentRows.length > 0 && (
              <div className="mt-3 space-y-2 border-l-2 border-gray-100 pl-4">
                {componentRows.map((componentProgress) => {
                  const component = (
                    academicRecordComponents ?? []
                  ).find(
                    (item) =>
                      item.id === componentProgress.component_id
                  )

                  return (
                    <div
                      key={componentProgress.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <p className="text-xs text-gray-600">
                        {component?.name ?? "Component"}
                      </p>

                      <span
                        className={
                          componentProgress.status === "PASS"
                            ? "text-xs font-semibold text-green-700"
                            : componentProgress.status === "IN_PROGRESS"
                              ? "text-xs font-semibold text-amber-700"
                              : componentProgress.status === "NOT_PASSED"
                                ? "text-xs font-semibold text-red-700"
                                : componentProgress.status === "EXEMPT"
                                  ? "text-xs font-semibold text-blue-700"
                                  : "text-xs font-semibold text-gray-400"
                        }
                      >
                        {displayLabel(componentProgress.status)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  ) : (
    <p className="text-sm text-gray-500">
      Chưa có lịch sử môn học.
    </p>
  )}
</div>
</details>
)
})}
</div>
</div>
</div>)
}
