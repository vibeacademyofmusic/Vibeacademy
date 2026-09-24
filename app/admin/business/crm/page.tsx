import { redirect } from 'next/navigation'

export default async function LegacyCrmPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    if (value && key !== 'tab') params.set(key, value)
  }
  const query = params.toString()
  redirect(`/admin/business/registrations?tab=crm${query ? `&${query}` : ''}`)
}
