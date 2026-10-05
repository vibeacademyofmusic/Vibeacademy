const businessZone = 'Asia/Ho_Chi_Minh'

export function businessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: businessZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function shiftBusinessDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
