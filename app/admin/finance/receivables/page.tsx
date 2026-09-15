import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { all, branches, invoiceList } from '../query'
import { currencies, money, sum } from '../data'
import type { Params } from '../operations'
import { InvoiceFilters, InvoiceTable } from '../_components/InvoiceList'
import { LoadError, Pager, Panel, Table } from '../_components/ui'
type Summary = { currency: string; total_outstanding: number; total_overdue: number; overdue_invoice_count: number; unpaid_invoice_count: number; partially_paid_invoice_count: number }
type Opening = { id: string; student_id: string; full_name: string; currency: string; net_opening_amount: number; net_opening_paid: number; outstanding_balance: number }
export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const db = await createClient()
  let loaded
  try { loaded = await Promise.all([invoiceList(db, params, true), branches(db), all<Summary>((a, b) => db.from('student_receivable_summary').select('currency,total_outstanding,total_overdue,overdue_invoice_count,unpaid_invoice_count,partially_paid_invoice_count').order('student_id').order('currency').range(a, b).returns<Summary[]>()), db.from('opening_receivable_directory').select('id,student_id,full_name,currency,net_opening_amount,net_opening_paid,outstanding_balance').eq('reversed', false).order('created_at', { ascending: false }).order('id').limit(50).returns<Opening[]>()]) } catch { return <LoadError /> }
  const [list, branchRows, summary, opening] = loaded
  return <div className="min-w-0 space-y-6"><h1 className="text-3xl font-bold">Công nợ</h1>
    <Panel title="Tổng công nợ toàn hệ thống"><p className="text-sm text-gray-600">Tổng công nợ gồm công nợ mở sổ đã duyệt. Các chỉ số toàn hệ thống không thay đổi theo bộ lọc danh sách bên dưới; số hóa đơn chỉ tính hóa đơn thực tế.</p>
      {currencies(summary).map(currency => <div key={currency}><h3 className="font-semibold">{currency}</h3><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
        ['Tổng công nợ', money(sum(summary, currency, 'total_outstanding'), currency)], ['Tổng quá hạn', money(sum(summary, currency, 'total_overdue'), currency)],
        ['Hóa đơn quá hạn', sum(summary, currency, 'overdue_invoice_count')], ['Hóa đơn chưa thanh toán', sum(summary, currency, 'unpaid_invoice_count')], ['Hóa đơn thanh toán một phần', sum(summary, currency, 'partially_paid_invoice_count')],
      ].map(([label, value]) => <div key={label} className="rounded border p-3"><dt className="text-sm">{label}</dt><dd className="mt-2 text-xl font-semibold">{value}</dd></div>)}</dl></div>)}
    </Panel>
    <Panel title="Công nợ mở sổ"><p className="text-sm">50 số dư mở sổ gần nhất chưa đảo. Đã trả đầu kỳ không phải tiền thu mới; không phát hành lại hóa đơn cho các kỳ này.</p>
      {opening.error ? <LoadError /> : <Table headers={['Học viên', 'Tiền tệ', 'Giá trị mở sổ', 'Đã trả đầu kỳ', 'Còn nợ']} rows={(opening.data ?? []).map(row => [<Link key={row.id} prefetch={false} href={'/admin/students/' + row.student_id}>{row.full_name}</Link>, row.currency, money(row.net_opening_amount, row.currency), money(row.net_opening_paid, row.currency), money(row.outstanding_balance, row.currency)])} />}
    </Panel>
    <p className="text-sm">Mặc định hiển thị công nợ còn mở: OVERDUE, UNPAID và PARTIALLY_PAID. Chọn PAID hoặc “Tất cả, gồm đã thanh toán” để xem các khoản đã trả.</p>
    <InvoiceFilters params={params} branches={branchRows} debt /><InvoiceTable {...list} debt /><Pager path="/admin/finance/receivables" params={params} {...list} />
  </div>
}
