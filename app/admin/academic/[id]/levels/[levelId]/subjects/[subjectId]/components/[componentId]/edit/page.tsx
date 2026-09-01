import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { updateCurriculumSubjectComponent } from '@/app/admin/academic/actions'

type EditComponentPageProps = {
  params: Promise<{
    id: string
    levelId: string
    subjectId: string
    componentId: string
  }>
  searchParams: Promise<{
    error?: string
  }>
}

export default async function EditComponentPage({
  params,
  searchParams,
}: EditComponentPageProps) {
  const {
    id,
    levelId,
    subjectId,
    componentId,
  } = await params

  const { error } = await searchParams

  const supabase = await createClient()

  const { data: curriculum } = await supabase
    .from('curriculums')
    .select('id, name')
    .eq('id', id)
    .maybeSingle()

  if (!curriculum) {
    notFound()
  }

  const { data: level } = await supabase
    .from('curriculum_levels')
    .select('id, name')
    .eq('id', levelId)
    .eq('curriculum_id', curriculum.id)
    .maybeSingle()

  if (!level) {
    notFound()
  }

  const { data: subject } = await supabase
    .from('curriculum_subjects')
    .select('id, name')
    .eq('id', subjectId)
    .eq('level_id', level.id)
    .maybeSingle()

  if (!subject) {
    notFound()
  }

  const { data: component } = await supabase
    .from('curriculum_subject_components')
    .select(
      'id, subject_id, code, name, is_required, sort_order, status'
    )
    .eq('id', componentId)
    .eq('subject_id', subject.id)
    .maybeSingle()

  if (!component) {
    notFound()
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}`}
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          ← Back to {subject.name}
        </Link>
      </div>

      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          {curriculum.name} · {level.name} · {subject.name}
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Edit Component
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Update {component.name}.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6">
        <form
          action={updateCurriculumSubjectComponent}
          className="space-y-5"
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

          <input
            type="hidden"
            name="component_id"
            value={component.id}
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
              defaultValue={component.code}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
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
              defaultValue={component.name}
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
              defaultValue={component.sort_order}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="is_required"
              value="true"
              defaultChecked={component.is_required}
              className="h-4 w-4 rounded border-gray-300"
            />

            <span className="text-sm font-medium text-gray-700">
              Required component
            </span>
          </label>

          <button
            type="submit"
            className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Save Changes
          </button>
        </form>
      </section>
    </div>
  )
}