import Link from 'next/link'

import { requireIntegrationAdmin } from './access'

export default async function IntegrationsPage() {
  await requireIntegrationAdmin()
  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Hệ thống</p>
      <h1 className="mt-1 text-3xl font-bold">Tích hợp</h1>
      <p className="mt-2 max-w-2xl text-sm text-gray-600">Kênh kết nối bên ngoài. Chỉ xem trạng thái, chưa gửi tin.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/admin/system/integrations/zalo" className="rounded-2xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold tracking-wide text-gray-500">ZALO OA</p>
          <h2 className="mt-2 text-xl font-semibold">Zalo Official Account</h2>
          <p className="mt-2 text-sm text-gray-600">Vibe Academy · theo dõi webhook và khách hàng đã liên kết.</p>
        </Link>
      </div>
    </div>
  )
}
