// Only the canonical provider URL bound to this payment link may be opened.
export function tuitionCheckoutUrl(paymentLinkId: unknown, checkoutUrl: unknown): string | null {
  if (typeof paymentLinkId !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(paymentLinkId)) return null
  const expected = `https://pay.payos.vn/web/${paymentLinkId}`
  return checkoutUrl === expected ? expected : null
}
