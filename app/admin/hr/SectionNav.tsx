'use client'

import { WorkspaceTabs } from '../_components/WorkspaceTabs'
import { usePathname } from 'next/navigation'
import { activeNavigationHref, activeNavigationParent, navigationGroups } from '../navigation'

export function HrSectionNav() {
  const pathname = usePathname() || ''
  const parentHref = activeNavigationParent(pathname)
  const leaf = activeNavigationHref(pathname)
  const section = navigationGroups
    .find(group => group.name === 'HR')
    ?.items.find(item => item.href === parentHref && item.children?.length)
  if (!section?.children) return null
  return (
    <div className="mb-6"><WorkspaceTabs label={section.name} tabs={section.children.map(child => ({
      href: child.href, label: child.name, active: leaf === child.href,
    }))} /></div>
  )
}
