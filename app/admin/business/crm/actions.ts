'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { crmError, sourceLabel } from './model'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validDate(value: string) {
  if (!datePattern.test(value)) return false
  const day = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value
}

async function db() {
  const client = await createClient()
  const { data, error } = await client.auth.getClaims()
  if (error || !data?.claims) redirect('/login')
  return client
}

function back(lead: string, error?: string) {
  const path = lead ? `/admin/business/crm/${lead}` : '/admin/business/crm'
  revalidatePath('/admin/business/crm')
  if (lead) revalidatePath(path)
  redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path)
}

export async function createCrmLead(formData: FormData): Promise<{ ok: boolean; id?: string; error?: string; field?: string }> {
  const client = await db()
  const request = String(formData.get('request_id') ?? '').trim()
  const birth = String(formData.get('student_date_of_birth') ?? '').trim()
  const start = String(formData.get('desired_start_date') ?? '').trim()
  const sessions = String(formData.get('preferred_sessions_per_week') ?? '').trim()
  const program = String(formData.get('program_interest') ?? '').trim()
  const branch = String(formData.get('branch_id') ?? '').trim()
  const studentName = String(formData.get('student_name') ?? '').trim()
  const note = String(formData.get('schedule_note') ?? '').trim()
  const rawSlots = String(formData.get('preferred_slots') ?? '[]')
  let slots: unknown
  try { slots = JSON.parse(rawSlots) } catch { return { ok: false, field: 'preferred_slots', error: 'Khung giờ mong muốn không hợp lệ.' } }
  if (!uuidPattern.test(request)) return { ok: false, field: 'request_id', error: 'Mã yêu cầu không hợp lệ. Mở lại form để bắt đầu hồ sơ mới.' }
  if (!uuidPattern.test(branch)) return { ok: false, field: 'branch_id', error: 'Chọn chi nhánh hợp lệ.' }
  if (!studentName || studentName.length > 200) return { ok: false, field: 'student_name', error: 'Nhập tên học viên dự kiến, tối đa 200 ký tự.' }
  if (note.length > 500) return { ok: false, field: 'schedule_note', error: 'Ghi chú lịch tối đa 500 ký tự.' }
  if (birth && !validDate(birth)) return { ok: false, field: 'student_date_of_birth', error: 'Ngày sinh không hợp lệ.' }
  if (start && !validDate(start)) return { ok: false, field: 'desired_start_date', error: 'Ngày dự kiến không hợp lệ.' }
  if (sessions && (!/^[1-7]$/.test(sessions))) return { ok: false, field: 'preferred_sessions_per_week', error: 'Số buổi mỗi tuần phải từ 1 đến 7.' }
  if (!Array.isArray(slots) || slots.length > 14 || slots.some(slot => !slot || typeof slot !== 'object' || !/^[1-7]$/.test(String(slot.weekday)) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(slot.start) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(slot.end) || slot.end <= slot.start)) return { ok: false, field: 'preferred_slots', error: 'Kiểm tra thứ và giờ bắt đầu/kết thúc.' }
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    if (slots[i].weekday === slots[j].weekday && slots[i].start < slots[j].end && slots[j].start < slots[i].end) return { ok: false, field: 'preferred_slots', error: 'Các khung giờ cùng ngày không được trùng nhau.' }
  }
  if (!program) return { ok: false, field: 'program_interest', error: 'Chọn bộ môn.' }
  const [{ data: curriculum }, { data: existing }] = await Promise.all([
    client.from('operational_curriculums').select('name').eq('name', program).maybeSingle(),
    client.from('crm_leads').select('program_interest').eq('id', request).maybeSingle(),
  ])
  if (!curriculum && existing?.program_interest !== program) return { ok: false, field: 'program_interest', error: 'Bộ môn không thuộc chương trình đang hoạt động.' }
  const { data, error } = await client.rpc('create_crm_lead_with_schedule', {
    p_request: request,
    p_branch: branch,
    p_full_name: String(formData.get('full_name') ?? ''),
    p_phone: String(formData.get('phone') ?? ''),
    p_email: String(formData.get('email') ?? ''),
    p_parent_name: String(formData.get('parent_name') ?? ''),
    p_student_name: studentName,
    p_student_date_of_birth: birth || null,
    p_program_interest: program,
    p_source_type: sourceLabel[String(formData.get('source_type') ?? '')] ? String(formData.get('source_type')) : 'MANUAL',
    p_interest_level: String(formData.get('interest_level') ?? 'REFERENCE'),
    p_desired_start: start || null,
    p_preferred_slots: slots,
    p_preferred_sessions_per_week: sessions ? Number(sessions) : null,
    p_schedule_note: note,
  })
  if (error) return { ok: false, error: crmError(error.message) }
  revalidatePath('/admin/business/crm')
  revalidatePath('/admin/business/registrations')
  return { ok: true, id: String(data) }
}

function ids(formData: FormData) {
  const lead = String(formData.get('lead_id') ?? '')
  const version = Number(formData.get('version'))
  const request = String(formData.get('request') ?? '')
  if (!uuidPattern.test(lead) || !uuidPattern.test(request) || !Number.isInteger(version)) {
    back(uuidPattern.test(lead) ? lead : '', 'Thiếu thông tin bắt buộc.')
  }
  return { lead, version, request }
}

export async function transitionCrmLead(formData: FormData) {
  const client = await db()
  const { lead, version, request } = ids(formData)
  const { error } = await client.rpc('transition_crm_lead', {
    p_request: request,
    p_lead: lead,
    p_version: version,
    p_to_status: String(formData.get('to_status') ?? ''),
    p_note: String(formData.get('note') ?? ''),
    p_channel: String(formData.get('channel') ?? ''),
  })
  back(lead, error ? crmError(error.message) : undefined)
}

export async function noteCrmLead(formData: FormData) {
  const client = await db()
  const { lead, version, request } = ids(formData)
  const { error } = await client.rpc('add_crm_lead_note', {
    p_request: request,
    p_lead: lead,
    p_version: version,
    p_note: String(formData.get('note') ?? ''),
    p_channel: String(formData.get('channel') ?? ''),
  })
  back(lead, error ? crmError(error.message) : undefined)
}

export async function followUpCrmLead(formData: FormData) {
  const client = await db()
  const { lead, version, request } = ids(formData)
  const day = String(formData.get('follow_up_on') ?? '')
  if (!datePattern.test(day)) back(lead, 'Ngày hẹn không hợp lệ.')
  const { error } = await client.rpc('set_crm_lead_follow_up', {
    p_request: request,
    p_lead: lead,
    p_version: version,
    p_follow_up_on: day,
    p_note: String(formData.get('note') ?? ''),
    p_channel: String(formData.get('channel') ?? ''),
  })
  back(lead, error ? crmError(error.message) : undefined)
}

export async function assignCrmLead(formData: FormData) {
  const client = await db()
  const { lead, version, request } = ids(formData)
  const owner = String(formData.get('owner_user_id') ?? '')
  if (!uuidPattern.test(owner)) back(lead, 'Chọn người phụ trách.')
  const { error } = await client.rpc('assign_crm_lead', {
    p_request: request,
    p_lead: lead,
    p_version: version,
    p_owner: owner,
    p_reason: String(formData.get('reason') ?? ''),
  })
  back(lead, error ? crmError(error.message) : undefined)
}

export async function attributeCrmLead(formData: FormData) {
  const client = await db()
  const { lead, version, request } = ids(formData)
  const campaign = String(formData.get('campaign_id') ?? '').trim()
  const { error } = await client.rpc('set_crm_lead_campaign', {
    p_request: request,
    p_lead: lead,
    p_version: version,
    p_campaign: uuidPattern.test(campaign) ? campaign : null,
    p_external_source: String(formData.get('external_source') ?? ''),
    p_external_lead_id: String(formData.get('external_lead_id') ?? ''),
    p_campaign_reference: String(formData.get('campaign_reference') ?? ''),
    p_received_at: null,
  })
  back(lead, error ? crmError(error.message) : undefined)
}

export async function reviewCrmLead(formData: FormData) {
  const client = await db()
  const { lead, version, request } = ids(formData)
  const student = String(formData.get('student_id') ?? '').trim()
  const parent = String(formData.get('parent_id') ?? '').trim()
  const { error } = await client.rpc('review_crm_lead_conversion', {
    p_request: request,
    p_lead: lead,
    p_version: version,
    p_decision: String(formData.get('decision') ?? ''),
    p_student: uuidPattern.test(student) ? student : null,
    p_parent: uuidPattern.test(parent) ? parent : null,
    p_note: String(formData.get('note') ?? ''),
  })
  back(lead, error ? crmError(error.message) : undefined)
}

export async function setCrmLeadInterest(formData: FormData) {
  const client = await db()
  const { lead, version, request } = ids(formData)
  const { error } = await client.rpc('set_crm_lead_interest', {
    p_request: request,
    p_lead: lead,
    p_version: version,
    p_interest_level: String(formData.get('interest_level') ?? ''),
  })
  back(lead, error ? crmError(error.message) : undefined)
}
