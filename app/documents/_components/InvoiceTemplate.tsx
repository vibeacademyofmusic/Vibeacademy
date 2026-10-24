import type { ReactNode } from 'react'
const money = (value: number | string, currency: string) => `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} ${currency}`
import { paymentStatus } from '@/app/admin/finance/invoices/payment-status'
import type { Invoice } from '@/app/admin/finance/query'
import PrintButton from './PrintButton'

type Props = {
  invoice: { number: string; status: string; issuedOn: string; dueOn: string; branch: string; student: string; currency: string; subtotal: number; total: number; notes: string }
  balance: Invoice
  items: { id: string; description: string; quantity: number; unit_amount: number; line_total: number }[]
  tuition?: { starts_on: string; effective_ends_on: string; plan_name_snapshot: string; list_price: number; discount_amount: number }
  contact?: { address: string | null; phone: string | null }
  logoSrc?: string
  actions?: ReactNode
}
const date = (value?: string) => value ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')) : '—'
export default function InvoiceTemplate({ invoice: i, balance, items, tuition, contact, logoSrc, actions }: Props) {
  // Existing invoice lines and subtotal are NET of discount. Only show the original
  // tuition breakdown when the locked amounts reconcile; never subtract it twice.
  const hasBreakdown = tuition && Number.isFinite(Number(tuition.list_price)) && Number.isFinite(Number(tuition.discount_amount))
    && Math.round((Number(tuition.list_price) - Number(tuition.discount_amount)) * 100) === Math.round(i.subtotal * 100)
  const metadata = (label: string, value: ReactNode) => <div className="invoice-field" key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>
  return <>
    <div className="document-actions flex flex-wrap gap-4"><PrintButton />{actions}{!logoSrc && <p role="status">Chưa có logo VIBE chính thức. Cần bổ sung logo trước khi duyệt mẫu.</p>}</div>
    <article className="official-invoice">
      <header className="invoice-brand">
        {/* Real public asset only; never render a substitute logo. */}
        {logoSrc && <img className="invoice-logo" src={logoSrc} alt="VIBE logo" width={180} height={120} />}
        <p>VIBE ACADEMY OF MUSIC &amp; CINEMA</p>
        <h1>INVOICE</h1>
      </header>
      <div className="invoice-metadata">
        <dl>{metadata('INVOICE NO.', i.number)}{metadata('ISSUE DATE', date(i.issuedOn))}{metadata('DUE DATE', date(i.dueOn))}{metadata('BRANCH', i.branch)}{metadata('STUDENT', i.student)}</dl>
        <dl>{metadata('PROGRAM', tuition?.plan_name_snapshot)}{metadata('BILLING PERIOD', tuition ? `${date(tuition.starts_on)} – ${date(tuition.effective_ends_on)}` : '—')}{metadata('STATUS', <span className="invoice-badge invoice-badge-status">{i.status}</span>)}{metadata('PAYMENT STATUS', <span className={`invoice-badge invoice-badge-${({ UNPAID: 'unpaid', PARTIALLY_PAID: 'partially_paid', PAID: 'paid' } as Record<string, string>)[paymentStatus(balance)] ?? 'neutral'}`}>{paymentStatus(balance)}</span>)}{metadata('AMOUNT PAID', money(balance.allocated_amount, i.currency))}{metadata('BALANCE DUE', money(balance.outstanding_balance, i.currency))}</dl>
      </div>
      <table className="invoice-items"><thead><tr><th>DESCRIPTION</th><th>QUANTITY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.unit_amount, i.currency)}</td><td>{money(item.line_total, i.currency)}</td></tr>)}</tbody></table>
      <p className="invoice-caption">Line prices include any applied tuition discount.</p>
      <dl className="invoice-totals">
        {metadata('SUBTOTAL', money(hasBreakdown ? tuition!.list_price : i.subtotal, i.currency))}
        {metadata('DISCOUNT', hasBreakdown ? money(tuition!.discount_amount, i.currency) : '—')}
        <div className="invoice-grand-total">{metadata('TOTAL', money(i.total, i.currency))}</div>
      </dl>
      <div className="invoice-closing">
      <section className="invoice-notes"><h2>NOTES</h2>{i.notes && <p>{i.notes}</p>}{!hasBreakdown && <p>Discount breakdown is unavailable. The invoice total already includes any applied discount.</p>}<p>Payment amounts and balance reflect the current ledger.</p></section>
      <section className="invoice-signature"><div /><h2>AUTHORIZED SIGNATURE</h2><p>VIBE ACADEMY OF MUSIC &amp; CINEMA</p></section>
      </div>
      <footer className="invoice-footer">{i.branch && <p>{i.branch}</p>}{contact?.address && <p>{contact.address}</p>}{contact?.phone && <p>{contact.phone}</p>}</footer>
    </article>
  </>
}
