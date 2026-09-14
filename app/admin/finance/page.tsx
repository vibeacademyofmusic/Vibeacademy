import type { ReactNode } from 'react'
import { currencies, loadFinance, money, sum, type Forecast } from './data'

const count = (value: number | string) => new Intl.NumberFormat('vi-VN').format(Number(value))
const unavailable = <p className="p-4 text-sm text-amber-800">Không tải được dữ liệu phần này. Vui lòng thử lại sau.</p>
function Cards({ items }: { items: [string, string][] }) {
  return <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(([label, value]) =>
    <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
      <dt className="text-sm text-gray-600">{label}</dt><dd className="mt-2 break-words text-xl font-semibold text-gray-950">{value}</dd>
    </div>)}</dl>
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4"><h2 className="text-xl font-semibold text-gray-950">{title}</h2>{children}</section>
}
function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] | null }) {
  if (rows === null) return unavailable
  return <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white"><table className="w-full text-left text-sm">
    <thead className="bg-gray-50 text-gray-600"><tr>{headers.map(h => <th scope="col" key={h} className="whitespace-nowrap px-4 py-3">{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-gray-100">{rows.length ? rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="whitespace-nowrap px-4 py-3">{cell}</td>)}</tr>) : <tr><td colSpan={headers.length} className="p-6 text-center text-gray-500">Chưa có dữ liệu</td></tr>}</tbody>
  </table></div>
}
function ForecastCards({ rows }: { rows: Forecast[] }) {
  return currencies(rows).map(currency => <div key={currency} className="space-y-2">
    <h3 className="font-medium">{currency}</h3><Cards items={[
      ['Kỳ học phí sắp hết hạn', count(sum(rows, currency, 'expiring_tuition_count'))],
      ['Học viên sắp hết hạn (tổng theo chi nhánh)', count(sum(rows, currency, 'expiring_student_count'))],
      ['Giá trị gia hạn dự kiến', money(sum(rows, currency, 'projected_renewal_amount'), currency)],
      ['Công nợ đến hạn dự kiến thu', money(sum(rows, currency, 'expected_cash_due'), currency)],
      ['Tổng cơ hội thu dự kiến', money(sum(rows, currency, 'gross_forecast_opportunity'), currency)],
    ]} /></div>)
}
export default async function FinancePage() {
  const data = await loadFinance()
  const failures = [
    ['Dòng tiền tháng này', data.cash], ['Tổng hợp tài chính', data.finance],
    ['Dự báo hệ thống', data.forecast], ['Dự báo chi nhánh', data.branches], ['Giao dịch gần nhất', data.ledger],
  ].filter(([, rows]) => rows === null).map(([label]) => String(label))
  return <div className="space-y-8">
    <header><h1 className="text-3xl font-bold text-gray-950">Tài chính</h1><p className="mt-2 text-sm text-gray-600">Tổng quan chỉ đọc • Tháng {data.month.slice(5, 7)}/{data.month.slice(0, 4)} • Giờ Việt Nam</p></header>
    {failures.length > 0 && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">Không tải được: {failures.join(', ')}. Các phần còn lại vẫn được hiển thị.</div>}
    <Section title="Dòng tiền tháng này">
      <p className="text-sm text-gray-500">Tiền đã thu và hoàn trong tháng, tính theo ngày Việt Nam. Dòng tiền thuần không phải lợi nhuận.</p>
      {data.cash === null ? unavailable : currencies(data.cash).map(currency => <div key={currency} className="space-y-2"><h3 className="font-medium">{currency}</h3><Cards items={[
        ['Tiền thu tháng này', money(sum(data.cash!, currency, 'cash_in'), currency)],
        ['Tiền hoàn tháng này', money(sum(data.cash!, currency, 'cash_out'), currency)],
        ['Dòng tiền thuần tháng này', money(sum(data.cash!, currency, 'net_cash'), currency)],
      ]} /></div>)}
    </Section>
    <Section title="Công nợ và hóa đơn hiện tại">
      <p className="text-sm text-gray-500">Tổng hợp toàn bộ hóa đơn đã phát hành và thanh toán đã phân bổ, không giới hạn trong tháng này.</p>
      {data.finance === null ? unavailable : currencies(data.finance).map(currency => <div key={currency} className="space-y-2"><h3 className="font-medium">{currency}</h3><Cards items={[
        ['Tổng công nợ', money(sum(data.finance!, currency, 'outstanding_amount'), currency)],
        ['Công nợ quá hạn', money(sum(data.finance!, currency, 'overdue_amount'), currency)],
        ['Hóa đơn quá hạn', count(sum(data.finance!, currency, 'overdue_invoice_count'))],
        ['Hóa đơn đã phát hành', count(sum(data.finance!, currency, 'issued_invoice_count'))],
        ['Giá trị hóa đơn đã phát hành', money(sum(data.finance!, currency, 'billed_amount'), currency)],
        ['Thanh toán đã phân bổ', money(sum(data.finance!, currency, 'applied_payment_amount'), currency)],
      ]} /></div>)}
    </Section>
    <p className="text-sm text-gray-600">Dự báo gồm cơ hội gia hạn và công nợ đến hạn; không phải tiền đã thu hoặc cam kết thu. Số học viên được cộng theo chi nhánh, có thể trùng giữa các chi nhánh.</p>
    <Section title="Dự báo tháng hiện tại">{data.forecast === null ? unavailable : <ForecastCards rows={data.forecast.filter(r => r.forecast_period === 'CURRENT_MONTH')} />}</Section>
    <Section title="Dự báo tháng kế tiếp">{data.forecast === null ? unavailable : <ForecastCards rows={data.forecast.filter(r => r.forecast_period === 'NEXT_MONTH')} />}</Section>
    <Section title="Tài chính theo chi nhánh — lũy kế">
      <Table headers={['Chi nhánh', 'Tiền tệ', 'Đã phát hành', 'Đã phân bổ', 'Công nợ', 'Quá hạn', 'Tiền thu', 'Tiền hoàn', 'Dòng tiền thuần', 'Hóa đơn quá hạn']} rows={data.finance?.map(r => [r.branch_name, r.currency, ...[r.billed_amount, r.applied_payment_amount, r.outstanding_amount, r.overdue_amount, r.cash_received, r.cash_refunded, r.net_cash].map(v => money(v, r.currency)), count(r.overdue_invoice_count)]) ?? null} />
    </Section>
    <Section title="Dự báo theo chi nhánh">
      <Table headers={['Chi nhánh', 'Kỳ dự báo', 'Tiền tệ', 'Học viên sắp hết hạn', 'Gia hạn dự kiến', 'Công nợ đến hạn', 'Tổng cơ hội thu']} rows={data.branches?.map(r => [r.branch_name, r.forecast_period === 'CURRENT_MONTH' ? 'Tháng hiện tại' : 'Tháng kế tiếp', r.currency, count(r.expiring_student_count), money(r.projected_renewal_amount, r.currency), money(r.expected_cash_due, r.currency), money(r.gross_forecast_opportunity, r.currency)]) ?? null} />
    </Section>
    <Section title="20 giao dịch gần nhất">
      <Table headers={['Thời gian (Việt Nam)', 'Loại', 'Chi nhánh', 'Mã giao dịch', 'Phương thức', 'Tiền tệ', 'Tiền vào', 'Tiền ra', 'Dòng tiền thuần']} rows={data.ledger?.map(r => [new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(r.occurred_at)), r.transaction_type === 'PAYMENT' ? 'Thu tiền (PAYMENT)' : 'Hoàn tiền (REFUND)', r.branch_name, r.transaction_number, r.payment_method ?? '—', r.currency, money(r.cash_in, r.currency), money(r.cash_out, r.currency), money(r.net_cash, r.currency)]) ?? null} />
    </Section>
  </div>
}
