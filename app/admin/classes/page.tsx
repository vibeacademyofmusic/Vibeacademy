import { redirect } from 'next/navigation'

type Props = {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function ClassesPage({ searchParams }: Props) {
  const params = await searchParams
  if (params.view === 'rooms') {
    const roomsQuery = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== 'view' && value) as [string, string][])
    redirect(`/admin/rooms${roomsQuery.size ? `?${roomsQuery}` : ''}`)
  }
  if (params.view === 'attendance') {
    const query = new URLSearchParams({ tab: 'attendance' })
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== 'view' && key !== 'tab') query.set(key, value)
    }
    redirect(`/admin/students?${query}`)
  }
  const query = new URLSearchParams({
    tab: 'coordination',
    view: params.view === 'schedule' ? 'week' : 'shifts',
  })
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'view' && key !== 'tab') query.set(key, value)
  }
  redirect(`/admin/students?${query.toString()}`)
}
