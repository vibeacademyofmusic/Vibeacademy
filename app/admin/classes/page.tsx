import { redirect } from 'next/navigation'

type Props = {
  searchParams: Promise<Record<string, string | undefined>>
}

const tabForView: Record<string, string> = {
  schedule: 'schedule',
  attendance: 'attendance',
  rooms: 'teaching-shifts',
}

export default async function ClassesPage({ searchParams }: Props) {
  const params = await searchParams
  if (params.view === 'rooms') {
    const roomsQuery = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== 'view' && value) as [string, string][])
    redirect(`/admin/rooms${roomsQuery.size ? `?${roomsQuery}` : ''}`)
  }
  const query = new URLSearchParams({ tab: tabForView[params.view ?? ''] ?? 'teaching-shifts' })
  for (const [key, value] of Object.entries(params)) {
    if (value && (key !== 'view' || value === 'overview')) query.set(key, value)
  }
  redirect(`/admin/students?${query.toString()}`)
}
