'use client'

import { useActionState, useEffect, useState } from 'react'
import { sightReadingLesson } from '@/lib/academic/piano-sight-reading'
import { loadSightReadingHistory, recordSightReading, type SightReadingEntry } from './piano-sight-reading-actions'

const noveltyLabel: Record<string, string> = { FIRST_PLAY: 'Lần thị tấu đầu trong hệ thống', REPLAY: 'Luyện lại', UNVERIFIED: 'Chưa xác minh' }

export function SightReadingRecord({ studentId, lessonCode, sessionId, performedOn }: { studentId: string; lessonCode: string; sessionId: string; performedOn: string }) {
  const lesson = sightReadingLesson(lessonCode)
  const [state, action, pending] = useActionState(recordSightReading, {})
  const [history, setHistory] = useState<SightReadingEntry[]>([])
  const [pieces, setPieces] = useState<{ code: string; title: string; material_status: string }[]>([])
  const [mode, setMode] = useState('PRACTICE')
  const [pieceCode, setPieceCode] = useState(lesson?.pieces[0]?.code ?? '')
  useEffect(() => {
    let active = true
    loadSightReadingHistory(studentId, lessonCode).then(result => {
      if (!active) return
      setHistory(result.history)
      setPieces(result.pieces)
    })
    return () => { active = false }
  }, [studentId, lessonCode, state.success])
  if (!lesson) return null
  const catalog = pieces.length ? pieces : lesson.pieces.map(piece => ({ code: piece.code, title: piece.title, material_status: piece.materialStatus }))
  const selected = catalog.find(piece => piece.code === pieceCode) ?? catalog[0]
  const seen = new Set(history.map(row => row.piece_code))
  const unseenReady = selected?.material_status === 'READY' && !seen.has(selected.code)
  return <details className="mt-3">
    <summary className="cursor-pointer font-semibold">Ghi nhận thị tấu</summary>
    <p className="mt-2 text-sm">{unseenReady ? 'Bài đang chọn có bản nhạc và chưa có lần tiếp xúc trong hệ thống.' : 'Chưa có học liệu mới cho bài đang chọn. Luyện tập vẫn ghi được kỹ năng. Hệ thống không tự dùng lại bài đã xem và không ghi kiểm tra bài mới khi chưa có bản nhạc.'}</p>
    <form action={action} className="mt-3 space-y-2 text-sm">
      <input type="hidden" name="student" value={studentId} />
      <input type="hidden" name="session" value={sessionId} />
      <input type="hidden" name="performed_on" value={performedOn} />
      <label>Chế độ<select name="mode" value={mode} onChange={event => setMode(event.target.value)}><option value="PRACTICE">Luyện tập — được chơi lại</option><option value="UNSEEN">Kiểm tra bài mới</option></select></label>
      <label>Bài<select name="piece" value={selected?.code ?? ''} onChange={event => setPieceCode(event.target.value)}>{catalog.map(piece => <option key={piece.code} value={piece.code}>{piece.code} · {piece.material_status === 'READY' ? piece.title : 'Chưa có học liệu'}{seen.has(piece.code) ? ' · đã có lần ghi' : ''}</option>)}</select></label>
      {mode === 'UNSEEN' ? <label>Mức xác minh<select name="novelty" defaultValue="UNVERIFIED"><option value="UNVERIFIED">Chưa xác minh</option><option value="FIRST_PLAY">Lần chơi đầu trong hệ thống</option></select></label> : <input type="hidden" name="novelty" value="REPLAY" />}
      <label>Có hỗ trợ<select name="support" defaultValue="yes"><option value="yes">Có hỗ trợ</option><option value="no">Không hỗ trợ</option></select></label>
      <label>Giữ phách<input name="pulse" maxLength={500} required /></label>
      <label>Độ liên tục<input name="continuity" maxLength={500} required /></label>
      <label>Tiết tấu<input name="rhythm" maxLength={500} required /></label>
      <label>Cao độ<input name="pitch" maxLength={500} required /></label>
      <label>Phối hợp tay<input name="hands" maxLength={500} required /></label>
      <label>Articulation, sắc thái, biểu cảm<input name="expression" maxLength={500} required /></label>
      <label>Cần cải thiện<textarea name="improvement" maxLength={1000} required /></label>
      <label>Bài luyện tiếp<textarea name="next" maxLength={1000} required /></label>
      <label>Nhận xét<textarea name="note" maxLength={2000} /></label>
      <button type="submit" disabled={pending || (mode === 'UNSEEN' && !unseenReady)}>{mode === 'UNSEEN' && !unseenReady ? 'Chưa có bài mới để kiểm tra' : mode === 'UNSEEN' ? 'Lưu lần kiểm tra' : 'Lưu lần luyện tập'}</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
    <h4 className="mt-3 font-semibold">Lịch sử bài của lesson này</h4>
    {!history.length && <p className="text-sm">Chưa có lần ghi.</p>}
    <ul className="mt-2 space-y-2 text-sm">{history.map(row => <li key={row.id}>{row.performed_on} · {row.mode === 'PRACTICE' ? 'Luyện tập' : 'Kiểm tra'} · {noveltyLabel[row.novelty] ?? row.novelty} · {row.with_support ? 'có hỗ trợ' : 'không hỗ trợ'} · {row.material_status === 'READY' ? row.title : 'Chưa có học liệu'} · {row.improvement}</li>)}</ul>
  </details>
}
