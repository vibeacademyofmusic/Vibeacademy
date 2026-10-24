import { notFound } from 'next/navigation'
import { AcademicTrail } from '@/app/admin/programs/trail'

import { createClient } from '@/lib/supabase/server'
import { updateCurriculumLevel } from '../../../../actions'

type EditLevelPageProps = {
  params: Promise<{
    id: string
    levelId: string
  }>
  searchParams: Promise<{
    error?: string
  }>
}

export default async function EditLevelPage({
  params,
  searchParams,
}: EditLevelPageProps) {
  const { id, levelId } = await params
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
    .select(
      'id, curriculum_id, code, name, sequence_no, level_number, level_type, completion_rule, status'
    )
    .eq('id', levelId)
    .eq('curriculum_id', curriculum.id)
    .maybeSingle()

  if (!level) {
    notFound()
  }

  return (
    <div>
      <AcademicTrail items={[
        { label: curriculum.name, href: `/admin/academic/${curriculum.id}` },
        { label: level.name, href: `/admin/academic/${curriculum.id}/levels/${level.id}` },
        { label: 'Chỉnh sửa cấp độ' },
      ]} />

      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">
          {curriculum.name}
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-950">
          Chỉnh sửa cấp độ
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          Update {level.name}.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6">
        <form
          action={updateCurriculumLevel}
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

          <div>
            <label
              htmlFor="code"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Mã cấp độ *
            </label>

            <input
              id="code"
              name="code"
              required
              defaultValue={level.code}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Tên cấp độ *
            </label>

            <input
              id="name"
              name="name"
              required
              defaultValue={level.name}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="level_type"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Loại cấp độ *
            </label>

            <select
              id="level_type"
              name="level_type"
              defaultValue={level.level_type}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            >
              <option value="FOUNDATION">
                Nền tảng
              </option>

              <option value="GRADE">
                Cấp độ
              </option>

              <option value="DIPLOMA">
                Văn bằng
              </option>

              <option value="OTHER">
                Khác
              </option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="sequence_no"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Thứ tự *
              </label>

              <input
                id="sequence_no"
                name="sequence_no"
                type="number"
                min="1"
                required
                defaultValue={level.sequence_no}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="level_number"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Số cấp
              </label>

              <input
                id="level_number"
                name="level_number"
                type="number"
                min="0"
                defaultValue={level.level_number ?? ''}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="completion_rule"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Cách hoàn thành
            </label>

            <select
              id="completion_rule"
              name="completion_rule"
              defaultValue={level.completion_rule}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
            >
              <option value="ALL_REQUIRED_SUBJECTS">
                Hoàn thành mọi môn bắt buộc
              </option>

              <option value="MANUAL">
                Thủ công
              </option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-gray-950 px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Lưu thay đổi
          </button>
        </form>
      </section>
    </div>
  )
}