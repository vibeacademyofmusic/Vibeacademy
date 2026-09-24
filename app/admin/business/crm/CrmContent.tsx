import Link from 'next/link'

import { createCrmLead } from './actions'
import { crmDirectory, loadLeadPage, type LeadFilters } from './data'
import { interestLevelLabel, sourceLabel, statusLabel, tabs } from './model'

function hrefFor(filters: LeadFilters, patch: LeadFilters) {
  const params = new URLSearchParams()
  const next = { ...filters, page: undefined, ...patch }
  for (const [key, value] of Object.entries(next)) if (value && key !== 'tab') params.set(key, value)
  const query = params.toString()
  return query ? `/admin/business/registrations?tab=crm&${query}` : '/admin/business/registrations?tab=crm'
}

export async function CrmLeadContent({ searchParams }: { searchParams: Promise<LeadFilters & { error?: string; success?: string }> }) {
  const filters = await searchParams
  const [directory, list] = await Promise.all([crmDirectory(), loadLeadPage(filters)])
  const branchName = new Map(directory.branches.map(branch => [branch.id, branch.name]))
  const ownerName = new Map(directory.owners.map(owner => [owner.id, owner.full_name]))

  return (
    <div>
      <h2 className="mb-6 text-xl font-semibold tracking-tight text-gray-950">Khách hàng và cơ hội</h2>
      {filters.error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{filters.error}</div>}
      {filters.success && <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{filters.success}</div>}
      <section className="mb-6">
        <h2 className="text-sm font-semibold tracking-wide text-gray-500">HÔM NAY CẦN XỬ LÝ</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {directory.queue.map(item => (
            <Link key={item.id} href={hrefFor(filters, { queue: item.id, lead_tab: undefined })} className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-2xl font-semibold text-gray-950">{item.count}</div>
              <div className="mt-1 text-sm text-gray-600">{item.label}</div>
            </Link>
          ))}
        </div>
      </section>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(tab => (
          <Link key={tab.id} href={hrefFor(filters, { lead_tab: tab.id === 'all' ? undefined : tab.id, queue: undefined })} className={`rounded-full px-3 py-1.5 text-sm ${((filters.lead_tab || 'all') === tab.id) ? 'bg-gray-950 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'}`}>{tab.label}</Link>
        ))}
      </div>
      <form action="/admin/business/registrations" className="mb-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-3 xl:grid-cols-6">
        <input type="hidden" name="tab" value="crm" />
        <input name="q" defaultValue={filters.q} placeholder="Tên, điện thoại, email" className="rounded-lg border border-gray-300 px-3 py-2" />
        <select name="status" defaultValue={filters.status || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi trạng thái</option>{Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>
        <select name="interest" defaultValue={filters.interest || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi mức độ</option>{Object.entries(interestLevelLabel).map(([level, label]) => <option key={level} value={level}>{label}</option>)}</select>
        <select name="branch" defaultValue={filters.branch || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi chi nhánh</option>{directory.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select name="owner" defaultValue={filters.owner || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi người phụ trách</option>{directory.owners.map(owner => <option key={owner.id} value={owner.id}>{owner.full_name || 'Chưa có tên'}</option>)}</select>
        <select name="source" defaultValue={filters.source || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi nguồn</option>{Object.entries(sourceLabel).map(([source, label]) => <option key={source} value={source}>{label}</option>)}</select>
        <select name="follow" defaultValue={filters.follow || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi lịch hẹn</option><option value="today">Hôm nay</option><option value="overdue">Quá hạn</option><option value="scheduled">Đã hẹn</option><option value="none">Chưa hẹn</option></select>
        <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Lọc</button>
      </form>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold text-gray-950">Tạo khách hàng</h2>
          <form action={createCrmLead} className="mt-4 space-y-3">
            <select name="branch_id" required className="w-full rounded-lg border border-gray-300 px-3 py-2">{directory.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
            <input name="full_name" placeholder="Người liên hệ" maxLength={200} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="phone" placeholder="Số điện thoại" maxLength={40} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="email" placeholder="Email" maxLength={200} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="student_name" placeholder="Học viên" maxLength={200} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="program_interest" placeholder="Bộ môn" maxLength={200} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <input name="instrument_interest" placeholder="Nhạc cụ" maxLength={200} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <label className="block text-sm text-gray-700">Mức độ quan tâm<select name="interest_level" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2">{Object.entries(interestLevelLabel).map(([level, label]) => <option key={level} value={level}>{label}</option>)}</select></label>
            <button className="rounded-lg bg-gray-950 px-4 py-2 text-sm text-white">Tạo</button>
          </form>
        </section>
        <section className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-gray-200 text-gray-500">
              <tr>
                {['Tên', 'Điện thoại', 'Email', 'Nguồn', 'Bộ môn / nhạc cụ', 'Chi nhánh', 'Owner', 'Mức độ', 'Trạng thái', 'Lần liên hệ cuối', 'Follow-up tiếp theo'].map(label => <th key={label} className="px-3 py-3 font-medium">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.rows.length === 0 && <tr><td colSpan={11} className="px-3 py-8 text-gray-500">Chưa có khách hàng trong bộ lọc này.</td></tr>}
              {list.rows.map(row => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-3 py-3"><Link href={`/admin/business/crm/${row.id}`} className="font-medium text-gray-950">{row.full_name || row.student_name || 'Chưa có tên'}</Link></td>
                  <td className="px-3 py-3">{row.phone || ''}</td>
                  <td className="px-3 py-3">{row.email || ''}</td>
                  <td className="px-3 py-3">{sourceLabel[row.source_type] || row.source_type}</td>
                  <td className="px-3 py-3">{[row.program_interest, row.instrument_interest].filter(Boolean).join(' / ')}</td>
                  <td className="px-3 py-3">{branchName.get(row.branch_id) || ''}</td>
                  <td className="px-3 py-3">{row.owner_user_id ? ownerName.get(row.owner_user_id) || 'Đã gán' : 'Chưa gán'}</td>
                  <td className="px-3 py-3">{interestLevelLabel[row.interest_level] || 'Tham khảo'}</td>
                  <td className="px-3 py-3">{statusLabel[row.status] || row.status}</td>
                  <td className="px-3 py-3">{row.last_contact_at ? new Date(row.last_contact_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''}</td>
                  <td className="px-3 py-3">{row.next_follow_up_on || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-3 py-3 text-sm text-gray-500">
            <span>{list.count} khách hàng</span>
            <span>{list.page > 1 && <Link href={hrefFor(filters, { page: String(list.page - 1) })} className="mr-4">Trước</Link>}{list.page * 25 < list.count && <Link href={hrefFor(filters, { page: String(list.page + 1) })}>Sau</Link>}</span>
          </div>
        </section>
      </div>
    </div>
  )
}
