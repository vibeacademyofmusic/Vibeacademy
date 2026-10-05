// "Trên 18 tuổi" means the 18th birthday in Asia/Ho_Chi_Minh has already passed.
// The birthday itself is exactly 18, not over 18. This is not "từ đủ 18".
export const ADDRESS_LIMIT = 300

export function vietnamToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function collapseWhitespace(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function homeAddress(value: string) {
  const collapsed = collapseWhitespace(value)
  if (!collapsed || collapsed.length > ADDRESS_LIMIT) return null
  return collapsed
}

export function addCalendarYears(iso: string, years: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const last = new Date(Date.UTC(year + years, month, 0)).getUTCDate()
  const date = new Date(Date.UTC(year + years, month - 1, Math.min(day, last)))
  return date.toISOString().slice(0, 10)
}

export function isOver18(birth: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false
  return addCalendarYears(birth, 18) < today
}

export function normalizeVnPhone(value: string) {
  const trimmed = value.trim()
  if (!trimmed || /[A-Za-zÀ-ỹ]/.test(trimmed) || !/^\+?[0-9 () .-]+$/.test(trimmed)) return null
  const digits = trimmed.replace(/\D/g, '')
  if (/^84\d{9}$/.test(digits)) return digits
  if (/^0\d{9}$/.test(digits)) return `84${digits.slice(1)}`
  return null
}
