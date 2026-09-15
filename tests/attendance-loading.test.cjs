/* eslint-disable @typescript-eslint/no-require-imports -- Test actual loader with session query fixtures. */
const test = require('node:test')
const assert = require('node:assert/strict')
const { harness, id } = require('./helpers/finance-operations.cjs')
test('empty session result does not load attendance history', async () => {
  const h = harness()
  const result = await h.load('../attendance/attendance-loader.ts').loadVisibleAttendance(h.db, [])
  assert.deepEqual(result, { data: [], error: null })
  assert.equal(h.calls.length, 0)
})
test('attendance query is restricted to visible sessions', async () => {
  const h = harness({ attendance_records: [{ session_occurrence_id: id(1), status: 'PRESENT' }, { session_occurrence_id: id(2), status: 'ABSENT' }] })
  const result = await h.load('../attendance/attendance-loader.ts').loadVisibleAttendance(h.db, [id(1)])
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].session_occurrence_id, id(1))
})
test('missing deployed view reports schema update, without falling back to primary teacher', () => {
  const h = harness()
  const message = h.load('../attendance/attendance-loader.ts').attendanceLoadMessage({ session_actual_teachers: { code: 'PGRST205' } })
  assert.match(message, /database chưa được cập nhật/)
})
test('permission/network failures are not misdiagnosed as missing migrations', () => {
  const { attendanceLoadMessage } = harness().load('../attendance/attendance-loader.ts')
  assert.doesNotMatch(attendanceLoadMessage({ sessions: { code: '42501' } }), /chưa được cập nhật/)
  assert.equal(attendanceLoadMessage({ sessions: null }), null)
})
