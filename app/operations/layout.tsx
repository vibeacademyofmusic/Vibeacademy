import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { logout } from '@/app/login/actions'
import { requestClaims, requestClient, requestRole } from '@/lib/auth/request'

const links = [
  { href: '/operations/teacher', label: 'Không gian giáo viên', teacher: true },
  { href: '/operations', label: 'Học viên & lớp học' },
  { href: '/my-payroll', label: 'Bảng lương', teacher: true },
  { href: '/notifications', label: 'Thông báo' },
]

export default async function OperationsLayout({ children }: { children: ReactNode }) {
  const { data, error } = await requestClaims()
  if (error || !data?.claims) redirect('/login')
  const [profile, teacher] = await Promise.all([
    requestClient().then(db => db.from('profiles').select('full_name').eq('id', data.claims.sub).single()),
    requestRole('TEACHER'),
  ])
  const isTeacher = !teacher.error && teacher.data === true
  return <div className="min-h-screen bg-gray-50 text-gray-900">
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
        <img src="/vibe-logo.png" alt="VIBE Academy" width={96} height={48} className="h-12 w-24 object-contain" />
        <nav aria-label="Điều hướng" className="flex flex-1 flex-wrap gap-1 text-sm font-medium">
          {links.filter(link => !link.teacher || isTeacher).map(link => <Link key={link.href} prefetch={false} href={link.href} className="rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100">{link.label}</Link>)}
        </nav>
        <div className="flex items-center gap-3">
          <span className="max-w-[12rem] truncate text-sm text-gray-600">{profile.data?.full_name ?? 'Tài khoản'}</span>
          <form action={logout}><button className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Đăng xuất</button></form>
        </div>
      </div>
    </header>
    <div className="[&_a]:text-blue-700 [&_a:hover]:underline [&_article]:rounded-xl [&_article]:border-gray-200 [&_article]:bg-white [&_article]:shadow-sm [&_h1]:text-gray-900 [&_input]:bg-white [&_main_div.rounded]:bg-white [&_nav_a]:no-underline [&_section_div.rounded]:border-gray-200">{children}</div>
  </div>
}
