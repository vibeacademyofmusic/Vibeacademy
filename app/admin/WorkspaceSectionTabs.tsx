'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { WorkspaceTabs } from './_components/WorkspaceTabs'
import { activeWorkspaceTab, workspaceTabHref, workspaceSection, workspaceTabsForAccess, type ShellMode } from './navigation'

export default function WorkspaceSectionTabs({ mode }: { mode: ShellMode }) {
  const pathname = usePathname() || ''
  const search = useSearchParams()
  const tabs = workspaceTabsForAccess(pathname, mode)
  if (!tabs.length) return null
  const active = activeWorkspaceTab(pathname, search.get('view'), search.get('tab'))
  return <div className="mb-6 min-w-0 space-y-3 print:hidden">
    <WorkspaceTabs scroll label={workspaceSection(pathname) === 'training' ? 'Đào tạo' : 'Hệ thống'}
      tabs={tabs.map(tab => ({ href: workspaceTabHref(pathname, search, tab.href), label: tab.name, active: ('activeHref' in tab ? tab.activeHref : tab.href) === active }))} />
  </div>
}
