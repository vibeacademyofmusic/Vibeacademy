import { redirect } from 'next/navigation'

import { legacyAfterSalesRedirect } from '../workspaces'

export default async function ReactivationRedirectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyAfterSalesRedirect('returning', await searchParams))
}
