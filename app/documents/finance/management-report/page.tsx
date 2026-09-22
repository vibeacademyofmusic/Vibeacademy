import { cache } from 'react'
import type { Metadata } from 'next'
import { loadFinanceControlTower } from '@/app/admin/finance/management-report/data'
import {
  financialReportDocumentTitle,
} from '@/app/admin/finance/management-report/presentation'
import type { Params } from '@/app/admin/finance/operations'
import FinancialManagementReportDocument from './FinancialManagementReportDocument'
import PrintFinancialReportButton from './PrintFinancialReportButton'
import './financial-report-print.css'

const loadCachedFinancialReport = cache(async (key: string) => {
  const params = JSON.parse(key) as Params
  return loadFinanceControlTower(params)
})

function reportKey(params: Params) {
  return JSON.stringify({
    month: params.month ?? '',
    branch: params.branch ?? '',
    currency: params.currency ?? '',
    compare: params.compare ?? '',
  })
}

function documentTitle(data: Awaited<ReturnType<typeof loadFinanceControlTower>>) {
  if (!data.report) return 'VIBE-Financial-Management-Report'
  const branchCode = data.report.scope.branch_id
    ? data.branches.find((branch) => branch.id === data.report?.scope.branch_id)?.code ?? null
    : null
  return financialReportDocumentTitle(data.report.period.month, data.report.scope, branchCode)
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>
}): Promise<Metadata> {
  const data = await loadCachedFinancialReport(reportKey(await searchParams))
  return { title: documentTitle(data) }
}

export default async function FinancialManagementReportPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const data = await loadCachedFinancialReport(reportKey(await searchParams))
  if (!data.report) {
    return <p>{data.error ?? 'Không tải được báo cáo tài chính quản trị.'}</p>
  }
  const title = documentTitle(data)
  return (
    <>
      <div className="document-actions fm-report-actions">
        <PrintFinancialReportButton title={title} />
      </div>
      <FinancialManagementReportDocument report={data.report} />
    </>
  )
}
