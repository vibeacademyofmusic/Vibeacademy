import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { updateCurriculum } from '../../actions'

type EditCurriculumPageProps = {
  params: Promise<{
    id: string
  }>
  searchParams: Promise<{
    error?: string
    success?: string
  }>
}

export default async function EditCurriculumPage({
  params,
  searchParams,
}: EditCurriculumPageProps) {
  const { id } = await params
  const { error, success } = await searchParams

  const supabase = await createClient()

  const {
    data: curriculum,
    error: curriculumError,
  } = await supabase
    .from('curriculums')
    .select('id, code, name, description, status')
    .eq('id', id)
    .maybeSingle()

  if (curriculumError || !curriculum) {
    notFound()
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/admin/academic/${curriculum.id}`}
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          ← Back to {curriculum.name}
        </Link>
      </div>

      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          Academic
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Edit Curriculum
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Update the curriculum information.
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

      <section className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6">
        <form
          action={updateCurriculum}
          className="space-y-5"
        >
          <input
            type="hidden"
            name="id"
            value={curriculum.id}
          />

          <div>
            <label
              htmlFor="code"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Curriculum Code *
            </label>

            <input
              id="code"
              name="code"
              required
              maxLength={30}
              defaultValue={curriculum.code}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Curriculum Name *
            </label>

            <input
              id="name"
              name="name"
              required
              defaultValue={curriculum.name}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Description
            </label>

            <textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={curriculum.description ?? ''}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </div>

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