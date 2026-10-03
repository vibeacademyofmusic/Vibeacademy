import { businessDate } from '@/app/admin/_lib/business-date'
import { createClient } from '@/lib/supabase/server'
import { openRegistrationStatuses, shownCount, tabMode, tabStatuses } from './model'

export const pageSize = 25

export type LeadFilters = {
  tab?: string
  queue?: string
  status?: string
  branch?: string
  owner?: string
  source?: string
  interest_level?: string
  interest?: string
  follow?: string
  q?: string
  page?: string
}

export type LeadRow = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  parent_name: string | null
  student_name: string | null
  source_type: string
  interest_level: string
  program_interest: string | null
  instrument_interest: string | null
  branch_id: string
  owner_user_id: string | null
  status: string
  last_contact_at: string | null
  next_follow_up_on: string | null
  converted_student_id: string | null
  version: number
  created_at: string
}

export type RegistrationSummary = {
  id: string
  crm_lead_id: string | null
  status: string
  application_code: string
  linked_student_id: string | null
  invoice_id: string | null
  payment_confirmed_at: string | null
}

const leadColumns = 'id, full_name, phone, email, parent_name, student_name, source_type, program_interest, instrument_interest, branch_id, owner_user_id, status, interest_level, last_contact_at, next_follow_up_on, converted_student_id, version, created_at'
const closedLead = '(WON,LOST)'
const closedRegistration = '(CANCELLED,REJECTED,EXPIRED)'

function safeSearch(value?: string) {
  return (value ?? '').trim().replace(/[%(),]/g, '').slice(0, 80)
}

function pageNumber(value?: string) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number < 10000 ? number : 1
}

function monthStart(today: string) {
  return `${today.slice(0, 7)}-01T00:00:00+07:00`
}

async function leadIds(query: PromiseLike<{ data: { id?: string; crm_lead_id?: string | null }[] | null; error: { message: string } | null }>) {
  const result = await query
  if (result.error) return { failed: true, ids: [] as string[] }
  const ids = (result.data ?? []).map(row => row.id || row.crm_lead_id).filter((id): id is string => Boolean(id))
  return { failed: false, ids }
}

export async function crmDirectory() {
  const db = await createClient()
  const today = businessDate()
  const start = monthStart(today)
  const [branches, owners, fresh, follow, opportunity, admission, convertedLeads, convertedApps, due, overdue, trial, payment, placement] = await Promise.all([
    db.from('branches').select('id, name').eq('status', 'ACTIVE').order('name'),
    db.from('profiles').select('id, full_name').eq('status', 'ACTIVE').order('full_name').limit(100),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', 'NEW'),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).lte('next_follow_up_on', today).not('status', 'in', closedLead),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).in('status', ['TRIAL_BOOKED', 'TRIAL_COMPLETED', 'PROPOSAL_SENT', 'NEGOTIATING']),
    db.from('registration_applications').select('id', { count: 'exact', head: true }).in('status', openRegistrationStatuses).not('crm_lead_id', 'is', null),
    db.from('crm_leads').select('id').gte('converted_at', start).limit(1000),
    db.from('registration_applications').select('crm_lead_id').gte('completed_at', start).not('linked_student_id', 'is', null).not('crm_lead_id', 'is', null).limit(1000),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).eq('next_follow_up_on', today).not('status', 'in', closedLead),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).lt('next_follow_up_on', today).not('status', 'in', closedLead),
    db.from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', 'TRIAL_BOOKED'),
    db.from('registration_applications').select('id', { count: 'exact', head: true }).eq('status', 'PAYMENT_PENDING'),
    db.from('student_placement_cases').select('id', { count: 'exact', head: true }).eq('status', 'UNASSIGNED'),
  ])
  const convertedFailed = Boolean(convertedLeads.error || convertedApps.error)
  const convertedIds = new Set<string>([
    ...((convertedLeads.data ?? []).map(row => row.id)),
    ...((convertedApps.data ?? []).map(row => row.crm_lead_id).filter((id): id is string => Boolean(id))),
  ])
  return {
    today,
    branches: branches.error ? [] : branches.data ?? [],
    owners: owners.error ? [] : owners.data ?? [],
    directoryError: Boolean(branches.error),
    metrics: [
      { id: 'new', title: 'Khách mới', value: shownCount(Boolean(fresh.error), fresh.count) },
      { id: 'follow', title: 'Cần follow-up', value: shownCount(Boolean(follow.error), follow.count) },
      { id: 'opportunity', title: 'Cơ hội', value: shownCount(Boolean(opportunity.error), opportunity.count) },
      { id: 'admission', title: 'Đang nhập học', value: shownCount(Boolean(admission.error), admission.count) },
      { id: 'converted', title: 'Chuyển đổi tháng này', value: convertedFailed ? '—' : String(convertedIds.size) },
    ],
    queue: [
      { id: 'due', label: 'Cần liên hệ hôm nay', value: shownCount(Boolean(due.error), due.count) },
      { id: 'overdue', label: 'Quá hạn follow-up', value: shownCount(Boolean(overdue.error), overdue.count) },
      { id: 'trial', label: 'Đang chờ học thử', value: shownCount(Boolean(trial.error), trial.count) },
      { id: 'payment', label: 'Đang chờ thanh toán', value: shownCount(Boolean(payment.error), payment.count) },
      { id: 'placement', label: 'Đang chờ xếp lớp', value: shownCount(Boolean(placement.error), placement.count) },
    ],
  }
}

async function placementLeadIds(db: Awaited<ReturnType<typeof createClient>>) {
  const placements = await db.from('student_placement_cases').select('registration_application_id').eq('status', 'UNASSIGNED').limit(1000)
  if (placements.error) return { failed: true, ids: [] as string[] }
  const applicationIds = (placements.data ?? []).map(row => row.registration_application_id).filter((id): id is string => Boolean(id))
  if (applicationIds.length === 0) return { failed: false, ids: [] as string[] }
  return leadIds(db.from('registration_applications').select('crm_lead_id').in('id', applicationIds).not('crm_lead_id', 'is', null))
}

export async function loadLeadPage(filters: LeadFilters) {
  const db = await createClient()
  const today = businessDate()
  const page = pageNumber(filters.page)
  const mode = tabMode(filters.tab)
  let idFilter: string[] | null = null
  if (mode === 'admission' || mode === 'converted' || filters.queue === 'payment' || filters.queue === 'placement') {
    const lookedUp = mode === 'admission'
      ? await leadIds(db.from('registration_applications').select('crm_lead_id').in('status', openRegistrationStatuses).not('crm_lead_id', 'is', null).limit(1000))
      : mode === 'converted'
        ? await (async () => {
            const [linked, registered] = await Promise.all([
              leadIds(db.from('crm_leads').select('id').not('converted_student_id', 'is', null).limit(1000)),
              leadIds(db.from('registration_applications').select('crm_lead_id').not('linked_student_id', 'is', null).not('crm_lead_id', 'is', null).limit(1000)),
            ])
            if (linked.failed || registered.failed) return { failed: true, ids: [] as string[] }
            return { failed: false, ids: [...new Set([...linked.ids, ...registered.ids])] }
          })()
        : filters.queue === 'payment'
          ? await leadIds(db.from('registration_applications').select('crm_lead_id').eq('status', 'PAYMENT_PENDING').not('crm_lead_id', 'is', null).limit(1000))
          : await placementLeadIds(db)
    if (lookedUp.failed) return { rows: [] as LeadRow[], registrations: [] as RegistrationSummary[], count: null, page, today, error: true }
    idFilter = lookedUp.ids
    if (idFilter.length === 0) return { rows: [] as LeadRow[], registrations: [] as RegistrationSummary[], count: 0, page, today, error: false }
  }

  let query = db.from('crm_leads').select(leadColumns, { count: 'exact' })
  if (idFilter) query = query.in('id', idFilter)
  const statuses = filters.status ? [filters.status] : tabStatuses(filters.tab)
  if (statuses) query = query.in('status', statuses)
  if (filters.branch) query = query.eq('branch_id', filters.branch)
  if (filters.owner) query = query.eq('owner_user_id', filters.owner)
  if (filters.source) query = query.eq('source_type', filters.source)
  if (filters.queue === 'uncontacted') query = query.eq('status', 'NEW')
  if (filters.queue === 'due') query = query.eq('next_follow_up_on', today).not('status', 'in', closedLead)
  if (filters.queue === 'overdue') query = query.lt('next_follow_up_on', today).not('status', 'in', closedLead)
  if (filters.queue === 'trial') query = query.eq('status', 'TRIAL_BOOKED')
  if (filters.follow === 'today') query = query.eq('next_follow_up_on', today)
  if (filters.follow === 'overdue') query = query.lt('next_follow_up_on', today)
  if (filters.follow === 'scheduled') query = query.not('next_follow_up_on', 'is', null)
  if (filters.follow === 'none') query = query.is('next_follow_up_on', null)
  if (['REFERENCE', 'INTERESTED', 'POTENTIAL'].includes(filters.interest_level ?? '')) query = query.eq('interest_level', filters.interest_level)
  const interest = safeSearch(filters.interest)
  if (interest) query = query.or(`program_interest.ilike.%${interest}%,instrument_interest.ilike.%${interest}%`)
  const search = safeSearch(filters.q)
  if (search) {
    const digits = search.replace(/\D/g, '')
    const clauses = [`full_name.ilike.%${search}%`, `phone.ilike.%${search}%`, `email.ilike.%${search}%`, `student_name.ilike.%${search}%`, `parent_name.ilike.%${search}%`]
    if (digits.length >= 4) clauses.push(`phone_key.ilike.%${digits}%`)
    query = query.or(clauses.join(','))
  }
  const { data, count, error } = await query.order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1)
  if (error) return { rows: [] as LeadRow[], registrations: [] as RegistrationSummary[], count: null, page, today, error: true }
  const rows = (data ?? []) as LeadRow[]
  const ids = rows.map(row => row.id)
  if (ids.length === 0) return { rows, registrations: [] as RegistrationSummary[], count: count ?? 0, page, today, error: false }
  const registrations = await db.from('registration_applications').select('id, crm_lead_id, status, application_code, linked_student_id, invoice_id, payment_confirmed_at').in('crm_lead_id', ids)
  if (registrations.error) return { rows, registrations: [] as RegistrationSummary[], count: count ?? 0, page, today, error: true }
  return { rows, registrations: (registrations.data ?? []) as RegistrationSummary[], count: count ?? 0, page, today, error: false }
}
