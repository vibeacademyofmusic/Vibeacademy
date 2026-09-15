import { createClient } from '@/lib/supabase/server'
import { all, branches, invoiceList } from '../query'
import { currencies, money, sum } from '../data'
import type { Params } from '../operations'
import { InvoiceFilters, InvoiceTable } from '../_components/InvoiceList'
import { LoadError, Pager, Panel } from '../_components/ui'
type Summary = { currency: string; total_outstanding: number; total_overdue: number; overdue_invoice_count: number; unpaid_invoice_count: number; partially_paid_invoice_count: number }
export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const db = await createClient()
  let loaded
  try { loaded = await Promise.all([invoiceList(db, params, true), branches(db), all<Summary>((a, b) => db.from('student_receivable_summary').select('currency,total_outstanding,total_overdue,overdue_invoice_count,unpaid_invoice_count,partially_paid_invoice_count').order('student_id').order('currency').range(a, b).returns<Summary[]>())]) } catch { return <LoadError /> }
  const [list, branchRows, summary] = loaded
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Công nợ</h1>
    <Panel title="Tổng công nợ toàn hệ thống"><p className="text-sm text-gray-600">Các chỉ số toàn hệ thống, không thay đổi theo bộ lọc danh sách bên dưới.</p>
      {currencies(summary).map(currency => <div key={currency}><h3 className="font-semibold">{currency}</h3><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ['Tổng công nợ', money(sum(summary, currency, 'total_outstanding'), currency)], ['Tổng quá hạn', money(sum(summary, currency, 'total_overdue'), currency)],
        ['Hóa đơn quá hạn', sum(summary, currency, 'overdue_invoice_count')], ['Hóa đơn chưa thanh toán', sum(summary, currency, 'unpaid_invoice_count')], ['Hóa đơn thanh toán một phần', sum(summary, currency, 'partially_paid_invoice_count')],
      ].map(([label, value]) => <div key={label} className="rounded border p-3"><dt className="text-sm">{label}</dt><dd className="mt-2 text-xl font-semibold">{value}</dd></div>)}</dl></div>)}
    </Panel>
    <p className="text-sm">Mặc định hiển thị công nợ còn mở: OVERDUE, UNPAID và PARTIALLY_PAID. Chọn PAID hoặc “Tất cả, gồm đã thanh toán” để xem các khoản đã trả.</p>
    <InvoiceFilters params={params} branches={branchRows} debt /><InvoiceTable {...list} debt /><Pager path="/admin/finance/receivables" params={params} {...list} />
  </div>
}
