'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(message: string): never {
  const text = message.includes('STALE') ? 'Dữ liệu đã thay đổi. Tải lại rồi thử lại.'
    : message.includes('UNAUTHORIZED') ? 'Bạn không có quyền thực hiện thao tác này.'
    : message.includes('INVALID') ? 'Thiếu thông tin bắt buộc.'
    : 'Không thực hiện được thao tác.'
  redirect('/admin/business/campaigns?error=' + encodeURIComponent(text))
}

function day(value: FormDataEntryValue | null) {
  const text = String(value ?? '')
  return datePattern.test(text) ? text : null
}

function money(formData: FormData) {
  const raw = String(formData.get('budget_amount') ?? '').trim()
  if (!raw) return { budget: null, currency: null }
  const budget = Number(raw)
  const currency = String(formData.get('currency') ?? '').trim().toUpperCase()
  if (!Number.isFinite(budget) || budget < 0 || !/^[A-Z]{3}$/.test(currency)) fail('INVALID')
  return { budget, currency }
}

export async function createCrmCampaign(formData: FormData) {
  const client = await createClient()
  const { data } = await client.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const branch = String(formData.get('branch_id') ?? '')
  const { budget, currency } = money(formData)
  const { error } = await client.rpc('create_crm_campaign', {
    p_request: crypto.randomUUID(),
    p_name: String(formData.get('name') ?? ''),
    p_platform: String(formData.get('platform') ?? ''),
    p_channel: String(formData.get('channel') ?? ''),
    p_branch: uuidPattern.test(branch) ? branch : null,
    p_starts_on: day(formData.get('starts_on')),
    p_ends_on: day(formData.get('ends_on')),
    p_budget: budget,
    p_currency: currency,
    p_utm_source: String(formData.get('utm_source') ?? ''),
    p_utm_medium: String(formData.get('utm_medium') ?? ''),
    p_utm_campaign: String(formData.get('utm_campaign') ?? ''),
    p_utm_content: String(formData.get('utm_content') ?? ''),
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/campaigns')
  redirect('/admin/business/campaigns?success=' + encodeURIComponent('Đã tạo chiến dịch'))
}

export async function updateCrmCampaign(formData: FormData) {
  const client = await createClient()
  const { data } = await client.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const { budget, currency } = money(formData)
  const { error } = await client.rpc('update_crm_campaign', {
    p_campaign: String(formData.get('campaign_id') ?? ''),
    p_version: Number(formData.get('version')),
    p_name: String(formData.get('name') ?? ''),
    p_channel: String(formData.get('channel') ?? ''),
    p_starts_on: day(formData.get('starts_on')),
    p_ends_on: day(formData.get('ends_on')),
    p_budget: budget,
    p_currency: currency,
    p_utm_source: String(formData.get('utm_source') ?? ''),
    p_utm_medium: String(formData.get('utm_medium') ?? ''),
    p_utm_campaign: String(formData.get('utm_campaign') ?? ''),
    p_utm_content: String(formData.get('utm_content') ?? ''),
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/campaigns')
  redirect('/admin/business/campaigns?success=' + encodeURIComponent('Đã cập nhật chiến dịch'))
}

export async function setCrmCampaignStatus(formData: FormData) {
  const client = await createClient()
  const { data } = await client.auth.getClaims()
  if (!data?.claims) redirect('/login')
  const { error } = await client.rpc('set_crm_campaign_status', {
    p_request: crypto.randomUUID(),
    p_campaign: String(formData.get('campaign_id') ?? ''),
    p_version: Number(formData.get('version')),
    p_status: String(formData.get('status') ?? ''),
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/campaigns')
  redirect('/admin/business/campaigns')
}
