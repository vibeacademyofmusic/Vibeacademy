'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const datePattern = /^\d{4}-\d{2}-\d{2}$/

async function db() {
  const client = await createClient()
  const { data, error } = await client.auth.getClaims()
  if (error || !data?.claims) redirect('/login')
  return client
}

function fail(path: string, error: { message?: string } | null) {
  revalidatePath('/admin/business/registrations')
  revalidatePath(path)
  redirect(error?.message ? `${path}?error=${encodeURIComponent(error.message)}` : path)
}

export async function createRegistration(formData: FormData) {
  const client = await db()
  const request = crypto.randomUUID()
  const birth = String(formData.get('student_date_of_birth') ?? '').trim()
  const start = String(formData.get('desired_start_date') ?? '').trim()
  const lead = String(formData.get('crm_lead_id') ?? '').trim()
  const { data, error } = await client.rpc('create_registration_application', {
    p_request: request,
    p_branch: String(formData.get('branch_id') ?? ''),
    p_lead: uuidPattern.test(lead) ? lead : null,
    p_student_name: String(formData.get('student_name') ?? ''),
    p_student_date_of_birth: datePattern.test(birth) ? birth : null,
    p_parent_name: String(formData.get('parent_name') ?? ''),
    p_parent_phone: String(formData.get('parent_phone') ?? ''),
    p_program: String(formData.get('program_interest') ?? ''),
    p_instrument: String(formData.get('instrument_interest') ?? ''),
    p_desired_start: datePattern.test(start) ? start : null,
    p_preferred_schedule: String(formData.get('preferred_schedule') ?? ''),
  })
  if (error || !data) fail('/admin/business/registrations', error)
  redirect(`/admin/business/registrations/${data}`)
}

export async function transitionRegistration(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const { error } = await client.rpc('transition_registration_application', {
    p_request: crypto.randomUUID(),
    p_application: id,
    p_version: Number(formData.get('version') ?? 0),
    p_action: String(formData.get('action_name') ?? ''),
  })
  fail(`/admin/business/registrations/${id}`, error)
}

export async function requestRegistrationZaloLink(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const { error } = await client.rpc('request_registration_zalo_link', { p_application: id })
  fail(`/admin/business/registrations/${id}`, error)
}

export async function refreshRegistrationZaloLink(formData: FormData) {
  await db()
  const id = String(formData.get('application_id') ?? '')
  revalidatePath(`/admin/business/registrations/${id}`)
  redirect(`/admin/business/registrations/${id}`)
}

export async function completeRegistration(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const student = String(formData.get('student_id') ?? '').trim()
  const parent = String(formData.get('parent_id') ?? '').trim()
  const { error } = await client.rpc('complete_registration_application', {
    p_request: crypto.randomUUID(),
    p_application: id,
    p_version: Number(formData.get('version') ?? 0),
    p_student: uuidPattern.test(student) ? student : null,
    p_parent: uuidPattern.test(parent) ? parent : null,
  })
  fail(`/admin/business/registrations/${id}`, error)
}
