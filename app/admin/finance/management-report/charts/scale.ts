import { cents, type Amount } from '../../../_lib/money'

const ZERO = BigInt(0)
const SCALE = BigInt(100000)

export function plotCents(value: Amount): bigint | null {
  if (value === null || value === undefined) return null
  return cents(value)
}

export function axisRatio(value: bigint, low: bigint, high: bigint) {
  if (high === low) return 0.5
  const span = high - low
  return Number((value - low) * SCALE / span) / 100000
}

export function bounds(values: Array<bigint | null>) {
  const present = values.filter((value): value is bigint => value !== null)
  if (!present.length) return { low: ZERO, high: ZERO }
  let low = present[0]
  let high = present[0]
  for (const value of present) {
    if (value < low) low = value
    if (value > high) high = value
  }
  if (low > ZERO) low = ZERO
  if (high < ZERO) high = ZERO
  return { low, high }
}
