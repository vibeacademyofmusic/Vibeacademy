import { createClient } from '@/lib/supabase/server'
import { formatCost, formatRate, cohortRate } from '../reports/model'
import { createCrmCampaign, setCrmCampaignStatus, updateCrmCampaign } from './actions'

const platforms = ['FACEBOOK', 'GOOGLE', 'TIKTOK', 'ZALO', 'WEBSITE', 'REFERRAL', 'WALK_IN', 'OTHER']
const platformLabel: Record<string, string> = {
  FACEBOOK: 'Facebook', GOOGLE: 'Google', TIKTOK: 'TikTok', ZALO: 'Zalo', WEBSITE: 'Website', REFERRAL: 'Giới thiệu', WALK_IN: 'Khách đến', OTHER: 'Khác',
}
const statusLabel: Record<string, string> = { DRAFT: 'Nháp', ACTIVE: 'Đang chạy', INACTIVE: 'Ngừng' }

export default async function CampaignPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string; branch?: string; platform?: string; status?: string }> }) {
  const filters = await searchParams
  const db = await createClient()
  const [{ data: branches }, { data: campaigns }, { data: summary }] = await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.from('crm_campaigns').select('id, name, platform, channel, branch_id, starts_on, ends_on, budget_amount, currency, status, version').order('name'),
    db.rpc('crm_campaign_summary'),
  ])
  const counts = new Map(((summary ?? []) as { campaign_id: string; leads: number; qualified: number; won: number; lost: number }[]).map(row => [row.campaign_id, row]))
  const branchName = new Map((branches ?? []).map(branch => [branch.id, branch.name]))
  const rows = (campaigns ?? []).filter(row => {
    if (filters.branch && row.branch_id !== filters.branch) return false
    if (filters.platform && row.platform !== filters.platform) return false
    if (filters.status && row.status !== filters.status) return false
    return true
  })

  return (
    <div>
      <p className="text-sm font-medium text-gray-500">Kinh doanh</p>
      <h1 className="mt-1 text-3xl font-bold text-gray-950">Chiến dịch</h1>
      {filters.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{filters.error}</div>}
      {filters.success && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{filters.success}</div>}
      <form className="mt-6 grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:grid-cols-4">
        <select name="branch" defaultValue={filters.branch || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi chi nhánh</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        <select name="platform" defaultValue={filters.platform || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi nền tảng</option>{platforms.map(platform => <option key={platform} value={platform}>{platformLabel[platform]}</option>)}</select>
        <select name="status" defaultValue={filters.status || ''} className="rounded-lg border border-gray-300 px-3 py-2"><option value="">Mọi trạng thái</option><option value="DRAFT">Nháp</option><option value="ACTIVE">Đang chạy</option><option value="INACTIVE">Ngừng</option></select>
        <button className="rounded-lg bg-gray-950 px-3 py-2 text-sm text-white">Lọc</button>
      </form>
      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
        <form action={createCrmCampaign} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">Tạo chiến dịch</h2>
          <input name="name" required placeholder="Tên" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          <select name="platform" required className="w-full rounded-lg border border-gray-300 px-3 py-2">{platforms.map(platform => <option key={platform} value={platform}>{platformLabel[platform]}</option>)}</select>
          <select name="branch_id" className="w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Toàn hệ thống</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
          <input name="starts_on" type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          <input name="ends_on" type="date" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          <input name="budget_amount" placeholder="Ngân sách, để trống nếu chưa có" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          <input name="currency" placeholder="VND" maxLength={3} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          <button className="rounded-lg bg-gray-950 px-4 py-2 text-sm text-white">Tạo</button>
        </form>
        <div className="space-y-4">
          {rows.map(row => {
            const count = counts.get(row.id)
            const leads = Number(count?.leads ?? 0)
            const won = Number(count?.won ?? 0)
            const budget = row.budget_amount == null ? null : Number(row.budget_amount)
            return (
              <section key={row.id} className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{row.name}</h2>
                    <p className="mt-1 text-sm text-gray-500">{platformLabel[row.platform] || row.platform} · {row.branch_id ? branchName.get(row.branch_id) : 'Toàn hệ thống'} · {row.starts_on || '—'} → {row.ends_on || '—'}</p>
                  </div>
                  <form action={setCrmCampaignStatus} className="flex gap-2">
                    <input type="hidden" name="campaign_id" value={row.id} />
                    <input type="hidden" name="version" value={row.version} />
                    <select name="status" defaultValue={row.status} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">{Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>
                    <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cập nhật trạng thái</button>
                  </form>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-5">
                  <div><dt className="text-gray-500">Ngân sách</dt><dd>{budget != null && budget > 0 ? formatCost(budget) : 'Chưa có dữ liệu chi phí'}</dd></div>
                  <div><dt className="text-gray-500">Lead</dt><dd>{leads}</dd></div>
                  <div><dt className="text-gray-500">Đủ điều kiện</dt><dd>{Number(count?.qualified ?? 0)}</dd></div>
                  <div><dt className="text-gray-500">Thành công / mất</dt><dd>{won} / {Number(count?.lost ?? 0)}</dd></div>
                  <div><dt className="text-gray-500">Chuyển đổi</dt><dd>{formatRate(cohortRate(won, leads))}</dd></div>
                </dl>
                <form action={updateCrmCampaign} className="mt-4 grid gap-2 md:grid-cols-4">
                  <input type="hidden" name="campaign_id" value={row.id} />
                  <input type="hidden" name="version" value={row.version} />
                  <input name="name" defaultValue={row.name} className="rounded-lg border border-gray-300 px-3 py-2" />
                  <input name="starts_on" type="date" defaultValue={row.starts_on || ''} className="rounded-lg border border-gray-300 px-3 py-2" />
                  <input name="ends_on" type="date" defaultValue={row.ends_on || ''} className="rounded-lg border border-gray-300 px-3 py-2" />
                  <input name="budget_amount" defaultValue={row.budget_amount ?? ''} placeholder="Ngân sách" className="rounded-lg border border-gray-300 px-3 py-2" />
                  <input name="currency" defaultValue={row.currency || ''} placeholder="VND" className="rounded-lg border border-gray-300 px-3 py-2" />
                  <button className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Lưu thông tin</button>
                </form>
              </section>
            )
          })}
          {rows.length === 0 && <p className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Chưa có chiến dịch trong bộ lọc này.</p>}
        </div>
      </div>
    </div>
  )
}
