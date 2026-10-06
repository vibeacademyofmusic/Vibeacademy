import { redirect } from 'next/navigation'

import { legacyAfterSalesRedirect } from '../workspaces'

export default async function InstrumentCustomersRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyAfterSalesRedirect('instruments', await searchParams))
}
