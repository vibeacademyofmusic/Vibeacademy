'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { signMomoCreate, verifyMomoCreateResponse } from '@/lib/integrations/momo/signature'
import { createPayosPaymentLink, payosConfigurationGaps, payosReturnUrls, payosCheckoutError } from '@/lib/integrations/payos/client'
import { homeAddress, isOver18, normalizeVnPhone, vietnamToday } from './intake'

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

function intakeInput(formData: FormData) {
  const birth = String(formData.get('student_date_of_birth') ?? '').trim()
  const start = String(formData.get('desired_start_date') ?? '').trim()
  const lead = String(formData.get('crm_lead_id') ?? '').trim()
  const request = String(formData.get('request_id') ?? '').trim()
  const subject = String(formData.get('subject_id') ?? '').trim()
  const over18 = formData.get('student_over_18') === 'yes'
  const address = homeAddress(String(formData.get('home_address') ?? ''))
  const zalo = normalizeVnPhone(String(formData.get('zalo_phone') ?? ''))
  const parentPhoneRaw = String(formData.get('parent_phone') ?? '')
  const parentPhone = parentPhoneRaw.trim() ? normalizeVnPhone(parentPhoneRaw) : null
  const today = vietnamToday()
  if (!address) return { error: 'Địa chỉ nhà không được để trống hoặc chỉ gồm khoảng trắng.' }
  if (!zalo) return { error: 'Số Zalo không hợp lệ. Chỉ dùng chữ số và phải là số Việt Nam.' }
  if (!datePattern.test(birth) || over18 !== isOver18(birth, today)) return { error: 'Ngày sinh không khớp ô Trên 18 tuổi. Trên 18 tuổi nghĩa là đã qua ngày sinh nhật thứ 18 theo giờ Việt Nam, không tính đúng ngày sinh nhật.' }
  if (!over18 && (!String(formData.get('parent_name') ?? '').trim() || !parentPhone)) return { error: 'Học viên chưa trên 18 tuổi thì cần họ tên và số điện thoại phụ huynh hợp lệ.' }
  if (over18 && parentPhoneRaw.trim() && !parentPhone) return { error: 'Số điện thoại phụ huynh không hợp lệ.' }
  return {
    args: {
      p_consent: formData.get('phone_consent') === 'yes',
      p_consent_method: formData.get('phone_consent') === 'yes' ? 'IN_PERSON' : '',
      p_request: uuidPattern.test(request) ? request : crypto.randomUUID(),
      p_branch: String(formData.get('branch_id') ?? ''),
      p_lead: uuidPattern.test(lead) ? lead : null,
      p_student_name: String(formData.get('student_name') ?? ''),
      p_student_date_of_birth: birth,
      p_parent_name: String(formData.get('parent_name') ?? ''),
      p_parent_phone: parentPhone ?? '',
      p_curriculum: String(formData.get('curriculum_id') ?? ''),
      p_level: String(formData.get('level_id') ?? ''),
      p_subject: uuidPattern.test(subject) ? subject : null,
      p_desired_start: datePattern.test(start) ? start : null,
      p_preferred_schedule: String(formData.get('preferred_schedule') ?? ''),
      p_over_18: over18,
      p_zalo_phone: zalo,
      p_home_address: address,
    },
  }
}

export async function createRegistration(formData: FormData) {
  const client = await db()
  const intake = intakeInput(formData)
  if ('error' in intake) fail('/admin/business/registrations/new', { message: intake.error })
  const { data, error } = await client.rpc('create_registration_with_zalo_consent', intake.args)
  if (error || !data) fail('/admin/business/registrations/new', error)
  redirect(`/admin/business/registrations/${data}`)
}

export async function updateRegistrationIntake(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const path = `/admin/business/registrations/${id}`
  const intake = intakeInput(formData)
  if ('error' in intake) fail(path, { message: intake.error })
  const { error } = await client.rpc('update_registration_intake', {
    ...intake.args,
    p_application: id,
    p_version: Number(formData.get('version') ?? 0),
  })
  if (error) fail(path, error)
  revalidatePath(path)
  redirect(path)
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
  const discountType = String(formData.get('discount_type') ?? 'NONE').trim().toUpperCase()
  const discountValue = Number(formData.get('discount_value') ?? 0)
  const discountName = String(formData.get('discount_name') ?? '').trim()
  if (!uuidPattern.test(plan)) fail(`/admin/business/registrations/${id}`, { message: 'Chọn gói học phí hợp lệ.' })
  if (!['NONE', 'PERCENT', 'FIXED'].includes(discountType)) {
    fail(`/admin/business/registrations/${id}`, { message: 'Loại giảm giá không hợp lệ.' })
  }
  if (discountType !== 'NONE' && !discountName) {
    fail(`/admin/business/registrations/${id}`, { message: 'Giảm giá đã duyệt cần tên quyết định.' })
  }
  const paymentOption = String(formData.get('payment_option') ?? 'DEPOSIT_50').trim().toUpperCase()
  if (!['DEPOSIT_50', 'FULL'].includes(paymentOption)) {
    fail(`/admin/business/registrations/${id}`, { message: 'Chọn thanh toán 50% hoặc thanh toán đủ học phí.' })
  }
  const { error } = await client.rpc('set_registration_deposit_quote', {
    p_application: id,
    p_version: Number(formData.get('version') ?? 0),
    p_plan: plan,
    p_discount_type: discountType,
    p_discount_value: Number.isFinite(discountValue) ? discountValue : 0,
    p_discount_name: discountName || null,
    p_payment_option: paymentOption,
  })
  fail(`/admin/business/registrations/${id}`, error)
}

export async function allocateRegistrationDeposits(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const invoice = String(formData.get('invoice_id') ?? '').trim()
  if (!uuidPattern.test(invoice)) {
    fail(`/admin/business/registrations/${id}`, { message: 'Chọn công nợ học phí nội bộ đã phát hành.' })
  }
  const { error } = await client.rpc('allocate_registration_deposits_to_invoice', {
    p_application: id,
    p_invoice: invoice,
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
    fail(path, { message: 'Số tiền thanh toán không phù hợp giới hạn giao dịch MoMo.' })
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
    fail(path, { message: 'Phản hồi MoMo không khớp đơn thanh toán.' })
  }
  const admin = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.rpc('activate_registration_momo_order', {
    p_order_id: order.order_id, p_partner_code: partnerCode,
    p_amount: order.amount, p_pay_url: response.payUrl,
  })
  fail(path, error)
}

export async function createRegistrationPayosCheckout(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const path = `/admin/business/registrations/${id}`
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const gaps = [
    ...payosConfigurationGaps(),
    ...(!serviceKey ? ['SUPABASE_SERVICE_ROLE_KEY'] : []),
    ...(!supabaseUrl ? ['NEXT_PUBLIC_SUPABASE_URL'] : []),
  ]
  if (gaps.length > 0 || !serviceKey || !supabaseUrl) {
    fail(path, { message: `Kênh payOS chưa được cấu hình. Thiếu ${gaps.join(', ')}.` })
  }
  const { data: order, error: reserveError } = await client.rpc('reserve_registration_payos_order', {
    p_application: id, p_request: crypto.randomUUID(), p_version: Number(formData.get('version') ?? 0),
  })
  if (reserveError || !order) fail(path, reserveError)
  if (order.state === 'PAID' || (order.state === 'PENDING' && order.checkout_url)) redirect(path)
  if (order.state !== 'RESERVED') fail(path, { message: 'Đơn payOS hiện tại không thể tạo link mới.' })
  let checkout
  try {
    checkout = await createPayosPaymentLink({
      orderCode: Number(order.order_code), amount: Number(order.amount), description: order.description,
      ...payosReturnUrls(path),
    })
  } catch (error) {
    fail(path, { message: payosCheckoutError(error) })
  }
  const admin = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { error } = await admin.rpc('activate_registration_payos_order', {
    p_order_code: checkout.orderCode, p_amount: checkout.amount, p_payment_link_id: checkout.paymentLinkId,
    p_checkout_url: checkout.checkoutUrl, p_qr_code: checkout.qrCode,
  })
  fail(path, error)
}


export async function requestRegistrationZaloLink(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const { error } = await client.rpc('request_registration_zalo_link', { p_application: id })
  fail(`/admin/business/registrations/${id}`, error)
}

export async function recordRegistrationZaloPhoneConsent(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const expected = String(formData.get('expected_consent') ?? '')
  const { data, error } = await client.rpc('update_registration_zalo_consent', {
    p_application: id,
    p_expected: expected || null,
    p_operation: formData.get('operation') === 'REVOKE' ? 'REVOKE' : 'RECORD',
    p_phone: String(formData.get('phone') ?? ''),
    p_confirmed: formData.get('phone_consent') === 'yes',
    p_method: String(formData.get('consent_method') ?? ''),
    p_source: 'REGISTRATION_RECORD',
  })
  const path = `/admin/business/registrations/${id}`
  if (error) fail(path, error)
  revalidatePath(path)
  revalidatePath('/admin/system/integrations/zalo')
  redirect(`${path}?channel=${encodeURIComponent(data ?? 'CONSENT_RECORDED')}`)
}

export async function refreshRegistrationZaloLink(formData: FormData) {
  await db()
  const id = String(formData.get('application_id') ?? '')
  revalidatePath(`/admin/business/registrations/${id}`)
  redirect(`/admin/business/registrations/${id}`)
}

export async function reevaluateRegistrationZaloChannel(formData: FormData) {
  const client = await db()
  const id = String(formData.get('application_id') ?? '')
  const path = `/admin/business/registrations/${id}`
  const { data, error } = await client.rpc('reevaluate_registration_zalo_channel', { p_application: id })
  revalidatePath(path)
  revalidatePath('/admin/system/integrations/zalo')
  if (error) fail(path, error)
  redirect(`${path}?channel=${encodeURIComponent(String(data))}`)
}
