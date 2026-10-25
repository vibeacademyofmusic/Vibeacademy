export type RosterEnrollment = {
  id: string
  student_id: string
}

// A makeup session's list is the booked participants, including a student
// whose enrollment belongs to another class. A short load is incomplete.
export function makeupSessionRoster(
  participantEnrollmentIds: readonly string[],
  loadedEnrollments: readonly RosterEnrollment[],
) {
  const expected = [...new Set(participantEnrollmentIds)]
  const byId = new Map(loadedEnrollments.map(row => [row.id, row]))
  const roster = expected.flatMap(id => {
    const row = byId.get(id)
    return row ? [row] : []
  })
  return {
    roster,
    complete: roster.length === expected.length && expected.length === participantEnrollmentIds.length,
  }
}
