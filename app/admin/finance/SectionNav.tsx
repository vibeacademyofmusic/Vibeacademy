'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { activeNavigationHref, activeNavigationParent, navigationGroups, type ShellMode } from '../navigation'

const group = navigationGroups.flatMap(group => group.items).find(item => item.href === '/admin/finance/invoices')!
export function TuitionPaymentNav({ mode = 'full' }: { mode?: ShellMode }) {
  const pathname = usePathname() || ''
  if (activeNavigationParent(pathname) !== group.href) return null
  const active = activeNavigationHref(pathname)
  const items = mode === 'tuition' ? group.children!.filter(item => item.href === '/admin/tuition/reminders') : group.children!
  return <section className="mb-6 min-w-0" aria-label={group.name}>
    <h2 className="mb-2 text-lg font-bold text-[var(--vibe-navy)]">{group.name}</h2>
    <nav className="vibe-tabs" style={{ flexWrap: 'wrap', rowGap: 0 }} aria-label="Các mục Học phí & Thanh toán">
      {items.map(item => <Link key={item.href} href={item.href} prefetch={false}
        aria-current={active === item.href ? 'page' : undefined}
        className={active === item.href ? 'border-b-[3px] border-[var(--vibe-gold)] font-bold text-[var(--vibe-navy)]' : 'text-[var(--vibe-muted)]'}>{item.name}</Link>)}
    </nav>
  </section>
}

export function OtherFinanceNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  return activeNavigationParent(pathname) === group.href ? null : children
}
