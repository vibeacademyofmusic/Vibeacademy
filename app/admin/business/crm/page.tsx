import { redirect } from 'next/navigation'
export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const incoming = await searchParams
  const params = new URLSearchParams()
  for (const [key,value] of Object.entries(incoming)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key,item))
    else if (value !== undefined) params.append(key,value)
  }
  params.set('workspace','crm')
  return redirect(`/admin/business/registrations?${params}`)
}
