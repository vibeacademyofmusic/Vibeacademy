import { loadBusinessAccess } from '../access'
import { BusinessWorkspace } from '../workspace-frame'
import { afterSalesHref, resolveAfterSalesTab } from '../workspaces'
import { InstrumentCustomersPanel } from './instruments-panel'
import { ReturningCustomersPanel } from './returning-panel'

const returningDescription = 'Chỉ mở hồ sơ khi học viên đã ngừng, hoặc bảo lưu đã kết thúc và học viên chưa có ghi danh đang học. Bảo lưu còn hạn không được tính quá hạn. Danh sách này không gộp với khách mua đàn.'
const instrumentsDescription = 'Serial, giá bán và ngày hết bảo hành lấy từ phiếu bán. Trang này không tạo hóa đơn học phí và không gộp với hồ sơ khách hàng cũ.'

export default async function AfterSalesWorkspacePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filters = await searchParams
  const access = await loadBusinessAccess()
  const { tab, denied } = resolveAfterSalesTab(filters.tab, access)
  const tabs = [
    access.returning ? { href: afterSalesHref('returning'), label: 'Khách hàng cũ', active: tab === 'returning' } : null,
    access.instruments ? { href: afterSalesHref('instruments'), label: 'Khách mua đàn', active: tab === 'instruments' } : null,
  ].filter((item): item is { href: string; label: string; active: boolean } => Boolean(item))
  const tabLabel = tab === 'instruments' || filters.tab === 'instruments' ? 'Khách mua đàn' : 'Khách hàng cũ'

  return (
    <BusinessWorkspace
      title="Sau bán hàng"
      description={!tab ? undefined : tab === 'instruments' ? instrumentsDescription : returningDescription}
      section="Sau bán hàng"
      tabLabel={tabLabel}
      tabs={tabs}
      denied={denied || !tab}
    >
      {tab === 'returning' ? <ReturningCustomersPanel filters={filters} canManage={access.manageReturning} /> : null}
      {tab === 'instruments' ? <InstrumentCustomersPanel query={filters} canManage={access.manageInstruments} /> : null}
    </BusinessWorkspace>
  )
}
