import assert from 'node:assert/strict'
import test from 'node:test'
import { assessParallelShiftProposal } from '../lib/teaching-shifts/parallel-readiness.ts'

const slot = { dayOfWeek: 3, startTime: '18:00', endTime: '19:30', effectiveFrom: null, effectiveTo: null }

function proposal() {
  return {
    sourceSlot: { dayOfWeek: 3, startTime: '18:00', endTime: '19:30' },
    existing: {
      classId: 'existing-class', code: 'PIANO-T4-1800',
      slot: { ...slot },
      roomId: 'room-one', roomCapacity: 6, roomCapacityConfirmed: true, roomActive: true,
      configuredCapacity: 6,
      approvedCapacity: 6, occupied: 0,
      proposedStudentIds: ['student-a', 'student-b', 'student-c', 'student-d', 'student-e', 'student-f'],
      primaryTeacherId: 'teacher-one',
    },
    parallel: {
      classId: null, code: 'PIANO-T4-1800-B', slot: { ...slot }, roomId: 'room-two',
      roomCapacity: 6, roomCapacityConfirmed: true, roomActive: true,
      capacity: 6, capacityApproved: true, configuredCapacity: null, occupied: 0,
      proposedStudentIds: ['student-g', 'student-h', 'student-i'], groupApproved: true,
      primaryTeacherId: 'teacher-one',
    },
    confirmedStudentIds: ['student-a', 'student-b', 'student-c', 'student-d', 'student-e',
      'student-f', 'student-g', 'student-h', 'student-i'],
    allBranchClasses: [{ id: 'existing-class', code: 'PIANO-T4-1800' }],
    allRoomBookings: [],
  }
}

test('Piano rooms with confirmed six-seat capacity can plan 6+3 without assigning real students', () => {
  assert.deepEqual(assessParallelShiftProposal(proposal()), {
    ready: true,
    blockers: [],
    staffingOptions: ['SHARED_PRIMARY', 'DIFFERENT_PRIMARY', 'OPTIONAL_ASSISTANT'],
  })
})

test('unknown physical capacity is not substituted by a database configuration', () => {
  const input = proposal()
  input.existing.approvedCapacity = null
  input.existing.roomCapacityConfirmed = false
  input.parallel.roomCapacityConfirmed = false
  assert.deepEqual(assessParallelShiftProposal(input).blockers,
    ['EXISTING_ROOM_CAPACITY_UNAPPROVED_OR_INACTIVE', 'EXISTING_CAPACITY_UNAPPROVED',
      'ROOM_INACTIVE_OR_CAPACITY_UNAPPROVED'])
})

test('parallel room is considered only after the existing group reaches confirmed capacity', () => {
  const input = proposal()
  input.existing.proposedStudentIds = input.existing.proposedStudentIds.slice(0, 5)
  assert.ok(assessParallelShiftProposal(input).blockers.includes('EXISTING_NOT_FULL'))
  input.existing.proposedStudentIds.push('student-j', 'student-k')
  assert.ok(assessParallelShiftProposal(input).blockers.includes('EXISTING_OVER_CAPACITY'))
})

test('already enrolled students count toward Piano 1 before proposing a 6+3 split', () => {
  const input = proposal()
  input.existing.occupied = 2
  input.existing.proposedStudentIds = input.existing.proposedStudentIds.slice(0, 4)
  assert.equal(assessParallelShiftProposal(input).ready, true)
  input.existing.occupied = 3
  assert.ok(assessParallelShiftProposal(input).blockers.includes('EXISTING_OVER_CAPACITY'))
})

test('unknown member or unapproved grouping never becomes an automatic split', () => {
  const input = proposal()
  input.parallel.groupApproved = false
  input.parallel.proposedStudentIds = ['student-g', 'short-name-only']
  const blockers = assessParallelShiftProposal(input).blockers
  assert.ok(blockers.includes('GROUP_UNAPPROVED_OR_EMPTY'))
  assert.ok(blockers.includes('STUDENT_IDENTITY_UNCONFIRMED_OR_DUPLICATE'))
})

test('the parallel group keeps source weekday and hours, with unique code and room', () => {
  const input = proposal()
  input.parallel.slot = { ...slot, dayOfWeek: 4 }
  input.parallel.code = input.existing.code
  input.parallel.roomId = input.existing.roomId
  const blockers = assessParallelShiftProposal(input).blockers
  assert.ok(blockers.includes('SOURCE_TIME_CHANGED'))
  assert.ok(blockers.includes('CLASS_CODE_MISSING_OR_REUSED'))
  assert.ok(blockers.includes('ROOM_MISSING_OR_REUSED'))
})

test('unknown or too-small room cannot host the proposed capacity', () => {
  const input = proposal()
  input.parallel.roomCapacity = null
  assert.ok(assessParallelShiftProposal(input).blockers.includes('ROOM_INACTIVE_OR_CAPACITY_UNAPPROVED'))
  input.parallel.roomCapacity = 1
  assert.ok(assessParallelShiftProposal(input).blockers.includes('ROOM_TOO_SMALL'))
})

test('both physical rooms must fit their independently approved group capacities', () => {
  const input = proposal()
  input.existing.roomCapacity = 5
  input.parallel.roomCapacity = 5
  const blockers = assessParallelShiftProposal(input).blockers
  assert.ok(blockers.includes('EXISTING_ROOM_TOO_SMALL'))
  assert.ok(blockers.includes('ROOM_TOO_SMALL'))
})

test('proposed parallel class capacity must be approved, even when the room is large', () => {
  const input = proposal()
  input.parallel.capacityApproved = false
  assert.ok(assessParallelShiftProposal(input).blockers.includes('PARALLEL_CAPACITY_INVALID'))
})

test('parallel class code must be unique across the whole branch', () => {
  const input = proposal()
  input.allBranchClasses.push({ id: 'other-class', code: 'piano-t4-1800-b' })
  assert.ok(assessParallelShiftProposal(input).blockers.includes('CLASS_CODE_MISSING_OR_REUSED'))
})

test('a matching existing class in the second room is reused and its live enrollments count', () => {
  const input = proposal()
  input.parallel.classId = 'parallel-class'
  input.parallel.configuredCapacity = 6
  input.parallel.occupied = 3
  input.allBranchClasses.push({ id: 'parallel-class', code: 'PIANO-T4-1800-B' })
  input.allRoomBookings.push({ classId: 'parallel-class', roomId: 'room-two', status: 'ACTIVE', ...slot })
  assert.equal(assessParallelShiftProposal(input).ready, true)
  input.parallel.proposedStudentIds.push('student-j')
  input.confirmedStudentIds.push('student-j')
  assert.ok(assessParallelShiftProposal(input).blockers.includes('PARALLEL_OVER_CAPACITY'))
})

test('an existing parallel class must have the expected code and configured capacity', () => {
  const input = proposal()
  input.parallel.classId = 'parallel-class'
  input.parallel.configuredCapacity = 4
  input.allBranchClasses.push({ id: 'parallel-class', code: 'OTHER-CODE' })
  const blockers = assessParallelShiftProposal(input).blockers
  assert.ok(blockers.includes('PARALLEL_EXISTING_CLASS_MISMATCH'))
  assert.ok(blockers.includes('PARALLEL_CAPACITY_CONFIG_MISMATCH'))
})

test('room bookings from any program block the same weekly time', () => {
  const input = proposal()
  input.allRoomBookings = [{ classId: 'other-class', roomId: 'room-two', status: 'ACTIVE', ...slot }]
  assert.ok(assessParallelShiftProposal(input).blockers.includes('ROOM_BOOKED'))
  input.allRoomBookings[0].startTime = '19:30'
  input.allRoomBookings[0].endTime = '21:00'
  assert.equal(assessParallelShiftProposal(input).ready, true)
})

test('the existing room also needs a conflict-free schedule apart from its own class', () => {
  const input = proposal()
  input.allRoomBookings = [{ classId: 'existing-class', roomId: 'room-one', status: 'ACTIVE', ...slot }]
  assert.equal(assessParallelShiftProposal(input).ready, true)
  input.allRoomBookings.push({ classId: 'other-program-class', roomId: 'room-one', status: 'ACTIVE', ...slot })
  assert.ok(assessParallelShiftProposal(input).blockers.includes('EXISTING_ROOM_BOOKED'))
})

test('a known non-overlapping date window does not reserve the room forever', () => {
  const input = proposal()
  input.parallel.slot.effectiveFrom = '2026-11-01'
  input.allRoomBookings = [{ classId: 'other-class', roomId: 'room-two', status: 'ACTIVE',
    ...slot, effectiveFrom: '2026-01-01', effectiveTo: '2026-10-31' }]
  assert.equal(assessParallelShiftProposal(input).ready, true)
})

test('one primary teacher on two simultaneous rooms is allowed; staffing options are advisory', () => {
  const input = proposal()
  const shared = assessParallelShiftProposal(input)
  assert.equal(shared.ready, true)
  assert.deepEqual(shared.blockers, [])
  assert.ok(shared.staffingOptions.includes('SHARED_PRIMARY'))
  assert.ok(shared.staffingOptions.includes('OPTIONAL_ASSISTANT'))
  input.parallel.primaryTeacherId = 'teacher-two'
  assert.equal(assessParallelShiftProposal(input).ready, true)
})

test('unconfirmed Guitar or Violin room capacity never inherits Piano six seats', () => {
  const input = proposal()
  input.existing.code = 'VIOLIN-T4-1800'
  input.existing.roomCapacity = null
  input.existing.roomCapacityConfirmed = false
  input.existing.approvedCapacity = null
  const blockers = assessParallelShiftProposal(input).blockers
  assert.ok(blockers.includes('EXISTING_ROOM_CAPACITY_UNAPPROVED_OR_INACTIVE'))
  assert.ok(blockers.includes('EXISTING_CAPACITY_UNAPPROVED'))
})
