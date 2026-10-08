const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

const workspace = fs.readFileSync('app/operations/teacher/sessions/[id]/workspace.tsx', 'utf8')
const model = fs.readFileSync('app/operations/teacher/sessions/[id]/model.ts', 'utf8')
const css = fs.readFileSync('app/operations/teacher/sessions/[id]/workspace.module.css', 'utf8')
const portal = fs.readFileSync('app/operations/teacher/page.tsx', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260924160000_teacher_session_workspace_v1.sql', 'utf8')

test('TSW33-40 one session shows a lane per student', () => {
  assert.match(workspace, /data\.participants\.map/)
  assert.match(workspace, /academic\.level_name/)
  assert.match(workspace, /Ngoài phạm vi lớp/)
  assert.match(workspace, /Object\.entries\(attendanceLabels\)/)
  assert.match(workspace, /journalLabel\(data,p\)/)
  assert.match(workspace, /Nhóm đánh giá/)
  assert.match(workspace, /kind="subject"/)
  assert.match(workspace, /kind:'component'/)
  assert.match(workspace, /kind:'item'/)
  assert.match(model, /PRESENT: 'Có mặt'/)
  assert.match(model, /ABSENT: 'Vắng'/)
  assert.match(model, /LATE: 'Đi muộn'/)
  assert.match(model, /EXCUSED: 'Có phép'/)
  assert.match(model, /Chưa ghi nhận/)
  assert.match(model, /Bản nháp/)
  assert.match(model, /Đã gửi/)
  assert.match(model, /Đã chỉnh sửa/)
  assert.doesNotMatch(workspace, /current_lesson_id/)
  assert.doesNotMatch(migration, /teacher_session_feedback_v2/)
  assert.match(css, /@media\(max-width:767px\)/)
  assert.match(css, /grid-template-columns:1fr/)
  assert.match(css, /min-width:0/)
  assert.doesNotMatch(css, /overflow-x:\s*auto/)
  assert.match(portal, /Mở ca dạy/)
  assert.match(portal, /roster_count/)
  assert.match(portal, /room_name/)
  // Admin operations uses the approved Ca dạy tab; teacher workspace remains contextual.
  assert.match(fs.readFileSync('app/admin/navigation.ts', 'utf8'), /name: 'Ca dạy', href: '\/admin\/classes', studentTab: 'teaching-shifts'/)
})

test('TSW teaching helpers count individuals and keep absent feedback optional', async () => {
  const { summary, sessionLabel, journalLabel, teachingError } = await import('../app/operations/teacher/sessions/[id]/model.ts')
  const entry = (over = {}) => ({ observation: 'PRACTICING', progress_note: 'steady', attention_required: false, attention_resolved_at: null, ...over })
  const data = {
    status: 'SCHEDULED', starts_at: '2099-01-01T08:00:00Z', ends_at: '2099-01-01T09:00:00Z', journal: { status: 'DRAFT', revision_count: 0 },
    participants: [
      { attendance: 'PRESENT', entry: entry() },
      { attendance: 'LATE', entry: entry({ attention_required: true }) },
      { attendance: 'ABSENT', entry: null },
      { attendance: null, entry: null },
    ],
  }
  assert.deepEqual(summary(data), { marked: 3, required: 2, ready: 2, submitted: 0, attention: 1 })
  assert.equal(sessionLabel(data), 'Đã lên lịch')
  assert.equal(sessionLabel({ ...data, status: 'CANCELLED' }), 'Đã hủy')
  assert.equal(journalLabel(data, data.participants[0]), 'Bản nháp')
  assert.equal(journalLabel(data, data.participants[3]), 'Chưa ghi nhận')
  assert.equal(journalLabel({ ...data, journal: { status: 'SUBMITTED', revision_count: 1 } }, data.participants[0]), 'Đã chỉnh sửa')
  assert.match(teachingError('TEACHING_CANCELLED'), /đã hủy/)
  assert.match(teachingError('JOURNAL_PROGRESS_REQUIRED'), /có mặt hoặc đi muộn/)
})
