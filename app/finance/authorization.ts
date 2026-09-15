import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function financeContext() {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  const [admin, finance] = await Promise.all([db.rpc('is_global_super_admin'), db.rpc('has_role', {role_code:'FINANCE'})])
  if ((admin.error || admin.data !== true) && (finance.error || finance.data !== true)) redirect('/login?error=Unauthorized')
  return { db, userId: String(auth.data.claims.sub), isSuperAdmin: !admin.error && admin.data === true }
}
