import type { JWK } from '@supabase/auth-js'

const ttlMs = 10 * 60 * 1000
let cached: { keys: JWK[]; at: number } | null = null

/** Public signing keys for this isolate. A warm function reuses them instead of calling Auth on every page. */
export async function signingKeys(): Promise<{ keys: JWK[] } | undefined> {
  const now = Date.now()
  if (cached && now - cached.at < ttlMs) return { keys: cached.keys }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return undefined
  try {
    const response = await fetch(`${base}/auth/v1/.well-known/jwks.json`)
    if (!response.ok) return cached ? { keys: cached.keys } : undefined
    const body = await response.json() as { keys?: JWK[] }
    if (!Array.isArray(body.keys) || body.keys.length === 0) return cached ? { keys: cached.keys } : undefined
    cached = { keys: body.keys, at: now }
    return { keys: cached.keys }
  } catch {
    return cached ? { keys: cached.keys } : undefined
  }
}
