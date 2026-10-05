import Link from 'next/link'

import { outboundEvents, zaloPublicProfile, type ZaloAdminConfig } from '@/lib/integrations/zalo/admin'

export type ZaloEventRow = {
  id: string
  time: string
  type: string
  externalId: string
  status: string
  processing: string
  source: string
  error: string | null
}

export type ZaloCustomerRow = {
  id: string
  entity: string
  label: string
  branch: string
  linkedAt: string
  verifiedAt: string
  status: string
}

export type ZaloTemplateRow = {
  key: string
  provider: string
  templateId: string
  status: string
  enabled: string
  payloadReady: string
}

function Flag({ on, onLabel = 'Đã cấu hình', offLabel = 'Chưa cấu hình' }: { on: boolean; onLabel?: string; offLabel?: string }) {
  return <span className={on ? 'text-emerald-800' : 'text-gray-600'}>{on ? onLabel : offLabel}</span>
}

export function ZaloIntegrationView({
  config,
  summary,
  events,
  customers,
  templates = [],
  loadError,
}: {
  config: ZaloAdminConfig
  summary: { total: number; today: number; accepted: number; pending: number; failed: number }
  events: ZaloEventRow[]
  customers: ZaloCustomerRow[]
  templates?: ZaloTemplateRow[]
  loadError: boolean
}) {
  const checks = [
    ['Developer App', 'Đã tạo'],
    ['App ↔ OA', 'Đã liên kết'],
    ['OA verified', 'Đã xác thực'],
    ['Webhook foundation', 'Đã triển khai'],
  ] as const

  return (
    <div>
      <p className="text-sm text-gray-500"><Link href="/admin/system/integrations">Tích hợp</Link></p>
      <h2 className="mt-2 text-2xl font-bold">Cấu hình và nhật ký Zalo</h2>
      <p className="mt-2 text-sm text-gray-600">Thông tin OA đã khai báo và nhật ký hệ thống. Tình trạng kết nối hiện tại được kiểm tra ở phần trên.</p>
      {loadError && <p className="mt-4 text-sm text-red-700">Không tải được trạng thái Zalo.</p>}

      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-wide text-gray-500">OA Status</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-gray-500">OA</dt><dd className="font-medium">{zaloPublicProfile.oaName}</dd></div>
            <div><dt className="text-gray-500">OA ID</dt><dd>{zaloPublicProfile.oaId}</dd></div>
            <div><dt className="text-gray-500">OA verification</dt><dd>{zaloPublicProfile.verifiedLabel}</dd></div>
            <div><dt className="text-gray-500">Package</dt><dd>{zaloPublicProfile.packageName}</dd></div>
            <div><dt className="text-gray-500">ZCA</dt><dd>{zaloPublicProfile.zca}</dd></div>
          </dl>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-wide text-gray-500">App Integration</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-gray-500">App</dt><dd className="font-medium">{zaloPublicProfile.appName}</dd></div>
            <div><dt className="text-gray-500">App ID</dt><dd>{zaloPublicProfile.appId}</dd></div>
            {checks.map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd>✓ {value}</dd></div>)}
            <div><dt className="text-gray-500">Webhook public URL</dt><dd>{config.webhookPublicLabel}</dd></div>
            <div><dt className="text-gray-500">OA Secret Key</dt><dd><Flag on={config.oaSecretConfigured} /></dd></div>
            <div><dt className="text-gray-500">Access Token</dt><dd><Flag on={config.accessTokenConfigured} /></dd></div>
            <div><dt className="text-gray-500">Refresh Token</dt><dd><Flag on={config.refreshTokenConfigured} /></dd></div>
          </dl>
          <p className="mt-3 text-sm text-gray-600">{zaloPublicProfile.packageNote}</p>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-wide text-gray-500">Webhook</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-gray-500">Endpoint</dt><dd>POST /api/integrations/zalo/webhook</dd></div>
            <div><dt className="text-gray-500">Môi trường</dt><dd>{config.environmentLabel}</dd></div>
            <div><dt className="text-gray-500">Trạng thái</dt><dd>{config.webhookRuntimeLabel}</dd></div>
            <div><dt className="text-gray-500">Tổng sự kiện</dt><dd>{summary.total}</dd></div>
            <div><dt className="text-gray-500">Sự kiện hôm nay</dt><dd>{summary.today}</dd></div>
            <div><dt className="text-gray-500">Đã tiếp nhận</dt><dd>{summary.accepted}</dd></div>
            <div><dt className="text-gray-500">Chờ xử lý</dt><dd>{summary.pending}</dd></div>
            <div><dt className="text-gray-500">Lỗi xử lý</dt><dd>{summary.failed}</dd></div>
          </dl>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold tracking-wide text-gray-500">Gửi thông báo</h2>
          <p className="mt-3 text-lg font-semibold">Chưa kích hoạt</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
            <li>Gói OA hiện tại là Cơ bản</li>
            <li>Thông báo đăng ký dùng cơ chế gửi và khôi phục ở phần trên</li>
            <li>Các mẫu còn lại giữ điều kiện kích hoạt riêng của main</li>
          </ul>
          <p className="mt-3 text-sm text-gray-500">Sẵn sàng mẫu</p>
          {templates.length === 0 ? <p className="mt-1 text-sm text-gray-500">Chưa có mẫu.</p> : (
            <ul className="mt-1 space-y-2 text-sm">
              {templates.map(template => (
                <li key={template.key} className="rounded border border-gray-100 p-2">
                  <p className="font-medium">{template.key}</p>
                  <p>Provider: {template.provider}</p>
                  <p>Template ID: {template.templateId}</p>
                  <p>Status: {template.status}</p>
                  <p>Enabled: {template.enabled}</p>
                  <p>Payload: {template.payloadReady}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm text-gray-500">Sự kiện dự kiến</p>
          <ul className="mt-1 space-y-1 text-sm">{outboundEvents.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">Sự kiện gần đây</h2>
        {events.length === 0 ? <p className="mt-3 text-sm text-gray-500">Chưa có sự kiện.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500"><tr><th className="py-2 pr-3 font-medium">Thời gian</th><th className="py-2 pr-3 font-medium">Loại sự kiện</th><th className="py-2 pr-3 font-medium">Mã sự kiện</th><th className="py-2 pr-3 font-medium">Trạng thái</th><th className="py-2 pr-3 font-medium">Xử lý</th><th className="py-2 pr-3 font-medium">Nguồn</th><th className="py-2 font-medium">Lỗi</th></tr></thead>
              <tbody>{events.map(event => (
                <tr key={event.id} className="border-t border-gray-100">
                  <td className="py-2 pr-3">{event.time}</td>
                  <td className="py-2 pr-3">{event.type}</td>
                  <td className="py-2 pr-3">{event.externalId}</td>
                  <td className="py-2 pr-3">{event.status}</td>
                  <td className="py-2 pr-3">{event.processing}</td>
                  <td className="py-2 pr-3">{event.source}</td>
                  <td className="py-2">{event.error || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold">Khách hàng đã liên kết</h2>
        {customers.length === 0 ? <p className="mt-3 text-sm text-gray-500">Chưa có khách hàng đã liên kết.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500"><tr><th className="py-2 pr-3 font-medium">Đối tượng</th><th className="py-2 pr-3 font-medium">Tên hiển thị</th><th className="py-2 pr-3 font-medium">Chi nhánh</th><th className="py-2 pr-3 font-medium">Liên kết lúc</th><th className="py-2 pr-3 font-medium">Xác minh lần cuối</th><th className="py-2 font-medium">Trạng thái</th></tr></thead>
              <tbody>{customers.map(customer => (
                <tr key={customer.id} className="border-t border-gray-100">
                  <td className="py-2 pr-3">{customer.entity}</td>
                  <td className="py-2 pr-3">{customer.label}</td>
                  <td className="py-2 pr-3">{customer.branch}</td>
                  <td className="py-2 pr-3">{customer.linkedAt}</td>
                  <td className="py-2 pr-3">{customer.verifiedAt}</td>
                  <td className="py-2">{customer.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
