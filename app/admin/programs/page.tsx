import Link from 'next/link'

import { AppPage, DataTable, EmptyState, FilterBar, FormField, InlineNotice, MetricCard, PageHeader, SectionCard, SelectField, StatusBadge } from '@/app/admin/_components/vibe'
import { createCurriculum, setCurriculumStatus } from '@/app/admin/academic/actions'

import { loadWorkspace, type CourseView, type ProgramView } from './data'
import { statusLabel, statusTone } from './model'

type Filters = {
  view?: string
  q?: string
  status?: string
  gap?: string
  selected?: string
  error?: string
  success?: string
}

function hrefFor(filters: Filters, patch: Filters) {
  const params = new URLSearchParams()
  const next = { ...filters, error: undefined, success: undefined, ...patch }
  for (const [key, value] of Object.entries(next)) if (value) params.set(key, value)
  const query = params.toString()
  return query ? `/admin/programs?${query}` : '/admin/programs'
}

function matchesQuery(name: string, code: string, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return name.toLowerCase().includes(needle) || code.toLowerCase().includes(needle)
}

export default async function ProgramsWorkspacePage({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = await searchParams
  const view = filters.view === 'courses' ? 'courses' : 'programs'
  const workspace = await loadWorkspace()
  const visiblePrograms = workspace.programs.filter(program => {
    if (!matchesQuery(program.name, program.code, filters.q ?? '')) return false
    if (filters.status && program.status !== filters.status) return false
    if (filters.gap === 'no-level' && program.levelCount !== 0) return false
    if (filters.gap === 'level-subject' && program.levelsMissingSubjects === 0) return false
    if (filters.gap === 'lesson' && program.subjectsMissingLessons === 0) return false
    if (filters.gap === 'incomplete' && program.health !== 'incomplete') return false
    return true
  })
  const courses = workspace.courses.filter(course => {
    if (!matchesQuery(course.name, course.code, filters.q ?? '')) return false
    if (filters.status && course.status !== filters.status) return false
    if (filters.gap === 'no-class' && !course.needsClass) return false
    return true
  })
  const selectedProgram = workspace.programs.find(program => program.id === filters.selected)
  const selectedCourse = workspace.courses.find(course => course.id === filters.selected)

  return (
    <AppPage>
      <PageHeader
        title="Chương trình học"
        description="Lộ trình là Chương trình, Trình độ, Môn học, Bài học. Ca dạy là lớp, không gán thêm khóa học."
        actions={<a href="#create-program" className="vibe-button-primary">+ Tạo chương trình</a>}
      />
      {filters.error && <InlineNotice tone="error">{filters.error}</InlineNotice>}
      {filters.success && <InlineNotice>{filters.success}</InlineNotice>}
      {(view === 'programs' ? workspace.failed.programs : workspace.failed.courses) && <InlineNotice tone="error">Không tải được dữ liệu.</InlineNotice>}
      <div className="vibe-metrics">
        {(view === 'programs' ? workspace.metrics.programs : workspace.metrics.courses).map(item => <MetricCard key={item.id} title={item.title} value={item.value} />)}
      </div>
      <SectionCard title="Việc cần làm">
        <FilterBar>
          {(view === 'programs' ? workspace.queue.programs : workspace.queue.courses).map(item => (
            <Link key={item.id} href={hrefFor(filters, { view: view === 'courses' ? 'courses' : undefined, gap: item.hrefGap, selected: undefined })} className="vibe-button">{item.label}</Link>
          ))}
        </FilterBar>
      </SectionCard>
      <form className="vibe-filter" action="/admin/programs">
        {view === 'courses' && <input type="hidden" name="view" value="courses" />}
        <FormField label="Tìm kiếm" name="q" defaultValue={filters.q ?? ''} placeholder={view === 'programs' ? 'Tên hoặc mã chương trình' : 'Tên hoặc mã khóa học'} />
        <SelectField label="Trạng thái" name="status" defaultValue={filters.status ?? ''}>
          <option value="">Mọi trạng thái</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="INACTIVE">Ngừng hoạt động</option>
        </SelectField>
        {view === 'programs' && (
          <SelectField label="Cấu trúc" name="gap" defaultValue={filters.gap ?? ''}>
            <option value="">Mọi chương trình</option>
            <option value="incomplete">Cần bổ sung cấu trúc học thuật</option>
            <option value="no-level">Chưa có cấp độ</option>
            <option value="level-subject">Cấp độ chưa có môn học</option>
            <option value="lesson">Môn chưa có Lesson</option>
          </SelectField>
        )}
        <button className="vibe-button" type="submit">Lọc</button>
      </form>
      <FilterBar>
        <Link className="vibe-button" href={hrefFor(filters, { status: 'ACTIVE', gap: undefined })}>Đang hoạt động</Link>
        {view === 'programs'
          ? <Link className="vibe-button" href={hrefFor(filters, { gap: 'incomplete', status: undefined })}>Cần bổ sung</Link>
          : <Link className="vibe-button" href={hrefFor(filters, { gap: 'no-class', status: undefined })}>Cần xử lý</Link>}
      </FilterBar>
      {view === 'programs' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {visiblePrograms.length === 0 ? <EmptyState>{workspace.programs.length === 0 ? 'Chưa có chương trình.' : 'Không có chương trình phù hợp bộ lọc.'}</EmptyState> : (
            <DataTable
              headers={['Chương trình', 'Trạng thái', 'Cấp độ', 'Môn học', 'Nhóm đánh giá', 'Lesson đang hoạt động', 'Cấu trúc học thuật', 'Sẵn sàng nội dung', 'Tác vụ']}
              rows={visiblePrograms.map(program => programRow(program))}
            />
          )}
          <ProgramPanel program={selectedProgram} />
        </div>
      ) : (
        <>
        <InlineNotice>Hồ sơ khóa học cũ được giữ để đối chiếu. Không tạo khóa học mới từ màn hình này.</InlineNotice>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {courses.length === 0 ? <EmptyState>{workspace.courses.length === 0 ? 'Chưa có khóa học.' : 'Không có khóa học phù hợp bộ lọc.'}</EmptyState> : (
            <DataTable
              headers={['Khóa học', 'Chương trình', 'Cấp độ liên kết', 'Trạng thái', 'Lớp / học viên', 'Tác vụ']}
              rows={courses.map(course => courseRow(course, filters))}
            />
          )}
          <CoursePanel course={selectedCourse} />
        </div>
        </>
      )}
      {view === 'programs' ? <ProgramCreate /> : null}
    </AppPage>
  )
}

function programRow(program: ProgramView) {
  return [
    <div key="name"><strong>{program.name}</strong><p className="text-xs text-gray-500">{program.code}</p><p className="text-xs text-gray-500">{program.path}</p></div>,
    <StatusBadge key="status" tone={statusTone(program.status)}>{statusLabel(program.status)}</StatusBadge>,
    String(program.levelCount),
    String(program.subjectCount),
    String(program.componentCount),
    String(program.lessonCount),
    <StatusBadge key="health" tone={program.health === 'incomplete' ? 'warning' : 'success'}>{program.healthLabel}</StatusBadge>,
    program.contentLabel ?? 'Đủ nội dung Lesson',
    <Link key="open" href={`/admin/academic/${program.id}`}>Mở chương trình</Link>,
  ]
}

function courseRow(course: CourseView, filters: Filters) {
  return [
    <div key="name"><strong>{course.name}</strong><p className="text-xs text-gray-500">{course.code}</p></div>,
    course.curriculumName ?? '—',
    course.levelName ?? '—',
    <StatusBadge key="status" tone={statusTone(course.status)}>{statusLabel(course.status)}</StatusBadge>,
    `${course.classCount} lớp · ${course.enrollmentCount} học viên`,
    <Link key="open" href={hrefFor(filters, { view: 'courses', selected: course.id })}>Mở</Link>,
  ]
}

function ProgramPanel({ program }: { program?: ProgramView }) {
  if (!program) return <SectionCard title="Chương trình"><p className="text-sm text-gray-500">Chọn một chương trình để xem cấu trúc.</p></SectionCard>
  const ordered = [...program.levels].sort((a, b) => a.sequence - b.sequence)
  const first = ordered[0]?.name
  const last = ordered[ordered.length - 1]?.name
  return (
    <SectionCard title={program.name}>
      <p className="text-sm">{ordered.length ? `${first === last ? first : `${first} → ${last}`}` : 'Chưa có cấp độ'}</p>
      <p className="mt-2 text-sm text-gray-500">└─ Môn<br />&nbsp;&nbsp;&nbsp;└─ Lesson</p>
      <p className="mt-3 text-xs text-gray-500">{program.meta}</p>
      <p className="mt-3"><StatusBadge tone={program.health === 'incomplete' ? 'warning' : statusTone(program.status)}>{program.healthLabel}</StatusBadge></p>
      {program.contentLabel ? <p className="mt-2 text-xs text-gray-500">{program.contentLabel}</p> : null}
      <div className="mt-4 flex flex-col gap-2">
        <Link className="vibe-button-primary" href={`/admin/academic/${program.id}`}>Mở cấu trúc chương trình</Link>
        <Link className="vibe-button" href={`/admin/academic/${program.id}/edit`}>Chỉnh sửa chương trình</Link>
        <form action={setCurriculumStatus}>
          <input type="hidden" name="id" value={program.id} />
          <input type="hidden" name="status" value={program.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'} />
          <button className="vibe-button" type="submit">{program.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}</button>
        </form>
      </div>
    </SectionCard>
  )
}

function CoursePanel({ course }: { course?: CourseView }) {
  if (!course) return <SectionCard title="Khóa học cũ"><p className="text-sm text-gray-500">Chọn một hồ sơ cũ để xem. Không gán khóa học cho lộ trình mới.</p></SectionCard>
  return (
    <SectionCard title={course.name}>
      <dl className="grid gap-2 text-sm">
        <div><dt className="text-gray-500">Mã</dt><dd>{course.code}</dd></div>
        <div><dt className="text-gray-500">Trạng thái</dt><dd>{statusLabel(course.status)}</dd></div>
        <div><dt className="text-gray-500">Chương trình</dt><dd>{course.curriculumName ?? '—'}</dd></div>
        <div><dt className="text-gray-500">Cấp độ liên kết</dt><dd>{course.levelName ?? '—'}</dd></div>
        <div><dt className="text-gray-500">Chi nhánh của lớp</dt><dd>{course.branches.length ? course.branches.join(', ') : '—'}</dd></div>
        <div><dt className="text-gray-500">Lớp / học viên</dt><dd>{course.classCount} lớp · {course.enrollmentCount} học viên</dd></div>
      </dl>
      <p className="mt-4 text-sm text-gray-500">Dữ liệu này được giữ nguyên. Lớp mới vẫn đọc liên kết cũ cho đến khi có quyết định chuyển schema.</p>
    </SectionCard>
  )
}

function ProgramCreate() {
  return (
    <SectionCard title="Tạo chương trình">
      <form id="create-program" action={createCurriculum} className="grid gap-3 md:grid-cols-2">
        <FormField label="Mã chương trình" name="code" required maxLength={30} placeholder="GUITAR" />
        <FormField label="Tên chương trình" name="name" required placeholder="Guitar" />
        <label className="vibe-field md:col-span-2"><span>Mô tả</span><textarea name="description" rows={3} /></label>
        <button className="vibe-button-primary" type="submit">Tạo chương trình</button>
      </form>
    </SectionCard>
  )
}

