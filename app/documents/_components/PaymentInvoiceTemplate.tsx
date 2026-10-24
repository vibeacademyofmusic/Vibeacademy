import type { ReactNode } from 'react'
import PrintButton from './PrintButton'
import { timeText } from '@/app/admin/finance/_components/ui'
import './payment-invoice.css'

type Props = {
  payment: { id: string; payment_number: string; amount: number; currency: string; paid_at: string; payment_method: string; reference: string | null; branch_name_snapshot: string }
  student: string
  refunded: number
  contact?: { address: string | null; phone: string | null }
  actions?: ReactNode
}

const methodLabels: Record<string, string> = { CASH: 'Tiền mặt', BANK_TRANSFER: 'Chuyển khoản', CARD: 'Thẻ', OTHER: 'Khác' }
const money = (amount: number, currency: string) => Number(amount).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' ' + currency

export function paymentInvoiceDocumentHref(paymentId: string) {
  return '/documents/finance/payment-invoices/' + encodeURIComponent(paymentId)
}

export default function PaymentInvoiceTemplate({ payment, student, refunded, contact, actions }: Props) {
  const reference = 'HDNB-' + payment.payment_number
  const method = payment.reference?.startsWith('PAYOS:') ? 'PayOS' : payment.reference?.startsWith('MOMO:') ? 'MoMo' : methodLabels[payment.payment_method] ?? payment.payment_method
  const net = Math.max(0, Number(payment.amount) - refunded)

  return <>
    <div className="document-actions payment-invoice-actions"><PrintButton />{actions}<span>Chọn In / Lưu PDF để xuất khổ A5 ngang.</span></div>
    <article className="payment-invoice-sheet" aria-label={'Hóa đơn học phí nội bộ ' + reference}>
      <header className="payment-invoice-header">
        <div className="payment-invoice-brand">
          {/* Keep the official asset at a fixed print size, matching the payslip. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/vibe-logo.png" alt="VIBE Academy" width={220} height={122} />
          <div className="payment-invoice-brand-rule" aria-hidden="true" />
          <div>
            <p className="payment-invoice-department">PHÒNG TÀI CHÍNH · HỌC PHÍ</p>
            <h1>HÓA ĐƠN HỌC PHÍ</h1>
            <p className="payment-invoice-subtitle">Chứng từ nội bộ theo khoản đã thu</p>
            <p className="payment-invoice-date">Xác nhận lúc <strong>{timeText(payment.paid_at)}</strong></p>
          </div>
        </div>
        <div className="payment-invoice-header-meta">
          <div><span>TRẠNG THÁI</span><strong className="payment-invoice-status"><i aria-hidden="true" />ĐÃ XÁC NHẬN</strong></div>
          <div><span>SỐ HÓA ĐƠN</span><strong>{reference}</strong></div>
          <div><span>PHIẾU THU GỐC</span><strong>{payment.payment_number}</strong></div>
        </div>
      </header>

      <section className="payment-invoice-identity" aria-label="Thông tin học viên và giao dịch">
        <div className="payment-invoice-student"><span>HỌC VIÊN</span><strong>{student}</strong><small>{payment.branch_name_snapshot}</small></div>
        <div><span>PHƯƠNG THỨC</span><strong>{method}</strong></div>
        <div><span>THAM CHIẾU GIAO DỊCH</span><strong>{payment.reference || '—'}</strong></div>
      </section>

      <section className="payment-invoice-content" aria-label="Chi tiết học phí đã thu">
        <h2>Chi tiết khoản đã thu</h2>
        <table>
          <thead><tr><th>NỘI DUNG</th><th>SỐ LƯỢNG</th><th>ĐƠN GIÁ</th><th>THÀNH TIỀN</th></tr></thead>
          <tbody><tr><td>Học phí đã thu theo {payment.payment_number}</td><td>1</td><td>{money(payment.amount, payment.currency)}</td><td>{money(payment.amount, payment.currency)}</td></tr></tbody>
        </table>
      </section>

      <section className="payment-invoice-settlement" aria-label="Tổng tiền đã thu">
        <div><span>ĐÃ XÁC NHẬN</span><strong>{money(payment.amount, payment.currency)}</strong></div>
        {refunded > 0 && <div><span>ĐÃ HOÀN</span><strong>{money(refunded, payment.currency)}</strong></div>}
        <div className="payment-invoice-final"><span>{refunded > 0 ? 'THỰC THU CÒN LẠI' : 'TỔNG ĐÃ THU'}</span><strong>{money(net, payment.currency)}</strong></div>
      </section>

      <section className="payment-invoice-note" aria-label="Ghi chú chứng từ">
        <h2>Ghi chú</h2>
        <p>Chứng từ xác nhận số tiền đã nhận theo phiếu thu. Học phí còn lại và công nợ kỳ học được theo dõi riêng. Xem hoặc in lại không tạo thêm khoản thu.</p>
        <p>Chứng từ nội bộ, không thay thế hóa đơn điện tử thuế.</p>
      </section>

      <footer className="payment-invoice-footer">
        <span>VIBE ACADEMY OF MUSIC &amp; CINEMA · TÀI LIỆU NỘI BỘ</span>
        <span>{contact?.address || payment.branch_name_snapshot}{contact?.phone ? ' · ' + contact.phone : ''}</span>
        <small>Mã hệ thống: {payment.id}</small>
      </footer>
    </article>
    <style>{'@page { size: A5 landscape; margin: 0; }'}</style>
  </>
}
