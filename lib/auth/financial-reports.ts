import { requestClient, requestRole } from './request'

// Financial report reads fail closed for every account that is not the unrestricted administrator.
// Before the operations-lead migration is applied, the check falls back to the existing administrator gate.
export async function mayViewFinancialReports(branch: string | null = null) {
  const db = await requestClient()
  const access = await db.rpc('can_view_financial_reports', { p_branch: branch })
  if (!access.error) return access.data === true
  const role = await requestRole('SUPER_ADMIN')
  return role.data === true
}
