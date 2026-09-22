import SessionTeacher from '../session-teachers/SessionTeacher'
import { createClient } from '@/lib/supabase/server'
import QuickEntry from './QuickEntry'
import type { ObservationOption } from './priority'

export default async function SessionJournals({ occurrenceId }: { occurrenceId: string }) {
  const db = await createClient()
  const { data: attendance, error } = await db.from('attendance_records')
    .select('id, status, enrollments!inner(students!inner(full_name))')
    .eq('session_occurrence_id', occurrenceId).order('created_at')
  if (error) return <p role="alert">Không thể tải học viên để ghi nhật ký.</p>
  const [options, focuses, reasons, homework, journal, entries] = await Promise.all([
    db.from('learning_observation_options').select('code, dimension, signal, label_vi, draft_clause_vi, sort_order, active').eq('active', true).order('sort_order'),
    db.from('learning_focus_options').select('code, label_vi').eq('active', true).order('sort_order'),
    db.from('learning_attention_reasons').select('code, label_vi').eq('active', true).order('sort_order'),
    db.from('learning_homework_parts').select('code, part_group, label_vi, sort_order').eq('active', true).order('sort_order'),
    db.from('session_learning_journals').select('content_covered, curriculum_context, status').eq('session_occurrence_id', occurrenceId).maybeSingle(),
    db.from('student_learning_journal_entries').select('attendance_record_id, observation, progress_note, individual_homework, homework_custom, next_focus_code, attention_required, attention_reason_code, attention_detail, family_note, student_journal_observation_selections(option_code)').order('created_at'),
  ])
  if (options.error || focuses.error || reasons.error || homework.error || entries.error) return <p role="alert">Bảng quan sát học tập chưa sẵn sàng.</p>
  const entryRows = entries.data ?? []
  const students = (attendance ?? []).map(row => {
    const enrollment = Array.isArray(row.enrollments) ? row.enrollments[0] : row.enrollments
    const student = Array.isArray(enrollment.students) ? enrollment.students[0] : enrollment.students
    const entry = entryRows.find(item => item.attendance_record_id === row.id)
    const selections = entry?.student_journal_observation_selections
    const codes = Array.isArray(selections) ? selections.map(selection => selection.option_code) : []
    return {
      attendanceId: row.id,
      name: student.full_name,
      status: row.status,
      observation: entry?.observation ?? 'NOT_RECORDED',
      progressNote: entry?.progress_note ?? '',
      homework: entry?.individual_homework ?? '',
      homeworkCustom: entry?.homework_custom ?? false,
      focus: entry?.next_focus_code ?? '',
      attention: entry?.attention_required ?? false,
      attentionReason: entry?.attention_reason_code ?? '',
      attentionDetail: entry?.attention_detail ?? '',
      familyNote: entry?.family_note ?? '',
      codes,
    }
  })
  return (
    <section id="learning-journals">
      <SessionTeacher id={occurrenceId} readOnly />
      <QuickEntry
        sessionId={occurrenceId}
        content={journal.data?.content_covered ?? ''}
        context={journal.data?.curriculum_context ?? ''}
        status={journal.data?.status ?? 'DRAFT'}
        students={students}
        catalogue={{
          options: (options.data ?? []) as ObservationOption[],
          focuses: focuses.data ?? [],
          reasons: reasons.data ?? [],
          homework: homework.data ?? [],
        }}
      />
    </section>
  )
}
