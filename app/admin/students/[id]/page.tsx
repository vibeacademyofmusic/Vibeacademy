import Link from 'next/link'
import { notFound } from 'next/navigation'

import { updateStudent } from '../actions'
import { createClient } from '@/lib/supabase/server'

type EditStudentPageProps = {
  params: Promise<{
    id: string
  }>

  searchParams: Promise<{
    error?: string
  }>
}

export default async function EditStudentPage({
  params,
  searchParams,
}: EditStudentPageProps) {
  const { id } = await params
  const { error } = await searchParams

  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students')
    .select(`
      id,
      student_code,
      full_name,
      preferred_name,
      default_branch_id,
      date_of_birth,
      gender,
      phone,
      email,
      address,
      admission_date,
      notes,
      status
    `)
    .eq('id', id)
    .single()

  if (!student) {
    notFound()
  }
  const { data: enrollment } = await supabase
  .from('student_curriculum_enrollments')
  .select('id, curriculum_id, current_level_id, status, is_primary, started_at')
  .eq('student_id', student.id)
  .eq('status', 'ACTIVE')
  .eq('is_primary', true)
  .maybeSingle()
  const { data: curriculum } = await supabase
  .from('curriculums')
  .select('id, code, name')
  .eq('id', enrollment?.curriculum_id ?? '')
  .maybeSingle()
  const { data: currentLevel } = await supabase
  .from('curriculum_levels')
  .select('id, code, name, sequence_no')
  .eq('id', enrollment?.current_level_id ?? '')
  .maybeSingle()
  const {
    data: currentLevelProgress,
    error: currentLevelProgressError,
  } = await supabase
    .from('student_level_progress')
    .select('id, status')
    .eq('enrollment_id', enrollment?.id ?? '')
    .eq('level_id', currentLevel?.id ?? '')
    .maybeSingle()
  
  const {
    data: subjectProgressRows,
    error: subjectProgressError,
  } = currentLevelProgress?.id
    ? await supabase
        .from('student_subject_progress')
        .select('id, subject_id, status')
        .eq('level_progress_id', currentLevelProgress.id)
    : { data: [], error: null }
  
  const subjectIds = (subjectProgressRows ?? []).map(
    (row) => row.subject_id
  )
  
  const {
    data: subjectDefinitions,
    error: subjectDefinitionsError,
  } =
    subjectIds.length > 0
      ? await supabase
          .from('curriculum_subjects')
          .select('id, name, sort_order')
          .in('id', subjectIds)
      : { data: [], error: null }
  
  const subjectMap = new Map(
    (subjectDefinitions ?? []).map((subject) => [
      subject.id,
      subject,
    ])
  )
  
  const subjectProgress = (subjectProgressRows ?? []).map(
    (row) => ({
      id: row.id,
      status: row.status,
      subject: subjectMap.get(row.subject_id) ?? null,
    })
  )
  const subjectProgressIds = subjectProgress.map(
    (item) => item.id
  )
  
  const {
    data: componentProgressRows,
    error: componentProgressError,
  } =
    subjectProgressIds.length > 0
      ? await supabase
          .from('student_component_progress')
          .select('id, subject_progress_id, component_id, status')
          .in('subject_progress_id', subjectProgressIds)
      : { data: [], error: null }
  
  const componentIds = (componentProgressRows ?? []).map(
    (row) => row.component_id
  )
  
  const {
    data: componentDefinitions,
    error: componentDefinitionsError,
  } =
    componentIds.length > 0
      ? await supabase
          .from('curriculum_subject_components')
          .select('id, subject_id, name, sort_order')
          .in('id', componentIds)
      : { data: [], error: null }
      const componentDefinitionMap = new Map(
        (componentDefinitions ?? []).map((component) => [
          component.id,
          component,
        ])
      )
      
      const componentsBySubjectProgressId = new Map<
        string,
        Array<{
          id: string
          status: string
          component: {
            id: string
            subject_id: string
            name: string
            sort_order: number
          } | null
        }>
      >()
      
      for (const row of componentProgressRows ?? []) {
        const componentItem = {
          id: row.id,
          status: row.status,
          component:
            componentDefinitionMap.get(row.component_id) ?? null,
        }
      
        const currentItems =
          componentsBySubjectProgressId.get(
            row.subject_progress_id
          ) ?? []
      
        currentItems.push(componentItem)
      
        componentsBySubjectProgressId.set(
          row.subject_progress_id,
          currentItems
        )
      }
      
      for (const items of componentsBySubjectProgressId.values()) {
        items.sort(
          (a, b) =>
            (a.component?.sort_order ?? 0) -
            (b.component?.sort_order ?? 0)
        )
      }
      
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
  
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name, status')
    .order('name')
    const currentBranch = (branches ?? []).find(
        (branch) => branch.id === student.default_branch_id
      )
      
      const completedSubjects = sortedSubjectProgress.filter(
        (item) =>
          item.status === 'PASS' ||
          item.status === 'EXEMPT'
      ).length
      
      const totalSubjects = sortedSubjectProgress.length
      return (
        <div className="max-w-6xl">
          <Link
            href="/admin/students"
            className="text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            ← Back to Students
          </Link>
      
          <div className="mt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Student Profile
                </p>
      
                <h1 className="mt-1 text-3xl font-bold text-gray-950">
                  {student.full_name}
                </h1>
      
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  <span>{student.student_code}</span>
      
                  <span>•</span>
      
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      student.status === 'ACTIVE'
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {student.status}
                  </span>
                </div>
              </div>
            </div>
      
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current Branch
                </p>
      
                <p className="mt-2 font-semibold text-gray-950">
                  {currentBranch?.name ?? 'Not assigned'}
                </p>
              </div>
      
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Admission Date
                </p>
      
                <p className="mt-2 font-semibold text-gray-950">
                  {student.admission_date ?? '—'}
                </p>
              </div>
      
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current Program
                </p>
      
                <p className="mt-2 font-semibold text-gray-950">
                {curriculum?.name ?? 'Not configured yet'}
                </p>
              </div>
      
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Current Grade
                </p>
      
                <p className="mt-2 font-semibold text-gray-950">
                {currentLevel?.name ?? 'Not configured yet'}
                </p>
              </div>
            </div>
      
            <div className="rounded-xl border border-gray-200 bg-white p-5">
  <p className="text-sm font-semibold text-gray-950">
    Academic Journey
  </p>

  <p className="mt-2 text-sm text-gray-500">
    {curriculum?.name ?? 'No program'} •{' '}
    {currentLevel?.name ?? 'No grade'}
  </p>

  <div className="mt-4">
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-gray-700">
        Grade Progress
      </p>

      <p className="text-sm font-semibold text-gray-950">
        {completedSubjects} / {totalSubjects}
      </p>
    </div>

    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-gray-900"
        style={{
          width:
            totalSubjects > 0
              ? `${(completedSubjects / totalSubjects) * 100}%`
              : '0%',
        }}
      />
    </div>
  </div>

  <div className="mt-5 space-y-2">
  {sortedSubjectProgress.map((item) => (
  <div
    key={item.id}
    className="overflow-hidden rounded-lg border border-gray-200"
  >
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <p className="text-sm font-medium text-gray-800">
        {item.subject?.name ?? 'Unnamed Subject'}
      </p>

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
        {item.status.replaceAll('_', ' ')}
      </span>
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
                    'Unnamed Component'}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                  componentItem.status === 'PASS' ||
                  componentItem.status === 'EXEMPT'
                    ? 'bg-green-50 text-green-700'
                    : componentItem.status === 'IN_PROGRESS'
                      ? 'bg-amber-50 text-amber-700'
                      : componentItem.status === 'NOT_PASSED'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-white text-gray-500'
                }`}
              >
                {componentItem.status.replaceAll('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
))
    }
  </div>
</div>
      
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <p className="text-sm font-semibold text-gray-950">
                  Academic Record
                </p>
      
                <p className="mt-2 text-sm text-gray-500">
                  Assessments, grade history and transcript will appear here.
                </p>
              </div>
            </div>
      
            <div className="mt-8">
              <h2 className="text-xl font-semibold text-gray-950">
                Edit Profile
              </h2>
      
              <p className="mt-1 text-sm text-gray-500">
                Update personal and contact information.
              </p>
            </div>

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        action={updateStudent}
        className="mt-8 space-y-5 rounded-2xl border border-gray-200 bg-white p-6"
      >
        <input type="hidden" name="id" value={student.id} />

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Student Code *
            </label>

            <input
              name="student_code"
              required
              defaultValue={student.student_code}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Full Name *
            </label>

            <input
              name="full_name"
              required
              defaultValue={student.full_name ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Preferred Name
          </label>

          <input
            name="preferred_name"
            defaultValue={student.preferred_name ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Branch *
          </label>

          <select
            name="default_branch_id"
            required
            defaultValue={student.default_branch_id}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
          >
            {(branches ?? []).map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branch.status !== 'ACTIVE'
                  ? ' (Inactive)'
                  : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Date of Birth
            </label>

            <input
              name="date_of_birth"
              type="date"
              defaultValue={student.date_of_birth ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Gender
            </label>

            <select
              name="gender"
              defaultValue={student.gender ?? ''}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
            >
              <option value="">Not specified</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
              <option value="UNSPECIFIED">
                Unspecified
              </option>
            </select>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              Phone
            </label>

            <input
              name="phone"
              defaultValue={student.phone ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              Email
            </label>

            <input
              name="email"
              type="email"
              defaultValue={student.email ?? ''}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Admission Date
          </label>

          <input
            name="admission_date"
            type="date"
            defaultValue={student.admission_date ?? ''}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Address
          </label>

          <textarea
            name="address"
            rows={3}
            defaultValue={student.address ?? ''}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Notes
          </label>

          <textarea
            name="notes"
            rows={4}
            defaultValue={student.notes ?? ''}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5"
          />
        </div>

        <div className="rounded-xl bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Current Status
          </p>

          <p className="mt-1 font-semibold text-gray-900">
            {student.status}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Save Changes
          </button>

          <Link
            href="/admin/students"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}