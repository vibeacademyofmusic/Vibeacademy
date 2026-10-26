import Link from 'next/link'
import { DataTable, InlineNotice, MetricCard, OperationsFilterBar, SectionCard, StatusBadge } from '../_components/vibe'
import { Pager, dateText } from '../finance/_components/ui'
import { pageNumber, pageSize, type Params } from '../finance/operations'
import { periodTiming, type PeriodState, type SourceRow } from './source-periods'

const labels: Record<PeriodState, string> = { ACTIVE: 'Trong kỳ', UPCOMING: 'Chưa bắt đầu', EXPIRED: 'Đã hết hạn', UNLIMITED: 'Vô hạn', HOLD: 'Chờ xác nhận' }
const tones = { ACTIVE: 'success', UPCOMING: 'info', EXPIRED: 'warning', UNLIMITED: 'neutral', HOLD: 'warning' } as const
export default function SourcePeriods({ data, params, today }: { data: SourceRow[]; params: Params; today: string }) {
  if (!data.length) return null
  const timed = data.map(row => ({ row, ...periodTiming(row, today) }))
  const count = (state: PeriodState) => timed.filter(r => r.state === state).length
  const search = (params.period_student ?? '').trim().normalize('NFC').toLocaleLowerCase('vi')
  const filtered = timed.filter(({ row, state }) => (!params.period_state || params.period_state === state) &&
    (!search || `${row.students?.full_name ?? ''} ${row.students?.student_code ?? ''} ${row.source_excel_row}`.normalize('NFC').toLocaleLowerCase('vi').includes(search)))
  const page = pageNumber(params.period_page), visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  return <SectionCard title="Kỳ học phí từ danh sách Cần Thơ">
    <p className="text-sm">Theo dõi đến ngày {dateText(today)}. Ngày kết thúc giữ đúng danh sách đã cung cấp; số ngày còn lại được tính theo ngày Việt Nam.</p>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {(['ACTIVE', 'UPCOMING', 'EXPIRED', 'UNLIMITED', 'HOLD'] as PeriodState[]).map(state => <MetricCard key={state} title={labels[state]} value={count(state)} note="Dòng kỳ học phí" />)}
    </div>
    <InlineNotice>Số tiền và khoản đã thu đang chờ đối soát. Theo dõi kỳ chưa tạo hóa đơn, yêu cầu thanh toán hoặc nhắc phí tự động. Các hồ sơ chờ xác nhận chưa được tính ngày còn lại.</InlineNotice>
    <OperationsFilterBar action="/admin/tuition" fields={[
      { name: 'period_student', label: 'Tên / mã học viên / dòng nguồn', type: 'search', value: params.period_student },
      { name: 'period_state', label: 'Trạng thái kỳ', type: 'select', value: params.period_state, options: Object.entries(labels).map(([id, name]) => ({ id, name })) },
    ]} resetHref="/admin/tuition" submitLabel="Lọc kỳ học phí" />
    <DataTable headers={['Học viên', 'Môn / gói nguồn', 'Bắt đầu kỳ', 'Kết thúc kỳ', 'Trạng thái', 'Thời gian còn lại', 'Đối soát']} rows={visible.map(({ row, state, days }) => [
      <div key="student">{row.target_student_id && row.students ? <Link prefetch={false} href={`/admin/students/${row.target_student_id}`}>{row.students.full_name} · {row.students.student_code}</Link> : 'Chưa xác nhận hồ sơ'}<small className="block">Dòng Excel {row.source_excel_row}</small></div>,
      <div key="program">{String(row.normalized_payload.source_program ?? '—')}<small className="block">{row.is_unlimited ? 'Vô hạn' : String((row.normalized_payload.tuition_tracking as Record<string, unknown> | undefined)?.plan_label ?? 'Chờ đối chiếu gói')}</small></div>,
      state === 'HOLD' ? 'Chờ xác nhận' : dateText(row.fee_starts_on),
      state === 'UNLIMITED' ? 'Không giới hạn' : state === 'HOLD' ? 'Chờ xác nhận' : dateText(row.source_effective_ends_on),
      <StatusBadge key="status" tone={tones[state]}>{labels[state]}</StatusBadge>,
      state === 'HOLD' ? 'Chưa tính' : state === 'UNLIMITED' ? 'Không hết hạn' : state === 'UPCOMING' ? `Bắt đầu sau ${Math.abs(daysBetweenStart(today, row.fee_starts_on!))} ngày` : days! < 0 ? `Đã hết hạn ${Math.abs(days!)} ngày` : days === 0 ? 'Hết hạn hôm nay' : `Còn ${days} ngày`,
      'Chưa đối soát số tiền',
    ])} />
    <Pager path="/admin/tuition" params={params} page={page} more={filtered.length > page * pageSize} keyName="period_page" />
  </SectionCard>
}
function daysBetweenStart(today: string, start: string) { return Math.round((Date.parse(start + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) }
