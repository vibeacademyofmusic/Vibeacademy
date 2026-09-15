import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
// Representative rollout keeps the legacy admin gate: new role permissions alone do not open admin actions.
export async function requireAdminPermission(permission: string, branch: string|null = null) {
 const db=await createClient()
 const auth=await db.auth.getClaims()
 if(auth.error||!auth.data?.claims)redirect('/login')
 const role=await db.rpc('has_role',{role_code:'SUPER_ADMIN'})
 if(role.error||role.data!==true)redirect('/login?error=Unauthorized')
 const allowed=await db.rpc('has_permission',{p_permission:permission,p_branch:branch})
 if(allowed.error||allowed.data!==true)redirect('/login?error=Unauthorized')
 return db
}
