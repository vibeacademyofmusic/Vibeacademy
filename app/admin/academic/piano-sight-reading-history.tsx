import { createClient } from '@/lib/supabase/server'

const noveltyLabel: Record<string, string> = { FIRST_PLAY: 'Lần thị tấu đầu trong hệ thống', REPLAY: 'Luyện lại', UNVERIFIED: 'Chưa xác minh' }

export async function SightReadingHistory({ studentId }: { studentId: string }) {
  const db = await createClient()
  const piano = await db.from('student_curriculum_enrollments').select('id, curriculums!inner(code)').eq('student_id', studentId).eq('curriculums.code', 'PIANO').limit(1)
  const history = await db.from('piano_sight_reading_exposures').select('id, performed_on, mode, novelty, with_support, improvement, next_practice, piece_code, piano_sight_reading_pieces(title, material_status)').eq('student_id', studentId).order('performed_on', { ascending: false }).limit(8)
  if (piano.error || history.error || (!piano.data?.length && !history.data?.length)) return null
  return <section className="mt-4 space-y-2 rounded-2xl border border-gray-200 bg-white p-4" aria-label="Lịch sử thị tấu">
    <h3 className="font-semibold">Thị tấu Piano</h3>
    <p className="text-sm">Lần luyện tập không phải lần thị tấu đầu. Bài chưa có bản nhạc được ghi là “Chưa có học liệu”.</p>
    {!history.data?.length && <p className="text-sm">Chưa có lần ghi.</p>}
    <ul className="space-y-2 text-sm">{(history.data ?? []).map(row => {
      const piece = Array.isArray(row.piano_sight_reading_pieces) ? row.piano_sight_reading_pieces[0] : row.piano_sight_reading_pieces
      return <li key={row.id}>{row.performed_on} · {row.mode === 'PRACTICE' ? 'Luyện tập' : 'Kiểm tra'} · {noveltyLabel[row.novelty] ?? row.novelty} · {piece?.material_status === 'READY' ? piece.title : 'Chưa có học liệu'} · {row.with_support ? 'có hỗ trợ' : 'không hỗ trợ'} · tiếp theo: {row.next_practice}</li>
    })}</ul>
  </section>
}
