import Link from 'next/link'

import { ZALO_TEMPLATE_LABELS } from '@/lib/integrations/zalo/outbound'

import { requireIntegrationAdmin } from '../access'

type TemplateRow = {
  template_key: string
  provider_template_id: string | null
  status: string
  enabled: boolean
}

function approvalLabel(status: string) {
  if (status === 'APPROVED') return 'Đã duyệt'
  if (status === 'PENDING') return 'Chờ duyệt'
  if (status === 'DISABLED') return 'Tắt'
  return 'Nháp'
}

export default async function ZaloIntegrationPage() {
  const db = await requireIntegrationAdmin()
  const templates = await db.from('notification_templates').select('template_key,provider_template_id,status,enabled').eq('provider', 'ZALO').order('template_key')
  const rows = (templates.data || []) as TemplateRow[]
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
    </article>
  )
}
