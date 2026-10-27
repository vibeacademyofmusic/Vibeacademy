import Link from 'next/link'
import { DataTable, InlineNotice, SectionCard, StatusBadge } from '../../_components/vibe'
import { dateText } from '../../finance/_components/ui'
import { periodRemaining, type SourceRow } from '../source-periods'
import { trackedSourceReminders } from './source-reminder-periods'

export default function SourceReminderPeriods({ data, today }: { data: SourceRow[]; today: string }) {
  const periods = trackedSourceReminders(data, today)
  if (!periods.length) return null
  return <SectionCard title={`Kỳ nhắc học phí từ danh sách Cần Thơ · ${periods.length} kỳ`}>
    <p>Theo dõi từ 35 ngày trước ngày kết thúc kỳ. Các kỳ đã hết hạn vẫn được giữ để tiếp tục xử lý.</p>
    <InlineNotice>Đã đưa vào danh sách theo dõi. Số tiền đang chờ đối soát; chưa gửi nhắc phí, chưa tạo hóa đơn hoặc yêu cầu thanh toán.</InlineNotice>
    <DataTable headers={['STT', 'Học viên', 'Môn / gói', 'Kỳ học phí', 'Bắt đầu khoảng nhắc', 'Thời gian còn lại', 'Trạng thái xử lý']} rows={periods.map(({ row, state, days, needsReview }, index) => {
      const marker = row.normalized_payload.tuition_reminder_tracking as Record<string, unknown>
      const tracking = row.normalized_payload.tuition_tracking as Record<string, unknown>
      return [index + 1,
        <div key="student"><Link href={`/admin/students/${row.target_student_id}`}>{row.students?.full_name} · {row.students?.student_code}</Link><small className="block">Dòng Excel {row.source_excel_row}</small></div>,
        <div key="plan">{String(row.normalized_payload.source_program ?? '—')}<small className="block">{String(tracking?.plan_label ?? 'Chờ đối chiếu')}</small></div>,
        needsReview ? 'Cần đối chiếu lại kỳ' : `${dateText(row.fee_starts_on)} – ${dateText(row.source_effective_ends_on)}`,
        needsReview ? 'Chờ xác nhận' : dateText(String(marker.window_start)),
        needsReview ? 'Chờ xác nhận' : periodRemaining(row, state, days, today),
        <StatusBadge key="status" tone="warning">{needsReview ? 'Cần đối chiếu lại kỳ' : 'Chờ đối soát số tiền'}</StatusBadge>,
      ]
    })} />
  </SectionCard>
}
