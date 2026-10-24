import { DataTable, SectionCard } from '@/app/admin/_components/vibe'
import { sightReadingLesson, sightReadingPlan } from '@/lib/academic/piano-sight-reading'
import { PianoSightReadingGlossary } from './piano-sight-reading-glossary'

export function PianoSightReadingDetails({ code }: { code?: string | null }) {
  const lesson = sightReadingLesson(code)
  if (!lesson) return null
  return <div className="space-y-4">
    <SectionCard title={`${lesson.nameVi} (${lesson.nameEn})`}>
      <dl className="space-y-3 text-sm">
        <div><dt className="font-semibold">Mục tiêu</dt><dd>{lesson.objective}</dd></div>
        <div><dt className="font-semibold">Kiến thức kế thừa</dt><dd>{lesson.inherited}</dd></div>
        <div><dt className="font-semibold">Yếu tố của grade này</dt><dd>{lesson.introduced}</dd></div>
        <div><dt className="font-semibold">Độ dài</dt><dd>{lesson.scope.length}</dd></div>
        <div><dt className="font-semibold">Giọng</dt><dd>{lesson.scope.keys}</dd></div>
        <div><dt className="font-semibold">Nhịp</dt><dd>{lesson.scope.times}</dd></div>
        <div><dt className="font-semibold">Tay</dt><dd>{lesson.scope.hands}</dd></div>
        <div><dt className="font-semibold">Hướng dẫn giáo viên</dt><dd>{lesson.teacher}</dd></div>
      </dl>
      <h3 className="mt-4 font-semibold">Các bước học viên thực hành</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{lesson.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <h3 className="mt-4 font-semibold">Lỗi thường gặp</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{lesson.errors.map(error => <li key={error}>{error}</li>)}</ul>
      <h3 className="mt-4 font-semibold">Checklist quan sát</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{lesson.checklist.map(item => <li key={item}>{item}</li>)}</ul>
      <p className="mt-4 text-sm"><a className="underline" href={`${lesson.source}#page=${lesson.pdfPages.split('-')[0]}`} target="_blank" rel="noopener noreferrer">{sightReadingPlan.source.title}</a> · trang in {lesson.printedPages} · trang PDF {lesson.pdfPages} · đối chiếu {lesson.checkedOn}.</p>
    </SectionCard>
    <PianoSightReadingGlossary quickAccess grade={lesson.grade} />
    <SectionCard title="Học liệu">
      <p className="text-sm">{lesson.materialNote}</p>
      <DataTable headers={['Mã', 'Bài', 'Nguồn', 'Trạng thái']} rows={lesson.pieces.map(piece => [piece.code, piece.title, piece.sourceLabel, 'Chưa có học liệu'])} />
    </SectionCard>
  </div>
}
