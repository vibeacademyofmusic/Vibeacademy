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
  const query = new URLSearchParams({ tab: tabForView[params.view ?? ''] ?? 'teaching-shifts' })
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== 'view') query.set(key, value)
  }
  redirect(`/admin/students?${query.toString()}`)
}
