import { loadBusinessAccess } from '../access'
import { BusinessWorkspace } from '../workspace-frame'
import { marketingHref, resolveMarketingTab } from '../workspaces'
import { MarketingCampaignsPanel } from './campaigns-panel'
import { MarketingReportsPanel } from './reports-panel'

const reportsDescription = 'Phễu theo nhóm lấy khách được tạo trong kỳ, kể cả khi chốt ở kỳ sau. Phễu hoạt động chỉ đếm sự kiện xảy ra trong kỳ. Chi phí dùng ngân sách của chiến dịch đang lọc, không gán toàn bộ doanh thu cho marketing.'
const campaignsDescription = 'Lead, đủ điều kiện, thành công và mất được đếm trên khách đã gắn với từng chiến dịch. Số này tách khỏi phễu bán hàng ở tab Báo cáo.'

export default async function MarketingWorkspacePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filters = await searchParams
  const access = await loadBusinessAccess()
  const { tab, denied } = resolveMarketingTab(filters.tab, access)
  const tabs = [
    access.reports ? { href: marketingHref('reports'), label: 'Báo cáo', active: tab === 'reports' } : null,
    access.campaigns ? { href: marketingHref('campaigns'), label: 'Chiến dịch', active: tab === 'campaigns' } : null,
  ].filter((item): item is { href: string; label: string; active: boolean } => Boolean(item))
  const tabLabel = tab === 'campaigns' || filters.tab === 'campaigns' ? 'Chiến dịch' : 'Báo cáo'

  return (
    <BusinessWorkspace
      title="Báo cáo marketing"
      description={!tab ? undefined : tab === 'campaigns' ? campaignsDescription : reportsDescription}
      section="Báo cáo marketing"
      tabLabel={tabLabel}
      tabs={tabs}
      denied={denied || !tab}
    >
      {tab === 'reports' ? <MarketingReportsPanel filters={filters} /> : null}
      {tab === 'campaigns' ? <MarketingCampaignsPanel filters={filters} canManage={access.manageCampaigns} /> : null}
    </BusinessWorkspace>
  )
}
