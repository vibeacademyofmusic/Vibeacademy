import { redirect } from 'next/navigation'

type Props = { searchParams: Promise<Record<string, string | undefined>> }

export default async function AttendanceListRedirect({ searchParams }: Props) {
  const params = await searchParams
  const query = new URLSearchParams()
  query.set('tab', 'attendance')
  if (params.branch) query.set('branch', params.branch)
  if (params.date) query.set('date', params.date)
  if (params.class) query.set('class', params.class)
  for (const key of ['teacher', 'student', 'q', 'status', 'page']) if (params[key]) query.set(key, params[key]!)
  if (params.error) query.set('error', params.error)
  if (params.success) query.set('success', params.success)
  redirect(`/admin/students?${query}`)
}
