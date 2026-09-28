export const marketingPath = '/admin/business/marketing'
export const afterSalesPath = '/admin/business/after-sales'

export type MarketingTab = 'reports' | 'campaigns'
export type AfterSalesTab = 'returning' | 'instruments'

export type BusinessAccessFlags = {
  reports: boolean
  campaigns: boolean
  returning: boolean
  instruments: boolean
}

const reportKeys = ['from', 'to', 'branch', 'campaign', 'source', 'owner', 'program'] as const
const campaignKeys = ['branch', 'platform', 'status', 'error', 'success'] as const
const returningKeys = ['branch', 'reason', 'status', 'error', 'success'] as const
const instrumentKeys = ['view', 'filter', 'error', 'success'] as const

function textParam(value: string | string[] | undefined) {
  return typeof value === 'string' && value ? value : undefined
}

function pick(params: Record<string, string | string[] | undefined>, keys: readonly string[]) {
  const query: Record<string, string | undefined> = {}
  for (const key of keys) query[key] = textParam(params[key])
  return query
}

export function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
  const text = params.toString()
  return text ? `${path}?${text}` : path
}

export function marketingHref(tab: MarketingTab, query: Record<string, string | undefined> = {}) {
  return withQuery(marketingPath, { tab, ...query })
}

export function afterSalesHref(tab: AfterSalesTab, query: Record<string, string | undefined> = {}) {
  return withQuery(afterSalesPath, { tab, ...query })
}

export function defaultMarketingTab(access: BusinessAccessFlags): MarketingTab | null {
  if (access.reports) return 'reports'
  if (access.campaigns) return 'campaigns'
  return null
}

export function defaultAfterSalesTab(access: BusinessAccessFlags): AfterSalesTab | null {
  if (access.returning) return 'returning'
  if (access.instruments) return 'instruments'
  return null
}

export function resolveMarketingTab(requested: string | undefined, access: BusinessAccessFlags) {
  if (requested === 'campaigns') return { tab: access.campaigns ? 'campaigns' as const : null, denied: !access.campaigns }
  if (requested === 'reports') return { tab: access.reports ? 'reports' as const : null, denied: !access.reports }
  const tab = defaultMarketingTab(access)
  return { tab, denied: tab == null }
}

export function resolveAfterSalesTab(requested: string | undefined, access: BusinessAccessFlags) {
  if (requested === 'instruments') return { tab: access.instruments ? 'instruments' as const : null, denied: !access.instruments }
  if (requested === 'returning') return { tab: access.returning ? 'returning' as const : null, denied: !access.returning }
  const tab = defaultAfterSalesTab(access)
  return { tab, denied: tab == null }
}

export function legacyMarketingRedirect(source: 'reports' | 'campaigns', params: Record<string, string | string[] | undefined>) {
  return source === 'reports'
    ? marketingHref('reports', pick(params, reportKeys))
    : marketingHref('campaigns', pick(params, campaignKeys))
}

export function legacyAfterSalesRedirect(source: 'returning' | 'instruments', params: Record<string, string | string[] | undefined>) {
  if (source === 'returning') return afterSalesHref('returning', pick(params, returningKeys))
  const query = pick(params, instrumentKeys)
  if (query.view && query.view !== 'warranty' && query.view !== 'care') delete query.view
  return afterSalesHref('instruments', query)
}

export function hiddenBusinessHrefs(access: BusinessAccessFlags) {
  const hidden: string[] = []
  if (!access.reports && !access.campaigns) hidden.push(marketingPath)
  if (!access.returning && !access.instruments) hidden.push(afterSalesPath)
  return hidden
}

export function isMarketingPath(pathname: string) {
  return pathname === marketingPath || pathname.startsWith(`${marketingPath}/`)
    || pathname === '/admin/business/reports' || pathname.startsWith('/admin/business/reports/')
    || pathname === '/admin/business/campaigns' || pathname.startsWith('/admin/business/campaigns/')
}

export function isAfterSalesPath(pathname: string) {
  return pathname === afterSalesPath || pathname.startsWith(`${afterSalesPath}/`)
    || pathname === '/admin/business/reactivation' || pathname.startsWith('/admin/business/reactivation/')
    || pathname === '/admin/business/instrument-customers' || pathname.startsWith('/admin/business/instrument-customers/')
}
