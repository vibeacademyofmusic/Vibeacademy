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

export const periodLabels: Record<PeriodState, string> = { ACTIVE: 'Trong kỳ', UPCOMING: 'Chưa bắt đầu', EXPIRED: 'Đã hết hạn', UNLIMITED: 'Vô hạn', HOLD: 'Chờ xác nhận' }
export function filterSourcePeriods(data: SourceRow[], today: string, params: { period_state?: string; period_student?: string }) {
  const search = (params.period_student ?? '').trim().normalize('NFC').toLocaleLowerCase('vi')
  return data.map(row => ({ row, ...periodTiming(row, today) })).filter(({ row, state, days }) =>
    matchesPeriodFilter({ state, days }, params.period_state) &&
    (!search || `${row.students?.full_name ?? ''} ${row.students?.student_code ?? ''} ${row.source_excel_row}`.normalize('NFC').toLocaleLowerCase('vi').includes(search)))
}
export function periodRemaining(row: SourceRow, state: PeriodState, days: number | null, today: string) {
  return state === 'HOLD' ? 'Chưa tính' : state === 'UNLIMITED' ? 'Không hết hạn' : state === 'UPCOMING' ? `Bắt đầu sau ${daysBetween(today, row.fee_starts_on!)} ngày` : days! < 0 ? `Đã hết hạn ${Math.abs(days!)} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`
}

export function sourceMoneyLabel(row: SourceRow) {
  const value = row.normalized_payload.tuition_money_confirmation as Record<string, unknown> | undefined
  if (!value || value.version !== 'OWNER_CONFIRMED_V1') return 'Chưa đối soát số tiền'
  if (value.student_id !== row.target_student_id || value.starts_on !== row.fee_starts_on || value.ends_on !== row.source_effective_ends_on || value.currency !== 'VND' ||
      ![value.total_amount, value.paid_amount, value.outstanding_amount].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0) ||
      Number(value.total_amount) !== Number(value.paid_amount) + Number(value.outstanding_amount)) return 'Cần đối chiếu lại số tiền'
  const format = (n: unknown) => Number(n).toLocaleString('vi-VN') + 'đ'
  return `Tổng ${format(value.total_amount)} · Đã đóng ${format(value.paid_amount)} · Còn nợ ${format(value.outstanding_amount)} (chủ trường xác nhận; chờ ghi sổ)`
}
