import { SectionCard } from '@/app/admin/_components/vibe'
import { techniqueLesson, techniquePractice, techniqueGeneralRules } from '@/lib/academic/piano-technique'
import { PianoTechniqueGlossary } from './piano-technique-glossary'

export function PianoTechniqueDetails({ code }: { code?: string | null }) {
  const lesson = techniqueLesson(code)
  if (!lesson) return null
  const practice = techniquePractice(lesson)
  return <div className="space-y-4">
    <SectionCard title={lesson.official ? 'Yêu cầu thi ABRSM' : 'Hướng dẫn VIBE'}>
      {lesson.official ? <>
        <p className="text-sm font-medium">{lesson.handText} · {lesson.octaves}×8ve — {lesson.octaves} quãng tám · {lesson.articulation} — {lesson.articulation === 'Legato' ? 'Liền tiếng' : 'Ngắt tiếng'}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div><dt className="font-semibold">Kỹ thuật</dt><dd>{lesson.technique}</dd></div>
          <div><dt className="font-semibold">Dạng thứ</dt><dd>{lesson.formText}</dd></div>
          <div><dt className="font-semibold">Vị trí xuất phát</dt><dd>{lesson.start}</dd></div>
          <div><dt className="font-semibold">Thể hợp âm</dt><dd>{lesson.inversion}</dd></div>
          <div><dt className="font-semibold">Lựa chọn biến thể</dt><dd>{lesson.choice}</dd></div>
          {lesson.resolve && <div><dt className="font-semibold">Kết thúc</dt><dd>Giải về chủ âm, theo mẫu dominant seventh trong syllabus.</dd></div>}
        </dl>
      </> : <p className="text-sm">Bài hướng dẫn / ôn tập do VIBE biên soạn. Không phải yêu cầu thi bổ sung, không đặt điểm đậu và không khóa bài kế tiếp.</p>}
      <p className="mt-3 text-sm">{techniqueGeneralRules}</p>
      <p className="mt-3 text-sm"><a className="underline" href={`${lesson.source}#page=${lesson.pdfPage}`} target="_blank" rel="noopener noreferrer">ABRSM Piano Practical Grades 2025–2026 · trang in {lesson.page} (trang PDF {lesson.pdfPage})</a>; quy tắc chung trang 13–14.</p>
    </SectionCard>
    <PianoTechniqueGlossary quickAccess />
    <SectionCard title="Hướng dẫn luyện tập VIBE">
      <dl className="space-y-3 text-sm">
        <div><dt className="font-semibold">Mục tiêu</dt><dd>{practice.objective}</dd></div>
        <div><dt className="font-semibold">Cách luyện</dt><dd>{practice.practice}</dd></div>
        <div><dt className="font-semibold">Lỗi thường gặp</dt><dd>{practice.errors}</dd></div>
      </dl>
      <h3 className="mt-4 font-semibold">Checklist giáo viên</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{practice.checklist.map(text => <li key={text}>{text}</li>)}</ul>
      <p className="mt-3 text-sm">Mỗi lesson chỉ ghi nhận đúng biến thể trong tên bài. Biến thể bắt buộc khác có tiến độ riêng. Ghi rõ dạng thứ thí sinh lựa chọn trong nhận xét. Hướng dẫn VIBE không thay thế quy định thi ABRSM.</p>
    </SectionCard>
  </div>
}
