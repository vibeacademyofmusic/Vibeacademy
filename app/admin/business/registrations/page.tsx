import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CrmLeadContent } from '../crm/CrmContent'

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string; [key: string]: string | undefined }> }) {
  const params = await searchParams
  if (params.tab === 'crm') {
    return <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">CRM & Tuyển sinh</h1>
      <div className="mt-5 mb-6 flex flex-wrap gap-2 border-b border-gray-200 pb-3 text-sm">
        <Link href="/admin/business/registrations/new" className="rounded-lg px-4 py-2 text-gray-700">Đăng ký tại quầy</Link>
        <span className="rounded-lg bg-gray-950 px-4 py-2 text-white">CRM</span>
        <Link href="/admin/business/registrations" className="rounded-lg px-4 py-2 text-gray-700">Danh sách đăng ký</Link>
      </div>
      <CrmLeadContent searchParams={Promise.resolve(params)} />
    </div>
  }
  const db = await createClient()
  const { data, error } = await db.from('registration_applications')
    .select('id, application_code, student_name, status, desired_start_date, branches(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">CRM & Tuyển sinh</h1>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-gray-200 pb-3 text-sm">
        <Link href="/admin/business/registrations/new" className="rounded-lg px-4 py-2 text-gray-700">Đăng ký tại quầy</Link>
        <Link href="/admin/business/registrations?tab=crm" className="rounded-lg px-4 py-2 text-gray-700">CRM</Link>
        <span className="rounded-lg bg-gray-950 px-4 py-2 text-white">Danh sách đăng ký</span>
      </div>
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-gray-950">Tiếp nhận và đăng ký tại quầy</h2>
        <p className="mt-1 text-sm text-gray-600">Tạo hồ sơ học viên, chọn chương trình và theo dõi đến khi thanh toán đủ để chờ xếp lớp.</p>
        <Link href="/admin/business/registrations/new" className="mt-4 inline-flex rounded-lg bg-gray-950 px-4 py-2 text-sm text-white">Bắt đầu đăng ký</Link>
      </section>
      {params.error && <p className="mt-4 text-sm text-red-700">{params.error}</p>}
      {error && <p className="mt-4 text-sm text-red-700">Không thể tải hồ sơ đăng ký.</p>}
      <h2 className="mt-8 text-lg font-semibold text-gray-950">Đăng ký đã tạo</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Chi nhánh</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Ngày muốn học</th></tr></thead>
          <tbody>
            {(data ?? []).map(row => {
              const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
              return <tr key={row.id} className="border-t border-gray-100"><td className="px-4 py-3"><Link href={`/admin/business/registrations/${row.id}`} className="font-medium text-gray-950">{row.application_code}</Link></td><td className="px-4 py-3">{row.student_name || '—'}</td><td className="px-4 py-3">{branch?.name || '—'}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.desired_start_date || '—'}</td></tr>
            })}
          </tbody>
        </table>
        {!data?.length && <p className="px-4 py-6 text-sm text-gray-500">Chưa có hồ sơ đăng ký.</p>}
      </div>
    </div>
  )
}
