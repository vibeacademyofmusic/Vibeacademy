import { requestClaims, requestClient } from '@/lib/auth/request'
import { pageNumber, pageSize, uuidPattern, vietnamDateTime, type Params } from '../../finance/operations'
import { expenseStates, type ClaimDetail, type ClaimListItem, type CreateContext } from './model'

export async function loadExpenses(params: Params, forEmployee = false) {
  const db = await requestClient()
  const page = pageNumber(params.page)
  const status = expenseStates[params.status ?? ''] ? params.status! : null
  const claimId = uuidPattern.test(params.claim ?? '') ? params.claim! : null
  const [claimsResult, contextResult, authResult, detailResult] = await Promise.all([
    db.rpc('list_employee_expense_claims_v2', { p_status: status, p_limit: pageSize, p_offset: (page - 1) * pageSize }),
    db.rpc('get_expense_claim_v2_create_context'),
    requestClaims(),
    claimId ? db.rpc('get_employee_expense_claim', { p_claim: claimId }) : Promise.resolve({ data: null, error: null }),
  ])
  const listPayload = claimsResult.data && typeof claimsResult.data === 'object' ? claimsResult.data as Record<string, unknown> : null
  const claims = Array.isArray(listPayload?.claims) ? listPayload.claims as ClaimListItem[] : []
  const detail = detailResult.data && typeof detailResult.data === 'object' ? detailResult.data as ClaimDetail : null
  const context = contextResult.data && typeof contextResult.data === 'object' ? contextResult.data as CreateContext : null
  const ownDetail = forEmployee && detail && context && detail.claim.employee_id === context.employee.id && detail.claim.branch_id === context.branch.id
  const [person, branch, periods] = detail ? await Promise.all([
    ownDetail ? Promise.resolve({ data: { full_name: context.employee.full_name, employee_code: context.employee.employee_code }, error: null }) : db.from('employee_directory').select('full_name,employee_code').eq('id', detail.claim.employee_id).maybeSingle(),
    ownDetail ? Promise.resolve({ data: { name: context.branch.name }, error: null }) : db.from('branches').select('name').eq('id', detail.claim.branch_id).maybeSingle(),
    !forEmployee && detail.claim.status === 'APPROVED' ? db.from('payroll_periods').select('id,starts_on,status,version').eq('branch_id', detail.claim.branch_id).eq('starts_on', detail.claim.requested_month).in('status', ['GENERATED', 'REVIEW']) : Promise.resolve({ data: [], error: null }),
  ]) : [null, null, null]
  return {
    page, claims,
    currentMonth: vietnamDateTime().slice(0, 7),
    listError: claimsResult.error ? 'Không xác nhận được danh sách bảng kê.' : null,
    context,
    contextError: contextResult.error
      ? contextResult.error.message.includes('EXPENSE_ACTIVE_EMPLOYEE_LINK_AND_OWN_PERMISSION_REQUIRED')
        ? 'Tài khoản này chưa liên kết với nhân viên đang làm việc hoặc chưa có quyền tự xem lương để lập bảng kê.'
        : 'Không xác nhận được quan hệ nhân sự và chuyến công tác đã duyệt.'
      : null,
    detail,
    detailError: claimId && (detailResult.error || !detail) ? 'Không tải được bảng kê đã chọn.' : null,
    actorId: typeof authResult.data?.claims?.sub === 'string' ? authResult.data.claims.sub : null,
    person: person?.error ? null : person?.data ?? null,
    branch: branch?.error ? null : branch?.data ?? null,
    periods: periods?.error ? null : periods?.data ?? null,
    relatedReadError: Boolean(person?.error || branch?.error || periods?.error),
  }
}
