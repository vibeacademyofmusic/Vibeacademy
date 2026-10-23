export type ParallelSlot = {
  dayOfWeek: number
  startTime: string
  endTime: string
  effectiveFrom: string | null
  effectiveTo: string | null
}

export type RoomBooking = ParallelSlot & {
  classId: string
  roomId: string | null
  status: 'ACTIVE' | 'INACTIVE'
}

export type ParallelShiftProposal = {
  sourceSlot: Pick<ParallelSlot, 'dayOfWeek' | 'startTime' | 'endTime'>
  existing: {
    classId: string
    code: string
    slot: ParallelSlot
    roomId: string | null
    roomCapacity: number | null
    roomCapacityConfirmed: boolean
    roomActive: boolean
    configuredCapacity: number
    approvedCapacity: number | null
    occupied: number
    proposedStudentIds: string[]
    primaryTeacherId: string | null
  }
  parallel: {
    classId: string | null
    code: string
    slot: ParallelSlot
    roomId: string | null
    roomCapacity: number | null
    roomCapacityConfirmed: boolean
    roomActive: boolean
    capacity: number | null
    capacityApproved: boolean
    configuredCapacity: number | null
    occupied: number
    proposedStudentIds: string[]
    groupApproved: boolean
    primaryTeacherId: string | null
  }
  confirmedStudentIds: string[]
  allBranchClasses: { id: string; code: string }[]
  allRoomBookings: RoomBooking[]
}

export type ParallelReadinessBlocker =
  | 'SOURCE_TIME_CHANGED'
  | 'CLASS_CODE_MISSING_OR_REUSED'
  | 'PARALLEL_EXISTING_CLASS_MISMATCH'
  | 'EXISTING_CAPACITY_UNAPPROVED'
  | 'EXISTING_CAPACITY_CONFIG_MISMATCH'
  | 'EXISTING_ROOM_CAPACITY_UNAPPROVED_OR_INACTIVE'
  | 'EXISTING_ROOM_TOO_SMALL'
  | 'EXISTING_ROOM_BOOKED'
  | 'EXISTING_NOT_FULL'
  | 'EXISTING_OVER_CAPACITY'
  | 'GROUP_UNAPPROVED_OR_EMPTY'
  | 'STUDENT_IDENTITY_UNCONFIRMED_OR_DUPLICATE'
  | 'PARALLEL_CAPACITY_INVALID'
  | 'PARALLEL_CAPACITY_CONFIG_MISMATCH'
  | 'PARALLEL_OVER_CAPACITY'
  | 'ROOM_MISSING_OR_REUSED'
  | 'ROOM_INACTIVE_OR_CAPACITY_UNAPPROVED'
  | 'ROOM_TOO_SMALL'
  | 'ROOM_BOOKED'

export type StaffingOption = 'SHARED_PRIMARY' | 'DIFFERENT_PRIMARY' | 'OPTIONAL_ASSISTANT'

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart.slice(0, 5) < bEnd.slice(0, 5) && bStart.slice(0, 5) < aEnd.slice(0, 5)
}

function datesOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null) {
  return aStart <= (bEnd ?? '9999-12-31') && bStart <= (aEnd ?? '9999-12-31')
}

// Planning gate only. Re-read and lock live rows before any database write.
export function assessParallelShiftProposal(input: ParallelShiftProposal) {
  const blockers: ParallelReadinessBlocker[] = []
  const add = (blocker: ParallelReadinessBlocker) => {
    if (!blockers.includes(blocker)) blockers.push(blocker)
  }
  const { existing, parallel, sourceSlot } = input
  const proposedExisting = existing.proposedStudentIds
  const proposedParallel = parallel.proposedStudentIds
  const allProposed = [...proposedExisting, ...proposedParallel]

  if (existing.slot.dayOfWeek !== sourceSlot.dayOfWeek
    || existing.slot.startTime.slice(0, 5) !== sourceSlot.startTime.slice(0, 5)
    || existing.slot.endTime.slice(0, 5) !== sourceSlot.endTime.slice(0, 5)
    || parallel.slot.dayOfWeek !== sourceSlot.dayOfWeek
    || parallel.slot.startTime.slice(0, 5) !== sourceSlot.startTime.slice(0, 5)
    || parallel.slot.endTime.slice(0, 5) !== sourceSlot.endTime.slice(0, 5)) add('SOURCE_TIME_CHANGED')
  const parallelCode = parallel.code.trim().toUpperCase()
  const matchingCode = input.allBranchClasses.filter(row => row.code.trim().toUpperCase() === parallelCode)
  if (!parallelCode || existing.code.trim().toUpperCase() === parallelCode
    || matchingCode.some(row => row.id !== parallel.classId)) {
    add('CLASS_CODE_MISSING_OR_REUSED')
  }
  if (parallel.classId && !matchingCode.some(row => row.id === parallel.classId)) {
    add('PARALLEL_EXISTING_CLASS_MISMATCH')
  }

  if (!existing.roomActive || !existing.roomCapacityConfirmed
    || !Number.isInteger(existing.roomCapacity) || (existing.roomCapacity ?? 0) <= 0) {
    add('EXISTING_ROOM_CAPACITY_UNAPPROVED_OR_INACTIVE')
  } else if (existing.configuredCapacity > existing.roomCapacity!) {
    add('EXISTING_ROOM_TOO_SMALL')
  }
  if (existing.roomId && input.allRoomBookings.some(booking =>
    booking.status === 'ACTIVE'
    && booking.classId !== existing.classId
    && booking.roomId === existing.roomId
    && booking.dayOfWeek === existing.slot.dayOfWeek
    && timesOverlap(booking.startTime, booking.endTime, existing.slot.startTime, existing.slot.endTime)
    && (existing.slot.effectiveFrom === null || booking.effectiveFrom === null
      || datesOverlap(booking.effectiveFrom, booking.effectiveTo,
        existing.slot.effectiveFrom, existing.slot.effectiveTo))
  )) add('EXISTING_ROOM_BOOKED')

  if (!Number.isInteger(existing.approvedCapacity) || (existing.approvedCapacity ?? 0) <= 0) {
    add('EXISTING_CAPACITY_UNAPPROVED')
  } else {
    if (existing.configuredCapacity !== existing.approvedCapacity) add('EXISTING_CAPACITY_CONFIG_MISMATCH')
    const planned = existing.occupied + proposedExisting.length
    if (planned < existing.approvedCapacity!) add('EXISTING_NOT_FULL')
    if (planned > existing.approvedCapacity!) add('EXISTING_OVER_CAPACITY')
  }

  if (!parallel.groupApproved || !proposedParallel.length) add('GROUP_UNAPPROVED_OR_EMPTY')
  const confirmed = new Set(input.confirmedStudentIds)
  if (allProposed.some(id => !id || !confirmed.has(id)) || new Set(allProposed).size !== allProposed.length) {
    add('STUDENT_IDENTITY_UNCONFIRMED_OR_DUPLICATE')
  }
  if (!parallel.capacityApproved || !Number.isInteger(parallel.capacity) || (parallel.capacity ?? 0) <= 0) {
    add('PARALLEL_CAPACITY_INVALID')
  }
  if (parallel.classId && parallel.configuredCapacity !== parallel.capacity) {
    add('PARALLEL_CAPACITY_CONFIG_MISMATCH')
  }
  if (!Number.isInteger(parallel.occupied) || parallel.occupied < 0
    || parallel.occupied + proposedParallel.length > (parallel.capacity ?? 0)) {
    add('PARALLEL_OVER_CAPACITY')
  }

  if (!existing.roomId || !parallel.roomId || parallel.roomId === existing.roomId) {
    add('ROOM_MISSING_OR_REUSED')
  }
  if (!parallel.roomActive || !parallel.roomCapacityConfirmed
    || !Number.isInteger(parallel.roomCapacity) || (parallel.roomCapacity ?? 0) <= 0) {
    add('ROOM_INACTIVE_OR_CAPACITY_UNAPPROVED')
  } else if ((parallel.capacity ?? 0) > parallel.roomCapacity!) add('ROOM_TOO_SMALL')

  if (parallel.roomId && input.allRoomBookings.some(booking =>
    booking.status === 'ACTIVE'
    && booking.classId !== parallel.classId
    && booking.roomId === parallel.roomId
    && booking.dayOfWeek === parallel.slot.dayOfWeek
    && timesOverlap(booking.startTime, booking.endTime, parallel.slot.startTime, parallel.slot.endTime)
    && (parallel.slot.effectiveFrom === null || booking.effectiveFrom === null
      || datesOverlap(booking.effectiveFrom, booking.effectiveTo,
        parallel.slot.effectiveFrom, parallel.slot.effectiveTo))
  )) add('ROOM_BOOKED')

  // The owner permits one PRIMARY teacher on two simultaneous classes. Staffing
  // between separate rooms is an owner decision, not a planner rejection.
  const staffingOptions: StaffingOption[] = [
    'SHARED_PRIMARY',
    'DIFFERENT_PRIMARY',
    'OPTIONAL_ASSISTANT',
  ]
  return { ready: blockers.length === 0, blockers, staffingOptions }
}
