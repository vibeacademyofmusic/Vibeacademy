import { EmptyState, FormField, InlineNotice, SectionCard, SelectField, StatusBadge } from '@/app/admin/_components/vibe'
import { createClient } from '@/lib/supabase/server'

import { cohortRate, formatCost, formatRate } from '../reports/model'
import { marketingPath } from '../workspaces'
import { createCrmCampaign, setCrmCampaignStatus, updateCrmCampaign } from '../campaigns/actions'

const platforms = ['FACEBOOK', 'GOOGLE', 'TIKTOK', 'ZALO', 'WEBSITE', 'REFERRAL', 'WALK_IN', 'OTHER']
const platformLabel: Record<string, string> = {
  FACEBOOK: 'Facebook', GOOGLE: 'Google', TIKTOK: 'TikTok', ZALO: 'Zalo', WEBSITE: 'Website', REFERRAL: 'Giới thiệu', WALK_IN: 'Khách đến', OTHER: 'Khác',
}
const statusLabel: Record<string, string> = { DRAFT: 'Nháp', ACTIVE: 'Đang chạy', INACTIVE: 'Ngừng' }
const statusTone: Record<string, 'neutral' | 'success' | 'warning'> = { DRAFT: 'neutral', ACTIVE: 'success', INACTIVE: 'warning' }

export async function MarketingCampaignsPanel({
  filters,
  canManage,
}: {
  filters: { error?: string; success?: string; branch?: string; platform?: string; status?: string }
  canManage: boolean
}) {
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
    <>
      {filters.error && <InlineNotice tone="error">{filters.error}</InlineNotice>}
      {filters.success && <InlineNotice>{filters.success}</InlineNotice>}
      <form className="vibe-filter" action={marketingPath} method="get">
        <input type="hidden" name="tab" value="campaigns" />
        <SelectField label="Chi nhánh" name="branch" defaultValue={filters.branch || ''}><option value="">Mọi chi nhánh</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
        <SelectField label="Nền tảng" name="platform" defaultValue={filters.platform || ''}><option value="">Mọi nền tảng</option>{platforms.map(platform => <option key={platform} value={platform}>{platformLabel[platform]}</option>)}</SelectField>
        <SelectField label="Trạng thái" name="status" defaultValue={filters.status || ''}><option value="">Mọi trạng thái</option>{Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</SelectField>
        <button className="vibe-button vibe-button-primary" type="submit">Lọc</button>
      </form>
      {canManage && (
        <SectionCard title="Tạo chiến dịch">
          <form action={createCrmCampaign} className="vibe-filter">
            <FormField label="Tên" name="name" required />
            <SelectField label="Nền tảng" name="platform" required>{platforms.map(platform => <option key={platform} value={platform}>{platformLabel[platform]}</option>)}</SelectField>
            <SelectField label="Chi nhánh" name="branch_id"><option value="">Toàn hệ thống</option>{(branches ?? []).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</SelectField>
            <FormField label="Bắt đầu" name="starts_on" type="date" />
            <FormField label="Kết thúc" name="ends_on" type="date" />
            <FormField label="Ngân sách" name="budget_amount" placeholder="Để trống nếu chưa có" />
            <FormField label="Tiền tệ" name="currency" placeholder="VND" maxLength={3} />
            <button className="vibe-button vibe-button-primary" type="submit">Tạo</button>
          </form>
        </SectionCard>
      )}
      {rows.map(row => {
        const count = counts.get(row.id)
        const leads = Number(count?.leads ?? 0)
        const won = Number(count?.won ?? 0)
        const budget = row.budget_amount == null ? null : Number(row.budget_amount)
        return (
          <SectionCard key={row.id} title={row.name}>
            <p>{platformLabel[row.platform] || row.platform} · {row.branch_id ? branchName.get(row.branch_id) : 'Toàn hệ thống'} · {row.starts_on || '—'} → {row.ends_on || '—'}</p>
            <StatusBadge tone={statusTone[row.status] || 'neutral'}>{statusLabel[row.status] || row.status}</StatusBadge>
            <dl className="grid gap-3 text-sm sm:grid-cols-5">
              <div><dt>Ngân sách</dt><dd>{budget != null && budget > 0 ? formatCost(budget) : 'Chưa có dữ liệu chi phí'}</dd></div>
              <div><dt>Lead</dt><dd>{leads}</dd></div>
              <div><dt>Đủ điều kiện</dt><dd>{Number(count?.qualified ?? 0)}</dd></div>
              <div><dt>Thành công / mất</dt><dd>{won} / {Number(count?.lost ?? 0)}</dd></div>
              <div><dt>Chuyển đổi</dt><dd>{formatRate(cohortRate(won, leads))}</dd></div>
            </dl>
            {canManage && (
              <>
                <form action={setCrmCampaignStatus} className="vibe-filter">
                  <input type="hidden" name="campaign_id" value={row.id} />
                  <input type="hidden" name="version" value={row.version} />
                  <SelectField label="Trạng thái" name="status" defaultValue={row.status}>{Object.entries(statusLabel).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</SelectField>
                  <button className="vibe-button" type="submit">Cập nhật trạng thái</button>
                </form>
                <form action={updateCrmCampaign} className="vibe-filter">
                  <input type="hidden" name="campaign_id" value={row.id} />
                  <input type="hidden" name="version" value={row.version} />
                  <FormField label="Tên" name="name" defaultValue={row.name} />
                  <FormField label="Bắt đầu" name="starts_on" type="date" defaultValue={row.starts_on || ''} />
                  <FormField label="Kết thúc" name="ends_on" type="date" defaultValue={row.ends_on || ''} />
                  <FormField label="Ngân sách" name="budget_amount" defaultValue={row.budget_amount ?? ''} placeholder="Ngân sách" />
                  <FormField label="Tiền tệ" name="currency" defaultValue={row.currency || ''} placeholder="VND" />
                  <button className="vibe-button" type="submit">Lưu thông tin</button>
                </form>
              </>
            )}
          </SectionCard>
        )
      })}
      {rows.length === 0 && <EmptyState>Chưa có chiến dịch trong bộ lọc này.</EmptyState>}
    </>
  )
}
