import test from 'node:test'
import assert from 'node:assert/strict'
import { makeupSessionRoster } from '../app/admin/attendance/roster.ts'

const host = { id: 'enr-host', student_id: 'student-host' }
const guest = { id: 'enr-guest', student_id: 'student-guest' }

test('makeup roster keeps a student booked from another class', () => {
  const result = makeupSessionRoster(['enr-host', 'enr-guest'], [host, guest])
  assert.equal(result.complete, true)
  assert.deepEqual(result.roster.map(row => row.id), ['enr-host', 'enr-guest'])
})

test('a missing cross-class booking is not a complete headcount', () => {
  const result = makeupSessionRoster(['enr-host', 'enr-guest'], [host])
  assert.equal(result.complete, false)
  assert.equal(result.roster.length, 1)
})

test('duplicate participant ids are not counted as two seats', () => {
  const result = makeupSessionRoster(['enr-guest', 'enr-guest'], [guest])
  assert.equal(result.complete, false)
  assert.equal(result.roster.length, 1)
})
