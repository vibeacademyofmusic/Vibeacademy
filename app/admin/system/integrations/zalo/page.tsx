import Link from 'next/link'

import { ZALO_TEMPLATE_LABELS } from '@/lib/integrations/zalo/outbound'
import { prepareTuitionPaymentRequest } from '@/lib/integrations/tuition/payment-zbs'

import { requireIntegrationAdmin } from '../access'

type TemplateRow = {
  template_key: string
  provider_template_id: string | null
  status: string
  enabled: boolean
  parameter_schema?: unknown
  payload_schema?: unknown
}

const syntheticPaymentPreview = {
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

function approvalLabel(status: string) {
  if (status === 'APPROVED') return 'Đã duyệt'
  if (status === 'PENDING') return 'Chờ duyệt'
  if (status === 'DISABLED') return 'Tắt'
  return 'Nháp'
}

export default async function ZaloIntegrationPage() {
  const db = await requireIntegrationAdmin()
  const templates = await db.from('notification_templates').select('template_key,provider_template_id,status,enabled,parameter_schema,payload_schema').eq('provider', 'ZALO').order('template_key')
  const rows = (templates.data || []) as TemplateRow[]
  const paymentTemplate = rows.find(row => row.template_key === 'ZALO_TUITION_PAYMENT') ?? null
  const paymentPreview = prepareTuitionPaymentRequest({
    template: paymentTemplate,
    input: syntheticPaymentPreview,
    linkInvoiceCode: syntheticPaymentPreview.invoiceCode,
  })
  return (
    <article className="min-w-0 space-y-5">
      <p><Link href="/admin/system/integrations">Tích hợp</Link></p>
      <h1 className="text-2xl font-bold">Zalo OA</h1>
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">OUTBOUND MESSAGING</h2>
        <p>Trạng thái hiện tại: Chưa kích hoạt</p>
        <p>Lý do: OA package Cơ bản / Live OpenAPI credentials not configured</p>
        <p>Bộ gửi Zalo trả về ZALO_OUTBOUND_NOT_CONFIGURED và không tạo tin SENT.</p>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">Mẫu thông báo</h2>
        {templates.error && <p role="alert">Không tải được danh mục mẫu.</p>}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3">Template</th>
              <th className="py-2 pr-3">Internal key</th>
              <th className="py-2 pr-3">Template ID</th>
              <th className="py-2 pr-3">Trạng thái duyệt</th>
              <th className="py-2">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.template_key} className="border-b">
                <td className="py-2 pr-3">{ZALO_TEMPLATE_LABELS[row.template_key] || row.template_key}</td>
                <td className="py-2 pr-3">{row.template_key}</td>
                <td className="py-2 pr-3">{row.provider_template_id || 'Chưa có'}</td>
                <td className="py-2 pr-3">{approvalLabel(row.status)}</td>
                <td className="py-2">{row.enabled ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="space-y-2 rounded border p-4">
        <h2 className="font-semibold">Yêu cầu thanh toán — xem trước tổng hợp</h2>
        <p>Mẫu đọc từ registry: {paymentPreview.templateId || 'Chưa có'}. Gửi đang tắt. Không tạo hóa đơn, link hay thanh toán.</p>
        <p>Hạn 15/11/2026 trong xem trước này là dữ liệu thử, không phải hạn mặc định.</p>
        <p>Kết quả: {paymentPreview.code}. Đã gửi: không. Đã thanh toán: không.</p>
        {paymentPreview.parameters && (
          <ul className="list-disc pl-5">
            {Object.entries(paymentPreview.parameters).map(([key, value]) => <li key={key}>{key}: {value}</li>)}
          </ul>
        )}
      </section>
    </article>
  )
}
