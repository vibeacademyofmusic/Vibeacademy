const path = '/admin/tuition/reminders'
const filters = ['state', 'branch', 'plan', 'page', 'reply'] as const
const panels = ['renew', 'zalo', 'history', 'process', 'auto', 'parent'] as const

export function reminderReturnHref(params: Record<string, string | undefined>, includePanel = false) {
  const query = new URLSearchParams()
  for (const key of includePanel ? [...filters, ...panels] : filters) {
    const value = params[key]
    if (value && value.length <= 200) query.set(key, value)
  }
  return path + (query.size ? '?' + query : '')
}

/** Accept only this local route and allowlisted context; never redirect to posted URLs. */
export function reminderActionHref(form: FormData, message: string, tone: 'error' | 'success' = 'error', panel?: { key: string; id: string }) {
  let params: Record<string, string> = {}
  const raw = String(form.get('return_context') ?? '')
  if (raw === path || raw.startsWith(path + '?')) params = Object.fromEntries(new URLSearchParams(raw.slice(path.length + 1)))
  const url = new URL(reminderReturnHref(params, true), 'http://local.invalid')
  url.searchParams.set(tone, message)
  if (panel) url.searchParams.set(panel.key, panel.id)
  return url.pathname + url.search
}
