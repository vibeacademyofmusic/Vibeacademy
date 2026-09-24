'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { signMomoCreate, verifyMomoCreateResponse } from '@/lib/integrations/momo/signature'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const datePattern = /^\d{4}-\d{2}-\d{2}$/

async function db() {
  const client = await createClient()
  const { data, error } = await client.auth.getClaims()
  if (error || !data?.claims) redirect('/login')
  return client
}

function fail(path: string, error: { message?: string } | null): never {
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
  const { data, error } = await client.rpc('create_registration_application_with_academics', {
    p_request: request,
    p_branch: String(formData.get('branch_id') ?? ''),
    p_lead: uuidPattern.test(lead) ? lead : null,
    p_student_name: String(formData.get('student_name') ?? ''),
    p_student_date_of_birth: datePattern.test(birth) ? birth : null,
    p_parent_name: String(formData.get('parent_name') ?? ''),
    p_parent_phone: String(formData.get('parent_phone') ?? ''),
    p_curriculum: String(formData.get('curriculum_id') ?? ''),
    p_level: String(formData.get('level_id') ?? ''),
    p_subject: String(formData.get('subject_id') ?? ''),
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

export async function setRegistrationDepositQuote(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const plan = String(formData.get('tuition_plan_id') ?? '')
  if (!uuidPattern.test(plan)) fail(`/admin/business/registrations/${id}`, { message: 'Chọn gói học phí hợp lệ.' })
  const { error } = await client.rpc('set_registration_deposit_quote', {
    p_application: id, p_version: Number(formData.get('version') ?? 0), p_plan: plan,
  })
  fail(`/admin/business/registrations/${id}`, error)
}

export async function createRegistrationMomoCheckout(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const path = `/admin/business/registrations/${id}`
  const partnerCode = process.env.MOMO_PARTNER_CODE
  const accessKey = process.env.MOMO_ACCESS_KEY
  const secretKey = process.env.MOMO_SECRET_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const origin = process.env.MOMO_PUBLIC_ORIGIN
  if (process.env.MOMO_ENV !== 'test' || !partnerCode || !accessKey || !secretKey ||
      !serviceKey || !supabaseUrl || !origin || !origin.startsWith('https://')) {
    fail(path, { message: 'Kênh MoMo test chưa được cấu hình.' })
  }
  const { data: order, error: reserveError } = await client.rpc('reserve_registration_momo_order', {
    p_application: id, p_request: crypto.randomUUID(), p_version: Number(formData.get('version') ?? 0),
    p_amount: Number(formData.get('amount') ?? 0),
  })
  if (reserveError || !order) fail(path, reserveError)
  if (order.state === 'READY' && order.pay_url) redirect(path)
  if (order.state !== 'RESERVED' || order.amount < 1000 || order.amount > 50_000_000) {
    fail(path, { message: 'Số tiền cọc không phù hợp giới hạn giao dịch MoMo.' })
  }
  const ipnUrl = `${origin}/api/integrations/momo/ipn`
  const redirectUrl = `${origin}${path}`
  const orderInfo = `Coc hoc phi VIBE ${order.order_id}`
  const request = {
    partnerCode, requestType: 'captureWallet', ipnUrl, redirectUrl,
    orderId: order.order_id, amount: order.amount, orderInfo,
    requestId: order.request_id, extraData: '', lang: 'vi',
  }
  const signature = signMomoCreate({ ...request, accessKey, secretKey })
  let response: Record<string, unknown>
  try {
    const result = await fetch('https://test-payment.momo.vn/v2/gateway/api/create', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...request, signature }),
      signal: AbortSignal.timeout(35_000), cache: 'no-store',
    })
    if (!result.ok) throw new Error('MoMo unavailable')
    response = await result.json()
  } catch {
    fail(path, { message: 'Chưa tạo được yêu cầu MoMo. Kiểm tra kết quả đơn trước khi thử lại.' })
  }
  if (!verifyMomoCreateResponse(response, accessKey, secretKey) ||
      response.resultCode !== 0 || response.partnerCode !== partnerCode ||
      response.orderId !== order.order_id || response.requestId !== order.request_id ||
      Number(response.amount) !== order.amount || typeof response.payUrl !== 'string') {
    fail(path, { message: 'Phản hồi MoMo không khớp đơn cọc.' })
  }
  const admin = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.rpc('activate_registration_momo_order', {
    p_order_id: order.order_id, p_partner_code: partnerCode,
    p_amount: order.amount, p_pay_url: response.payUrl,
  })
  fail(path, error)
}
