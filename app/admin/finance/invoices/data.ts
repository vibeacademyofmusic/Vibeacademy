import { pageNumber, pageSize, uuidPattern, type Params } from '../operations'
import { rows, type DB } from '../query'
export type Tuition = { id: string; starts_on: string; effective_ends_on: string; plan_name_snapshot: string; branch_name_snapshot: string; amount: number; discount_amount: number; currency: string; enrollments: { students: { full_name: string; student_code: string } } }
export async function tuitionCandidates(db: DB, params: Params) {
  const page = pageNumber(params.terms_page)
  let query = db.from('enrollment_tuition').select('id,starts_on,effective_ends_on,plan_name_snapshot,branch_name_snapshot,amount,discount_amount,currency,enrollments!inner(student_id,students!inner(full_name,student_code)),invoices(id)').neq('status', 'CANCELLED').is('invoices', null)
  if (uuidPattern.test(params.student ?? '')) query = query.eq('enrollments.student_id', params.student!)
  const data = await rows(query.order('starts_on', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<Tuition[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}
