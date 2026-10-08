'use server'
import { revalidatePath } from 'next/cache'
import { reminderActionHref } from './dialog-context'
import { redirect } from 'next/navigation'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { signedInClient, uuidPattern } from '../../finance/operations'
import { openTuitionPayosCheckout } from '@/lib/integrations/tuition/renewal-payos'
import { buildTuitionPaymentRequest, paymentAttemptFromStored, prepareTuitionPaymentRequest, tuitionPaymentDispatch, TUITION_PAYMENT_TEMPLATE_KEY, VERIFIED_TUITION_PAYMENT_TEMPLATE_ID } from '@/lib/integrations/tuition/payment-zbs'
import { sendTuitionPaymentTemplate } from '@/lib/integrations/tuition/payment-send'
import { tuitionCheckoutUrl } from '@/lib/integrations/tuition/checkout-link'
import { paymentNoticeReason, persistedPaymentNoticeStatus } from '@/lib/integrations/tuition/renewal-status'

const plans = ['VIBE_3_MONTHS', 'VIBE_12_MONTHS']
const options = ['DEPOSIT_50', 'FULL']
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function back(form: FormData, message: string, tone: 'error' | 'success' = 'error', reminderId = '') {
  revalidatePath('/admin/tuition/reminders')
  redirect(reminderActionHref(form, message, tone, uuidPattern.test(reminderId) ? { key: 'renew', id: reminderId } : undefined))
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
  const { data, error } = await db.from('tuition_payos_orders').select('order_code,amount,description,state,checkout_url,payment_link_id').eq('case_id', caseId).in('state', ['RESERVED', 'PENDING']).limit(1).maybeSingle()
  if (error) throw new Error('Không đọc được đơn payOS. Hãy tải lại hồ sơ; chưa gọi tạo đơn mới.')
  if (!data) return null
  return data as { order_code: number; amount: number; description: string; state: string; checkout_url: string | null; payment_link_id: string | null }
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
  await db.rpc('note_tuition_renewal_notice', {
    p_case: caseId,
    p_kind: 'PAYMENT',
    p_status: persistedPaymentNoticeStatus(dispatch),
    p_error_code: dispatch.code,
    p_tracking: null,
  })
  return dispatch
}

async function activateCheckout(caseId: string): Promise<{ url?: string; error?: string }> {
  const db = await signedInClient()
  // Check the same branch permission used by begin_tuition_renewal before any provider/service access.
  const renewal = await db.from('tuition_renewal_cases').select('branch_id,reminder_id').eq('id', caseId).maybeSingle()
  if (renewal.error || !renewal.data) return { error: 'Không đọc được hồ sơ gia hạn hoặc bạn không có quyền xem.' }
  const allowed = await db.rpc('has_permission', { p_permission: 'tuition.renewal.prepare', p_branch: renewal.data.branch_id })
  if (allowed.error || allowed.data !== true) return { error: 'Bạn không có quyền tạo gia hạn tại chi nhánh này.' }
  let order
  try { order = await reservedOrder(db, caseId) } catch (error) { return { error: (error as Error).message } }
  if (!order) return { error: 'Không tìm thấy đơn payOS của hóa đơn này.' }
  if (order.state === 'PENDING') {
    const url = tuitionCheckoutUrl(order.payment_link_id, order.checkout_url)
    return url ? { url } : { error: 'Link payOS đã lưu không hợp lệ. Cần đối chiếu đơn trước khi thử lại.' }
  }
  if (order.state !== 'RESERVED') return { error: 'Đơn payOS hiện tại không thể tạo lại.' }
  // A RESERVED row exists only in VIBE. Create the provider checkout; if a prior POST was ambiguous, the helper falls back to a safe GET by orderCode.
  const opened = await openTuitionPayosCheckout({ orderCode: Number(order.order_code), amount: Number(order.amount), description: order.description }, process.env, true, renewal.data.reminder_id)
  if (!opened.checkout) return { error: opened.error ?? 'Chờ tạo thanh toán.' }
  const url = tuitionCheckoutUrl(opened.checkout.paymentLinkId, opened.checkout.checkoutUrl)
  if (!url) return { error: 'payOS trả về link không hợp lệ. Cần đối chiếu đơn trước khi thử lại.' }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return { error: 'Thiếu cấu hình lưu checkout. Đơn đã giữ; đối chiếu payOS trước khi thử lại.' }
  const admin = createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const activated = await admin.rpc('activate_tuition_payos_checkout', {
    p_case: caseId, p_order_code: opened.checkout.orderCode, p_amount: opened.checkout.amount,
    p_payment_link_id: opened.checkout.paymentLinkId, p_checkout_url: url, p_qr_code: opened.checkout.qrCode,
  })
  if (activated.error) return { error: `Không lưu được checkout (${activated.error.code || 'DATABASE_ERROR'}). Đối chiếu đơn payOS hiện có trước khi thử lại.` }
  let saved
  try { saved = await reservedOrder(db, caseId) } catch { return { error: 'Không đọc lại được checkout đã lưu. Hãy tải lại hồ sơ; không tạo đơn mới.' } }
  if (!saved || saved.state !== 'PENDING' || saved.amount !== order.amount || tuitionCheckoutUrl(saved.payment_link_id, saved.checkout_url) !== url) {
    return { error: 'Chưa xác minh được checkout đã lưu. Hãy tải lại hồ sơ để đối chiếu, không tạo đơn mới.' }
  }
  // Notification/template failures cannot withhold a persisted checkout.
  try { await markNotice(caseId) } catch { /* Payment link remains usable; notice status is separate. */ }
  return { url }
}

function openCheckout(url: string) {
  revalidatePath('/admin/tuition/reminders')
  redirect(url)
}

export async function createTuitionRenewal(form: FormData) {
  const reminderId = String(form.get('reminder_id') ?? '')
  const plan = String(form.get('plan_code') ?? '')
  const option = String(form.get('payment_option') ?? '')
  const starts = String(form.get('starts_on') ?? '')
  const due = String(form.get('due_on') ?? '')
  const note = String(form.get('note') ?? '').trim()
  if (form.has('list_price') || form.has('amount') || form.has('amount_due')) return back(form, 'Học phí lấy từ bảng giá chi nhánh. Chưa tạo gia hạn.', 'error', reminderId)
  if (!uuidPattern.test(reminderId) || !plans.includes(plan) || !options.includes(option) || !datePattern.test(starts) || !datePattern.test(due) || note.length > 2000) {
    return back(form, 'Hãy chọn gói, cách thanh toán và ngày hợp lệ.', 'error', reminderId)
  }
  const db = await signedInClient()
  const allowed = await db.rpc('tuition_reminder_prepare_allowed', { p_reminder: reminderId })
  if (allowed.error || allowed.data !== true) return back(form, 'Bạn không có quyền tạo gia hạn tại chi nhánh này.', 'error', reminderId)
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
    if (code.includes('TUITION_RENEWAL_UNAUTHORIZED')) return back(form, 'Bạn không có quyền tạo gia hạn tại chi nhánh này.', 'error', reminderId)
    if (code.includes('TUITION_PRICE_REJECTED')) return back(form, 'Giá gửi lên không khớp bảng giá chi nhánh.', 'error', reminderId)
    if (code.includes('TUITION_RENEWAL_ALREADY_SCHEDULED')) return back(form, 'Đã có kỳ gia hạn đang mở. Chưa tạo thêm hóa đơn.', 'error', reminderId)
    const reason = code.match(/TUITION_[A-Z0-9_]+/)?.[0] ?? begun.error?.code ?? 'DATABASE_ERROR'
    const advice: Record<string, string> = { TUITION_DATE_REJECTED: 'Kiểm tra ngày bắt đầu sau kỳ hiện tại và hạn thanh toán chưa qua.', TUITION_PAYER_REQUIRED: 'Hồ sơ cần phụ huynh chính đang hoạt động, có quyền xem tài chính.', TUITION_PRICE_UNAVAILABLE: 'Chưa có bảng giá hoạt động cho gói tại chi nhánh.', TUITION_SOURCE_UNAVAILABLE: 'Kiểm tra ghi danh đang hoạt động và kỳ học chưa bị hủy.' }
    return back(form, `Không tạo được gia hạn (${reason}). ${advice[reason] ?? 'Hãy tải lại và kiểm tra hồ sơ.'}`, 'error', reminderId)
  }
  if (payload.result === 'open_renewal') return back(form, 'Đã có gia hạn hoặc hóa đơn mở cho học viên này. Chưa tạo bản ghi mới.', 'error', reminderId)
  const checkout = await activateCheckout(payload.case_id)
  if (!checkout.url) return back(form, checkout.error ?? 'Chưa tạo được checkout.', 'error', reminderId)
  return openCheckout(checkout.url)
}

export async function retryTuitionPayos(form: FormData) {
  const caseId = String(form.get('case_id') ?? '')
  if (!uuidPattern.test(caseId)) return back(form, 'Không xác định được hồ sơ gia hạn.')
  const db = await signedInClient()
  const renewal = await db.from('tuition_renewal_cases').select('reminder_id').eq('id', caseId).maybeSingle()
  const checkout = await activateCheckout(caseId)
  if (!checkout.url) return back(form, checkout.error ?? 'Chưa tạo được checkout.', 'error', renewal.data?.reminder_id ?? '')
  return openCheckout(checkout.url)
}

export async function retryTuitionNotice(form: FormData) {
  const caseId = String(form.get('case_id') ?? '')
  if (!uuidPattern.test(caseId)) return back(form, 'Không xác định được hồ sơ gia hạn.')
  const db = await signedInClient()
  const renewal = await db.from('tuition_renewal_cases').select('reminder_id').eq('id', caseId).maybeSingle()
  const dispatch = await markNotice(caseId)
  return back(form, paymentNoticeReason(dispatch.code, dispatch.templateId), 'error', renewal.data?.reminder_id ?? '')
}

export async function sendTuitionPaymentRequest(form: FormData) {
  const caseId = String(form.get('case_id') ?? '')
  if (!uuidPattern.test(caseId)) return back(form, 'Không xác định được hồ sơ gia hạn.')
  const db = await signedInClient()
  const renewal = await db.from('tuition_renewal_cases').select('id,reminder_id,branch_id,student_id,parent_id,plan_code,list_price,amount_due,payment_option,due_on,invoice_id,zbs_status,zbs_error_code,state').eq('id', caseId).maybeSingle()
  const reminderId = renewal.data?.reminder_id ?? ''
  if (renewal.error || !renewal.data) return back(form, 'Không đọc được hồ sơ gia hạn hoặc bạn không có quyền xem.', 'error', reminderId)
  const allowed = await db.rpc('has_permission', { p_permission: 'tuition.renewal.prepare', p_branch: renewal.data.branch_id })
  if (allowed.error || allowed.data !== true) return back(form, 'Bạn không có quyền gửi yêu cầu thanh toán tại chi nhánh này.', 'error', reminderId)
  if (renewal.data.state === 'DEPOSIT_PAID' || renewal.data.state === 'PAID') return back(form, 'Hồ sơ này đã ghi nhận thanh toán. Không gửi yêu cầu mới.', 'error', reminderId)
  const template = await db.from('notification_templates').select('template_key,status,enabled,provider_template_id,parameter_schema,payload_schema').eq('template_key', TUITION_PAYMENT_TEMPLATE_KEY).limit(1).maybeSingle()
  const invoice = await db.from('invoices').select('invoice_number').eq('id', renewal.data.invoice_id).maybeSingle()
  const order = await db.from('tuition_payos_orders').select('payment_link_id,checkout_url,amount,state').eq('case_id', caseId).eq('state', 'PENDING').maybeSingle()
  const student = await db.from('students').select('full_name').eq('id', renewal.data.student_id).maybeSingle()
  const parent = await db.from('parents').select('parent_code,user_id').eq('id', renewal.data.parent_id).maybeSingle()
  const profile = parent.data?.user_id ? await db.from('profiles').select('full_name,phone').eq('id', parent.data.user_id).maybeSingle() : { data: null }
  const invoiceCode = invoice.data?.invoice_number || ''
  const input = {
    customerName: profile.data?.full_name || parent.data?.parent_code || '',
    studentName: student.data?.full_name || '',
    invoiceCode,
    packageName: renewal.data.plan_code === 'VIBE_12_MONTHS' ? '1 năm' : '3 tháng',
    packageAmount: Number(renewal.data.list_price ?? 0),
    paymentType: renewal.data.payment_option === 'FULL' ? 'Thanh toán 100%' : 'Đặt cọc 50%',
    amountDue: Number(renewal.data.amount_due ?? 0),
    deadline: renewal.data.due_on || '',
    paymentLinkId: order.data?.payment_link_id || '',
    checkoutUrl: order.data?.checkout_url || '',
  }
  const prepared = prepareTuitionPaymentRequest({
    template: template.data,
    input,
    linkInvoiceCode: invoiceCode,
    attempt: paymentAttemptFromStored(renewal.data.zbs_status, renewal.data.zbs_error_code, caseId, invoiceCode, input.paymentLinkId),
  })
  if (prepared.code !== 'ELIGIBLE' || !prepared.parameters || prepared.templateId !== VERIFIED_TUITION_PAYMENT_TEMPLATE_ID || Number(order.data?.amount) !== input.amountDue) {
    return back(form, paymentNoticeReason(prepared.code === 'ELIGIBLE' ? 'LINK_INVOICE_MISMATCH' : prepared.code, prepared.templateId), 'error', reminderId)
  }
  if (!profile.data?.phone) return back(form, 'Người nhận chưa có số điện thoại. Chưa gửi.', 'error', reminderId)
  const { zaloManualSendBlock } = await import('@/lib/integrations/zalo/service')
  if (await zaloManualSendBlock()) return back(form, 'Cần cấp quyền lại cho Zalo trước khi gửi. Mở Kết nối Zalo và bấm Kết nối lại Zalo. Chưa gửi tin và chưa ghi đã thanh toán.', 'error', reminderId)
  const claim = await db.rpc('claim_tuition_payment_notice', { p_case: caseId })
  if (claim.error || claim.data !== 'CLAIMED') return back(form, paymentNoticeReason(String(claim.data ?? 'NOT_CLAIMED'), prepared.templateId), 'error', reminderId)
  const tracking = crypto.randomUUID().replaceAll('-', '')
  let outcome: 'ACCEPTED' | 'UNKNOWN' | 'REJECTED' = 'UNKNOWN'
  let reason: 'LOCAL_CONTRACT' | 'TOKEN_INVALID' | 'TEMPLATE_REJECTED' | 'PROVIDER_REJECTED' | 'ACCEPTED' | 'UNKNOWN' = 'UNKNOWN'
  try {
    const sent = await sendTuitionPaymentTemplate({ phone: profile.data.phone, templateId: prepared.templateId, trackingId: tracking, parameters: prepared.parameters })
    outcome = sent.outcome
    reason = sent.reason
  } catch {
    outcome = 'UNKNOWN'
  }
  const finished = await db.rpc('finish_tuition_payment_notice', {
    p_case: caseId,
    p_outcome: outcome,
    p_error: outcome === 'ACCEPTED' ? null : reason,
    p_tracking: tracking,
  })
  if (finished.error || !finished.data) return back(form, 'Không ghi được kết quả gửi. Không bấm gửi lại trước khi đối soát.', 'error', reminderId)
  if (outcome === 'ACCEPTED') return back(form, 'Đã gửi yêu cầu thanh toán cho đúng hóa đơn này. Chưa ghi đã thanh toán.', 'success', reminderId)
  if (reason === 'TOKEN_INVALID') return back(form, 'Kết nối Zalo không còn hiệu lực. Chưa gửi được tin. Hãy kết nối lại OA rồi bấm gửi một lần nữa.', 'error', reminderId)
  if (reason === 'TEMPLATE_REJECTED') return back(form, 'Mẫu 645028 chưa ở trạng thái có thể gửi trên Zalo. Chưa gửi tin và chưa ghi đã thanh toán.', 'error', reminderId)
  if (reason === 'LOCAL_CONTRACT') return back(form, 'Hồ sơ hoặc số điện thoại chưa đúng hợp đồng mẫu thanh toán. Chưa gửi tin.', 'error', reminderId)
  if (outcome === 'UNKNOWN') return back(form, paymentNoticeReason('ACCEPTANCE_UNKNOWN', prepared.templateId), 'error', reminderId)
  return back(form, 'Zalo từ chối nội dung tin. Có thể gửi lại sau khi kiểm tra hồ sơ. Chưa ghi đã thanh toán.', 'error', reminderId)
}
