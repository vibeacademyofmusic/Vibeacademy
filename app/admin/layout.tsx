import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'

const navigation = [
  { name: 'Dashboard', href: '/admin' },
  { name: 'Branches', href: '/admin/branches' },
  { name: 'Students', href: '/admin/students' },
  { name: 'Teachers', href: '/admin/teachers' },
  { name: 'Academic', href: '/admin/academic' },
  { name: 'Schedule', href: '/admin/schedule' },
  { name: 'Attendance', href: '/admin/attendance' },
  { name: 'Tuition', href: '/admin/tuition' },
  { name: 'E-learning', href: '/admin/lms' },
  { name: 'Exams', href: '/admin/exams' },
  { name: 'Reports', href: '/admin/reports' },
  { name: 'Settings', href: '/admin/settings' },
]

export default async function AdminLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = await createClient()

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()

  if (claimsError || !claimsData?.claims) {
    redirect('/login')
  }

  const { data: isSuperAdmin, error: roleError } = await supabase.rpc(
    'has_role',
    {
      role_code: 'SUPER_ADMIN',
    }
  )

  if (roleError || !isSuperAdmin) {
    redirect('/login?error=Unauthorized')
  }

  const userId = claimsData.claims.sub

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-gray-200 px-6 py-6">
            <Link href="/admin">
              <h1 className="text-xl font-bold text-gray-900">
                Vibe Academy
              </h1>
            </Link>

            <p className="mt-1 text-xs text-gray-500">
              Management System
            </p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-950"
              >
                {item.name}
              </Link>
            ))}
          </nav>

          <div className="border-t border-gray-200 p-4">
            <div className="mb-4 px-2">
              <p className="text-xs text-gray-500">Signed in as</p>

              <p className="mt-1 truncate text-sm font-medium text-gray-900">
                {profile?.full_name ?? 'Administrator'}
              </p>

              <p className="mt-1 text-xs font-medium text-gray-400">
                SUPER_ADMIN
              </p>
            </div>

            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="border-b border-gray-200 bg-white px-6 py-4 lg:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Vibe Academy System
              </p>

              <p className="text-xs text-gray-500">
                Administration
              </p>
            </div>

            <div className="text-sm text-gray-500">
              {profile?.full_name ?? 'Administrator'}
            </div>
          </div>
        </header>

        <main className="px-6 py-8 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}