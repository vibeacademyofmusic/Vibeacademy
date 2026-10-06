import { redirect } from 'next/navigation'

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const params = await searchParams
  const next = new URLSearchParams()
  next.set('view', 'courses')
  if (params.error) next.set('error', params.error)
  if (params.success) next.set('success', params.success)
  redirect(`/admin/programs?${next.toString()}`)
}
