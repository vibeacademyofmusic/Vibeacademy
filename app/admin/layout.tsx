import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { logout } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/server'

const navigation = [
  { name: "Bảng lương", href: "/admin/payroll" },
  { name: "Phản hồi buổi học", href: "/admin/feedback" },
  { name: "Báo cáo học tập", href: "/admin/reports/learning" },
  { name: "Bảng điều khiển", href: '/admin' },
  { name: "Chi nhánh", href: '/admin/branches' },
  { name: "Học viên", href: '/admin/students' },
  { name: "Giáo viên", href: '/admin/teachers' },
  { name: "Đào tạo", href: '/admin/academic' },
  { name: "Khóa học", href: '/admin/courses' },
  { name: "Lớp học", href: '/admin/classes' },
  { name: "Phòng học", href: '/admin/rooms' },
  { name: "Lịch học", href: '/admin/schedule' },
  { name: "Điểm danh", href: '/admin/attendance' },
  { name: "Học phí", href: '/admin/tuition' },
  { name: "Tài chính", href: '/admin/finance' },
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
    redirect('/login?error=B%E1%BA%A1n%20kh%C3%B4ng%20c%C3%B3%20quy%E1%BB%81n%20truy%20c%E1%BA%ADp')
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
          <Link href="/admin" prefetch={false}>
              <h1 className="text-xl font-bold text-gray-900">
                Vibe Academy
              </h1>
            </Link>

            <p className="mt-1 text-xs text-gray-500">
              Hệ thống quản lý
            </p>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
            {navigation.map((item) => (
              <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-950"
            >
              {item.name}
            </Link>
            ))}
          </nav>

          <div className="border-t border-gray-200 p-4">
            <div className="mb-4 px-2">
              <p className="text-xs text-gray-500">Đăng nhập với tài khoản</p>

              <p className="mt-1 truncate text-sm font-medium text-gray-900">
                {profile?.full_name ?? "Quản trị viên"}
              </p>

              <p className="mt-1 text-xs font-medium text-gray-400">
                Quản trị viên cấp cao
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

        <nav
          aria-label="Điều hướng quản trị"
          className="overflow-x-auto border-b border-gray-200 bg-white px-4 py-3 lg:hidden"
        >
          <div className="flex min-w-max gap-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-950"
              >
                {item.name}
              </Link>
            ))}
          </div>
        </nav>

        <main className="px-6 py-8 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
