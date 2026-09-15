'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { activeNavigationHref, navigationGroups } from './navigation'

export default function AdminNavigation({ mobile = false }: { mobile?: boolean }) {
  const active = activeNavigationHref(usePathname())
  const groups = <div className={mobile ? 'grid gap-5 pt-4 sm:grid-cols-2' : 'space-y-5'}>
    {navigationGroups.map(group => <section key={group.name} aria-label={group.name}>
      <h2 className="mb-1 px-3 text-xs font-semibold tracking-wide text-gray-500">{group.name}</h2>
      <ul className="space-y-1">{group.items.map(item => <li key={item.href}>
        <Link href={item.href} prefetch={false} aria-current={active === item.href ? 'page' : undefined}
          className={`block rounded-lg px-3 py-2 text-sm font-medium ${active === item.href ? 'bg-blue-50 text-blue-800' : 'text-gray-700 hover:bg-gray-100'}`}>
          {item.name}
        </Link>
      </li>)}</ul>
    </section>)}
  </div>
  return mobile
    ? <nav aria-label="Điều hướng quản trị mobile" className="border-b border-gray-200 bg-white px-4 py-3 lg:hidden"><details><summary className="cursor-pointer font-medium">Menu quản trị</summary>{groups}</details></nav>
    : <nav aria-label="Điều hướng quản trị" className="flex-1 overflow-y-auto px-3 py-5">{groups}</nav>
}
