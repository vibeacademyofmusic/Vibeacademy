import { adminClient, pageNumber, pageSize, uuidPattern, type Params } from '../../finance/operations'
import { paymentStatusLabels, type BranchOption, type PayrollDisbursementDetail, type PayrollFilterOption, type PayrollListRow } from './model'

export async function loadPayslipDisbursements(params: Params) {
  const db = await adminClient()
  const page = pageNumber(params.page)
  const period = uuidPattern.test(params.period ?? '') ? params.period! : null
  const branch = uuidPattern.test(params.branch ?? '') ? params.branch! : null
  const paymentStatus = params.payment_status && params.payment_status in paymentStatusLabels ? params.payment_status : null
  const search = (params.q ?? '').trim().slice(0, 100) || null
  const selected = uuidPattern.test(params.payroll ?? '') ? params.payroll! : null

  const [listResult, periodsResult, branchesResult, detailResult] = await Promise.all([
    db.rpc('list_payroll_disbursements_v2', {
      p_period: period, p_branch: branch, p_payment_status: paymentStatus,
      p_search: search, p_limit: pageSize, p_offset: (page - 1) * pageSize,
    }),
    db.from('payroll_periods').select('id,starts_on,ends_on,status,branch_id').in('status', ['APPROVED', 'FINALIZED']).order('starts_on', { ascending: false }).limit(240),
    db.from('branches').select('id,name').eq('status', 'ACTIVE').order('name').limit(200),
    selected ? db.rpc('get_payroll_disbursement_detail', { p_payroll: selected }) : Promise.resolve({ data: null, error: null }),
  ])

  const listPayload = listResult.data && typeof listResult.data === 'object' ? listResult.data as Record<string, unknown> : null
  const rows = !listResult.error && Array.isArray(listPayload?.rows) ? listPayload.rows as PayrollListRow[] : null
  const detail = detailResult.data && typeof detailResult.data === 'object' ? detailResult.data as PayrollDisbursementDetail : null

  return {
    page,
    rows,
    hasMore: listPayload?.has_more === true,
    listError: listResult.error ? 'Không đọc được sổ chi trả. Không hiển thị trạng thái hoặc số tiền thay thế.' : null,
    periods: periodsResult.error ? null : periodsResult.data as PayrollFilterOption[],
    branches: branchesResult.error ? null : branchesResult.data as BranchOption[],
    filterError: periodsResult.error || branchesResult.error ? 'Không tải được đầy đủ lựa chọn kỳ lương hoặc chi nhánh.' : null,
    detail,
    detailError: selected && (detailResult.error || !detail) ? 'Không đọc được chi tiết phiếu lương và lịch sử chi trả.' : null,
  }
}
