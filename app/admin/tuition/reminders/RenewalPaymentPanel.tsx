import { adminClient } from '../../finance/operations'
import { buildTuitionPaymentRequest, tuitionPaymentDispatch } from '@/lib/integrations/tuition/payment-zbs'
import { paymentNoticeReason, paymentTemplateGate, persistedPaymentNoticeStatus, storedZbsStatusLabel } from '@/lib/integrations/tuition/renewal-status'
import { RenewalPaymentDialog } from './RenewalPaymentDialog'

const syntheticPayment = {
  customerName: 'Phụ huynh thử',
  studentName: 'Học viên thử',
  invoiceCode: 'INV-SYNTHETIC-645',
  packageName: '3 tháng',
  packageAmount: 5500000,
  paymentType: 'Đặt cọc 50%',
  amountDue: 2750000,
  deadline: '2026-11-15',
  paymentLinkId: 'synthetic01',
  checkoutUrl: 'https://pay.payos.vn/web/synthetic01',
}

export async function RenewalPaymentPanel() {
  const db = await adminClient()
  const template = await db.from('notification_templates').select('template_key,status,enabled,provider_template_id,parameter_schema,payload_schema').eq('template_key', 'ZALO_TUITION_PAYMENT').eq('provider', 'ZALO').limit(1).maybeSingle()
  const row = template.data
  const gate = paymentTemplateGate(row)
  const built = buildTuitionPaymentRequest(syntheticPayment)
  const first = tuitionPaymentDispatch(row, built)
  const second = tuitionPaymentDispatch(row, built)
  return (
    <RenewalPaymentDialog>
      <div className="space-y-2">
      <p>Sẵn sàng hiện tại: {paymentNoticeReason(gate.code, gate.templateId)}</p>
      <p>{storedZbsStatusLabel(null)}. Chưa ghi lịch sử cho bản xem trước này. Dispatcher trả {first.state}; trạng thái sẽ lưu là {persistedPaymentNoticeStatus(first)}, mã {first.code}.</p>
      <p>Xem trước tổng hợp, không ghi hóa đơn, đơn payOS, job hay thanh toán. Hạn 15/11/2026 chỉ là dữ liệu thử.</p>
      {built.ok && (
        <ul className="list-disc pl-5 text-sm">
          {Object.entries({ ...built.body, payment_link_id: built.cta.payment_link_id }).map(([key, value]) => <li key={key}>{key}: {value}</li>)}
          <li>CTA: {built.checkoutUrl}</li>
        </ul>
      )}
      <p>Đánh giá lặp lại: {second.state} / {second.code}. Không tạo thêm đối tượng.</p>
      <p>Xác nhận sau thu dùng mẫu riêng. Mẫu 645028 không phải biên nhận và không đổi trạng thái đã thanh toán.</p>
      {template.error && <p role="alert">Không đọc được mẫu ZALO_TUITION_PAYMENT.</p>}
      </div>
    </RenewalPaymentDialog>
  )
}
