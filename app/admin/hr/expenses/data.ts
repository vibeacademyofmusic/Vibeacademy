import { adminClient, pageNumber, pageSize, uuidPattern, type Params } from '../../finance/operations'
import { expenseStates, type ClaimDetail, type ClaimListItem, type CreateContext } from './model'

export async function loadExpenses(params: Params) {
  const db = await adminClient()
  const page = pageNumber(params.page)
  const status = expenseStates[params.status ?? ''] ? params.status! : null
  const claimId = uuidPattern.test(params.claim ?? '') ? params.claim! : null
  const [claimsResult, contextResult, authResult, detailResult] = await Promise.all([
    db.rpc('list_employee_expense_claims_v2', { p_status: status, p_limit: pageSize, p_offset: (page - 1) * pageSize }),
    db.rpc('get_expense_claim_v2_create_context'),
    db.auth.getClaims(),
    claimId ? db.rpc('get_employee_expense_claim', { p_claim: claimId }) : Promise.resolve({ data: null, error: null }),
  ])
  const listPayload = claimsResult.data && typeof claimsResult.data === 'object' ? claimsResult.data as Record<string, unknown> : null
  const claims = Array.isArray(listPayload?.claims) ? listPayload.claims as ClaimListItem[] : []
  const detail = detailResult.data && typeof detailResult.data === 'object' ? detailResult.data as ClaimDetail : null
  const context = contextResult.data && typeof contextResult.data === 'object' ? contextResult.data as CreateContext : null
  const [person, branch, periods] = detail ? await Promise.all([
    db.from('employee_directory').select('full_name,employee_code').eq('id', detail.claim.employee_id).maybeSingle(),
    db.from('branches').select('name').eq('id', detail.claim.branch_id).maybeSingle(),
    detail.claim.status === 'APPROVED' ? db.from('payroll_periods').select('id,starts_on,status,version').eq('branch_id', detail.claim.branch_id).eq('starts_on', detail.claim.requested_month).in('status', ['GENERATED', 'REVIEW']) : Promise.resolve({ data: [], error: null }),
  ]) : [null, null, null]
  return {
    page, claims,
    listError: claimsResult.error ? 'Không xác nhận được danh sách bảng kê.' : null,
    context,
    contextError: contextResult.error ? 'Không xác nhận được quan hệ nhân sự và chuyến công tác đã duyệt.' : null,
    detail,
    detailError: claimId && (detailResult.error || !detail) ? 'Không tải được bảng kê đã chọn.' : null,
    actorId: typeof authResult.data?.claims?.sub === 'string' ? authResult.data.claims.sub : null,
    person: person?.error ? null : person?.data ?? null,
    branch: branch?.error ? null : branch?.data ?? null,
    periods: periods?.error ? null : periods?.data ?? null,
    relatedReadError: Boolean(person?.error || branch?.error || periods?.error),
  }
}
