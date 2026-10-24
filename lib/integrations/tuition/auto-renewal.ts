import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { openTuitionPayosCheckout } from './renewal-payos'
import { tuitionCheckoutUrl } from './checkout-link'
import { buildTuitionPaymentRequest, paymentAttemptFromStored, prepareTuitionPaymentRequest, TUITION_PAYMENT_TEMPLATE_KEY, VERIFIED_TUITION_PAYMENT_TEMPLATE_ID } from './payment-zbs'
import { sendTuitionPaymentTemplate } from './payment-send'

type Step = { status: 'DONE' | 'PENDING' | 'HELD'; step: string; error?: string }

async function checkout(admin: SupabaseClient, caseId: string, reminderId: string): Promise<string | null> {
  const { data: order } = await admin.from('tuition_payos_orders').select('order_code,amount,description,state,checkout_url,payment_link_id').eq('case_id', caseId).in('state', ['RESERVED', 'PENDING']).limit(1).maybeSingle()
  if (!order) return null
  if (order.state === 'PENDING') return tuitionCheckoutUrl(order.payment_link_id, order.checkout_url) ? 'READY' : null
  const opened = await openTuitionPayosCheckout({ orderCode: Number(order.order_code), amount: Number(order.amount), description: order.description }, process.env, false, reminderId)
  if (!opened.checkout) return null
  const url = tuitionCheckoutUrl(opened.checkout.paymentLinkId, opened.checkout.checkoutUrl)
  if (!url) return null
  const activated = await admin.rpc('activate_tuition_payos_checkout', {
    p_case: caseId, p_order_code: opened.checkout.orderCode, p_amount: opened.checkout.amount,
    p_payment_link_id: opened.checkout.paymentLinkId, p_checkout_url: url, p_qr_code: opened.checkout.qrCode,
  })
  return activated.error ? null : 'READY'
}

async function sendPayment(admin: SupabaseClient, caseId: string): Promise<Step> {
  const { data: renewal } = await admin.from('tuition_renewal_cases').select('id,student_id,parent_id,plan_code,list_price,amount_due,payment_option,due_on,invoice_id,zbs_status,zbs_error_code,state').eq('id', caseId).maybeSingle()
  if (!renewal) return { status: 'HELD', step: 'case', error: 'CASE_MISSING' }
  if (renewal.zbs_status === 'SENT' || renewal.state === 'AWAITING_PAYMENT') return { status: 'DONE', step: 'already_sent' }
  if (renewal.state === 'DEPOSIT_PAID' || renewal.state === 'PAID') return { status: 'DONE', step: 'paid' }
  const [template, invoice, order, student, parent] = await Promise.all([
    admin.from('notification_templates').select('template_key,status,enabled,provider_template_id,parameter_schema,payload_schema').eq('template_key', TUITION_PAYMENT_TEMPLATE_KEY).limit(1).maybeSingle(),
    admin.from('invoices').select('invoice_number').eq('id', renewal.invoice_id).maybeSingle(),
    admin.from('tuition_payos_orders').select('payment_link_id,checkout_url,amount').eq('case_id', caseId).eq('state', 'PENDING').maybeSingle(),
    admin.from('students').select('full_name').eq('id', renewal.student_id).maybeSingle(),
    admin.from('parents').select('parent_code,user_id').eq('id', renewal.parent_id).maybeSingle(),
  ])
  const profile = parent.data?.user_id ? await admin.from('profiles').select('full_name,phone').eq('id', parent.data.user_id).maybeSingle() : { data: null }
  const invoiceCode = invoice.data?.invoice_number || ''
  const input = {
    customerName: profile.data?.full_name || parent.data?.parent_code || '',
    studentName: student.data?.full_name || '',
    invoiceCode,
    packageName: renewal.plan_code === 'VIBE_12_MONTHS' ? '1 năm' : '3 tháng',
    packageAmount: Number(renewal.list_price ?? 0),
    paymentType: renewal.payment_option === 'FULL' ? 'Thanh toán 100%' : 'Đặt cọc 50%',
    amountDue: Number(renewal.amount_due ?? 0),
    deadline: renewal.due_on || '',
    paymentLinkId: order.data?.payment_link_id || '',
    checkoutUrl: order.data?.checkout_url || '',
  }
  const prepared = prepareTuitionPaymentRequest({
    template: template.data, input, linkInvoiceCode: invoiceCode,
    attempt: paymentAttemptFromStored(renewal.zbs_status, renewal.zbs_error_code, caseId, invoiceCode, input.paymentLinkId),
  })
  if (prepared.code !== 'ELIGIBLE' || !prepared.parameters || prepared.templateId !== VERIFIED_TUITION_PAYMENT_TEMPLATE_ID || Number(order.data?.amount) !== input.amountDue) {
    return { status: 'PENDING', step: 'prepare', error: prepared.code }
  }
  if (!profile.data?.phone) return { status: 'HELD', step: 'phone', error: 'PHONE_MISSING' }
  // The durable claim is the exactly-once gate; a lost provider result is never retried automatically.
  const claim = await admin.rpc('claim_tuition_payment_notice', { p_case: caseId })
  if (claim.error) return { status: 'PENDING', step: 'claim', error: 'CLAIM_FAILED' }
  if (claim.data === 'ALREADY_ACCEPTED') return { status: 'DONE', step: 'already_sent' }
  if (claim.data !== 'CLAIMED') return { status: 'HELD', step: 'claim', error: String(claim.data ?? 'NOT_CLAIMED').slice(0, 60) }
  const tracking = crypto.randomUUID().replaceAll('-', '')
  let outcome: 'ACCEPTED' | 'UNKNOWN' | 'REJECTED' = 'UNKNOWN'
  let reason = 'UNKNOWN'
  try {
    const sent = await sendTuitionPaymentTemplate({ phone: profile.data.phone, templateId: prepared.templateId, trackingId: tracking, parameters: prepared.parameters })
    outcome = sent.outcome
    reason = sent.reason
  } catch { outcome = 'UNKNOWN' }
  const finished = await admin.rpc('finish_tuition_payment_notice', { p_case: caseId, p_outcome: outcome, p_error: outcome === 'ACCEPTED' ? null : reason, p_tracking: tracking })
  if (finished.error) return { status: 'HELD', step: 'finish', error: 'FINISH_FAILED' }
  if (outcome === 'ACCEPTED') return { status: 'DONE', step: 'payment_request_sent' }
  return { status: 'HELD', step: 'payment_request', error: reason }
}

async function processOne(admin: SupabaseClient, reminderId: string): Promise<Step> {
  const begun = await admin.rpc('auto_begin_tuition_renewal', { p_reminder: reminderId })
  const payload = begun.data as { result?: string; case_id?: string } | null
  if (begun.error || !payload) return { status: 'PENDING', step: 'begin', error: begun.error?.message?.match(/TUITION_[A-Z0-9_]+/)?.[0] ?? 'BEGIN_FAILED' }
  if (payload.result === 'not_continue') return { status: 'DONE', step: 'not_continue' }
  if (!payload.case_id) return { status: 'HELD', step: 'begin', error: payload.result ?? 'NO_CASE' }
  if (!await checkout(admin, payload.case_id, reminderId)) return { status: 'PENDING', step: 'checkout', error: 'CHECKOUT_UNAVAILABLE' }
  return sendPayment(admin, payload.case_id)
}

export async function runTuitionRenewalAutomation(admin: SupabaseClient, limit = 3) {
  const claimed = await admin.rpc('claim_tuition_renewal_automation', { p_limit: limit })
  if (claimed.error) return { claimed: 0, state: 'UNAVAILABLE' as const }
  const results: Array<{ reminder: string; status: string; step: string }> = []
  for (const row of (claimed.data ?? []) as Array<{ reminder_id: string }>) {
    let step: Step
    try { step = await processOne(admin, row.reminder_id) } catch { step = { status: 'PENDING', step: 'exception', error: 'EXCEPTION' } }
    await admin.rpc('finish_tuition_renewal_automation', { p_reminder: row.reminder_id, p_status: step.status, p_step: step.step, p_error: step.error ?? null })
    results.push({ reminder: row.reminder_id.slice(0, 8), status: step.status, step: step.step })
  }
  return { claimed: results.length, state: 'OK' as const, results }
}
