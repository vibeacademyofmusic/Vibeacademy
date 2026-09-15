import { rows, all, type DB } from '../finance/query'
import { pageNumber, pageSize, uuidPattern, vietnamDateTime, type Params } from '../finance/operations'
export const statuses = ['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']
export type Term = {
  id: string; enrollment_id: string; tuition_plan_id: string; starts_on: string; base_ends_on: string; effective_ends_on: string;
  status: string; plan_name_snapshot: string; branch_name_snapshot: string; branch_id_snapshot: string; list_price: number;
  discount_type: string; discount_value: number; discount_name: string | null; discount_amount: number; amount: number; currency: string;
  enrollments: { student_id: string; started_at: string; students: { full_name: string; student_code: string } };
  invoices: { id: string; invoice_number: string; status: string } | null;
}
export const termFields = 'id,enrollment_id,tuition_plan_id,starts_on,base_ends_on,effective_ends_on,status,plan_name_snapshot,branch_name_snapshot,branch_id_snapshot,list_price,discount_type,discount_value,discount_name,discount_amount,amount,currency,enrollments!inner(student_id,started_at,students!inner(full_name,student_code)),invoices(id,invoice_number,status)'
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)
export function monthRange(next: boolean, today = vietnamDateTime().slice(0, 10)) {
  const d = new Date(today.slice(0, 7) + '-01T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + (next ? 1 : 0)); const start = d.toISOString().slice(0, 10)
  d.setUTCMonth(d.getUTCMonth() + 1); return [start, d.toISOString().slice(0, 10)]
}
export async function plans(db: DB) { return all((a, b) => db.from('tuition_plans').select('id,name,status').order('name').order('id').range(a, b).returns<{ id: string; name: string; status: string }[]>()) }
export async function terms(db: DB, params: Params) {
  const page = pageNumber(params.page)
  let q = db.from('enrollment_tuition').select(termFields)
  if (uuidPattern.test(params.branch ?? '')) q = q.eq('branch_id_snapshot', params.branch!)
  if (uuidPattern.test(params.plan ?? '')) q = q.eq('tuition_plan_id', params.plan!)
  if (uuidPattern.test(params.enrollment ?? '')) q = q.eq('enrollment_id', params.enrollment!)
  if (statuses.includes(params.status ?? '')) q = q.eq('status', params.status!)
  if (/^[A-Z]{3}$/.test(params.currency ?? '')) q = q.eq('currency', params.currency!)
  if (params.invoice === 'no') q = q.is('invoices', null)
  if (params.invoice === 'yes') q = q.not('invoices', 'is', null)
  if (['current', 'next'].includes(params.expiring ?? '')) {
    const [start, end] = monthRange(params.expiring === 'next'); q = q.gte('effective_ends_on', start).lt('effective_ends_on', end)
  }
  const data = await rows(q.order('starts_on', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<Term[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}
export async function selectedTerm(db: DB, id?: string) {
  if (!uuidPattern.test(id ?? '')) return null
  return (await rows(db.from('enrollment_tuition').select(termFields).eq('id', id!).limit(1).returns<Term[]>()))[0] ?? null
}
export type Enrollment = { id: string; started_at: string; students: { full_name: string; student_code: string }; classes: { name: string; branches: { name: string } } }
export async function enrollmentChoices(db: DB, params: Params) {
  const page = pageNumber(params.enrollments_page)
  let q = db.from('enrollments').select('id,started_at,students!inner(full_name,student_code),classes!inner(name,branches!inner(name))').eq('status', 'ACTIVE').not('started_at', 'is', null)
  const search = (params.student ?? '').trim().slice(0, 80).replace(/[^\p{L}\p{N} -]/gu, '')
  if (search) q = q.or(`full_name.ilike.%${search}%,student_code.ilike.%${search}%`, { referencedTable: 'students' })
  const data = await rows(q.order('started_at', { ascending: false }).order('id').range((page - 1) * pageSize, page * pageSize).returns<Enrollment[]>())
  return { data: data.slice(0, pageSize), page, more: data.length > pageSize }
}
export type Debt = { invoice_id: string; enrollment_tuition_id: string; invoice_number: string; invoice_status: string; receivable_status: string; total_amount: number; outstanding_balance: number; currency: string }
export async function debts(db: DB, ids: string[]) {
  if (!ids.length) return []
  return rows(db.from('invoice_receivables').select('invoice_id,enrollment_tuition_id,invoice_number,invoice_status,receivable_status,total_amount,outstanding_balance,currency').in('enrollment_tuition_id', [...new Set(ids)]).returns<Debt[]>())
}
