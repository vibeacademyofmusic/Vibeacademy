import { filterSourcePeriods, periodLabels, periodRemaining, type SourceRow } from './source-periods'

// Quote every cell and keep user-supplied text from being evaluated as a formula.
function csvCell(value: string | number) {
  const text = String(value)
  const safe = /^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text) ? "'" + text : text
  return '"' + safe.replaceAll('"', '""') + '"'
}
function date(value: string | null) { return value ? value.split('-').reverse().join('/') : '' }
export function sourcePeriodsCsv(data: SourceRow[], today: string, params: { period_state?: string; period_student?: string }) {
  const rows: (string | number)[][] = [
    ['STT', 'Học viên', 'Mã học viên', 'Môn', 'Gói học', 'Bắt đầu kỳ', 'Kết thúc kỳ', 'Trạng thái', 'Thời gian còn lại', 'Đối soát', 'Dòng Excel nguồn', 'Ngày xuất'],
    ...filterSourcePeriods(data, today, params).map(({ row, state, days }, index) => [
      index + 1, row.students?.full_name ?? 'Chưa xác nhận hồ sơ', row.students?.student_code ?? '',
      String(row.normalized_payload.source_program ?? '—'),
      row.is_unlimited ? 'Vô hạn' : String((row.normalized_payload.tuition_tracking as Record<string, unknown> | undefined)?.plan_label ?? 'Chờ đối chiếu gói'),
      state === 'HOLD' ? 'Chờ xác nhận' : date(row.fee_starts_on),
      state === 'HOLD' ? 'Chờ xác nhận' : state === 'UNLIMITED' ? 'Không giới hạn' : date(row.source_effective_ends_on),
      periodLabels[state], periodRemaining(row, state, days, today), 'Chưa đối soát số tiền', row.source_excel_row, date(today),
    ]),
  ]
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
