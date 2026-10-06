export type ShiftSlot = {
  classId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  effectiveFrom: string
  effectiveTo: string | null
}

function minutes(value: string) {
  const [hours, mins] = value.slice(0, 5).split(':').map(Number)
  return hours * 60 + mins
}

export function shiftTimesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return minutes(startA) < minutes(endB) && minutes(endA) > minutes(startB)
}

export function shiftDatesOverlap(
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null,
) {
  const aEnd = endA ?? '9999-12-31'
  const bEnd = endB ?? '9999-12-31'
  return startA <= bEnd && aEnd >= startB
}

function slotsOverlap(a: ShiftSlot, b: ShiftSlot) {
  return a.dayOfWeek === b.dayOfWeek
    && shiftTimesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)
    && shiftDatesOverlap(a.effectiveFrom, a.effectiveTo, b.effectiveFrom, b.effectiveTo)
}

// A primary teacher may cover two shifts at once. A third distinct shift
// is blocked only when two other shifts already overlap each other inside
// the candidate interval.
export function primaryShiftWouldExceedTwo(candidate: ShiftSlot, others: ShiftSlot[]) {
  const overlapping = others.filter(slot => slot.classId !== candidate.classId && slotsOverlap(candidate, slot))
  for (let i = 0; i < overlapping.length; i += 1) {
    for (let j = i + 1; j < overlapping.length; j += 1) {
      if (overlapping[i].classId !== overlapping[j].classId && slotsOverlap(overlapping[i], overlapping[j])) {
        return true
      }
    }
  }
  return false
}
