import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { uuidPattern } from '@/app/admin/finance/operations'
import { money } from '@/app/admin/payroll/data'
import { Table, timeText, dateText, LoadError } from '@/app/admin/finance/_components/ui'
import Document from '../../_components/Document'
import { payslipTotals, type Payslip } from '../data'
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidPattern.test(id)) notFound()
  const db = await createClient(), result = await db.rpc('payroll_payslip', { p_payroll: id })
  if (result.error) return <LoadError/>
  if (!result.data) notFound()
  const data = result.data as Payslip, { payroll: pay, period, lines, adjustments } = data, totals = payslipTotals(data)
  if (Math.round(totals.net * 100) !== Math.round(Number(pay.gross_amount) * 100)) return <LoadError/>
  return <Document title="Phiếu lương" reference={pay.id}>
    <p>{data.employee_code} — {pay.teacher_name}</p><p>Kỳ: {dateText(period.starts_on)} → {dateText(period.ends_on)} • {pay.pay_type}</p>
    <p>Chi nhánh trả lương (mã tham chiếu): {pay.branch_id} • {period.status}</p>
    {lines.filter(l => l.required_minutes != null).map(l => <p key={l.id}>Phút lịch bắt buộc: {l.required_minutes}; phút được trả: {l.payable_minutes}; tỷ lệ: {Number(l.required_minutes) > 0 ? (Number(l.payable_minutes) / Number(l.required_minutes) * 100).toFixed(2) + '%' : 'Không áp dụng'}. Lương tháng đầy đủ: {money(l.rate, pay.currency)}.</p>)}
    <Table headers={['Ngày', 'Khoản thu nhập', 'Giờ theo lịch', 'Mức đã áp dụng', 'Thành tiền']} rows={lines.map(l => [dateText(l.earned_on), l.kind, l.hours, money(l.rate, pay.currency), money(l.amount, pay.currency)])}/>
    <Table headers={['Điều chỉnh', 'Lý do', 'Số tiền']} rows={adjustments.map(a => [a.kind, a.reason, money(a.amount, pay.currency)])}/>
    <footer className="space-y-2 border-t pt-4"><p>Tổng thu nhập: {money(totals.earnings, pay.currency)}</p><p>Tổng khoản giảm: {money(totals.deductions, pay.currency)}</p><p className="text-xl font-bold">Thực lĩnh: {money(pay.gross_amount, pay.currency)}</p><p>Người duyệt: {period.approved_by} • {timeText(period.approved_at)}</p><p>Chốt kỳ: {period.finalized_at ? timeText(period.finalized_at) : 'Chưa chốt'}</p><p>Số liệu từ bảng lương đã duyệt; phiếu này không xác nhận đã chuyển tiền. Lương giờ dùng thời lượng buổi theo lịch.</p></footer>
  </Document>
}
