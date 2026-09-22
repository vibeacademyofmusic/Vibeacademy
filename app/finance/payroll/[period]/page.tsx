import { financeContext } from '../../authorization'
import { pageNumber, type Params } from '../../../admin/finance/operations'
import { Notice, LoadError } from '../../../admin/finance/_components/ui'
import { loadWorkspace } from '../../../admin/payroll/_ux/load'
import Workspace from '../../../admin/payroll/_ux/Workspace'
import Workflow from '../../../admin/payroll/_ux/Workflow'

export default async function PayrollReview({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<Params> }) {
  const { period: id } = await params
  const p = await searchParams
  // Never swap the Finance authorization boundary for adminClient or a service role.
  const { db, isSuperAdmin } = await financeContext()
  let data
  try { data = await loadWorkspace(db, id) } catch { return <LoadError/> }
  if (!data) return <p>Không có kỳ lương trong phạm vi được cấp quyền.</p>
  const needsReview = data.evidenceError || data.missingPay.length > 0 || data.rows.some(r => r.tone !== 'neutral')
  return <main className="mx-auto w-full min-w-0 max-w-7xl p-4 sm:p-8"><Notice params={p}/><Workspace key={id + ':' + data.head.version} data={data} finance initialQuery={p.q} initialTeacher={p.teacher} initialType={p.type} initialCurrency={p.currency} initialTab={p.tab} initialSelected={p.payroll} initialPage={pageNumber(p.page)} workflow={<Workflow head={data.head} finance canOverride={isSuperAdmin} needsReview={needsReview}/>}/></main>
}
