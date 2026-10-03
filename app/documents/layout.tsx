import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import './print.css'
export const metadata = { title: 'Chứng từ | VIBE Academy' }
export default async function DocumentLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient()
  const auth = await db.auth.getClaims()
  if (auth.error || !auth.data?.claims) redirect('/login')
  return <main className="document mx-auto w-full min-w-0 max-w-4xl space-y-6 bg-white p-4 text-gray-950 sm:p-8">{children}</main>
}
