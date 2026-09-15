import Link from 'next/link'
import type { ReactNode } from 'react'
const links = [['', 'Tổng quan'], ['/invoices', 'Hóa đơn'], ['/payments', 'Thanh toán'], ['/receivables', 'Công nợ'], ['/refunds', 'Hoàn tiền']]
export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <div className="min-w-0 space-y-6"><nav aria-label="Điều hướng tài chính" className="flex flex-wrap gap-2">{links.map(([path, label]) => <Link key={path} prefetch={false} href={'/admin/finance' + path} className="rounded border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-100">{label}</Link>)}</nav>{children}</div>
}
