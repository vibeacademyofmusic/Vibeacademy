'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function fail(message: string): never {
  const text = message.includes('ALREADY_LINKED') ? 'Đơn bán này đã có khách hàng.'
    : message.includes('ALREADY_OPEN') ? 'Đang có hồ sơ bảo hành mở.'
    : message.includes('STALE') ? 'Dữ liệu đã thay đổi. Tải lại rồi thử lại.'
    : message.includes('TERMINAL') ? 'Hồ sơ bảo hành đã kết thúc.'
    : message.includes('UNAUTHORIZED') ? 'Bạn không có quyền thực hiện thao tác này.'
    : message.includes('INVALID') ? 'Thiếu thông tin bắt buộc.'
    : 'Không thực hiện được thao tác.'
  redirect('/admin/business/instrument-customers?error=' + encodeURIComponent(text))
}

async function client() {
  const db = await createClient()
  const { data } = await db.auth.getClaims()
  if (!data?.claims) redirect('/login')
  return db
}

export async function linkInstrumentCustomer(formData: FormData) {
  const db = await client()
  const { error } = await db.rpc('link_instrument_sale_customer', {
    p_request: crypto.randomUUID(),
    p_sale: String(formData.get('sale_event_id') ?? ''),
    p_student: null,
    p_parent: null,
    p_contact_name: String(formData.get('contact_name') ?? ''),
    p_contact_phone: String(formData.get('contact_phone') ?? ''),
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/instrument-customers')
  redirect('/admin/business/instrument-customers?success=' + encodeURIComponent('Đã gắn khách mua đàn'))
}

export async function openWarrantyCase(formData: FormData) {
  const db = await client()
  const { error } = await db.rpc('open_instrument_warranty_case', {
    p_request: crypto.randomUUID(),
    p_sale: String(formData.get('sale_event_id') ?? ''),
    p_issue: String(formData.get('issue') ?? ''),
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/instrument-customers')
  redirect('/admin/business/instrument-customers?view=warranty')
}

export async function transitionWarrantyCase(formData: FormData) {
  const db = await client()
  const { error } = await db.rpc('transition_instrument_warranty', {
    p_request: crypto.randomUUID(),
    p_case: String(formData.get('case_id') ?? ''),
    p_version: Number(formData.get('version')),
    p_status: String(formData.get('status') ?? ''),
    p_note: String(formData.get('note') ?? ''),
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/instrument-customers')
  redirect('/admin/business/instrument-customers?view=warranty')
}

export async function addInstrumentFollowup(formData: FormData) {
  const db = await client()
  const next = String(formData.get('next_follow_up_on') ?? '')
  const { error } = await db.rpc('add_instrument_customer_followup', {
    p_request: crypto.randomUUID(),
    p_sale: String(formData.get('sale_event_id') ?? ''),
    p_channel: String(formData.get('channel') ?? ''),
    p_outcome: String(formData.get('outcome') ?? ''),
    p_note: String(formData.get('note') ?? ''),
    p_next_on: datePattern.test(next) ? next : null,
  })
  if (error) fail(error.message)
  revalidatePath('/admin/business/instrument-customers')
  redirect('/admin/business/instrument-customers?view=care')
}
