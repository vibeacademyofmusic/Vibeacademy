import { createClient } from '@/lib/supabase/server'

const modeLabel: Record<string, string> = { GUIDED: 'Luyện có hướng dẫn / Guided', INDEPENDENT: 'Thực hành độc lập / Independent', EXAM: 'Mô phỏng / Exam practice' }

export async function AuralHistory({ studentId }: { studentId: string }) {
  const db = await createClient()
  const history = await db.from('aural_attempts').select('id, program_code, lesson_code, mode, instruction_language, response_form, hearings, hints, observation, next_practice, performed_on').eq('student_id', studentId).order('performed_on', { ascending: false }).limit(8)
  if (history.error || !history.data?.length) return null
  return <section className="mt-4 space-y-2 rounded-2xl border border-gray-200 bg-white p-4" aria-label="Lịch sử Aural">
    <h3 className="font-semibold">Aural — Luyện tai / Aural</h3>
    <p className="text-sm">Lần làm gắn với lesson, không gắn với ngôn ngữ. Đáp án không hiện ở trang học viên.</p>
    <ul className="space-y-2 text-sm">{history.data.map(row => <li key={row.id}>{row.performed_on} · {row.program_code} · {row.lesson_code} · {modeLabel[row.mode] ?? row.mode} · {row.instruction_language} · nghe {row.hearings} · gợi ý {row.hints} · {row.observation}</li>)}</ul>
  </section>
}
