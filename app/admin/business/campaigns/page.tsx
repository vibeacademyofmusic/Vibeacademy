import { redirect } from 'next/navigation'

import { legacyMarketingRedirect } from '../workspaces'

export default async function CampaignsRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyMarketingRedirect('campaigns', await searchParams))
}
