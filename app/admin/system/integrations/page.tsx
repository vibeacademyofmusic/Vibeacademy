import Link from 'next/link'

import { requireIntegrationAdmin } from './access'

export default async function IntegrationsPage() {
  await requireIntegrationAdmin()
  return (
    <article className="min-w-0 space-y-5">
      <h1 className="text-2xl font-bold">Tích hợp</h1>
      <p>Kết nối bên ngoài của VIBE. Thông tin bí mật không hiển thị tại đây.</p>
      <section className="rounded border p-4">
        <h2 className="font-semibold">Zalo OA</h2>
        <p className="mt-2">Nhận sự kiện và chuẩn bị mẫu thông báo. Gửi tin đang tắt.</p>
        <Link className="mt-3 inline-block rounded border px-3 py-2" href="/admin/system/integrations/zalo">Mở Zalo OA</Link>
      </section>
    </article>
  )
}
