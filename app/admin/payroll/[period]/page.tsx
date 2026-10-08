import { adminClient, pageNumber, type Params } from '../../finance/operations'
import { Notice, LoadError } from '../../finance/_components/ui'
import { loadWorkspace } from '../_ux/load'
import Workspace from '../_ux/Workspace'
import Workflow from '../_ux/Workflow'

export default async function PayrollPeriod({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<Params> }) {
  const { period: id } = await params
  const p = await searchParams
  const db = await adminClient()
  let data
  try { data = await loadWorkspace(db, id) } catch { return <LoadError/> }
  if (!data) return <p>Không tìm thấy kỳ lương trong phạm vi được cấp quyền.</p>
  const override = await db.rpc('is_global_super_admin')
  const needsReview = data.evidenceError || data.missingPay.length > 0 || data.rows.some(r => r.tone !== 'neutral')
  return <><Notice params={p}/><Workspace key={id + ':' + data.head.version} data={data} initialQuery={p.q} initialTeacher={p.teacher} initialType={p.type} initialCurrency={p.currency} initialTab={p.tab} initialSelected={p.payroll} initialPage={pageNumber(p.page)} workflow={<Workflow head={data.head} canOverride={!override.error && override.data === true} needsReview={needsReview}/>}/></>
}
