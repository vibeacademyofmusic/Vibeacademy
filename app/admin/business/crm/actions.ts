'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { crmError } from './model'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export async function createCrmLead(formData: FormData) {
  const client = await db()
  const birth = String(formData.get('student_date_of_birth') ?? '').trim()
  const { error } = await client.rpc('create_crm_lead_with_interest', {
    p_request: crypto.randomUUID(),
    p_branch: String(formData.get('branch_id') ?? ''),
    p_full_name: String(formData.get('full_name') ?? ''),
    p_phone: String(formData.get('phone') ?? ''),
    p_email: String(formData.get('email') ?? ''),
    p_parent_name: String(formData.get('parent_name') ?? ''),
    p_student_name: String(formData.get('student_name') ?? ''),
    p_student_date_of_birth: datePattern.test(birth) ? birth : null,
    p_program_interest: String(formData.get('program_interest') ?? ''),
    p_instrument_interest: String(formData.get('instrument_interest') ?? ''),
    p_source_type: 'MANUAL',
    p_owner: null,
    p_interest_level: String(formData.get('interest_level') ?? 'REFERENCE'),
  })
  if (error) redirect('/admin/business/crm?error=' + encodeURIComponent(crmError(error.message)))
  revalidatePath('/admin/business/crm')
  redirect('/admin/business/crm?success=' + encodeURIComponent('Đã tạo khách hàng mới'))
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
