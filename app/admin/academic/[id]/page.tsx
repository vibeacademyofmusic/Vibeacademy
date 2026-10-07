import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AppPage, DataTable, EmptyState, FormField, InlineNotice, PageHeader, SectionCard, SelectField, StatusBadge } from '@/app/admin/_components/vibe'
import { createCurriculumLevel, setCurriculumLevelStatus } from '@/app/admin/academic/actions'
import { loadWorkspace } from '@/app/admin/programs/data'
import { levelTypeLabel, statusLabel, statusTone, subjectCompletionLabel } from '@/app/admin/programs/model'
import { AcademicTrail } from '@/app/admin/programs/trail'
import styles from './level-rows.module.css'

export default async function CurriculumDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const { error, success } = await searchParams
  const workspace = await loadWorkspace()
  const program = workspace.programs.find(row => row.id === id)
  if (!program) notFound()
  const courses = workspace.courses.filter(course => course.curriculumId === program.id)
  const structureGaps = program.attention.filter(row => row.kind === 'structure')
  const contentGaps = program.attention.filter(row => row.kind === 'content')
  const nextSequence = program.levels.length + 1

  return (
    <AppPage>
      <AcademicTrail items={[{ label: program.name }]} />
      <PageHeader
        title={program.name}
        description={program.description ?? `${program.code} · Chương trình đào tạo`}
        actions={<Link className="vibe-button" href={`/admin/academic/${program.id}/edit`}>Chỉnh sửa chương trình</Link>}
      />
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      {success ? <InlineNotice>{success}</InlineNotice> : null}
      {program.levels.length > 0 ? (
        <nav className="vibe-tabs" aria-label="Cấp độ">
          {program.levels.map(level => (
            <Link key={level.id} href={`/admin/academic/${program.id}/levels/${level.id}`}>{level.name}</Link>
          ))}
        </nav>
      ) : null}
      <SectionCard title="Cấu trúc học thuật">
        <p><StatusBadge tone={program.health === 'incomplete' ? 'warning' : 'success'}>{program.healthLabel}</StatusBadge></p>
        <p className="mt-3 text-sm text-gray-500">{program.path}</p>
        {structureGaps.length === 0 ? <p className="mt-3 text-sm">Không có môn học nào thiếu cấu trúc bắt buộc.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {structureGaps.map(gap => (
              <li key={`${gap.subjectId}-structure`}>
                <Link href={`/admin/academic/${program.id}/levels/${gap.levelId}/subjects/${gap.subjectId}`}>{gap.levelName} · {gap.subjectName}</Link>
                <span className="text-gray-500"> · cần bổ sung cấu trúc học thuật</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Sẵn sàng nội dung">
        <p className="text-sm">{program.contentLabel ?? 'Đủ nội dung Lesson'}</p>
        {contentGaps.length > 0 ? (
          <ul className="mt-3 space-y-2 text-sm">
            {contentGaps.map(gap => (
              <li key={`${gap.subjectId}-content`}>
                <Link href={`/admin/academic/${program.id}/levels/${gap.levelId}/subjects/${gap.subjectId}`}>{gap.levelName} · {gap.subjectName}</Link>
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>
      <SectionCard title="Cấp độ">
        {program.levels.length === 0 ? <EmptyState>Chưa có cấp độ.</EmptyState> : (
          <div className={styles.list}>
            <div className={styles.head}>
              <span>Cấp độ</span>
              <span>Trạng thái</span>
              <span>Cấu trúc học thuật</span>
              <span>Tác vụ</span>
            </div>
            {program.levels.map(level => {
              const href = `/admin/academic/${program.id}/levels/${level.id}`
              return (
                <div key={level.id} className={styles.row}>
                  <Link className={styles.name} href={href}>
                    <strong>{level.name}</strong>
                    <p className="text-xs text-gray-500">{level.code} · {levelTypeLabel(level.levelType)} · {subjectCompletionLabel(level.completionRule)}</p>
                  </Link>
                  <StatusBadge tone={statusTone(level.status)}>{statusLabel(level.status)}</StatusBadge>
                  <StatusBadge tone={level.health === 'incomplete' ? 'warning' : 'success'}>{level.health === 'incomplete' ? 'Cần bổ sung cấu trúc học thuật' : 'Đủ cấu trúc học thuật'}</StatusBadge>
                  <div className={styles.actions}>
                    <Link href={`${href}/edit`}>Chỉnh sửa</Link>
                    <form action={setCurriculumLevelStatus}>
                      <input type="hidden" name="curriculum_id" value={program.id} />
                      <input type="hidden" name="level_id" value={level.id} />
                      <input type="hidden" name="status" value={level.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'} />
                      <button className="vibe-button" type="submit">{level.status === 'ACTIVE' ? 'Ngừng hoạt động' : 'Kích hoạt'}</button>
                    </form>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
      <SectionCard title="Hồ sơ khóa học cũ">
        <p className="mb-3 text-sm text-gray-500">Đây là dữ liệu cũ, không phải bước trên lộ trình Chương trình → Trình độ → Môn học → Bài học. Ca dạy là lớp.</p>
        {courses.length === 0 ? <EmptyState>Chưa có khóa học liên kết.</EmptyState> : (
          <DataTable
            headers={['Khóa học', 'Cấp độ liên kết', 'Trạng thái', 'Lớp / học viên', 'Tác vụ']}
            rows={courses.map(course => [
              <div key="name"><strong>{course.name}</strong><p className="text-xs text-gray-500">{course.code}</p></div>,
              course.levelName ?? '—',
              <StatusBadge key="status" tone={statusTone(course.status)}>{statusLabel(course.status)}</StatusBadge>,
              `${course.classCount} lớp · ${course.enrollmentCount} học viên`,
              <span key="edit">Giữ nguyên hồ sơ cũ</span>,
            ])}
          />
        )}
      </SectionCard>
      <SectionCard title="Thêm cấp độ">
        <form action={createCurriculumLevel} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="curriculum_id" value={program.id} />
          <FormField label="Mã cấp độ" name="code" required placeholder="GRADE_1" />
          <FormField label="Tên cấp độ" name="name" required placeholder="Grade 1" />
          <SelectField label="Loại cấp độ" name="level_type" defaultValue="GRADE">
            <option value="FOUNDATION">Nền tảng</option>
            <option value="GRADE">Cấp độ</option>
            <option value="DIPLOMA">Văn bằng</option>
            <option value="OTHER">Khác</option>
          </SelectField>
          <FormField label="Thứ tự" name="sequence_no" type="number" min={1} required defaultValue={nextSequence} />
          <FormField label="Số cấp" name="level_number" type="number" min={0} placeholder="1" />
          <SelectField label="Cách hoàn thành" name="completion_rule" defaultValue="ALL_REQUIRED_SUBJECTS">
            <option value="ALL_REQUIRED_SUBJECTS">Hoàn thành mọi môn bắt buộc</option>
            <option value="MANUAL">Thủ công</option>
          </SelectField>
          <button className="vibe-button-primary" type="submit">Tạo cấp độ</button>
        </form>
      </SectionCard>
    </AppPage>
  )
}
