import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const db = await createClient()
  const { data, error } = await db.from('registration_applications')
    .select('id, application_code, student_name, status, desired_start_date, branches(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-gray-950">Hồ sơ đăng ký</h1>
        <Link href="/admin/business/registrations/new" className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Tạo hồ sơ</Link>
      </div>
      {params.error && <p className="mt-4 text-sm text-red-700">{params.error}</p>}
      {error && <p className="mt-4 text-sm text-red-700">Không thể tải hồ sơ đăng ký.</p>}
      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white">
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
