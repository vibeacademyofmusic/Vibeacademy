import { AppPage, InlineNotice } from '../_components/vibe'
import type { Params } from './operations'
import { loadFinanceControlTower } from './management-report/data'
import { FinanceControlTower } from './management-report/FinanceControlTower'

export default async function FinancePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams
  const data = await loadFinanceControlTower(params)
  if (!data.report) {
    return (
      <AppPage>
        <InlineNotice tone="error">{data.error ?? 'Không tải được báo cáo tài chính quản trị.'}</InlineNotice>
      </AppPage>
    )
  }
  return (
    <AppPage>
      <FinanceControlTower
        report={data.report}
        month={data.month}
        branchId={data.branchId}
        currency={data.currency}
        compare={data.compare}
        canConsolidate={data.canConsolidate}
        branches={data.branches}
      />
    </AppPage>
  )
}
