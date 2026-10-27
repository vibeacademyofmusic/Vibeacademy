import { periodTiming, type SourceRow } from '../source-periods'

export function trackedSourceReminders(data: SourceRow[], today: string) {
  return data.flatMap(row => {
    const marker = row.normalized_payload.tuition_reminder_tracking as Record<string, unknown> | undefined
    if (!marker || marker.version !== 'SOURCE_REMINDER_V1' || marker.state !== 'TRACKING' || marker.notifications_eligible !== false) return []
    const timing = periodTiming(row, today)
    const unchanged = marker.student_id === row.target_student_id && marker.starts_on === row.fee_starts_on && marker.ends_on === row.source_effective_ends_on
    return [{ row, ...timing, needsReview: !unchanged || timing.state === 'HOLD' || timing.state === 'UNLIMITED' }]
  })
}
