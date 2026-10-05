import type { Report } from '../data'
import { legacySummaryFallback, summaryFields } from '../data'
import { dateText, timeText } from '../../../finance/_components/ui'
const labels = [
  ['achievement', 'ACHIEVEMENT & PROGRESS'], ['difficulty', 'CURRENT CHALLENGES'],
  ['intervention', 'TEACHER INTERVENTION'], ['next_month_plan', 'NEXT PERIOD PLAN'],
  ['practice_consistency', 'PRACTICE CONSISTENCY'], ['lesson_preparation', 'LESSON PREPARATION'], ['learning_attitude', 'LEARNING ATTITUDE'],
]
const sectionHeading = (en: string, vi: string) => <h2>{en}<span lang="vi">{vi}</span></h2>
const displayStatus = (value: string) => ({ NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', PASSED: 'Passed', PASS: 'Pass', MERIT: 'Merit', DISTINCTION: 'Distinction', FAILED: 'Needs Review', NOT_PASSED: 'Needs Review', EXEMPT: 'Exempt' } as Record<string, string>)[value] ?? value
const field = (label: string, value: string | number | null | undefined) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Not provided.'}</dd></div>
export default function ReportDocument({ report: r, draftPreview = false }: { report: Report; draftPreview?: boolean }) {
  const isDraftPreview = draftPreview && ['DRAFT', 'READY_FOR_REVIEW'].includes(r.status)
  const s = isDraftPreview ? r.draft_data : r.snapshot_data
  if (!s) return <p role="alert">Approved snapshot unavailable. Please reload; draft content cannot be used as an official report.</p>
  const summary = s.teacher_summary ?? r.teacher_summary
  const value = (key: string) => summary[key] || (legacySummaryFallback[key] ?? []).map(k => summary[k]).find(Boolean) || 'Not provided.'
  const periodMonth = Number(String(s.period_start).slice(5, 7))
  const grade = s.academic.current_grade || 'Chưa xác định'
  return <>
  <article className="academic-document learning-report-paper academic-cover-sheet">
    <header className="academic-brand">
      {/* Preserve the supplied brand asset exactly, including its print rendering. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vibe-logo.png" width={180} height={120} alt="VIBE Academy logo" />
      <p>VIBE ACADEMY OF MUSIC &amp; CINEMA</p>
      <h1>LEARNING PROGRESS REPORT</h1>
      {isDraftPreview && <div>BẢN NHÁP — CHƯA DUYỆT</div>}
    </header>
    <section className="academic-cover"><h2 className="academic-cover-name">{s.student.name}</h2><p className="academic-cover-program">{[s.academic.curriculum, grade].filter(Boolean).join(' · ')}</p><div className="academic-columns">
      <dl>{field('STUDENT', s.student.name)}{field('STUDENT CODE', s.student.code)}{field('BRANCH', s.branch.name)}{field('CLASS', s.class_name)}{field('TEACHER', s.teachers.map(t => t.name || t.code).join(', ') || null)}</dl>
      <dl>{field('PROGRAM', s.academic.curriculum)}{field('GRADE', s.academic.current_grade)}{field('REPORT TYPE', r.report_type === 'MONTHLY' ? 'Monthly Report' : 'End-of-Course Report')}{field('REPORT PERIOD', `${dateText(s.period_start)} – ${dateText(s.period_end)}`)}{field('APPROVED AT', r.approved_at ? timeText(r.approved_at) : null)}</dl>
    </div><dl className="academic-register">{field('STATUS', r.status)}{field('VERSION', r.version)}{field('GENERATED AT', timeText(s.as_of))}{field('PUBLISHED AT', r.status === 'PUBLISHED' && r.sent_at ? timeText(r.sent_at) : 'Not published.')}</dl></section>
  </article>
  <article className="academic-document learning-report-paper">
    <header className="academic-running-head">
      <p>Báo cáo học tập kỳ tháng {periodMonth}</p>
      <p className="academic-running-identity"><strong>{s.student.name}</strong><span>{grade}</span></p>
    </header>
    <section>{sectionHeading('ATTENDANCE SUMMARY', 'Tổng hợp chuyên cần')}<dl className="academic-metrics">
      {field('SCHEDULED', s.attendance.scheduled)}{field('ATTENDED', s.attendance.attended)}{field('ABSENT', s.attendance.absent)}{field('EXCUSED', s.attendance.excused)}{field('MAKE-UP', s.attendance.makeup)}{field('ATTENDANCE RATE', s.attendance.rate === null ? 'Not available' : `${s.attendance.rate}%`)}
    </dl><p className="academic-note">Attendance rate is based on marked sessions; attended includes late arrivals. Unmarked sessions: {s.attendance.unmarked}. Make-up counts scheduled sessions.</p>
      <p className="academic-note">Cancelled sessions and unmarked regular sessions during an active pause are excluded. Pause dates are not recorded in this snapshot.</p>
    </section>
    <section>{sectionHeading('ACADEMIC PROGRESS', 'Tiến độ học tập')}<dl>{field('CURRENT GRADE', s.academic.current_grade)}</dl>
      <p className="academic-note">Progress reflects the generation date. Optional requirements do not block completion.</p>
      {!s.academic.subjects.length && <p>No academic progress recorded.</p>}
      <div className="academic-subjects">{s.academic.subjects.map((subject, i) => <article className="academic-subject" key={i}>
        <div className="academic-subject-head">
          <div><h3>{subject.name}</h3><p>{subject.grade}</p></div>
          <p className="academic-subject-meta"><span>{subject.is_required ? 'Required' : 'Optional'}</span><span>{displayStatus(subject.status)}</span><span>Score {subject.score ?? '—'}</span></p>
        </div>
        {subject.completion_rule === 'DIRECT_ASSESSMENT' ? <p>Direct assessment</p> : subject.components.length ? <ul className="academic-components">{subject.components.map((c, j) => <li key={j}><span>{c.name}</span><span>{c.required ? 'Required' : 'Optional'} · {displayStatus(c.status)}{c.score === null ? '' : ` · ${c.score}`}</span></li>)}</ul> : <p>Not provided.</p>}
      </article>)}</div>
    </section>
    {Array.isArray(s.videos) && <section>{sectionHeading('LESSON VIDEOS', 'Video bài học')}
      <p className="academic-note">Shared lesson links captured when this report was generated. Opening a video still depends on the permission set by the video owner on YouTube.</p>
      {!s.videos.length && <p>No shared lesson videos recorded.</p>}
      {s.videos.map((video, i) => <div className="academic-entry" key={`${video.url}-${i}`}>
        <p className="academic-video-title"><a className="academic-video-link" href={video.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{video.title}</a></p>
        <dl>
          {video.level_name && field('LEVEL', video.level_name)}
          {video.lesson_name && field('LESSON', video.lesson_name)}
          {video.note && field('NOTE', video.note)}
        </dl>
      </div>)}
    </section>}
    <section>{sectionHeading('LEARNING JOURNAL', 'Nhật ký học tập')}<p className="academic-note">{s.journals.count} entries recorded. Up to 30 most recently updated entries in this period are shown.</p>
      {!s.journals.excerpts.length && <p>No learning journal entries recorded for this period.</p>}
      {s.journals.excerpts.map((j, i) => <div className="academic-entry" key={i}><dl>{field('UPDATED AT', timeText(j.updated_at))}{j.content && field('CONTENT', j.content)}{j.repertoire && field('REPERTOIRE', j.repertoire)}{j.skills && field('SKILLS', j.skills)}{j.homework && field('PRACTICE / HOMEWORK', j.homework)}</dl></div>)}
    </section>
    <section>{sectionHeading('TEACHER ASSESSMENT', 'Nhận xét của giáo viên')}{labels.map(([key, label]) => <div className="academic-assessment" key={key}><h3>{label}<span lang="vi">{summaryFields.find(field => field.id === key)?.name}</span></h3><p>{value(key)}</p></div>)}</section>
    {!isDraftPreview && <section className="academic-approval"><div className="academic-signature-line" />{sectionHeading('AUTHORIZED ACADEMIC APPROVAL', 'Phê duyệt học thuật')}<dl>{field('APPROVED BY', r.approver_name || r.approved_by)}{field('APPROVED AT', r.approved_at ? timeText(r.approved_at) : null)}</dl></section>}
    <footer>{s.branch.name && <p>{s.branch.name}</p>}</footer>
  </article>
  </>
}
