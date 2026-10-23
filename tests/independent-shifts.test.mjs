import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTimeToRemaining,
  planIndependentShifts,
  selectPresetWindows,
  sessionsFromScheduleLabel,
  weeklySelectionConflict,
  weeklySessionCount,
  windowProblems,
} from '../lib/teaching-shifts/independent.ts'

const existing = [{
  id: 'class-mon',
  code: 'PIANO-T2-1800',
  name: 'Piano · Thứ 2 · 18:00–19:30',
  branchId: 'ct',
  curriculumId: 'piano',
  dayOfWeek: 1,
  startTime: '18:00:00',
  endTime: '19:30:00',
  dayCount: 1,
  roomId: 'piano-1',
  effectiveFrom: '2026-10-26',
  effectiveTo: null,
}]

test('a day combination plans one independent shift per weekday and reuses an exact slot', () => {
  const plan = planIndependentShifts({
    programCode: 'PIANO',
    programName: 'Piano',
    branchId: 'ct',
    curriculumId: 'piano',
    days: [1, 3],
    start: '18:00',
    end: '19:30',
    roomId: 'piano-1',
    effectiveFrom: '2026-10-26',
    existing,
  })
  assert.deepEqual(plan.map(row => row.code), ['PIANO-T2-1800', 'PIANO-T4-1800'])
  assert.equal(plan[0].existing?.id, 'class-mon')
  assert.equal(plan[1].existing, null)
  assert.equal(plan[0].name.includes('Thứ 2'), true)
  assert.equal(plan[1].name.includes('Thứ 4'), true)
})

test('the same clock time in another room stays an independent shift', () => {
  const plan = planIndependentShifts({
    programCode: 'PIANO',
    programName: 'Piano',
    branchId: 'ct',
    curriculumId: 'piano',
    days: [1],
    start: '18:00',
    end: '19:30',
    roomId: 'piano-2',
    effectiveFrom: '2026-10-26',
    existing,
  })
  assert.equal(plan[0].existing, null)
  assert.equal(plan[0].code, 'PIANO-T2-1800')
})

test('the same clock time on another weekday is not treated as the same shift', () => {
  const plan = planIndependentShifts({
    programCode: 'PIANO',
    programName: 'Piano',
    branchId: 'ct',
    curriculumId: 'piano',
    days: [2],
    start: '18:00',
    end: '19:30',
    existing,
  })
  assert.equal(plan[0].existing, null)
  assert.equal(plan[0].code, 'PIANO-T3-1800')
})

test('weekly requirement is shown only when the profile states one', () => {
  assert.equal(weeklySessionCount(null, 2), null)
  assert.equal(weeklySessionCount(undefined, 2), null)
  assert.deepEqual(weeklySessionCount(3, 2), { selected: 2, required: 3, missing: 1 })
  assert.deepEqual(weeklySessionCount(2, 2), { selected: 2, required: 2, missing: 0 })
})

test('selected shifts conflict only when their times overlap', () => {
  const monday = sessionsFromScheduleLabel('a', 'Thứ 2 18:00–19:30')
  const later = sessionsFromScheduleLabel('b', 'Thứ 2 19:30–21:00')
  const overlap = sessionsFromScheduleLabel('c', 'Thứ 2 19:00–20:00')
  const wednesday = sessionsFromScheduleLabel('d', 'Thứ 4 18:00–19:30')
  assert.equal(weeklySelectionConflict([...monday, ...later]), false)
  assert.equal(weeklySelectionConflict([...monday, ...wednesday]), false)
  assert.equal(weeklySelectionConflict([...monday, ...overlap]), true)
})

test('each selected day keeps its own time and an exact slot can be reused', () => {
  const plan = planIndependentShifts({
    programCode: 'PIANO',
    programName: 'Piano',
    branchId: 'ct',
    curriculumId: 'piano',
    days: [1, 2],
    start: '18:00',
    end: '19:30',
    windows: [
      { day: 1, start: '18:00', end: '19:30' },
      { day: 2, start: '16:00', end: '17:30' },
    ],
    roomId: 'piano-1',
    effectiveFrom: '2026-10-26',
    existing,
  })
  assert.deepEqual(plan.map(row => [row.day, row.start, row.end, row.existing?.code ?? null]), [
    [1, '18:00', '19:30', 'PIANO-T2-1800'],
    [2, '16:00', '17:30', null],
  ])
})

test('a day preset adds empty rows and does not copy times until asked', () => {
  const current = [{ key: 1, day: 1, start: '18:00', end: '19:30' }]
  const selected = selectPresetWindows(current, [1, 2], 2)
  assert.deepEqual(selected.rows, [
    { key: 1, day: 1, start: '18:00', end: '19:30' },
    { key: 2, day: 2, start: '', end: '' },
  ])
  const applied = applyTimeToRemaining(selected.rows, 0)
  assert.equal(applied[1].start, '18:00')
  assert.equal(applied[1].end, '19:30')
  assert.equal(windowProblems([{ day: 2, start: '16:00', end: '16:00' }]).invalid, true)
  assert.equal(windowProblems([
    { day: 2, start: '16:00', end: '17:30' },
    { day: 2, start: '17:00', end: '18:00' },
  ]).overlap, true)
})
