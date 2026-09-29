import { businessDate } from '@/app/admin/_lib/business-date'

export const attendanceStates: Record<string, string> = {
  UNMARKED: 'Chưa điểm danh', IN_PROGRESS: 'Đang điểm danh', COMPLETE: 'Đã hoàn tất', ABSENT: 'Có học viên vắng',
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function attendanceFilters(params: Record<string, string | undefined>) {
  const date = params.date ?? ''
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null
  return {
    date: parsed && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : businessDate(),
    branch: uuid.test(params.branch ?? '') ? params.branch! : '',
    class: uuid.test(params.class ?? '') ? params.class! : '',
    teacher: uuid.test(params.teacher ?? '') ? params.teacher! : '',
    student: (params.student ?? params.q ?? '').trim().slice(0, 150),
    status: Object.hasOwn(attendanceStates, params.status ?? '') ? params.status! : '',
    page: Math.max(1, Math.min(4001, Number.parseInt(params.page ?? '1', 10) || 1)),
  }
}
export function attendanceListHref(params: Record<string, string | undefined>) {
  const filters = attendanceFilters(params)
  const query = new URLSearchParams({ tab: 'attendance' })
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, String(value))
  return `/admin/students?${query}`
}
export function attendanceReturn(value: unknown, date?: string) {
  if (typeof value === 'string' && value.startsWith('/admin/students?')) {
    const query = new URLSearchParams(value.slice(value.indexOf('?') + 1))
    if (query.get('tab') === 'attendance') return attendanceListHref(Object.fromEntries(query))
  }
  return attendanceListHref({ date })
}
