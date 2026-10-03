import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppPage, DataTable, EmptyState, FormField, InlineNotice, MetricCard, PageHeader, SectionCard, SelectField, StatusBadge } from '@/app/admin/_components/vibe'
import { createCurriculumSubject, setCurriculumSubjectStatus } from '@/app/admin/academic/actions'
import { loadPaged } from '@/app/admin/programs/data'
import {
  levelAcademicHealth,
  levelTypeLabel,
  requirementLabel,
  statusLabel,
  statusTone,
  subjectAcademicValid,
  subjectCompletionLabel,
  subjectContentReady,
  type HealthSubject,
} from '@/app/admin/programs/model'
import { AcademicTrail } from '@/app/admin/programs/trail'
import { createClient } from '@/lib/supabase/server'

type SubjectRow = {
  id: string
  family_code: string
  code: string
  name: string
  subject_level: number | null
  is_required: boolean
  completion_rule: string
  sort_order: number
  status: string
}
type ComponentRow = { id: string; subject_id: string; status: string; is_required: boolean; completion_rule: string }
type ItemRow = { id: string; component_id: string; status: string; is_required: boolean }

export default async function LevelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; levelId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id, levelId } = await params
  const { error, success } = await searchParams
  const supabase = await createClient()
  const { data: curriculum } = await supabase.from('curriculums').select('id, code, name').eq('id', id).maybeSingle()
  if (!curriculum) notFound()
  const { data: level } = await supabase
    .from('curriculum_levels')
    .select('id, curriculum_id, code, name, level_number, level_type, completion_rule, status')
    .eq('id', levelId)
    .eq('curriculum_id', curriculum.id)
    .maybeSingle()
  if (!level) notFound()

  const { data: subjects, error: subjectsError } = await supabase
    .from('curriculum_subjects')
    .select('id, family_code, code, name, subject_level, is_required, completion_rule, sort_order, status')
    .eq('level_id', level.id)
    .order('sort_order', { ascending: true })
  const subjectRows = (subjects ?? []) as SubjectRow[]
  const subjectIds = subjectRows.map(subject => subject.id)
  const { data: components } = subjectIds.length
    ? await loadPaged<ComponentRow>((from, to) => supabase.from('curriculum_subject_components').select('id, subject_id, status, is_required, completion_rule').in('subject_id', subjectIds).range(from, to))
    : { data: [] as ComponentRow[] }
  const componentRows = components ?? []
  const componentIds = componentRows.map(component => component.id)
  const { data: lessons } = componentIds.length
    ? await loadPaged<ItemRow>((from, to) => supabase.from('curriculum_component_items').select('id, component_id, status, is_required').in('component_id', componentIds).range(from, to))
    : { data: [] as ItemRow[] }
  const lessonTotals = new Map<string, { active: number; requiredActive: number }>()
  for (const lesson of lessons ?? []) {
    if (lesson.status !== 'ACTIVE') continue
    const current = lessonTotals.get(lesson.component_id) ?? { active: 0, requiredActive: 0 }
    current.active += 1
    if (lesson.is_required) current.requiredActive += 1
    lessonTotals.set(lesson.component_id, current)
  }
  const rows = subjectRows.map(subject => {
    const own = componentRows.filter(component => component.subject_id === subject.id)
    const health: HealthSubject = {
      status: subject.status,
      completionRule: subject.completion_rule,
      activeLessonCount: own.reduce((sum, component) => sum + (lessonTotals.get(component.id)?.active ?? 0), 0),
      components: own.map(component => ({
        status: component.status,
        isRequired: component.is_required,
        completionRule: component.completion_rule,
        requiredActiveLessons: lessonTotals.get(component.id)?.requiredActive ?? 0,
      })),
    }
    return {
      subject,
      componentCount: own.filter(component => component.status === 'ACTIVE').length,
      activeLessonCount: health.activeLessonCount,
      structureReady: subjectAcademicValid(health),
      contentReady: subjectContentReady(health),
    }
  })
  const activeSubjects = rows.filter(row => row.subject.status === 'ACTIVE')
  const levelHealth = levelAcademicHealth({
    status: level.status,
    activeSubjectCount: activeSubjects.length,
    subjects: activeSubjects.map(row => ({
      status: row.subject.status,
      completionRule: row.subject.completion_rule,
      activeLessonCount: row.activeLessonCount,
      components: componentRows.filter(component => component.subject_id === row.subject.id).map(component => ({
        status: component.status,
        isRequired: component.is_required,
        completionRule: component.completion_rule,
        requiredActiveLessons: lessonTotals.get(component.id)?.requiredActive ?? 0,
      })),
    })),
  })
  const nextSortOrder = subjectRows.length ? Math.max(...subjectRows.map(subject => subject.sort_order)) + 1 : 1
  const warnings = rows.filter(row => row.subject.status === 'ACTIVE' && !row.structureReady)

  return (
    <AppPage>
      <AcademicTrail items={[
        { label: curriculum.name, href: `/admin/academic/${curriculum.id}` },
        { label: level.name },
      ]} />
      <PageHeader
        title={level.name}
        description={`${curriculum.name} · ${level.code}`}
        actions={<Link className="vibe-button" href={`/admin/academic/${curriculum.id}/levels/${level.id}/edit`}>Chỉnh sửa cấp độ</Link>}
      />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {success ? <InlineNotice>{success}</InlineNotice> : null}
      <div className="vibe-metrics">
        <MetricCard title="Môn học" value={String(subjectRows.length)} />
        <MetricCard title="Nhóm đánh giá" value={String(rows.reduce((sum, row) => sum + row.componentCount, 0))} />
        <MetricCard title="Lesson đang hoạt động" value={String(rows.reduce((sum, row) => sum + row.activeLessonCount, 0))} />
      </div>
      <SectionCard title="Thông tin cấp độ">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Trạng thái</dt><dd><StatusBadge tone={statusTone(level.status)}>{statusLabel(level.status)}</StatusBadge></dd></div>
          <div><dt className="text-gray-500">Loại</dt><dd>{levelTypeLabel(level.level_type)}</dd></div>
          <div><dt className="text-gray-500">Cách hoàn thành</dt><dd>{subjectCompletionLabel(level.completion_rule)}</dd></div>
          <div><dt className="text-gray-500">Cấu trúc học thuật</dt><dd>{level.status !== 'ACTIVE' ? 'Chưa áp dụng cho học vụ' : levelHealth === 'incomplete' ? 'Cần bổ sung cấu trúc học thuật' : 'Đủ cấu trúc học thuật'}</dd></div>
        </dl>
      </SectionCard>
      {warnings.length > 0 ? (
        <InlineNotice tone="warning">
          {warnings.map(row => row.subject.name).join(', ')} cần bổ sung cấu trúc học thuật.
        </InlineNotice>
      ) : null}
      <SectionCard title="Môn học">
        {subjectsError ? <InlineNotice tone="error">Không tải được môn học.</InlineNotice> : subjectRows.length === 0 ? <EmptyState>Chưa có môn học.</EmptyState> : (
          <DataTable
            headers={['Môn học', 'Bắt buộc', 'Cách hoàn thành', 'Nhóm đánh giá', 'Lesson đang hoạt động', 'Cấu trúc học thuật', 'Sẵn sàng nội dung', 'Tác vụ']}
            rows={rows.map(row => [
              <div key="name"><strong>{row.subject.name}</strong><p className="text-xs text-gray-500">{row.subject.code}</p></div>,
              requirementLabel(row.subject.is_required),
              subjectCompletionLabel(row.subject.completion_rule),
              String(row.componentCount),
              String(row.activeLessonCount),
              row.subject.status !== 'ACTIVE' ? 'Chưa áp dụng cho học vụ' : row.structureReady ? 'Đủ cấu trúc học thuật' : 'Cần bổ sung cấu trúc học thuật',
              row.subject.status !== 'ACTIVE' ? 'Chưa phát hành nội dung' : row.contentReady ? 'Đủ nội dung Lesson' : 'Nội dung Lesson chưa đầy đủ',
              <span key="actions" className="flex flex-wrap gap-2">
                <Link href={`/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${row.subject.id}`}>Mở môn học</Link>
                <Link href={`/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${row.subject.id}/edit`}>Chỉnh sửa</Link>
                <form action={setCurriculumSubjectStatus}>
                  <input type="hidden" name="curriculum_id" value={curriculum.id} />
                  <input type="hidden" name="level_id" value={level.id} />
                  <input type="hidden" name="subject_id" value={row.subject.id} />
                  <input type="hidden" name="status" value={row.subject.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'} />
                  <button className="vibe-button" type="submit">{row.subject.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}</button>
                </form>
              </span>,
            ])}
          />
        )}
      </SectionCard>
      <SectionCard title="Thêm môn học">
        <form action={createCurriculumSubject} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="curriculum_id" value={curriculum.id} />
          <input type="hidden" name="level_id" value={level.id} />
          <FormField label="Nhóm môn" name="family_code" required placeholder="REPERTOIRE" />
          <FormField label="Mã môn học" name="code" required placeholder="REPERTOIRE_1" />
          <FormField label="Tên môn học" name="name" required placeholder="Repertoire 1" />
          <FormField label="Cấp của môn" name="subject_level" type="number" min={0} defaultValue={level.level_number ?? ''} />
          <FormField label="Thứ tự" name="sort_order" type="number" min={0} required defaultValue={nextSortOrder} />
          <SelectField label="Cách hoàn thành" name="completion_rule" required defaultValue="ALL_REQUIRED_COMPONENTS">
            <option value="ALL_REQUIRED_COMPONENTS">Đánh giá theo nhóm đánh giá</option>
            <option value="DIRECT_ASSESSMENT">Đánh giá trực tiếp</option>
          </SelectField>
          <label className="vibe-field flex-row items-center gap-2">
            <input type="checkbox" name="is_required" value="true" defaultChecked />
            <span>Môn học bắt buộc</span>
          </label>
          <button className="vibe-button-primary" type="submit">Tạo môn học</button>
        </form>
      </SectionCard>
    </AppPage>
  )
}
