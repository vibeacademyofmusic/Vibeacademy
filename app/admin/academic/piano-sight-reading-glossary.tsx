import { DataTable, SectionCard } from '@/app/admin/_components/vibe'
import { sightReadingGrade, sightReadingPlan } from '@/lib/academic/piano-sight-reading'

export function PianoSightReadingGlossary({ quickAccess = false, grade }: { quickAccess?: boolean; grade?: number }) {
  const row = grade ? sightReadingGrade(grade) : undefined
  const content = <>
    <DataTable headers={['Ký hiệu / thuật ngữ', 'Ý nghĩa']} rows={sightReadingPlan.glossary} />
    <p className="mt-4 text-sm">C = Đô; D = Rê; E = Mi; F = Fa; G = Sol; A = La; B = Si. ♯ = Thăng; ♭ = Giáng; ♮ = Bình.</p>
    <h3 className="mt-4 font-semibold">Sắc thái dùng trong môn này</h3>
    <DataTable headers={['Ký hiệu', 'Nghĩa và grade giới thiệu']} rows={sightReadingPlan.dynamics} />
    <h3 className="mt-4 font-semibold">Trường độ và dấu lặng đã đọc từ trang 16</h3>
    <DataTable headers={['Ký hiệu', 'Nghĩa']} rows={sightReadingPlan.durations} />
    <p className="mt-4 text-sm">{sightReadingPlan.preparation}</p>
    {row ? <>
      <h3 className="mt-4 font-semibold">Phạm vi tích lũy Grade {grade}</h3>
      <p className="mt-2 text-sm">{row.lengthNote}</p>
      <p className="mt-2 text-sm">Giọng: {row.cumulative.keys.join('; ')}.</p>
      <p className="mt-2 text-sm">Nhịp: {row.cumulative.times.join(', ')}.</p>
      <p className="mt-2 text-sm">Tay: {row.cumulative.hands.join(' ')}</p>
      <p className="mt-2 text-sm">Yếu tố có thể xuất hiện: {row.cumulative.features.join('; ')}. Không phải bài nào cũng chứa tất cả.</p>
    </> : null}
    <p className="mt-4 text-sm"><a className="underline" href={sightReadingPlan.source.url} target="_blank" rel="noopener noreferrer">{sightReadingPlan.source.title}</a> · trang in {sightReadingPlan.source.printedPages} · đối chiếu {sightReadingPlan.source.checkedOn}. {sightReadingPlan.source.comparison}</p>
  </>
  return <SectionCard title={quickAccess ? undefined : 'Chú giải thị tấu'}>
    {quickAccess ? <details>
      <summary className="cursor-pointer font-semibold">Chú giải thị tấu</summary>
      <div className="mt-4">{content}</div>
    </details> : content}
  </SectionCard>
}
