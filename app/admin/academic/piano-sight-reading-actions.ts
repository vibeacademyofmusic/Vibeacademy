'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SightReadingState = { error?: string; success?: string }
export type SightReadingEntry = {
  id: string
  piece_code: string
  mode: string
  performed_on: string
  with_support: boolean
  novelty: string
  improvement: string
  next_practice: string
  title: string
  material_status: string
}

const messages: Record<string, string> = {
  SIGHT_READING_DENIED: 'Bạn không có quyền ghi thị tấu cho học viên này.',
  SIGHT_READING_NO_SCORE: 'Chưa có học liệu. Hệ thống không ghi lần thị tấu bài mới khi chưa có bản nhạc.',
  SIGHT_READING_ALREADY_SEEN: 'Bài này đã có lần tiếp xúc. Không dùng lại làm bài mới.',
  SIGHT_READING_PRACTICE_IS_REPLAY: 'Lần luyện tập không được ghi là lần thị tấu đầu.',
  SIGHT_READING_PIECE_MISSING: 'Không tìm thấy bài luyện.',
}

export async function loadSightReadingHistory(studentId: string, lessonCode: string): Promise<{ history: SightReadingEntry[]; pieces: { code: string; title: string; material_status: string }[] }> {
  const db = await createClient()
  const [history, pieces] = await Promise.all([
    db.from('piano_sight_reading_exposures').select('id, piece_code, mode, performed_on, with_support, novelty, improvement, next_practice, piano_sight_reading_pieces(title, material_status)').eq('student_id', studentId).eq('lesson_code', lessonCode).order('performed_on', { ascending: false }).limit(12),
    db.from('piano_sight_reading_pieces').select('code, title, material_status').eq('lesson_code', lessonCode).order('code'),
  ])
  if (history.error || pieces.error) return { history: [], pieces: [] }
  return {
    pieces: pieces.data ?? [],
    history: (history.data ?? []).map(row => {
      const piece = Array.isArray(row.piano_sight_reading_pieces) ? row.piano_sight_reading_pieces[0] : row.piano_sight_reading_pieces
      return {
        id: row.id,
        piece_code: row.piece_code,
        mode: row.mode,
        performed_on: row.performed_on,
        with_support: row.with_support,
        novelty: row.novelty,
        improvement: row.improvement,
        next_practice: row.next_practice,
        title: piece?.title ?? row.piece_code,
        material_status: piece?.material_status ?? 'MISSING',
      }
    }),
  }
}

export async function recordSightReading(_state: SightReadingState, form: FormData): Promise<SightReadingState> {
  const db = await createClient()
  const text = (name: string) => String(form.get(name) ?? '').trim()
  const student = text('student')
  const piece = text('piece')
  const mode = text('mode')
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(student)) return { error: 'Học viên không hợp lệ.' }
  if (!/^PSR-G[1-8]-\d{2}-P[12]$/.test(piece)) return { error: 'Bài luyện không hợp lệ.' }
  if (mode !== 'PRACTICE' && mode !== 'UNSEEN') return { error: 'Chọn luyện tập hoặc kiểm tra bài mới.' }
  const novelty = mode === 'PRACTICE' ? 'REPLAY' : text('novelty')
  if (mode === 'UNSEEN' && novelty !== 'FIRST_PLAY' && novelty !== 'UNVERIFIED') return { error: 'Bài mới phải ghi lần chơi đầu hoặc chưa xác minh.' }
  const { error } = await db.rpc('record_piano_sight_reading', {
    p_student: student,
    p_piece: piece,
    p_mode: mode,
    p_performed_on: text('performed_on'),
    p_with_support: form.get('support') === 'yes',
    p_pulse: text('pulse'),
    p_continuity: text('continuity'),
    p_rhythm: text('rhythm'),
    p_pitch: text('pitch'),
    p_hands: text('hands'),
    p_expression: text('expression'),
    p_improvement: text('improvement'),
    p_next: text('next'),
    p_novelty: novelty,
    p_note: text('note'),
  })
  if (error) {
    const known = Object.keys(messages).find(code => error.message.includes(code))
    return { error: known ? messages[known] : 'Không lưu được ghi nhận thị tấu.' }
  }
  const session = text('session')
  if (/^[0-9a-f-]{36}$/i.test(session)) revalidatePath(`/operations/teacher/sessions/${session}`)
  revalidatePath(`/admin/students/${student}`)
  return { success: mode === 'PRACTICE' ? 'Đã ghi lần luyện tập. Lần này không phải thị tấu đầu.' : 'Đã ghi lần kiểm tra.' }
}
