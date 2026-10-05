import assert from 'node:assert/strict'
import test from 'node:test'
import { primaryShiftWouldExceedTwo } from '../lib/teaching-shifts/overlap.ts'

const slot = (classId, start, end, day = 1) => ({
  classId,
  dayOfWeek: day,
  startTime: start,
  endTime: end,
  effectiveFrom: '2026-10-06',
  effectiveTo: null,
})

test('a second overlapping primary shift is allowed', () => {
  assert.equal(primaryShiftWouldExceedTwo(slot('new', '09:00', '10:00'), [slot('a', '09:00', '10:00')]), false)
})

test('a third shift is blocked when two other shifts overlap the same interval', () => {
  assert.equal(primaryShiftWouldExceedTwo(slot('new', '09:00', '10:00'), [
    slot('a', '09:00', '10:00'),
    slot('b', '09:30', '10:30'),
  ]), true)
})

test('two shifts that do not overlap each other stay within the limit', () => {
  assert.equal(primaryShiftWouldExceedTwo(slot('new', '09:00', '15:00'), [
    slot('a', '09:00', '10:00'),
    slot('b', '14:00', '15:00'),
  ]), false)
})

test('schedules of one other shift do not count as two shifts', () => {
  assert.equal(primaryShiftWouldExceedTwo(slot('new', '09:00', '11:00'), [
    slot('a', '09:00', '10:00'),
    slot('a', '10:00', '11:00'),
  ]), false)
})
