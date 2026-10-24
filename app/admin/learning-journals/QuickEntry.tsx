'use client'

import { useMemo, useState } from 'react'
import { useActionState } from 'react'
import { saveQuickEntry, type QuickState } from './quick-actions'
import { draftHomework, draftProgressNote, lessonContexts, recommendedOptions, type ObservationOption } from './priority'
import styles from './quick-entry.module.css'

type Student = {
  attendanceId: string
  name: string
  status: string
  observation: string
  progressNote: string
  homework: string
  homeworkCustom: boolean
  focus: string
  attention: boolean
  attentionReason: string
  attentionDetail: string
  familyNote: string
  codes: string[]
}
type Catalogue = {
  options: ObservationOption[]
  focuses: { code: string; label_vi: string }[]
  reasons: { code: string; label_vi: string }[]
  homework: { code: string; part_group: string; label_vi: string; sort_order: number }[]
}

const observations = [
  ['NOT_RECORDED', 'Chưa nhận xét'],
  ['PRACTICING', 'Đang luyện tập'],
  ['NEEDS_REVIEW', 'Cần ôn thêm'],
  ['ACHIEVED', 'Đã thực hiện tốt'],
] as const

const homeworkGroups = [
  ['CONTENT', 'Nội dung'],
  ['METHOD', 'Cách luyện'],
  ['DURATION', 'Thời lượng'],
  ['FREQUENCY', 'Tần suất'],
] as const

export default function QuickEntry({ sessionId, content, context, status, students, catalogue }: {
  sessionId: string
  content: string
  context: string
  status: string
  students: Student[]
  catalogue: Catalogue
}) {
  const [state, action, pending] = useActionState(saveQuickEntry, {} as QuickState)
  const [lessonContext, setLessonContext] = useState(context)
  const [entries, setEntries] = useState(students)
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})
  const [sharedParts, setSharedParts] = useState<string[]>([])
  const [sharedFocus, setSharedFocus] = useState('')
  const [studentParts, setStudentParts] = useState<Record<string, string[]>>({})
  const recommended = useMemo(() => recommendedOptions(catalogue.options, lessonContext), [catalogue.options, lessonContext])
  const attended = entries.filter(student => student.status === 'PRESENT' || student.status === 'LATE')
  function patch(attendanceId: string, change: Partial<Student>) {
    setEntries(current => current.map(student => student.attendanceId === attendanceId ? { ...student, ...change } : student))
  }
  function toggleCode(student: Student, code: string) {
    const codes = student.codes.includes(code) ? student.codes.filter(item => item !== code) : [...student.codes, code]
    patch(student.attendanceId, { codes, progressNote: student.progressNote || draftProgressNote(catalogue.options, codes) })
  }
  const sharedHomework = draftHomework(catalogue.homework, sharedParts)
  return (
    <form action={action} className={styles.root}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="attendance_ids" value={entries.map(student => student.attendanceId).join(',')} />
      <input type="hidden" name="shared_homework" value={sharedHomework} />
      <input type="hidden" name="shared_focus" value={sharedFocus} />
      <section className={styles.card}>
        <p className={styles.eyebrow}>Buổi học</p>
        <label>Nội dung buổi học<textarea className={styles.note} name="content_covered" defaultValue={content} rows={2} /></label>
        <div className={styles.row}>{lessonContexts.map(([code, label]) => <button key={code} type="button" className={styles.segment} aria-pressed={lessonContext === code} onClick={() => setLessonContext(code)}>{label}</button>)}</div>
        <input type="hidden" name="curriculum_context" value={lessonContext} />
        <p className={styles.eyebrow}>Bài tập dùng chung</p>
        {homeworkGroups.map(([group, label]) => <div key={group}><p className={styles.quiet}>{label}</p><div className={styles.row}>{catalogue.homework.filter(part => part.part_group === group).map(part => <button key={part.code} type="button" className={styles.chip} aria-pressed={sharedParts.includes(part.code)} onClick={() => setSharedParts(current => current.includes(part.code) ? current.filter(code => code !== part.code) : [...current, part.code])}>{part.label_vi}</button>)}</div></div>)}
        <div className={styles.row}>{catalogue.focuses.map(focus => <button key={focus.code} type="button" className={styles.chip} aria-pressed={sharedFocus === focus.code} onClick={() => setSharedFocus(focus.code)}>{focus.label_vi}</button>)}</div>
        <button className={styles.secondary} name="intent" value="share" disabled={pending}>Áp dụng cho tất cả có mặt</button>
      </section>
      {entries.map(student => {
        const absent = student.status === 'ABSENT' || student.status === 'EXCUSED'
        const choices = showAll[student.attendanceId] ? catalogue.options.filter(option => option.active) : [...recommended.strength, ...recommended.development]
        return (
          <section key={student.attendanceId} className={`${styles.card} ${absent ? styles.absent : ''}`}>
            <input type="hidden" name={`status:${student.attendanceId}`} value={student.status} />
            <input type="hidden" name={`codes:${student.attendanceId}`} value={student.codes.join(',')} />
            <input type="hidden" name={`homework_custom:${student.attendanceId}`} value={String(student.homeworkCustom)} />
            <strong>{student.name}</strong>
            <span>{student.status}</span>
            {absent ? <>
              <label>Bài tập<textarea className={styles.note} name={`homework:${student.attendanceId}`} value={student.homework} rows={2} onChange={event => patch(student.attendanceId, { homework: event.target.value, homeworkCustom: true })} /></label>
              <label>Lời nhắn gia đình<textarea className={styles.note} name={`family_note:${student.attendanceId}`} value={student.familyNote} rows={2} onChange={event => patch(student.attendanceId, { familyNote: event.target.value })} /></label>
            </> : <>
              <div className={styles.row}>{observations.map(([code, label]) => <button key={code} type="button" className={styles.segment} aria-pressed={student.observation === code} onClick={() => patch(student.attendanceId, { observation: code })}>{label}</button>)}</div>
              <input type="hidden" name={`observation:${student.attendanceId}`} value={student.observation} />
              <p className={styles.eyebrow}>Quan sát nổi bật</p>
              <div className={styles.row}>{choices.filter(option => option.signal === 'STRENGTH').map(option => <button key={option.code} type="button" className={styles.chip} aria-pressed={student.codes.includes(option.code)} onClick={() => toggleCode(student, option.code)}>{option.label_vi}</button>)}</div>
              <p className={styles.eyebrow}>Cần cải thiện</p>
              <div className={styles.row}>{choices.filter(option => option.signal === 'DEVELOPMENT').map(option => <button key={option.code} type="button" className={styles.chip} aria-pressed={student.codes.includes(option.code)} onClick={() => toggleCode(student, option.code)}>{option.label_vi}</button>)}</div>
              <button type="button" className={styles.secondary} onClick={() => setShowAll(current => ({ ...current, [student.attendanceId]: !current[student.attendanceId] }))}>{showAll[student.attendanceId] ? 'Thu gọn' : 'Xem tất cả'}</button>
              <label>Nhận xét<textarea className={styles.note} name={`progress_note:${student.attendanceId}`} value={student.progressNote} rows={3} onChange={event => patch(student.attendanceId, { progressNote: event.target.value })} /></label>
              <button type="button" className={styles.secondary} onClick={() => patch(student.attendanceId, { progressNote: draftProgressNote(catalogue.options, student.codes) })}>Dùng nhận xét gợi ý</button>
              <details>
                <summary>Bài tập</summary>
                {homeworkGroups.map(([group, label]) => <div key={group}><p className={styles.quiet}>{label}</p><div className={styles.row}>{catalogue.homework.filter(part => part.part_group === group).map(part => <button key={part.code} type="button" className={styles.chip} aria-pressed={(studentParts[student.attendanceId] ?? []).includes(part.code)} onClick={() => {
                  const current = studentParts[student.attendanceId] ?? []
                  const next = current.includes(part.code) ? current.filter(code => code !== part.code) : [...current, part.code]
                  setStudentParts(existing => ({ ...existing, [student.attendanceId]: next }))
                  patch(student.attendanceId, { homework: draftHomework(catalogue.homework, next), homeworkCustom: true })
                }}>{part.label_vi}</button>)}</div></div>)}
                <label>Bài tập<textarea className={styles.note} name={`homework:${student.attendanceId}`} value={student.homework} rows={2} onChange={event => patch(student.attendanceId, { homework: event.target.value, homeworkCustom: true })} /></label>
              </details>
              <p className={styles.eyebrow}>Trọng tâm buổi sau</p>
              <div className={styles.row}>{catalogue.focuses.map(focus => <button key={focus.code} type="button" className={styles.chip} aria-pressed={student.focus === focus.code} onClick={() => patch(student.attendanceId, { focus: focus.code })}>{focus.label_vi}</button>)}</div>
              <details>
                <summary>Chi tiết thêm</summary>
                <label>Lời nhắn gia đình<textarea className={styles.note} name={`family_note:${student.attendanceId}`} value={student.familyNote} rows={2} onChange={event => patch(student.attendanceId, { familyNote: event.target.value })} /></label>
              </details>
              <input type="hidden" name={`focus:${student.attendanceId}`} value={student.focus} />
              <label><input type="checkbox" checked={student.attention} onChange={event => patch(student.attendanceId, { attention: event.target.checked })} /> Cần VIBE theo dõi</label>
              <input type="hidden" name={`attention:${student.attendanceId}`} value={String(student.attention)} />
              {student.attention && <select className={styles.field} name={`attention_reason:${student.attendanceId}`} value={student.attentionReason} onChange={event => patch(student.attendanceId, { attentionReason: event.target.value })}><option value="">Lý do</option>{catalogue.reasons.map(reason => <option key={reason.code} value={reason.code}>{reason.label_vi}</option>)}</select>}
              {student.attention && <input className={styles.field} name={`attention_detail:${student.attendanceId}`} value={student.attentionDetail} onChange={event => patch(student.attendanceId, { attentionDetail: event.target.value })} placeholder="Chi tiết, nếu cần" />}
            </>}
          </section>
        )
      })}
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
      <div className={styles.actions}>
        <button className={styles.secondary} name="intent" value="draft" disabled={pending}>Lưu nháp</button>
        {status === 'SUBMITTED' ? <button className={styles.primary} name="intent" value="revise" disabled={pending}>Cập nhật nội dung đã nộp</button> : <button className={styles.primary} name="intent" value="submit" disabled={pending || attended.some(student => !student.progressNote || student.observation === 'NOT_RECORDED')}>Nộp nhật ký</button>}
      </div>
    </form>
  )
}
