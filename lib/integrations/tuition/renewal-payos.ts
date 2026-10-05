import { createPayosPaymentLink, readPayosPendingCheckout, payosCheckoutError, payosConfigurationGaps } from '@/lib/integrations/payos/client'

export function payosTuitionReturnUrls(env: NodeJS.ProcessEnv = process.env, reminderId = '') {
  const origin = new URL(env.NEXT_PUBLIC_APP_URL || '')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('PAYOS_RETURN_URL_INVALID')
  }
  const selected = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reminderId) ? `?renew=${reminderId}` : ''
  const base = `${origin.origin}/admin/tuition/reminders`
  return { returnUrl: base + selected, cancelUrl: base + selected + (selected ? '&' : '?') + 'payos=cancel' }
}

export async function openTuitionPayosCheckout(input: {
  orderCode: number
  amount: number
  description: string
}, env: NodeJS.ProcessEnv = process.env, fresh = false, reminderId = '') {
  const gaps = payosConfigurationGaps(env)
  if (gaps.length) return { error: `Chờ tạo thanh toán. Thiếu ${gaps.join(', ')}.` }
  try {
    const checkout = fresh
      ? await createPayosPaymentLink({ ...input, ...payosTuitionReturnUrls(env, reminderId) }, env)
      : await readPayosPendingCheckout(input, env)
    if (checkout.amount !== input.amount || checkout.orderCode !== input.orderCode) return { error: 'payOS trả về số tiền không khớp hóa đơn.' }
    return { checkout }
  } catch (error) {
    if (fresh) {
      // The provider may have committed even when POST timed out; only GET may follow.
      try { return { checkout: await readPayosPendingCheckout(input, env) } } catch { /* Keep original actionable error. */ }
    }
    return { error: payosCheckoutError(error) }
  }
}
