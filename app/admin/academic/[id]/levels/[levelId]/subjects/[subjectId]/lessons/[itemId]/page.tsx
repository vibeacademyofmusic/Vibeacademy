import Link from 'next/link'
import { notFound } from 'next/navigation'

import { retireCurriculumLesson, updateCurriculumLesson } from '@/app/admin/academic/actions'
import { AcademicTrail } from '@/app/admin/programs/trail'
import { createClient } from '@/lib/supabase/server'
import { showComponentGroups, statusLabel } from '@/app/admin/programs/model'

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; levelId: string; subjectId: string; itemId: string }>
  searchParams: Promise<{ error?: string; success?: string; retire?: string }>
}) {
  const { id, levelId, subjectId, itemId } = await params
  const { error, success, retire } = await searchParams
  const supabase = await createClient()
  const { data: curriculum } = await supabase.from('curriculums').select('id, name').eq('id', id).maybeSingle()
  if (!curriculum) notFound()
  const { data: level } = await supabase.from('curriculum_levels').select('id, name').eq('id', levelId).eq('curriculum_id', curriculum.id).maybeSingle()
  if (!level) notFound()
  const { data: subject } = await supabase.from('curriculum_subjects').select('id, name, completion_rule').eq('id', subjectId).eq('level_id', level.id).maybeSingle()
  if (!subject) notFound()
  const { data: components } = await supabase.from('curriculum_subject_components').select('id, name, status').eq('subject_id', subject.id)
  const componentIds = (components ?? []).map(row => row.id)
  if (!componentIds.length) notFound()
  const { data: lesson } = await supabase
    .from('curriculum_component_items')
    .select('id, component_id, code, name, sort_order, is_required, status')
    .eq('id', itemId)
    .in('component_id', componentIds)
    .maybeSingle()
  if (!lesson) notFound()
  const { data: guide } = await supabase
    .from('curriculum_lesson_guides')
    .select('source_book, source_edition, source_authors, source_pages, piece_reference, learning_objectives, core_concepts, teacher_demonstration, guided_practice, independent_practice, review, checkpoint, homework')
    .eq('item_id', lesson.id)
    .maybeSingle()
  const { data: syllabus, error: syllabusError } = await supabase
    .from('curriculum_lesson_syllabi')
    .select('source_book, source_authors, unit_title, source_pdf_pages, source_printed_pages, learning_objectives, classroom_activities, homework, teacher_notes, source_context, content_scope, syllabus_pdf_page')
    .eq('item_id', lesson.id)
    .maybeSingle()
  const syllabusTitle = lesson.code.startsWith('PIANO-PRE-REP-2A-') ? 'Giáo án Repertoire 2A' : lesson.code.startsWith('PIANO-PRE-REP-2B-') ? 'Giáo án Repertoire 2B' : lesson.code.startsWith('VIO_PS_FT1_') ? 'Giáo án Fiddle Time Joggers' : lesson.code.startsWith('VIO_PS_FT2_') ? 'Giáo án Fiddle Time Runners' : 'Giáo án Book B'
  const expectsSyllabus = lesson.code.startsWith('PIANO-PRESTEP-BB-') || lesson.code.startsWith('PIANO-PRE-REP-') || lesson.code.startsWith('VIO_PS_FT1_') || lesson.code.startsWith('VIO_PS_FT2_')
  const owner = (components ?? []).find(row => row.id === lesson.component_id)
  const showGroup = showComponentGroups(subject.completion_rule, components ?? [])
  const detailPath = `/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}/lessons/${lesson.id}`

  return (
    <div>
      <AcademicTrail items={[
        { label: curriculum.name, href: `/admin/academic/${curriculum.id}` },
        { label: level.name, href: `/admin/academic/${curriculum.id}/levels/${level.id}` },
        { label: subject.name, href: `/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}` },
        ...(showGroup && owner ? [{ label: owner.name, href: `/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}` }] : []),
        { label: `${lesson.code} · ${lesson.name}` },
      ]} />
      <p className="text-sm font-medium text-gray-500">Lesson</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-950">{lesson.code} · {lesson.name}</h1>
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {success ? <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{success}</p> : null}
      <dl className="mt-6 grid max-w-xl gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-sm">
        <div><dt className="text-gray-500">Chương trình</dt><dd>{curriculum.name}</dd></div>
        <div><dt className="text-gray-500">Cấp độ</dt><dd>{level.name}</dd></div>
        <div><dt className="text-gray-500">Môn học</dt><dd>{subject.name}</dd></div>
        <div><dt className="text-gray-500">{showGroup ? 'Nhóm đánh giá' : 'Cấu trúc nội bộ'}</dt><dd>{owner?.name ?? '—'}</dd></div>
        <div><dt className="text-gray-500">Trạng thái</dt><dd>{statusLabel(lesson.status)}</dd></div>
      </dl>

      {syllabusError && expectsSyllabus ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Không tải được {syllabusTitle.toLowerCase()}. Hãy tải lại trang; nếu lỗi còn tiếp diễn, liên hệ quản trị.</p>
      ) : null}
      {syllabus ? (
        <section aria-label={syllabusTitle} className="mt-6 max-w-3xl space-y-4 rounded-2xl border border-gray-200 border-l-[3px] border-l-[#ba872d] bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">{syllabusTitle}</h2>
          <p className="text-sm text-gray-600">{syllabus.source_book} · {syllabus.source_authors}</p>
          <p className="text-sm text-gray-600">{syllabus.unit_title} · {syllabus.syllabus_pdf_page ? 'Trang PDF sách đối chiếu' : 'Trang PDF nguồn'} {syllabus.source_pdf_pages}{syllabus.source_printed_pages ? ` · Trang in đối chiếu ${syllabus.source_printed_pages}` : ''}</p>
          {syllabus.syllabus_pdf_page ? <p className="text-sm text-gray-600">Trang giáo án VIBE {syllabus.syllabus_pdf_page}</p> : null}
          <dl className="space-y-4 text-sm">
            {[
              ...(syllabus.content_scope ? [['Phạm vi nội dung', syllabus.content_scope]] : []),
              ['Mục tiêu', syllabus.learning_objectives],
              ['Trên lớp', syllabus.classroom_activities],
              ['Ở nhà', syllabus.homework],
              ['Ghi chú giáo viên', syllabus.teacher_notes],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-medium text-gray-950">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-gray-700">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-gray-600">Một Lesson có thể gồm nhiều buổi. Giáo trình không đặt điểm đạt, Final Test hoặc tự động hoàn thành môn/cấp độ.</p>
          {syllabus.source_context ? (
            <details className="rounded-lg border border-gray-200 p-4 text-sm">
              <summary className="cursor-pointer font-medium text-gray-950">Hướng dẫn sử dụng, nguồn và bảng phân bổ đủ 50 Lesson</summary>
              <p className="mt-3 whitespace-pre-wrap text-gray-700">{syllabus.source_context}</p>
            </details>
          ) : null}
        </section>
      ) : null}

      {guide ? (
        <section className="mt-6 max-w-3xl space-y-4 rounded-2xl border border-gray-200 border-l-[3px] border-l-[#ba872d] bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">Giáo án</h2>
          <p className="text-sm text-gray-600">{guide.source_book} · {guide.source_edition} · {guide.source_authors}</p>
          <p className="text-sm text-gray-600">Trang in {guide.source_pages} · {guide.piece_reference}</p>
          <dl className="space-y-4 text-sm">
            {[
              ['Mục tiêu', guide.learning_objectives],
              ['Nội dung cốt lõi', guide.core_concepts],
              ['Giải thích / thị phạm', guide.teacher_demonstration],
              ['Luyện tập có hướng dẫn', guide.guided_practice],
              ['Luyện tập độc lập', guide.independent_practice],
              ['Ôn tập', guide.review],
              ['Điểm kiểm', guide.checkpoint],
              ['Bài tập về nhà', guide.homework],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-medium text-gray-950">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-gray-700">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-gray-600">Luyện tập độc lập không được ghi là hoàn thành học thuật. Giáo viên ghi PASS sau điểm kiểm. Hoàn thành môn này không tự chuyển học viên lên Grade kế tiếp.</p>
        </section>
      ) : null}

      <form action={updateCurriculumLesson} className="mt-6 max-w-xl space-y-4 rounded-2xl border border-gray-200 border-l-[3px] border-l-[#ba872d] bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-950">Chỉnh sửa</h2>
        <input type="hidden" name="curriculum_id" value={curriculum.id} />
        <input type="hidden" name="level_id" value={level.id} />
        <input type="hidden" name="subject_id" value={subject.id} />
        <input type="hidden" name="lesson_id" value={lesson.id} />
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">Tên Lesson *</label>
          <input id="name" name="name" required maxLength={200} defaultValue={lesson.name} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">Mã Lesson *</label>
            <input id="code" name="code" required defaultValue={lesson.code} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="sort_order" className="mb-1 block text-sm font-medium text-gray-700">Thứ tự *</label>
            <input id="sort_order" name="sort_order" type="number" min={1} required defaultValue={lesson.sort_order} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700">Trạng thái *</label>
          <select id="status" name="status" defaultValue={lesson.status} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="INACTIVE">Ngừng sử dụng</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="is_required" value="true" defaultChecked={lesson.is_required} />
          Bắt buộc
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">Lưu Lesson</button>
          <Link href={`/admin/academic/${curriculum.id}/levels/${level.id}/subjects/${subject.id}`} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Hủy</Link>
        </div>
      </form>

      {lesson.status === 'ACTIVE' ? (
        <section className="mt-6 max-w-xl rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-950">Ngừng sử dụng</h2>
          <p className="mt-2 text-sm text-gray-600">Lesson sẽ không còn được sử dụng cho hoạt động mới. Dữ liệu học tập trước đây được giữ lại.</p>
          {retire === 'confirm' ? (
            <form action={retireCurriculumLesson} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="curriculum_id" value={curriculum.id} />
              <input type="hidden" name="level_id" value={level.id} />
              <input type="hidden" name="subject_id" value={subject.id} />
              <input type="hidden" name="lesson_id" value={lesson.id} />
              <button type="submit" className="rounded-lg bg-gray-950 px-4 py-2 text-sm font-semibold text-white">Xác nhận ngừng sử dụng</button>
              <Link href={detailPath} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Hủy</Link>
            </form>
          ) : (
            <Link href={`${detailPath}?retire=confirm`} className="mt-4 inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800">Ngừng sử dụng</Link>
          )}
        </section>
      ) : null}
    </div>
  )
}
