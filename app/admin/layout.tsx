import Link from 'next/link'
import AdminNavigation from './AdminNavigation'
import HRContext from './_components/vibe/Context'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'

import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'
import { isBusinessShellPath, isStudentOpsPath, type ShellMode } from './navigation'

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

  const pathname = (await headers()).get('x-vibe-pathname')
  let mode: ShellMode = 'full'

  if (roleError || !isSuperAdmin) {
    const [{ data: mayEnter, error: shellError }, { data: mayStudents, error: studentError }] = await Promise.all([
      supabase.rpc('crm_shell_may_enter'),
      supabase.rpc('student_ops_may_enter'),
    ])
    const business = !shellError && mayEnter === true
    const students = !studentError && mayStudents === true
    const allowed = (business && isBusinessShellPath(pathname)) || (students && isStudentOpsPath(pathname))
    if (!allowed) {
      redirect('/login?error=B%E1%BA%A1n%20kh%C3%B4ng%20c%C3%B3%20quy%E1%BB%81n%20truy%20c%E1%BA%ADp')
    }
    mode = business && students ? 'business-students' : business ? 'business' : 'students'
  }

  const userId = claimsData.claims.sub

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  return (
    <div className="vibe-admin min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-gray-200 px-6 py-6">
          <Link href={mode === 'students' ? '/admin/students' : mode === 'full' ? '/admin' : '/admin/business'} prefetch={false}>
              <img src="/vibe-logo.png" alt="VIBE Academy" width={120} height={64} className="h-16 w-32 object-contain"/>
            </Link>

            <p className="mt-1 text-xs text-gray-500">
              Hệ thống quản lý
            </p>
          </div>

          <AdminNavigation mode={mode} />

          <div className="border-t border-gray-200 p-4">
            <div className="mb-4 px-2">
              <p className="text-xs text-gray-500">Đăng nhập với tài khoản</p>

              <p className="mt-1 truncate text-sm font-medium text-gray-900">
                {profile?.full_name ?? "Quản trị viên"}
              </p>

              <p className="mt-1 text-xs font-medium text-gray-400">
                {mode === 'full' ? 'Quản trị viên cấp cao' : mode === 'students' ? 'Học viên' : 'Kinh doanh'}
              </p>
            </div>

            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Đăng xuất
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
                Hệ thống Vibe Academy
              </p>

              <p className="text-xs text-gray-500">
                Quản trị
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-sm text-gray-500 sm:block">
                {profile?.full_name ?? "Quản trị viên"}
              </div>

              <form action={logout} className="lg:hidden">
                <button
                  type="submit"
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Đăng xuất
                </button>
              </form>
            </div>
          </div>
        </header>

        <AdminNavigation mobile mode={mode} />

        <main className="px-6 py-8 lg:px-8">
          <div className="mx-auto max-w-7xl"><HRContext />{children}</div>
        </main>
      </div>
    </div>
  )
}
