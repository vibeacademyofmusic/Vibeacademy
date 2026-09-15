import Link from 'next/link'
import { adminClient, type Params } from '../../finance/operations'
import { branches } from '../../finance/query'
import { money } from '../../finance/data'
import { Field, Select, Panel, Table, Pager, Notice, LoadError, dateText, timeText } from '../../finance/_components/ui'
import SubmitButton from '../../finance/_components/SubmitButton'
import { plans, debts } from '../data'
import { reminders, kpis, timing, filters } from './data'
import { generateReminders, resolveReminder } from './actions'
export default async function ReminderPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams, db = await adminClient()
  let loaded
  try {
    const base = await Promise.all([reminders(db, params), kpis(db), branches(db), plans(db)])
    loaded = { base, debtRows: await debts(db, base[0].data.map(r => r.enrollment_tuition_id)) }
  } catch { return <LoadError /> }
  const { base: [list, counts, branchRows, planRows], debtRows } = loaded
  const debtMap = new Map(debtRows.map(d => [d.enrollment_tuition_id, d]))
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Nhắc học phí</h1><Notice params={params} />
    <p>Hàng đợi nội bộ, chưa gửi Zalo hoặc email. Chỉ tạo cho kỳ đang trong thời gian học và ghi danh còn hoạt động. Lịch nhắc neo vào ngày bắt đầu kỳ, không dịch theo bảo lưu.</p>
    <Panel title="Tổng quan toàn hệ thống"><p className="text-sm">Các số liệu không thay đổi theo bộ lọc bên dưới. Tuần bắt đầu thứ Hai, ngày theo giờ Việt Nam.</p><div className="grid gap-3 sm:grid-cols-4"><p>Đến hạn tuần này: <strong>{counts.week}</strong></p><p>Sắp đến hạn tháng này: <strong>{counts.upcoming}</strong></p><p>Quá hạn nhắc: <strong>{counts.overdue}</strong></p><p>Đã gửi tháng này: <strong>{counts.sent}</strong></p></div></Panel>
    <form action={generateReminders}><SubmitButton>Tạo nhắc học phí còn thiếu</SubmitButton></form>
    <form className="grid gap-3 sm:grid-cols-4"><Select name="state" label="Thời điểm / trạng thái" options={filters} value={params.state} /><Select name="branch" label="Chi nhánh" options={branchRows} value={params.branch} /><Select name="plan" label="Gói học phí" options={planRows} value={params.plan} /><button className="rounded border p-2">Lọc nhắc học phí</button></form>
    <Table headers={['Học viên', 'Chi nhánh / gói', 'Kỳ học hiện tại', 'Khoảng nhắc', 'Trạng thái', 'Học phí hiện tại', 'Hóa đơn / công nợ', 'Xử lý']} rows={list.data.map(r => {
      const debt = debtMap.get(r.enrollment_tuition_id)
      return [r.full_name + ' (' + r.student_code + ')', r.branch_name_snapshot + ' / ' + r.plan_name_snapshot,
        <Link prefetch={false} key="term" href={'/admin/tuition?selected=' + r.enrollment_tuition_id}>{dateText(r.starts_on)} → {dateText(r.effective_ends_on)}</Link>,
        dateText(r.window_start) + ' → ' + dateText(r.window_end), r.status === 'PENDING' ? 'PENDING • ' + timing(r) : r.status, money(r.amount, r.currency),
        debt ? <Link prefetch={false} key="invoice" href={'/admin/finance/invoices?selected=' + debt.invoice_id}>{debt.invoice_number} • {debt.receivable_status} • {debt.invoice_status === 'ISSUED' ? 'Còn nợ' : 'Số dư hóa đơn (chưa ghi nhận công nợ)'}{' '}{money(debt.outstanding_balance, debt.currency)}</Link> : 'Chưa có hóa đơn',
        r.status === 'PENDING' ? <form action={resolveReminder} key={r.id} className="min-w-48 space-y-2"><input type="hidden" name="reminder_id" value={r.id} /><Select name="status" label="Xử lý nhắc" required options={[{ id: 'SKIPPED', name: 'Bỏ qua' }, { id: 'CANCELLED', name: 'Hủy do không hợp lệ' }]} /><Field name="reason" label="Lý do" /><SubmitButton>Lưu xử lý</SubmitButton></form> : <span key="audit">{r.reason}{r.marked_at && <small className="block">{timeText(r.marked_at)}</small>}</span>]
    })} /><Pager path="/admin/tuition/reminders" params={params} {...list} />
  </div>
}
