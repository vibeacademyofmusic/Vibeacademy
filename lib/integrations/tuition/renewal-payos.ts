import { createPayosPaymentLink, payosCheckoutError, payosConfigurationGaps } from '@/lib/integrations/payos/client'

export function payosTuitionReturnUrls(env: NodeJS.ProcessEnv = process.env) {
  const origin = new URL(env.NEXT_PUBLIC_APP_URL || '')
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('PAYOS_RETURN_URL_INVALID')
  }
  return {
    returnUrl: `${origin.origin}/admin/tuition/reminders`,
    cancelUrl: `${origin.origin}/admin/tuition/reminders?payos=cancel`,
  }
}

export async function openTuitionPayosCheckout(input: {
  orderCode: number
  amount: number
  description: string
}, env: NodeJS.ProcessEnv = process.env) {
  const gaps = payosConfigurationGaps(env)
  if (gaps.length) return { error: `Chờ tạo thanh toán. Thiếu ${gaps.join(', ')}.` }
  try {
    const checkout = await createPayosPaymentLink({ ...input, ...payosTuitionReturnUrls(env) }, env)
    if (checkout.amount !== input.amount || checkout.orderCode !== input.orderCode) return { error: 'payOS trả về số tiền không khớp hóa đơn.' }
    return { checkout }
  } catch (error) {
    return { error: payosCheckoutError(error) }
  }
}
