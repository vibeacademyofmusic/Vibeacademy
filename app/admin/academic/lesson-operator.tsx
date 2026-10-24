import Link from 'next/link'

import {
  createCurriculumLesson,
  reorderCurriculumLesson,
} from '@/app/admin/academic/actions'
import { missingLessonParentMessage, nextLessonCode } from '@/app/admin/academic/lesson-rules'
import { componentRuleLabel, showComponentGroups, statusLabel } from '@/app/admin/programs/model'

export type OperatorComponent = {
  id: string
  name: string
  status: string
  is_required: boolean
  completion_rule: string
}

export type OperatorLesson = {
  id: string
  component_id: string
  code: string
  name: string
  sort_order: number
  status: string
  is_required: boolean
}

function sequenceLabel(index: number) {
  return String(index + 1).padStart(2, '0')
}

function LessonCreateForm({
  curriculumId,
  levelId,
  subjectId,
  componentId,
  components,
  suggestedCode,
  suggestedOrder,
}: {
  curriculumId: string
  levelId: string
  subjectId: string
  componentId?: string
  components: OperatorComponent[]
  suggestedCode: string
  suggestedOrder: number
}) {
  return (
    <form action={createCurriculumLesson} className="mt-4 max-w-xl space-y-4 rounded-xl border border-gray-200 border-l-[3px] border-l-[#ba872d] bg-white p-4">
      <input type="hidden" name="curriculum_id" value={curriculumId} />
      <input type="hidden" name="level_id" value={levelId} />
      <input type="hidden" name="subject_id" value={subjectId} />
      {componentId ? <input type="hidden" name="component_id" value={componentId} /> : null}
      <p className="text-sm font-semibold text-gray-950">Thêm Lesson</p>
      {!componentId ? (
        <div>
          <label htmlFor={`lesson-component-${subjectId}`} className="mb-1 block text-sm font-medium text-gray-700">Nhóm đánh giá *</label>
          <select id={`lesson-component-${subjectId}`} name="component_id" required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Chọn nhóm đánh giá</option>
            {components.map(component => (
              <option key={component.id} value={component.id}>{component.name}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label htmlFor={`lesson-name-${componentId ?? 'new'}`} className="mb-1 block text-sm font-medium text-gray-700">Tên Lesson *</label>
        <input id={`lesson-name-${componentId ?? 'new'}`} name="name" required maxLength={200} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`lesson-code-${componentId ?? 'new'}`} className="mb-1 block text-sm font-medium text-gray-700">Mã Lesson *</label>
          <input id={`lesson-code-${componentId ?? 'new'}`} name="code" required defaultValue={suggestedCode} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor={`lesson-order-${componentId ?? 'new'}`} className="mb-1 block text-sm font-medium text-gray-700">Thứ tự *</label>
          <input id={`lesson-order-${componentId ?? 'new'}`} name="sort_order" type="number" min={1} required defaultValue={suggestedOrder} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label htmlFor={`lesson-status-${componentId ?? 'new'}`} className="mb-1 block text-sm font-medium text-gray-700">Trạng thái *</label>
        <select id={`lesson-status-${componentId ?? 'new'}`} name="status" defaultValue="ACTIVE" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngừng sử dụng</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="is_required" value="true" defaultChecked />
        Bắt buộc
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">Tạo Lesson</button>
        <Link href={`/admin/academic/${curriculumId}/levels/${levelId}/subjects/${subjectId}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Hủy</Link>
      </div>
    </form>
  )
}

function LessonRows({
  curriculumId,
  levelId,
  subjectId,
  lessons,
  scope,
}: {
  curriculumId: string
  levelId: string
  subjectId: string
  lessons: OperatorLesson[]
  scope: 'active' | 'all'
}) {
  return (
    <ul className="mt-3 divide-y divide-gray-100">
      {lessons.map((lesson, index) => (
        <li key={lesson.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 text-sm ${lesson.status === 'INACTIVE' ? 'opacity-60' : ''}`}>
          <div className="min-w-0">
            <p className="font-medium text-gray-950">{sequenceLabel(index)} {lesson.name}</p>
            <p className="mt-1 text-xs text-gray-500">{lesson.code} · {lesson.is_required ? 'Bắt buộc' : 'Tùy chọn'} · {statusLabel(lesson.status)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {index > 0 ? (
              <form action={reorderCurriculumLesson}>
                <input type="hidden" name="curriculum_id" value={curriculumId} />
                <input type="hidden" name="level_id" value={levelId} />
                <input type="hidden" name="subject_id" value={subjectId} />
                <input type="hidden" name="lesson_id" value={lesson.id} />
                <input type="hidden" name="direction" value="up" />
                <input type="hidden" name="scope" value={scope} />
                <button type="submit" className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700" aria-label={`Đưa ${lesson.name} lên`}>↑</button>
              </form>
            ) : null}
            {index < lessons.length - 1 ? (
              <form action={reorderCurriculumLesson}>
                <input type="hidden" name="curriculum_id" value={curriculumId} />
                <input type="hidden" name="level_id" value={levelId} />
                <input type="hidden" name="subject_id" value={subjectId} />
                <input type="hidden" name="lesson_id" value={lesson.id} />
                <input type="hidden" name="direction" value="down" />
                <input type="hidden" name="scope" value={scope} />
                <button type="submit" className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700" aria-label={`Đưa ${lesson.name} xuống`}>↓</button>
              </form>
            ) : null}
            <Link href={`/admin/academic/${curriculumId}/levels/${levelId}/subjects/${subjectId}/lessons/${lesson.id}`} className="text-sm font-medium text-gray-800">Chỉnh sửa</Link>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function LessonOperator({
  curriculumId,
  levelId,
  subjectId,
  completionRule,
  components,
  lessons,
  showRetired,
}: {
  curriculumId: string
  levelId: string
  subjectId: string
  completionRule: string
  components: OperatorComponent[]
  lessons: OperatorLesson[]
  showRetired: boolean
}) {
  const showGroups = showComponentGroups(completionRule, components)
  const scope = showRetired ? 'all' : 'active'
  const visible = lessons.filter(lesson => showRetired || lesson.status === 'ACTIVE')
  const subjectHref = `/admin/academic/${curriculumId}/levels/${levelId}/subjects/${subjectId}`
  const filterHref = showRetired ? subjectHref : `${subjectHref}?lessons=all`
  const soleComponent = components.length === 1 ? components[0] : null

  const listFor = (componentId: string) => visible
    .filter(lesson => lesson.component_id === componentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))

  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-950">{showGroups ? 'Nhóm đánh giá' : 'Lesson'}</h2>
        <Link href={filterHref} className="text-sm font-medium text-gray-700">{showRetired ? 'Chỉ Lesson đang hoạt động' : 'Hiển thị Lesson ngừng sử dụng'}</Link>
      </div>
      {showGroups ? (
        <p className="mt-1 text-sm text-gray-500">Mỗi nhóm đánh giá giữ danh sách Lesson riêng.</p>
      ) : (
        <p className="mt-1 text-sm text-gray-500">{visible.length} Lesson đang hiển thị</p>
      )}
      {components.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm text-gray-700">{completionRule === 'ALL_REQUIRED_COMPONENTS' ? 'Chưa có Nhóm đánh giá.' : 'Chưa có cấu trúc nội bộ để thêm Lesson.'}</p>
          <p className="mt-2 text-sm text-gray-700">{missingLessonParentMessage(completionRule)}</p>
          <a href="#cau-truc-noi-bo" className="mt-3 inline-flex text-sm font-medium text-gray-900">{completionRule === 'ALL_REQUIRED_COMPONENTS' ? 'Tạo Nhóm đánh giá' : 'Mở Cấu trúc nội bộ'}</a>
        </div>
      ) : showGroups ? components.map(component => {
        const own = listFor(component.id)
        return (
          <div key={component.id} className="mt-5">
            <p className="font-medium text-gray-950">{component.name}</p>
            <p className="mt-1 text-xs text-gray-500">{componentRuleLabel(component.completion_rule)} · {component.is_required ? 'Bắt buộc' : 'Tùy chọn'} · {statusLabel(component.status)}</p>
            {own.length === 0 ? <p className="mt-2 text-sm text-gray-500">Chưa có Lesson trong nhóm này.</p> : (
              <LessonRows curriculumId={curriculumId} levelId={levelId} subjectId={subjectId} lessons={own} scope={scope} />
            )}
            <LessonCreateForm
              curriculumId={curriculumId}
              levelId={levelId}
              subjectId={subjectId}
              componentId={component.id}
              components={components}
              suggestedCode={nextLessonCode(lessons.filter(lesson => lesson.component_id === component.id).map(lesson => lesson.code))}
            suggestedOrder={own.length + 1}
          />
          </div>
        )
      }) : (
        <>
          {visible.length === 0 ? <p className="mt-4 text-sm text-gray-500">Chưa có nội dung Lesson.</p> : (
            <LessonRows
              curriculumId={curriculumId}
              levelId={levelId}
              subjectId={subjectId}
              lessons={listFor(soleComponent?.id ?? '').length ? listFor(soleComponent?.id ?? '') : [...visible].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))}
              scope={scope}
            />
          )}
          <LessonCreateForm
            curriculumId={curriculumId}
            levelId={levelId}
            subjectId={subjectId}
            componentId={soleComponent?.id}
            components={components}
            suggestedCode={nextLessonCode((soleComponent ? lessons.filter(lesson => lesson.component_id === soleComponent.id) : lessons).map(lesson => lesson.code))}
            suggestedOrder={visible.length + 1}
          />
        </>
      )}
    </section>
  )
}
