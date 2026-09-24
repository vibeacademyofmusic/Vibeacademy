import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CrmLeadContent } from '../crm/CrmContent'
import { registrationProgressLabel } from './status'

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
    .select('id, application_code, student_name, status, desired_start_date, branches(name), student_placement_cases(status)')
    .order('created_at', { ascending: false })
    .limit(100)
  const review = (data ?? []).filter(row => row.status === 'PAID')
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
      {params.error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{params.error}</p>}
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">Không tải được danh sách đăng ký: {error.message}</p>}
      <h2 className="mt-8 text-lg font-semibold text-gray-950">Đăng ký đã tạo</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr><th className="px-4 py-3">Mã</th><th className="px-4 py-3">Học viên</th><th className="px-4 py-3">Chi nhánh</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Ngày muốn học</th></tr></thead>
          <tbody>
            {(data ?? []).map(row => {
              const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches
              const placement = Array.isArray(row.student_placement_cases) ? row.student_placement_cases[0] : row.student_placement_cases
              return <tr key={row.id} className="border-t border-gray-100"><td className="px-4 py-3"><Link href={`/admin/business/registrations/${row.id}`} className="font-medium text-gray-950">{row.application_code}</Link></td><td className="px-4 py-3">{row.student_name || '—'}</td><td className="px-4 py-3">{branch?.name || '—'}</td><td className="px-4 py-3">{registrationProgressLabel(row.status, placement?.status)}</td><td className="px-4 py-3">{row.desired_start_date || '—'}</td></tr>
            })}
          </tbody>
        </table>
        {!error && !data?.length && <p className="px-4 py-6 text-sm text-gray-500">Chưa có hồ sơ đăng ký.</p>}
      </div>
      <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="font-semibold">Đối soát tài chính</h2>
        <p className="mt-1">Hồ sơ đã nhận tiền nhưng chưa tạo học viên nằm ở đây. Hệ thống không tự hoàn tiền. Hủy hồ sơ sau khi đã nhận cọc bị chặn cho đến khi tài chính xử lý.</p>
        {error ? <p className="mt-3">Chưa kiểm tra được hàng đợi vì danh sách hồ sơ lỗi.</p> : review.length === 0 ? <p className="mt-3">Không có hồ sơ đang chờ đối soát.</p> : <ul className="mt-3 space-y-1">{review.map(row => <li key={row.id}><Link href={`/admin/business/registrations/${row.id}`}>{row.application_code}</Link> · {row.student_name}</li>)}</ul>}
      </section>
    </div>
  )
}
