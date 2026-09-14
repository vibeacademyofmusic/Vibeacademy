// Callers pass only ACTIVE required components; missing progress is NOT_STARTED.
export function subjectProgressValue(
  completionRule: string,
  status: string,
  components: ReadonlyArray<{ status: string }>,
): number {
  if (completionRule === 'ALL_REQUIRED_COMPONENTS') {
    return components.length
      ? components.filter(item => item.status === 'PASS' || item.status === 'EXEMPT').length / components.length
      : 0
  }
  if (status === 'PASS' || status === 'EXEMPT') return 1
  return status === 'IN_PROGRESS' ? 0.5 : 0
}

type Subject = {
  status: string
  is_required: boolean
  completion_rule: string
  progressStatus: string
  components: { status: string; is_required: boolean; progressStatus: string }[]
}

export function gradeProgressPercent(levelStatus: string, subjects: Subject[]): number | null {
  // Database completion is authoritative (including manually completed grades).
  if (levelStatus === 'COMPLETED') return 100
  const required = subjects.filter(s => s.status === 'ACTIVE' && s.is_required)
  if (!required.length) return null
  const total = required.reduce((sum, subject) => sum + subjectProgressValue(
    subject.completion_rule, subject.progressStatus,
    subject.components.filter(c => c.status === 'ACTIVE' && c.is_required)
      .map(c => ({ status: c.progressStatus })),
  ), 0)
  // A manual grade may have all passing subjects but still await confirmation.
  // Do not claim completion or invent a 99% value in that case.
  if (total === required.length) return null
  return Math.floor(total / required.length * 100)
}
