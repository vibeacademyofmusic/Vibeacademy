import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Identity for the current Server Component render only.
 * React cache() resets with each Next.js server request. It does not cross
 * proxy.ts, Route Handlers, or a later Server Action, and it is not the
 * shared Data Cache. Proxy session refresh stays in updateSession.
 */
export const requestClient = cache(createClient)

export const requestClaims = cache(async () => {
  const db = await requestClient()
  return db.auth.getClaims()
})

export const requestRole = cache(async (roleCode: string) => {
  const db = await requestClient()
  return db.rpc('has_role', { role_code: roleCode })
})

type RoleClient = {
  rpc: (fn: string, args?: { role_code: string }) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>
}

export async function operationalAdminOn(db: RoleClient) {
  const operational = await db.rpc('operational_admin')
  if (!operational.error) return operational
  return db.rpc('has_role', { role_code: 'SUPER_ADMIN' })
}

export const requestOperationalAdmin = cache(async () => operationalAdminOn(await requestClient()))
