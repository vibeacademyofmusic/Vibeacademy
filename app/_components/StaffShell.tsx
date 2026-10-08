import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { logout } from '@/app/login/actions'
import { requestClaims, requestClient, requestRole } from '@/lib/auth/request'

const links = [
  { href: '/operations/teacher', label: 'Trang chủ', teacher: true },
  { href: '/my-attendance', label: 'Chấm công' },
  { href: '/my-expenses', label: 'Công tác phí' },
  { href: '/my-payroll', label: 'Bảng lương' },
  { href: '/operations', label: 'Học viên & lớp', teacher: true },
  { href: '/notifications', label: 'Thông báo' },
]

export default async function StaffShell({ children }: { children: ReactNode }) {
  const { data, error } = await requestClaims()
  if (error || !data?.claims) redirect('/login')
  const [profile, teacher] = await Promise.all([
    requestClient().then(db => db.from('profiles').select('full_name').eq('id', data.claims.sub).single()),
    requestRole('TEACHER'),
  ])
  const isTeacher = !teacher.error && teacher.data === true
  return <div className="min-h-screen bg-gray-50 text-gray-900">
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-8">
        <Link prefetch={false} href={isTeacher ? '/operations/teacher' : '/my-attendance'}><img src="/vibe-logo.png" alt="VIBE Academy" width={96} height={48} className="h-12 w-24 object-contain" /></Link>
        <nav aria-label="Điều hướng" className="flex flex-1 flex-wrap gap-1 text-sm font-medium">
          {links.filter(link => !link.teacher || isTeacher).map(link => <Link key={link.href} prefetch={false} href={link.href} className="rounded-lg px-3 py-2 !text-gray-700 !no-underline hover:bg-gray-100">{link.label}</Link>)}
        </nav>
        <div className="flex items-center gap-3">
          <span className="max-w-[12rem] truncate text-sm text-gray-600">{profile.data?.full_name ?? 'Tài khoản'}</span>
          <form action={logout}><button className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Đăng xuất</button></form>
        </div>
      </div>
    </header>
    {children}
  </div>
}
