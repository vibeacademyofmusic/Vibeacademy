'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { WorkspaceTabs } from '../_components/WorkspaceTabs'
import { activeNavigationHref, activeNavigationParent, navigationGroups } from '../navigation'

const group = navigationGroups.flatMap(group => group.items).find(item => item.href === '/admin/finance/invoices')!
export function TuitionPaymentNav() {
  const pathname = usePathname() || ''
  if (activeNavigationParent(pathname) !== group.href) return null
  const active = activeNavigationHref(pathname)
  return <section className="mb-6 min-w-0 print:hidden" aria-label={group.name}>
    <h2 className="mb-2 text-lg font-bold text-[var(--vibe-navy)]">{group.name}</h2>
    <WorkspaceTabs scroll label="Các mục Học phí & Thanh toán"
      tabs={group.children!.map(item => ({ href: item.href, label: item.name, active: active === item.href }))} />
  </section>
}

export function OtherFinanceNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  return activeNavigationParent(pathname) === group.href ? null : children
}
