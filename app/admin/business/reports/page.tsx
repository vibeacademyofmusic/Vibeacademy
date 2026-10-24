import { redirect } from 'next/navigation'

import { legacyMarketingRedirect } from '../workspaces'

export default async function ReportsRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyMarketingRedirect('reports', await searchParams))
}
