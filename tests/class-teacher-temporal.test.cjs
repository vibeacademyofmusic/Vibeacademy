const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')

const actions = fs.readFileSync('app/admin/classes/[id]/actions.ts', 'utf8')
const assignSource = actions.slice(actions.indexOf('export async function assignTeacher'), actions.indexOf('export async function removeTeacher'))
const removeSource = actions.slice(actions.indexOf('export async function removeTeacher'), actions.indexOf('export async function enrollStudent'))

test('class teacher dates use the Vietnam business date', async () => {
  const dates = await import('../app/admin/_lib/business-date.ts')
  assert.equal(dates.businessDate(new Date('2026-09-21T18:30:00Z')), '2026-09-22')
  assert.equal(dates.shiftBusinessDate('2026-09-22', -1), '2026-09-21')
  assert.match(assignSource, /planClassTeacherAssignment/)
  assert.match(removeSource, /businessDate\(\)/)
  assert.doesNotMatch(assignSource + removeSource, /toISOString\(\)/)
  assert.doesNotMatch(assignSource, /upsert\(|onConflict/)
})

test('primary handoff gives the change date to the new teacher only', async () => {
  const dates = await import('../app/admin/_lib/business-date.ts')
  const model = await import('../app/admin/classes/teacher-assignment.ts')
  const current = {
    id: 'row-a',
    teacher_id: 'teacher-a',
    teacher_role: 'PRIMARY',
    is_active: true,
    assigned_at: '2026-01-01',
    ended_at: null,
  }
  const plan = model.planClassTeacherAssignment([current], {
    teacherId: 'teacher-b',
    role: 'PRIMARY',
    assignedAt: dates.businessDate(new Date('2026-09-21T18:30:00Z')),
  })
  assert.equal(plan.kind, 'assign')
  assert.equal(plan.assignedAt, '2026-09-22')
  assert.equal(plan.closeOn, '2026-09-21')
  const stored = [
    { ...current, is_active: false, ended_at: plan.closeOn },
    {
      id: 'row-b',
      teacher_id: 'teacher-b',
      teacher_role: 'PRIMARY',
      is_active: true,
      assigned_at: plan.assignedAt,
      ended_at: null,
    },
  ]
  assert.equal(model.primaryOnDate(stored, '2026-09-21'), 'teacher-a')
  assert.equal(model.primaryOnDate(stored, '2026-09-22'), 'teacher-b')
  assert.equal(stored.filter((row) => model.primaryOnDate([row], '2026-09-21')).length, 1)
  assert.equal(stored.filter((row) => model.primaryOnDate([row], '2026-09-22')).length, 1)
})

test('same-day start cannot be closed on the previous day', async () => {
  const model = await import('../app/admin/classes/teacher-assignment.ts')
  const plan = model.planClassTeacherAssignment([
    {
      id: 'row-a',
      teacher_id: 'teacher-a',
      teacher_role: 'PRIMARY',
      is_active: true,
      assigned_at: '2026-09-22',
      ended_at: null,
    },
  ], {
    teacherId: 'teacher-b',
    role: 'PRIMARY',
    assignedAt: '2026-09-22',
  })
  assert.deepEqual(plan, { kind: 'refused', reason: 'same_day_start' })
})

test('reassigning the same teacher does not overwrite the closed period', async () => {
  const model = await import('../app/admin/classes/teacher-assignment.ts')
  const history = {
    id: 'row-a',
    teacher_id: 'teacher-a',
    teacher_role: 'PRIMARY',
    is_active: false,
    assigned_at: '2026-01-01',
    ended_at: '2026-03-31',
  }
  const dates = await import('../app/admin/_lib/business-date.ts')
  assert.equal(dates.businessDate(new Date('2026-05-31T18:30:00Z')), '2026-06-01')
  const plan = model.planClassTeacherAssignment([history], {
    teacherId: 'teacher-a',
    role: 'PRIMARY',
    assignedAt: '2026-06-01',
  })
  assert.deepEqual(plan, { kind: 'refused', reason: 'history_gap' })
  assert.equal(history.assigned_at, '2026-01-01')
  assert.equal(history.ended_at, '2026-03-31')
})
