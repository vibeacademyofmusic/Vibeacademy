import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export async function requireIntegrationAdmin() {
  const db = await createClient()
  const { data, error } = await db.rpc('has_role', { role_code: 'SUPER_ADMIN' })
  if (error || data !== true) {
    redirect('/login?error=' + encodeURIComponent('Bạn không có quyền truy cập'))
  }
  return db
}
