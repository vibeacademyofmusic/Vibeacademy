import { DataTable } from '@/app/admin/_components/vibe'
import { PianoTechniqueGlossaryDialog } from './piano-technique-glossary-dialog'

const terms = [
  ['HT — Hands together', 'Hai tay cùng chơi'],
  ['HS — Hands separately', 'Từng tay riêng; cần chuẩn bị cả tay trái và tay phải'],
  ['RH — Right hand', 'Tay phải'],
  ['LH — Left hand', 'Tay trái'],
  ['8ve — Octave', 'Quãng tám'],
  ['M — Major', 'Trưởng'],
  ['m — Minor', 'Thứ'],
  ['H — Harmonic minor', 'Thứ hòa thanh'],
  ['Mel — Melodic minor', 'Thứ giai điệu'],
  ['N — Natural minor', 'Thứ tự nhiên'],
  ['Contrary motion', 'Hai tay ngược chiều'],
  ['Similar motion', 'Hai tay cùng chiều'],
  ['Legato', 'Liền tiếng'],
  ['Staccato', 'Ngắt tiếng'],
]

export function isPianoGradeTechnique(programCode: string, levelCode: string, familyCode: string) {
  return programCode === 'PIANO'
    && /^(?:G|GRADE_?)[1-8]$/.test(levelCode)
    && ['TECHNIQUE', 'TECHNIQUE_FOUNDATION', 'TECHNICAL_STUDIES'].includes(familyCode)
}

export function PianoTechniqueGlossary({ quickAccess = false }: { quickAccess?: boolean }) {
  const content = <>
    <DataTable headers={['Ký hiệu / thuật ngữ', 'Ý nghĩa']} rows={terms} />
    <p className="mt-4 text-sm">Tên nốt: C = Đô; D = Rê; E = Mi; F = Fa; G = Sol; A = La; B = Si. ♯ = Thăng; ♭ = Giáng; ♮ = Bình.</p>
    <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
      <li>HT không có nghĩa hai tay luôn bắt đầu cùng một phím; vị trí xuất phát theo từng yêu cầu.</li>
      <li>Contrary motion phải ghi rõ nốt bắt đầu của mỗi tay.</li>
      <li>“Hai tay cách quãng 3 / quãng 6” khác “quãng 3 kép / quãng 6 kép”.</li>
      <li>Luôn đọc diễn giải tiếng Việt cùng ký hiệu; thông số thực tế phải theo đúng Grade và nguồn syllabus của bài học.</li>
    </ul>
  </>
  return <PianoTechniqueGlossaryDialog quickAccess={quickAccess}>{content}</PianoTechniqueGlossaryDialog>
}
