import type { DB } from '../finance/query'
import { all } from '../finance/query'
import { daysBetween } from './data'
import { validDate } from '../finance/operations'

export const sourceBatch = 'b52d8476-7446-5130-abf8-04f0a67c992c'
export const periodSourceHash = '0c21addfc5e5971a45c635ea2bfacb9b0d4188536f033e26a9e658382c5e5dcc'
export type SourceRow = {
  id: string; source_excel_row: number; target_student_id: string | null; disposition: string;
  fee_starts_on: string | null; source_effective_ends_on: string | null; is_unlimited: boolean;
  normalized_payload: Record<string, unknown>;
  students: { full_name: string; student_code: string } | null;
}
export type PeriodState = 'ACTIVE' | 'UPCOMING' | 'EXPIRED' | 'UNLIMITED' | 'HOLD'
export function periodTiming(row: SourceRow, today: string): { state: PeriodState; days: number | null } {
  const marker = row.normalized_payload.tuition_tracking as Record<string, unknown> | undefined
  if (!marker || marker.version !== 'SOURCE_PERIOD_V1' || marker.source_sha256 !== periodSourceHash ||
      marker.source_excel_row !== row.source_excel_row || marker.student_id !== row.target_student_id ||
      marker.starts_on !== row.fee_starts_on || marker.ends_on !== row.source_effective_ends_on ||
      marker.is_unlimited !== row.is_unlimited || marker.money_state !== 'UNVERIFIED' ||
      marker.notifications_eligible !== false || !row.target_student_id || row.disposition !== 'IMPORT') return { state: 'HOLD', days: null }
  if (row.is_unlimited) return row.source_effective_ends_on === null ? { state: 'UNLIMITED', days: null } : { state: 'HOLD', days: null }
  if (!validDate(row.fee_starts_on ?? '') || !validDate(row.source_effective_ends_on ?? '') || row.source_effective_ends_on! <= row.fee_starts_on!) return { state: 'HOLD', days: null }
  const days = daysBetween(today, row.source_effective_ends_on!)
  return { state: row.fee_starts_on! > today ? 'UPCOMING' : days < 0 ? 'EXPIRED' : 'ACTIVE', days }
}
export function matchesPeriodFilter(timing: { state: PeriodState; days: number | null }, filter?: string) {
  if (filter === 'DUE_SOON') return timing.state === 'ACTIVE' && timing.days !== null && timing.days >= 0 && timing.days <= 35
  return !filter || timing.state === filter
}
export async function sourcePeriods(db: DB) {
  // Existing branch-scoped RLS governs visibility. Do not use a service-role client.
  return all<SourceRow>((from, to) => db.from('legacy_student_opening_rows')
    .select('id,source_excel_row,target_student_id,disposition,fee_starts_on,source_effective_ends_on,is_unlimited,normalized_payload,students(full_name,student_code)')
    .eq('import_batch_id', sourceBatch).neq('disposition', 'EXCLUDED')
    .is('normalized_payload->tuition_list_exclusion', null)
    .order('source_excel_row').range(from, to).returns<SourceRow[]>())
}
