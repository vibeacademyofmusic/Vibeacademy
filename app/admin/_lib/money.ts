export type Amount =
  | number
  | string
  | null
  | undefined

const ZERO = BigInt(0)
const HUNDRED = BigInt(100)

export function cents(value: Amount): bigint | null {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return null
  }

  if (
    typeof value === 'number' &&
    (
      !Number.isFinite(value) ||
      Math.abs(value) >
        Number.MAX_SAFE_INTEGER / 100
    )
  ) {
    return null
  }

  const text = String(value).trim()

  if (!/^-?\d{1,20}(?:\.\d{1,2})?$/.test(text)) {
    return null
  }

  const negative = text.startsWith('-')

  const [whole, decimal = ''] =
    text.replace(/^-/, '').split('.')

  const result =
    BigInt(whole) * HUNDRED +
    BigInt(decimal.padEnd(2, '0'))

  return negative ? -result : result
}

export function formatMoney(
  value: Amount,
  currency?: string
): string {
  const valueInCents = cents(value)

  if (valueInCents === null) {
    return '—'
  }

  const absolute =
    valueInCents < ZERO
      ? -valueInCents
      : valueInCents

  const fraction = String(
    absolute % HUNDRED
  )
    .padStart(2, '0')
    .replace(/0+$/, '')

  const formatted =
    `${valueInCents < ZERO ? '−' : ''}${
      String(absolute / HUNDRED)
        .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    }${fraction ? ',' + fraction : ''}`

  return (
    formatted +
    (currency ? ` ${currency}` : '')
  )
}