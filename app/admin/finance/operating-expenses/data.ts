import { adminClient, pageNumber, pageSize, uuidPattern, type Params } from '../operations'
import { operatingExpenseCategories, operatingExpenseStates, type OperatingExpenseContext, type OperatingExpenseDetail, type OperatingExpenseListRow } from './model'

export async function loadOperatingExpenses(params: Params) {
  const db = await adminClient()
  const page = pageNumber(params.page)
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month ?? '') ? `${params.month}-01` : null
  const branch = uuidPattern.test(params.branch ?? '') ? params.branch! : null
  const category = operatingExpenseCategories[params.category ?? ''] ? params.category! : null
  const status = operatingExpenseStates[params.status ?? ''] ? params.status! : null
  const search = (params.q ?? '').trim().slice(0, 100) || null
  const selected = uuidPattern.test(params.selected ?? '') ? params.selected! : null
  const [listResult, contextResult, detailResult] = await Promise.all([
    db.rpc('list_operating_expenses', {
      p_month: month,
      p_branch: branch,
      p_category: category,
      p_status: status,
      p_search: search,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    }),
    db.rpc('list_operating_expense_context'),
    selected ? db.rpc('get_operating_expense', { p_record: selected }) : Promise.resolve({ data: null, error: null }),
  ])
  const listPayload = listResult.data && typeof listResult.data === 'object' ? listResult.data as Record<string, unknown> : null
  const rows = Array.isArray(listPayload?.rows) ? listPayload.rows as OperatingExpenseListRow[] : []
  const context = contextResult.data && typeof contextResult.data === 'object' ? contextResult.data as OperatingExpenseContext : null
  const detail = detailResult.data && typeof detailResult.data === 'object' ? detailResult.data as OperatingExpenseDetail : null
  return {
    page,
    rows,
    more: listPayload?.has_more === true,
    listError: listResult.error ? 'Không xác nhận được danh sách chi phí cố định.' : null,
    context,
    contextError: contextResult.error ? 'Không xác nhận được chi nhánh và mẫu định kỳ.' : null,
    detail,
    detailError: selected && (detailResult.error || !detail) ? 'Không tải được khoản chi đã chọn.' : null,
  }
}
