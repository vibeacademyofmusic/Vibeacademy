import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import {
    createCurriculumSubjectComponent,
    setCurriculumSubjectComponentStatus,
  } from '../../../../../actions'
type SubjectDetailPageProps = {
  params: Promise<{
    id: string
    levelId: string
    subjectId: string
  }>
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function SubjectDetailPage({
  params,
  searchParams,
}: SubjectDetailPageProps) {
  const { id, levelId, subjectId } = await params
  const { error, success } = await searchParams

  const supabase = await createClient()

  const { data: curriculum } = await supabase
    .from('curriculums')
    .select('id, code, name')
    .eq('id', id)
    .maybeSingle()

  if (!curriculum) {
    notFound()
  }

  const { data: level } = await supabase
    .from('curriculum_levels')
    .select('id, curriculum_id, code, name')
    .eq('id', levelId)
    .eq('curriculum_id', curriculum.id)
    .maybeSingle()

  if (!level) {
    notFound()
  }

  const { data: subject } = await supabase
    .from('curriculum_subjects')
    .select(
      'id, level_id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status'
    )
    .eq('id', subjectId)
    .eq('level_id', level.id)
    .maybeSingle()

  if (!subject) {
    notFound()
  }

  const {
    data: components,
    error: componentsError,
  } = await supabase
    .from('curriculum_subject_components')
    .select(
      'id, subject_id, code, name, is_required, sort_order, status'
    )
    .eq('subject_id', subject.id)
    .order('sort_order', { ascending: true })

  const nextSortOrder =
    components && components.length > 0
      ? Math.max(
          ...components.map((component) => component.sort_order)
        ) + 1
      : 1

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/admin/academic/${curriculum.id}/levels/${level.id}`}
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          ← Back to {level.name}
        </Link>
      </div>

      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          {curriculum.name} · {level.name}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">
            {subject.name}
          </h1>

          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              subject.status === 'ACTIVE'
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {subject.status}
          </span>

          {subject.is_required && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              REQUIRED
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
          <span>Code: {subject.code}</span>
          <span>Family: {subject.family_code}</span>

          {subject.subject_level !== null && (
            <span>Level: {subject.subject_level}</span>
          )}

          <span>
            Completion: {subject.completion_rule}
          </span>
        </div>
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
            Add Component
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Add a component to {subject.name}.
          </p>

          <form
            action={createCurriculumSubjectComponent}
            className="mt-6 space-y-5"
          >
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
              name="subject_id"
              value={subject.id}
            />

            <div>
              <label
                htmlFor="code"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Component Code *
              </label>

              <input
                id="code"
                name="code"
                required
                placeholder="BAROQUE"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />

              <p className="mt-1 text-xs text-gray-400">
                Example: BAROQUE, SCALES, ETUDES
              </p>
            </div>

            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Component Name *
              </label>

              <input
                id="name"
                name="name"
                required
                placeholder="Baroque Repertoire"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="sort_order"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Order *
              </label>

              <input
                id="sort_order"
                name="sort_order"
                type="number"
                min="0"
                required
                defaultValue={nextSortOrder}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="is_required"
                value="true"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300"
              />

              <span className="text-sm font-medium text-gray-700">
                Required component
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Create Component
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Components
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {components?.length ?? 0} components in {subject.name}
            </p>
          </div>

          {componentsError ? (
            <div className="p-6 text-sm text-red-600">
              Could not load components.
            </div>
          ) : !components || components.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                No components yet
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Create the first component using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {components.map((component) => (
  <div
    key={component.id}
    className="flex items-center justify-between gap-6 px-6 py-5"
  >
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold text-gray-950">
          {component.name}
        </p>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            component.status === 'ACTIVE'
              ? 'bg-green-50 text-green-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {component.status}
        </span>

        {component.is_required && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            REQUIRED
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span>Code: {component.code}</span>
        <span>Order: {component.sort_order}</span>
      </div>
    </div>

    <div className="flex items-center gap-2">
  <Link
    href={`/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}/components/${component.id}/edit`}
    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
  >
    Edit
  </Link>

  <form action={setCurriculumSubjectComponentStatus}>
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
      name="subject_id"
      value={subject.id}
    />

    <input
      type="hidden"
      name="component_id"
      value={component.id}
    />

    <input
      type="hidden"
      name="status"
      value={
        component.status === 'ACTIVE'
          ? 'INACTIVE'
          : 'ACTIVE'
      }
    />

    <button
      type="submit"
      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      {component.status === 'ACTIVE'
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