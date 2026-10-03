'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { signedInClient, uuidPattern } from '../../finance/operations'
import { openTuitionPayosCheckout } from '@/lib/integrations/tuition/renewal-payos'
import { buildTuitionPaymentRequest, tuitionPaymentDispatch, TUITION_PAYMENT_TEMPLATE_KEY } from '@/lib/integrations/tuition/payment-zbs'
import { PAYMENT_TEMPLATE_REQUEST } from '@/lib/integrations/tuition/renewal-status'

const plans = ['VIBE_3_MONTHS', 'VIBE_12_MONTHS']
const options = ['DEPOSIT_50', 'FULL']
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function back(message: string, tone: 'error' | 'success' = 'error') {
  revalidatePath('/admin/tuition/reminders')
  redirect('/admin/tuition/reminders?' + new URLSearchParams({ [tone]: message }))
}

type Begun = {
  result?: string
  case_id?: string
  amount_due?: number
  state?: string
  order_code?: number
  description?: string
}

function begunRecord(value: unknown): Begun | null {
  return value && typeof value === 'object' ? value as Begun : null
}

async function reservedOrder(db: Awaited<ReturnType<typeof signedInClient>>, caseId: string) {
  const { data, error } = await db.from('tuition_payos_orders').select('order_code,amount,description,state,checkout_url').eq('case_id', caseId).in('state', ['RESERVED', 'PENDING']).limit(1).maybeSingle()
  if (error || !data) return null
  return data as { order_code: number; amount: number; description: string; state: string; checkout_url: string | null }
}

async function markNotice(caseId: string) {
  const db = await signedInClient()
  const template = await db.from('notification_templates').select('template_key,status,enabled,provider_template_id,parameter_schema,payload_schema').eq('template_key', TUITION_PAYMENT_TEMPLATE_KEY).limit(1).maybeSingle()
  const renewal = await db.from('tuition_renewal_cases').select('student_id,parent_id,plan_code,list_price,amount_due,payment_option,due_on,invoice_id').eq('id', caseId).maybeSingle()
  const order = await db.from('tuition_payos_orders').select('payment_link_id,checkout_url,state').eq('case_id', caseId).eq('state', 'PENDING').maybeSingle()
  const invoice = renewal.data?.invoice_id
    ? await db.from('invoices').select('invoice_number').eq('id', renewal.data.invoice_id).maybeSingle()
    : { data: null }
  const student = renewal.data?.student_id
    ? await db.from('students').select('full_name').eq('id', renewal.data.student_id).maybeSingle()
    : { data: null }
  const parent = renewal.data?.parent_id
    ? await db.from('parents').select('parent_code,user_id').eq('id', renewal.data.parent_id).maybeSingle()
    : { data: null }
  const profile = parent.data?.user_id
    ? await db.from('profiles').select('full_name').eq('id', parent.data.user_id).maybeSingle()
    : { data: null }
  const request = buildTuitionPaymentRequest({
    customerName: profile.data?.full_name || parent.data?.parent_code || '',
    studentName: student.data?.full_name || '',
    invoiceCode: invoice.data?.invoice_number || '',
    packageName: renewal.data?.plan_code === 'VIBE_12_MONTHS' ? '1 năm' : '3 tháng',
    packageAmount: Number(renewal.data?.list_price ?? 0),
    paymentType: renewal.data?.payment_option === 'FULL' ? 'Thanh toán 100%' : 'Đặt cọc 50%',
    amountDue: Number(renewal.data?.amount_due ?? 0),
    deadline: renewal.data?.due_on || '',
    paymentLinkId: order.data?.payment_link_id || '',
    checkoutUrl: order.data?.checkout_url || '',
  })
  const dispatch = tuitionPaymentDispatch(template.data, request)
  const waiting = dispatch.code === 'ZBS_TEMPLATE_REQUIRED'
  await db.rpc('note_tuition_renewal_notice', {
    p_case: caseId,
    p_kind: 'PAYMENT',
    p_status: waiting ? 'AWAITING_TEMPLATE' : 'FAILED',
    p_error_code: dispatch.code,
    p_tracking: null,
  })
  return dispatch.state === 'HELD'
}

async function activateCheckout(caseId: string) {
  const db = await signedInClient()
  const order = await reservedOrder(db, caseId)
  if (!order) return 'Không tìm thấy đơn payOS của hóa đơn này.'
  if (order.state === 'PENDING' && order.checkout_url) {
    await markNotice(caseId)
    return ''
  }
  if (order.state !== 'RESERVED') return 'Đơn payOS hiện tại không thể tạo lại.'
  const opened = await openTuitionPayosCheckout({ orderCode: Number(order.order_code), amount: Number(order.amount), description: order.description })
  if (!opened.checkout) return opened.error ?? 'Chờ tạo thanh toán.'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return 'Đã giữ hóa đơn. Chờ tạo thanh toán.'
  const admin = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const activated = await admin.rpc('activate_tuition_payos_checkout', {
    p_case: caseId,
    p_order_code: opened.checkout.orderCode,
    p_amount: opened.checkout.amount,
    p_payment_link_id: opened.checkout.paymentLinkId,
    p_checkout_url: opened.checkout.checkoutUrl,
    p_qr_code: opened.checkout.qrCode,
  })
  if (activated.error) return 'Đã giữ hóa đơn. Chờ tạo thanh toán.'
  await markNotice(caseId)
  return ''
}

export async function createTuitionRenewal(form: FormData) {
  const reminderId = String(form.get('reminder_id') ?? '')
  const plan = String(form.get('plan_code') ?? '')
  const option = String(form.get('payment_option') ?? '')
  const starts = String(form.get('starts_on') ?? '')
  const due = String(form.get('due_on') ?? '')
  const note = String(form.get('note') ?? '').trim()
  if (form.has('list_price') || form.has('amount') || form.has('amount_due')) return back('Học phí lấy từ bảng giá chi nhánh. Chưa tạo gia hạn.')
  if (!uuidPattern.test(reminderId) || !plans.includes(plan) || !options.includes(option) || !datePattern.test(starts) || !datePattern.test(due) || note.length > 2000) {
    return back('Hãy chọn gói, cách thanh toán và ngày hợp lệ.')
  }
  const db = await signedInClient()
  const begun = await db.rpc('begin_tuition_renewal', {
    p_reminder: reminderId,
    p_plan_code: plan,
    p_payment_option: option,
    p_starts_on: starts,
    p_due_on: due,
    p_note: note || null,
    p_asserted_price: null,
  })
  const payload = begunRecord(begun.data)
  if (begun.error || !payload?.case_id) {
    const code = begun.error?.message ?? ''
    if (code.includes('TUITION_RENEWAL_UNAUTHORIZED')) return back('Bạn không có quyền tạo gia hạn tại chi nhánh này.')
    if (code.includes('TUITION_PRICE_REJECTED')) return back('Giá gửi lên không khớp bảng giá chi nhánh.')
    if (code.includes('TUITION_RENEWAL_ALREADY_SCHEDULED')) return back('Đã có kỳ gia hạn đang mở. Chưa tạo thêm hóa đơn.')
    return back('Không tạo được gia hạn. Hãy tải lại và kiểm tra hồ sơ.')
  }
  if (payload.result === 'open_renewal') return back('Đã có gia hạn hoặc hóa đơn mở cho học viên này. Chưa tạo bản ghi mới.')
  const checkoutError = await activateCheckout(payload.case_id)
  if (checkoutError) return back(`Đã tạo hóa đơn gia hạn. ${checkoutError}`)
  return back(`Đã tạo gia hạn và hóa đơn. ${PAYMENT_TEMPLATE_REQUEST}`, 'success')
}

export async function retryTuitionPayos(form: FormData) {
  const caseId = String(form.get('case_id') ?? '')
  if (!uuidPattern.test(caseId)) return back('Không xác định được hồ sơ gia hạn.')
  const checkoutError = await activateCheckout(caseId)
  if (checkoutError) return back(checkoutError)
  return back('Đã dùng lại hóa đơn và đơn payOS hiện có.', 'success')
}

export async function retryTuitionNotice(form: FormData) {
  const caseId = String(form.get('case_id') ?? '')
  if (!uuidPattern.test(caseId)) return back('Không xác định được hồ sơ gia hạn.')
  await markNotice(caseId)
  return back(PAYMENT_TEMPLATE_REQUEST)
}
