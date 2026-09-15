import { createClient } from '@/lib/supabase/server'
import { readAll } from './data'
import { debtStatuses, invoiceStatuses, pageNumber, pageSize, uuidPattern, type Params } from './operations'
export type DB = Awaited<ReturnType<typeof createClient>>
export type Student = { id: string; full_name: string; student_code: string }
export type Branch = { id: string; name: string }
export type Invoice = {
  invoice_id: string; invoice_number: string; student_id_snapshot: string; branch_name_snapshot: string
  branch_id_snapshot: string; currency: string; total_amount: number; invoice_status: string; receivable_status: string
  issued_on: string | null; due_on: string | null; allocated_amount: number; gross_allocated_amount: number
  refunded_amount: number; outstanding_balance: number; days_overdue: number
}
export const invoiceFields = 'invoice_id,invoice_number,student_id_snapshot,branch_id_snapshot,branch_name_snapshot,currency,total_amount,invoice_status,receivable_status,issued_on,due_on,allocated_amount,gross_allocated_amount,refunded_amount,outstanding_balance,days_overdue'
export async function rows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result = await query
  if (result.error || !result.data) throw new Error('Không tải được dữ liệu')
  return result.data
}
export async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const result = await readAll(page)
  if (result === null) throw new Error('Không tải được dữ liệu')
  return result
}
export async function branches(db: DB) {
  return all<Branch>((a, b) => db.from('branches').select('id,name').order('name').order('id').range(a, b).returns<Branch[]>())
}
export async function studentNames(db: DB, ids: string[]) {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map<string, string>()
  const found = await rows(db.from('students').select('id,full_name,student_code').in('id', unique).returns<Student[]>())
  return new Map(found.map(s => [s.id, `${s.full_name} (${s.student_code})`]))
}
export async function findStudents(db: DB, text?: string) {
  if (!text?.trim()) return []
  const q = text.trim().replace(/[%_,()]/g, ' ').slice(0, 100)
  return rows(db.from('students').select('id,full_name,student_code').or(`full_name.ilike.%${q}%,student_code.ilike.%${q}%`).order('full_name').order('id').limit(25).returns<Student[]>())
}
export async function invoiceList(db: DB, params: Params, debt = false) {
  const page = pageNumber(params.page)
  let query = db.from('invoice_receivables').select(invoiceFields)
  if (debt) query = query.eq('invoice_status', 'ISSUED')
  else if (invoiceStatuses.includes(params.status ?? '')) query = query.eq('invoice_status', params.status!)
  if (debtStatuses.includes(params.receivable ?? '')) query = query.eq('receivable_status', params.receivable!)
  else if (debt && params.receivable !== 'ALL') query = query.in('receivable_status', debtStatuses.slice(0, 3))
  if (uuidPattern.test(params.branch ?? '')) query = query.eq('branch_id_snapshot', params.branch!)
  if (/^[A-Z]{3}$/.test(params.currency ?? '')) query = query.eq('currency', params.currency!)
  const data = await rows(query.order('due_on', { nullsFirst: false }).order('invoice_id').range((page - 1) * pageSize, page * pageSize).returns<Invoice[]>())
  const visible = data.slice(0, pageSize)
  return { data: visible, names: await studentNames(db, visible.map(i => i.student_id_snapshot)), more: data.length > pageSize, page }
}
export async function selectedInvoice(db: DB, id?: string) {
  if (!uuidPattern.test(id ?? '')) return null
  return (await rows(db.from('invoice_receivables').select(invoiceFields).eq('invoice_id', id!).returns<Invoice[]>()))[0] ?? null
}
