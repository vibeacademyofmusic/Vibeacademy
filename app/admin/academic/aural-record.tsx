'use client'

import { useState } from 'react'
import { auralLesson } from '@/lib/academic/aural'
import { recordAuralAttempt, revealAuralAnswer } from './aural-actions'

export function AuralRecord({ studentId, lessonCode, program, sessionId, performedOn }: { studentId: string; lessonCode: string; program: string; sessionId: string; performedOn: string }) {
  const lesson = auralLesson(lessonCode)
  const [answer, setAnswer] = useState<{ vi: string; en: string } | null>(null)
  const [message, setMessage] = useState('')
  const [responded, setResponded] = useState(false)
  if (!lesson) return null
  const examLocked = lesson.mode === 'EXAM' && !responded
  return <details className="mt-3">
    <summary className="cursor-pointer font-semibold">Ghi nhận Aural / Record an Aural attempt</summary>
    <form action={async form => {
      const stored = window.localStorage.getItem('vibe-aural-language')
      if (stored === 'vi' || stored === 'en' || stored === 'both') form.set('language', stored)
      const result = await recordAuralAttempt(form)
      setMessage(result.error || result.success || '')
    }} className="mt-3 space-y-2 text-sm">
      <input type="hidden" name="student" value={studentId} />
      <input type="hidden" name="lesson" value={lessonCode} />
      <input type="hidden" name="program" value={program} />
      <input type="hidden" name="session" value={sessionId} />
      <input type="hidden" name="performed_on" value={performedOn} />
      <input type="hidden" name="language" value="both" />
      <p>Chế độ / Mode: {lesson.mode}. Ngôn ngữ lời hướng dẫn đang chọn được lưu cùng lần làm, không tạo tiến độ mới.</p>
      <label>Hình thức trả lời / Response<select name="response" defaultValue="describe"><option value="sing">Hát / Sing</option><option value="clap">Vỗ / Clap</option><option value="play">Chơi / Play</option><option value="describe">Mô tả / Describe</option></select></label>
      <label>Số lần nghe / Hearings<input name="hearings" type="number" min={0} max={20} defaultValue={0} /></label>
      <label>Số gợi ý / Hints<input name="hints" type="number" min={0} max={20} defaultValue={0} /></label>
      <label>Quan sát / Observation<textarea name="observation" required maxLength={1000} /></label>
      <label>Nhận xét, giữ nguyên ngôn ngữ gốc / Comment, kept in its original language<textarea name="note" maxLength={2000} /></label>
      <label>Luyện tiếp / Next practice<textarea name="next" required maxLength={1000} /></label>
      <label><input type="checkbox" checked={responded} onChange={event => setResponded(event.target.checked)} /> Học viên đã trả lời / The learner has responded</label>
      <button type="submit">Lưu lần làm / Save attempt</button>
    </form>
    <button type="button" className="mt-3" disabled={examLocked} onClick={async () => {
      const result = await revealAuralAnswer(lessonCode)
      if (result.error || !result.vi || !result.en) setMessage(result.error || 'Không có đáp án.')
      else setAnswer({ vi: result.vi, en: result.en })
    }}>{examLocked ? 'Đáp án mở sau khi học viên trả lời / Answer opens after the response' : 'Hiện đáp án cho giáo viên / Show the answer to the teacher'}</button>
    {answer ? <div className="mt-3 grid gap-2 md:grid-cols-2"><p lang="vi">{answer.vi}</p><p lang="en">{answer.en}</p><p className="md:col-span-2">Chưa có học liệu. Đáp án đang chờ duyệt chuyên môn. / No learning material yet. The answer is pending specialist review.</p></div> : null}
    {message ? <p role="status" className="mt-2">{message}</p> : null}
  </details>
}
