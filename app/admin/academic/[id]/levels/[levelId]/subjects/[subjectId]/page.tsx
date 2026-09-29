import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppPage, InlineNotice, MetricCard, PageHeader, SectionCard, StatusBadge } from '@/app/admin/_components/vibe'
import { AcademicTrail } from '@/app/admin/programs/trail'
import { componentRuleLabel, requirementLabel, statusLabel, statusTone, subjectAcademicValid, subjectCompletionLabel, subjectContentReady, contentReadinessLabel } from '@/app/admin/programs/model'
import { LessonOperator } from '@/app/admin/academic/lesson-operator'
import { loadPaged } from '@/app/admin/programs/data'

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
    lessons?: string
  }>
}

export default async function SubjectDetailPage({
  params,
  searchParams,
}: SubjectDetailPageProps) {
  const { id, levelId, subjectId } = await params
  const { error, success, lessons: lessonFilter } = await searchParams

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
    'id, subject_id, code, name, is_required, sort_order, status, completion_rule'
  )
    .eq('subject_id', subject.id)
    .order('sort_order', { ascending: true })

  const nextSortOrder =
    components && components.length > 0
      ? Math.max(
          ...components.map((component) => component.sort_order)
        ) + 1
      : 1

  const componentIds = (components ?? []).map(component => component.id)
  const { data: lessons } = componentIds.length
    ? await loadPaged<{ id: string; component_id: string; code: string; name: string; sort_order: number; is_required: boolean; status: string }>((from, to) => supabase
      .from('curriculum_component_items')
      .select('id, component_id, code, name, sort_order, is_required, status')
      .in('component_id', componentIds)
      .order('sort_order', { ascending: true })
      .range(from, to))
    : { data: [] as { id: string; component_id: string; code: string; name: string; sort_order: number; is_required: boolean; status: string }[] }
  const lessonRows = lessons ?? []
  const componentRows = components ?? []
  const health = {
    status: subject.status,
    completionRule: subject.completion_rule,
    activeLessonCount: lessonRows.filter(lesson => lesson.status === 'ACTIVE').length,
    components: componentRows.map(component => ({
      status: component.status,
      isRequired: component.is_required,
      completionRule: component.completion_rule,
      requiredActiveLessons: lessonRows.filter(lesson => lesson.component_id === component.id && lesson.status === 'ACTIVE' && lesson.is_required).length,
    })),
  }
  const structureReady = subjectAcademicValid(health)
  const contentReady = subjectContentReady(health)

  return (
    <AppPage>
      <AcademicTrail items={[
        { label: curriculum.name, href: `/admin/academic/${curriculum.id}` },
        { label: level.name, href: `/admin/academic/${curriculum.id}/levels/${level.id}` },
        { label: subject.name },
      ]} />

      <PageHeader
        title={subject.name}
        description={`${curriculum.name} · ${level.name}`}
        actions={<Link className="vibe-button" href={`/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}/edit`}>Chỉnh sửa môn học</Link>}
      />
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={statusTone(subject.status)}>{statusLabel(subject.status)}</StatusBadge>
        <StatusBadge tone="info">{requirementLabel(subject.is_required)}</StatusBadge>
        <StatusBadge tone={structureReady ? 'success' : 'warning'}>{structureReady ? 'Đủ cấu trúc học thuật' : 'Cần bổ sung cấu trúc học thuật'}</StatusBadge>
        <StatusBadge tone={contentReady ? 'success' : 'neutral'}>{contentReadinessLabel(contentReady) ?? 'Đủ nội dung Lesson'}</StatusBadge>
      </div>
      <div className="vibe-metrics">
        <MetricCard title="Cách hoàn thành" value={subjectCompletionLabel(subject.completion_rule)} />
        <MetricCard title="Nhóm đánh giá" value={String(componentRows.filter(component => component.status === 'ACTIVE').length)} />
        <MetricCard title="Lesson đang hoạt động" value={String(health.activeLessonCount)} />
      </div>
      <SectionCard title="Thông tin môn học">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Mã</dt><dd>{subject.code}</dd></div>
          <div><dt className="text-gray-500">Nhóm môn</dt><dd>{subject.family_code}</dd></div>
        </dl>
      </SectionCard>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {success ? <InlineNotice>{success}</InlineNotice> : null}

      <LessonOperator
        curriculumId={curriculum.id}
        levelId={level.id}
        subjectId={subject.id}
        completionRule={subject.completion_rule}
        components={componentRows}
        lessons={lessonRows}
        showRetired={lessonFilter === 'all'}
      />

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 id="cau-truc-noi-bo" className="text-lg font-semibold text-gray-950">
            Cấu trúc nội bộ
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Thêm nhóm đánh giá cho {subject.name}.
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
                Mã nhóm đánh giá *
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
                Tên nhóm đánh giá *
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
                Thứ tự *
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

            <div>
              <label htmlFor="completion_rule" className="mb-2 block text-sm font-medium text-gray-700">
                Cách hoàn thành *
              </label>
              <select
                id="completion_rule"
                name="completion_rule"
                required
                defaultValue=""
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 outline-none focus:border-gray-900"
              >
                <option value="" disabled>Chọn cách hoàn thành</option>
                <option value="DIRECT_ASSESSMENT">Đánh giá trực tiếp</option>
                <option value="ALL_REQUIRED_ITEMS">Hoàn thành từ Lesson bắt buộc</option>
              </select>
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
                Nhóm đánh giá bắt buộc
              </span>
            </label>

            <button
              type="submit"
              className="w-full rounded-lg bg-gray-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Tạo nhóm đánh giá
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-gray-950">
              Nhóm đánh giá
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {components?.length ?? 0} nhóm trong {subject.name}
            </p>
          </div>

          {componentsError ? (
            <div className="p-6 text-sm text-red-600">
              Không tải được nhóm đánh giá.
            </div>
          ) : !components || components.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-gray-700">
                Chưa có nhóm đánh giá
              </p>

              <p className="mt-1 text-sm text-gray-400">
                Tạo nhóm đánh giá đầu tiên bằng biểu mẫu.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {components.map((component) => (

  <div
  key={component.id}
  className="px-6 py-5"
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
            Bắt buộc
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span>Mã: {component.code}</span>
        <span>Thứ tự: {component.sort_order}</span>
        <span>{componentRuleLabel(component.completion_rule)}</span>
      </div>
    </div>

    <div className="flex items-center gap-2">
  <Link
    href={`/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}/components/${component.id}/edit`}
    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
  >
    Chỉnh sửa
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
        ? 'Ngừng hoạt động'
        : 'Kích hoạt'}
    </button>
  </form>
</div>
  </div>
))}
            </div>
          )}
        </section>
      </div>
    </AppPage>
  )
}