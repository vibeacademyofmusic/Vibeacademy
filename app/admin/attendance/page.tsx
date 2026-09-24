import { redirect } from 'next/navigation'

type Props = { searchParams: Promise<Record<string, string | undefined>> }

export default async function AttendanceListRedirect({ searchParams }: Props) {
  const params = await searchParams
  const query = new URLSearchParams()
  query.set('tab', 'attendance')
  if (params.branch) query.set('branch', params.branch)
  if (params.date) query.set('date', params.date)
  if (params.class) query.set('class', params.class)
  if (params.error) query.set('error', params.error)
  if (params.success) query.set('success', params.success)
  redirect(`/admin/students?${query}`)
}
