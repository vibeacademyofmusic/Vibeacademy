const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')

const page = fs.readFileSync('app/admin/session-teachers/page.tsx', 'utf8')
const data = fs.readFileSync('app/admin/session-teachers/data.ts', 'utf8')
const actions = fs.readFileSync('app/admin/session-teachers/actions.ts', 'utf8')
const form = fs.readFileSync('app/admin/session-teachers/SessionTeacher.tsx', 'utf8')
const modelSource = fs.readFileSync('app/admin/session-teachers/model.ts', 'utf8')

test('control center exposes four operational areas', () => {
  for (const label of ['Cần phân công', 'Đang giảng dạy', 'Giáo viên', 'Cảnh báo']) {
    assert.match(page, new RegExp(label))
  }
  assert.match(page, /role="tablist"/)
  assert.match(page, /aria-selected/)
  assert.match(page, /Phân công giáo viên chính/)
  assert.match(page, /Lớp chính/)
  assert.doesNotMatch(page, /set_session_teacher/)
})

test('page does not invent a zero when the source fails', () => {
  assert.match(page, /Không tải được dữ liệu phân công giáo viên/)
  assert.match(page, /Không đọc đủ nguồn dữ liệu/)
  assert.match(page, /value=\{counts \? counts\.needed : '—'\}/)
  assert.doesNotMatch(page, /catch[\s\S]{0,80}\[\]/)
})

test('filters and pagination stay in the query string', () => {
  assert.match(page, /method="get"/)
  assert.match(page, /name="tab"/)
  assert.match(modelSource, /tab', 'branch', 'teacher', 'from', 'to', 'status', 'page'/)
  assert.match(page, /Pager/)
  assert.match(data, /session_actual_teachers/)
  assert.match(data, /teacher_branches/)
  assert.match(data, /class_teachers/)
  assert.match(data, /assignmentWindowCap/)
  assert.match(data, /Conflict schedule ignores branch and status filters/)
})

test('assignment still goes through set_session_teacher', () => {
  assert.match(actions, /set_session_teacher/)
  assert.match(form, /is_locked\|\|v\.status!=='SCHEDULED'/)
  assert.doesNotMatch(actions + page, /\.from\('session_teacher_assignments'\)/)
  assert.doesNotMatch(actions + page, /\.update\(|\.insert\(/)
})

test('rules', async () => {
  const model = await import('../app/admin/session-teachers/model.ts')
  const base = {
    class_id: 'class',
    branch_id: 'branch',
    occurrence_date: '2026-09-22',
    starts_at: '2026-09-22T01:00:00.000Z',
    ends_at: '2026-09-22T02:00:00.000Z',
    status: 'SCHEDULED',
    teacher_id: null,
    primary_teacher_id: null,
    assignment_type: 'PRIMARY',
    reason: null,
    is_locked: false,
  }
  const unassigned = { ...base, session_id: 's1' }
  assert.equal(model.needsAssignment(unassigned, '2026-09-22'), true)
  assert.equal(model.needsAssignment({ ...unassigned, occurrence_date: '2026-09-21' }, '2026-09-22'), false)
  assert.equal(model.needsAssignment({ ...unassigned, status: 'COMPLETED', is_locked: true }, '2026-09-22'), false)
  assert.equal(model.assignmentTypeLabel('SUBSTITUTE'), 'Dạy thay')

  const overlapA = { ...base, session_id: 'a', teacher_id: 't', starts_at: '2026-09-22T01:00:00.000Z', ends_at: '2026-09-22T03:00:00.000Z' }
  const overlapB = { ...base, session_id: 'b', teacher_id: 't', starts_at: '2026-09-22T02:00:00.000Z', ends_at: '2026-09-22T04:00:00.000Z' }
  const cancelled = { ...overlapB, session_id: 'c', status: 'CANCELLED', starts_at: '2026-09-22T01:30:00.000Z' }
  const eligible = new Set(['t:branch'])
  const conflicts = model.assignmentWarnings([overlapA, overlapB, cancelled], '2026-09-22', eligible)
  assert.equal(conflicts.filter((item) => item.code === 'SCHEDULE_CONFLICT').length, 2)
  assert.equal(conflicts.some((item) => item.sessionId === 'c'), false)

  const mismatch = model.assignmentWarnings([
    { ...overlapA, session_id: 'future' },
    { ...overlapA, session_id: 'done', status: 'COMPLETED', is_locked: true, occurrence_date: '2026-09-20' },
  ], '2026-09-22', new Set())
  assert.equal(mismatch.filter((item) => item.code === 'TEACHER_BRANCH_MISMATCH').map((item) => item.sessionId).join(), 'future')
  assert.equal(mismatch.some((item) => item.code === 'LOCK_STATE_INCONSISTENCY'), false)

  const broken = model.assignmentWarnings([
    { ...base, session_id: 'locked-open', status: 'COMPLETED', is_locked: false, teacher_id: 't' },
  ], '2026-09-22', eligible)
  assert.equal(broken.some((item) => item.code === 'LOCK_STATE_INCONSISTENCY'), true)

  const href = model.assignmentQuery({ tab: 'warnings', branch: 'b1', teacher: 't1', from: '2026-09-01', to: '2026-09-30', status: 'SCHEDULED', page: '2' }, { page: '3' })
  assert.match(href, /tab=warnings/)
  assert.match(href, /branch=b1/)
  assert.match(href, /teacher=t1/)
  assert.match(href, /from=2026-09-01/)
  assert.match(href, /to=2026-09-30/)
  assert.match(href, /status=SCHEDULED/)
  assert.match(href, /page=3/)

  const classB1 = { ...unassigned, session_id: 'b1', class_id: 'class-b', starts_at: '2026-09-23T03:00:00.000Z' }
  const classB2 = { ...unassigned, session_id: 'b2', class_id: 'class-b', starts_at: '2026-09-24T03:00:00.000Z' }
  const covered = { ...unassigned, session_id: 'covered', class_id: 'class-a', primary_teacher_id: 'teacher-a', teacher_id: 'teacher-a' }
  const needs = model.classesNeedingPrimary([classB1, classB2, covered], '2026-09-22')
  assert.deepEqual(needs.map((item) => item.classId), ['class-b'])
  assert.equal(needs[0].futureCount, 2)
  assert.equal(needs[0].nearestSessionId, 'b1')
  assert.equal(model.isCurrentTeaching(covered, '2026-09-22'), true)
  assert.equal(model.isCurrentTeaching({ ...covered, status: 'COMPLETED', is_locked: true }, '2026-09-22'), false)

  const otherBranch = { ...overlapB, session_id: 'other', branch_id: 'branch-b' }
  const hidden = model.assignmentWarnings([overlapA], '2026-09-22', eligible, [overlapA, otherBranch])
  assert.equal(hidden.filter((item) => item.code === 'SCHEDULE_CONFLICT').length, 1)
  assert.equal(hidden.find((item) => item.code === 'SCHEDULE_CONFLICT').text, 'Trùng lịch với một buổi tại chi nhánh khác.')

  const classWarning = model.assignmentWarnings([classB1, classB2], '2026-09-22', eligible)
  assert.equal(classWarning.filter((item) => item.code === 'CLASS_NO_PRIMARY_TEACHER').length, 1)
  assert.equal(classWarning.some((item) => item.code === 'SESSION_NO_ACTUAL_TEACHER'), false)
  const sessionGap = model.assignmentWarnings([
    covered,
    { ...unassigned, session_id: 'gap', class_id: 'class-a', occurrence_date: '2026-09-25', primary_teacher_id: null },
  ], '2026-09-22', eligible)
  assert.equal(sessionGap.some((item) => item.code === 'SESSION_NO_ACTUAL_TEACHER' && item.sessionId === 'gap'), true)
  assert.equal(sessionGap.some((item) => item.code === 'CLASS_NO_PRIMARY_TEACHER'), false)

  const loads = model.teacherWorkloads(
    [covered, { ...covered, session_id: 'sub', assignment_type: 'SUBSTITUTE', reason: 'Nghỉ', teacher_id: 'teacher-b', class_id: 'class-d' }],
    [
      { class_id: 'class-a', teacher_id: 'teacher-a', teacher_role: 'PRIMARY', is_active: true, assigned_at: '2026-09-01', ended_at: null, branch_id: 'branch' },
      { class_id: 'class-c', teacher_id: 'teacher-a', teacher_role: 'ASSISTANT', is_active: true, assigned_at: '2026-09-01', ended_at: null, branch_id: 'branch-b' },
    ],
    '2026-09-22',
  )
  const teacherA = loads.find((item) => item.teacherId === 'teacher-a')
  assert.equal(teacherA.primaryClasses, 1)
  assert.equal(teacherA.assistantClasses, 1)
  assert.equal(teacherA.upcoming, 1)
  assert.equal(loads.find((item) => item.teacherId === 'teacher-b').substitute, 1)
})
