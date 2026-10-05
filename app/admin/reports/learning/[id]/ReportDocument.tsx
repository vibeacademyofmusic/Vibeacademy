import type { Report } from '../data'
import { legacySummaryFallback } from '../data'
import { dateText, timeText } from '../../../finance/_components/ui'
const labels = [
  ['achievement', 'ACHIEVEMENT & PROGRESS'], ['difficulty', 'CURRENT CHALLENGES'],
  ['intervention', 'TEACHER INTERVENTION'], ['next_month_plan', 'NEXT PERIOD PLAN'],
  ['practice_consistency', 'PRACTICE CONSISTENCY'], ['lesson_preparation', 'LESSON PREPARATION'], ['learning_attitude', 'LEARNING ATTITUDE'],
]
const displayStatus = (value: string) => ({ NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', PASSED: 'Passed', PASS: 'Pass', MERIT: 'Merit', DISTINCTION: 'Distinction', FAILED: 'Needs Review', NOT_PASSED: 'Needs Review', EXEMPT: 'Exempt' } as Record<string, string>)[value] ?? value
const field = (label: string, value: string | number | null | undefined) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Not provided.'}</dd></div>
export default function ReportDocument({ report: r }: { report: Report }) {
  const s = r.snapshot_data
  if (!s) return <p role="alert">Approved snapshot unavailable. Please reload; draft content cannot be used as an official report.</p>
  const summary = s.teacher_summary ?? r.teacher_summary
  const value = (key: string) => summary[key] || (legacySummaryFallback[key] ?? []).map(k => summary[k]).find(Boolean) || 'Not provided.'
  return <article className="academic-document learning-report-paper">
    <header className="academic-brand">
      {/* Preserve the supplied brand asset exactly, including its print rendering. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vibe-logo.png" width={180} height={120} alt="VIBE Academy logo" />
      <p>VIBE ACADEMY OF MUSIC &amp; CINEMA</p>
      <h1>LEARNING PROGRESS REPORT</h1>
    </header>
    <section><h2>STUDENT INFORMATION</h2><div className="academic-columns">
      <dl>{field('STUDENT', s.student.name)}{field('STUDENT CODE', s.student.code)}{field('BRANCH', s.branch.name)}{field('CLASS', s.class_name)}{field('TEACHER', s.teachers.map(t => t.name || t.code).join(', ') || null)}</dl>
      <dl>{field('PROGRAM', s.academic.curriculum)}{field('GRADE', s.academic.current_grade)}{field('REPORT TYPE', r.report_type === 'MONTHLY' ? 'Monthly Report' : 'End-of-Course Report')}{field('REPORT PERIOD', `${dateText(s.period_start)} – ${dateText(s.period_end)}`)}{field('APPROVED AT', r.approved_at ? timeText(r.approved_at) : null)}</dl>
    </div><dl className="academic-register">{field('STATUS', r.status)}{field('VERSION', r.version)}{field('GENERATED AT', timeText(s.as_of))}{field('PUBLISHED AT', r.status === 'PUBLISHED' && r.sent_at ? timeText(r.sent_at) : 'Not published.')}</dl></section>
    <section><h2>ATTENDANCE SUMMARY</h2><dl className="academic-metrics">
      {field('SCHEDULED', s.attendance.scheduled)}{field('ATTENDED', s.attendance.attended)}{field('ABSENT', s.attendance.absent)}{field('EXCUSED', s.attendance.excused)}{field('MAKE-UP', s.attendance.makeup)}{field('ATTENDANCE RATE', s.attendance.rate === null ? 'Not available' : `${s.attendance.rate}%`)}
    </dl><p className="academic-note">Attendance rate is based on marked sessions; attended includes late arrivals. Unmarked sessions: {s.attendance.unmarked}. Make-up counts scheduled sessions.</p>
      <p className="academic-note">Cancelled sessions and unmarked regular sessions during an active pause are excluded. Pause dates are not recorded in this snapshot.</p>
    </section>
    <section><h2>ACADEMIC PROGRESS</h2><dl>{field('CURRENT GRADE', s.academic.current_grade)}</dl>
      <p className="academic-note">Progress reflects the generation date. Optional requirements do not block completion.</p>
      <table><thead><tr>{['SUBJECT', 'REQUIREMENT', 'STATUS', 'SCORE', 'COMPONENTS'].map(h => <th scope="col" key={h}>{h}</th>)}</tr></thead>
        <tbody>{s.academic.subjects.map((subject, i) => <tr key={i}><td>{subject.name}<small>{subject.grade}</small></td><td>{subject.is_required ? 'Required' : 'Optional'}</td><td>{displayStatus(subject.status)}</td><td>{subject.score ?? '—'}</td><td>{subject.completion_rule === 'DIRECT_ASSESSMENT' ? 'Direct assessment' : subject.components.length ? <ul>{subject.components.map((c, j) => <li key={j}>{c.name} · {c.required ? 'Required' : 'Optional'} · {displayStatus(c.status)}{c.score === null ? '' : ` · ${c.score}`}</li>)}</ul> : 'Not provided.'}</td></tr>)}</tbody>
      </table>{!s.academic.subjects.length && <p>No academic progress recorded.</p>}
    </section>
    <section><h2>LEARNING JOURNAL</h2><p className="academic-note">{s.journals.count} entries recorded. Up to 30 most recently updated entries in this period are shown.</p>
      {!s.journals.excerpts.length && <p>No learning journal entries recorded for this period.</p>}
      {s.journals.excerpts.map((j, i) => <div className="academic-entry" key={i}><dl>{field('UPDATED AT', timeText(j.updated_at))}{j.content && field('CONTENT', j.content)}{j.repertoire && field('REPERTOIRE', j.repertoire)}{j.skills && field('SKILLS', j.skills)}{j.homework && field('PRACTICE / HOMEWORK', j.homework)}</dl></div>)}
    </section>
    <section><h2>TEACHER ASSESSMENT</h2>{labels.map(([key, label]) => <div className="academic-assessment" key={key}><h3>{label}</h3><p>{value(key)}</p></div>)}</section>
    <section className="academic-approval"><div className="academic-signature-line" /><h2>AUTHORIZED ACADEMIC APPROVAL</h2><dl>{field('APPROVED BY', r.approver_name || r.approved_by)}{field('APPROVED AT', r.approved_at ? timeText(r.approved_at) : null)}</dl></section>
    <footer>{s.branch.name && <p>{s.branch.name}</p>}</footer>
  </article>
}
