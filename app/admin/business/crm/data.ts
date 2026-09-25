import { businessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { tabStatuses } from './model'

export const pageSize = 25

export type LeadFilters = {
  tab?: string
  lead_tab?: string
  queue?: string
  status?: string
  interest?: string
  branch?: string
  owner?: string
  source?: string
  follow?: string
  q?: string
  page?: string
}

const leadColumns = 'id, full_name, phone, email, student_name, source_type, program_interest, instrument_interest, branch_id, owner_user_id, status, interest_level, last_contact_at, next_follow_up_on, version, created_at'

function safeSearch(value?: string) {
  return (value ?? '').trim().replace(/[%(),]/g, '').slice(0, 80)
}

function pageNumber(value?: string) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number < 10000 ? number : 1
}

export async function crmDirectory() {
  const db = await createClient()
  const today = businessDate()
  const [branches, owners, uncontacted, due, overdue, trial, negotiating] = await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.from('profiles').select('id, full_name').eq('status', 'ACTIVE').order('full_name').limit(100),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', 'NEW'),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).eq('next_follow_up_on', today).not('status', 'in', '(WON,LOST)'),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).lt('next_follow_up_on', today).not('status', 'in', '(WON,LOST)'),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', 'TRIAL_BOOKED').eq('next_follow_up_on', today),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', 'NEGOTIATING'),
  ])
  return {
    today,
    branches: branches.data ?? [],
    owners: owners.data ?? [],
    queue: [
      { id: 'uncontacted', label: 'Lead mới chưa liên hệ', count: uncontacted.count ?? 0 },
      { id: 'due', label: 'Follow-up hôm nay', count: due.count ?? 0 },
      { id: 'overdue', label: 'Follow-up quá hạn', count: overdue.count ?? 0 },
      { id: 'trial', label: 'Trial hôm nay', count: trial.count ?? 0 },
      { id: 'negotiating', label: 'Đang thương lượng', count: negotiating.count ?? 0 },
    ],
  }
}

export async function loadLeadPage(filters: LeadFilters) {
  const db = await createClient()
  const today = businessDate()
  const page = pageNumber(filters.page)
  let query = db.from('crm_leads').select(leadColumns, { count: 'exact' })
  const statuses = filters.status ? [filters.status] : tabStatuses(filters.lead_tab)
  if (statuses) query = query.in('status', statuses)
  if (filters.branch) query = query.eq('branch_id', filters.branch)
  if (['REFERENCE', 'INTERESTED', 'POTENTIAL'].includes(filters.interest ?? '')) query = query.eq('interest_level', filters.interest)
  if (filters.owner) query = query.eq('owner_user_id', filters.owner)
  if (filters.source) query = query.eq('source_type', filters.source)
  if (filters.queue === 'uncontacted') query = query.eq('status', 'NEW')
  if (filters.queue === 'due') query = query.eq('next_follow_up_on', today).not('status', 'in', '(WON,LOST)')
  if (filters.queue === 'overdue') query = query.lt('next_follow_up_on', today).not('status', 'in', '(WON,LOST)')
  if (filters.queue === 'trial') query = query.eq('status', 'TRIAL_BOOKED').eq('next_follow_up_on', today)
  if (filters.queue === 'negotiating') query = query.eq('status', 'NEGOTIATING')
  if (filters.follow === 'today') query = query.eq('next_follow_up_on', today)
  if (filters.follow === 'overdue') query = query.lt('next_follow_up_on', today)
  if (filters.follow === 'scheduled') query = query.not('next_follow_up_on', 'is', null)
  if (filters.follow === 'none') query = query.is('next_follow_up_on', null)
  const search = safeSearch(filters.q)
  if (search) {
    const digits = search.replace(/\D/g, '')
    const clauses = [`full_name.ilike.%${search}%`, `phone.ilike.%${search}%`, `email.ilike.%${search}%`, `student_name.ilike.%${search}%`]
    if (digits.length >= 4) clauses.push(`phone_key.ilike.%${digits}%`)
    query = query.or(clauses.join(','))
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  return { rows: data ?? [], count: count ?? 0, page, today, error: error?.message ?? null }
}
