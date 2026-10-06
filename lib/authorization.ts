import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
// Operational administrators pass operational_admin. SUPER_ADMIN remains the unrestricted owner.
// Financial report permission is never opened here.
export async function requireAdminPermission(permission: string, branch: string|null = null) {
 const db=await createClient()
 const auth=await db.auth.getClaims()
 if(auth.error||!auth.data?.claims)redirect('/login')
 if(permission==='finance.report.view')redirect('/login?error=Unauthorized')
 const operational=await db.rpc('operational_admin')
 const legacy=operational.error?await db.rpc('has_role',{role_code:'SUPER_ADMIN'}):null
 if(operational.data!==true&&legacy?.data!==true)redirect('/login?error=Unauthorized')
 const allowed=await db.rpc('has_permission',{p_permission:permission,p_branch:branch})
 if(allowed.error||allowed.data!==true)redirect('/login?error=Unauthorized')
 return db
}

// Staff pilot only; the existing /admin entry and sensitive actions remain SUPER_ADMIN-only.
export async function requireOperationsStaff() {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  const roles = await Promise.all(['SUPER_ADMIN', 'BRANCH_ADMIN', 'TEACHER'].map(role_code => db.rpc('has_role', { role_code })))
  if (!roles.some(role => !role.error && role.data === true)) redirect('/login?error=Unauthorized')
  return db
}
