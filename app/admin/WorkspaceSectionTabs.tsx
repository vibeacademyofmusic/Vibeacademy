'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  activeStudentTab,
  activeWorkspaceTab,
  studentTabs,
  workspaceSection,
  workspaceTabsForAccess,
  type ShellMode,
} from './navigation'

function TabLinks({ label, tabs, active }: {
  label: string
  tabs: { name: string; href: string }[]
  active: string | null
}) {
  return (
    <nav aria-label={label} className="min-w-0 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 print:hidden">
      <div className="flex min-w-max gap-1">
        {tabs.map(tab => (
          <Link key={tab.href} href={tab.href} prefetch={false}
            aria-current={active === tab.href ? 'page' : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 ${active === tab.href ? 'vibe-nav-active' : 'text-gray-700 hover:bg-gray-100'}`}>
            {tab.name}
          </Link>
        ))}
      </div>
    </nav>
  )
}

export default function WorkspaceSectionTabs({ mode }: { mode: ShellMode }) {
  const pathname = usePathname()
  const tabs = workspaceTabsForAccess(pathname, mode)
  if (!tabs.length) return null

  const section = workspaceSection(pathname)
  const studentTab = activeStudentTab(pathname)
  return (
    <div className="mb-6 min-w-0 space-y-3 print:hidden">
      <TabLinks label={section === 'training' ? 'Đào tạo' : 'Hệ thống'} tabs={tabs} active={activeWorkspaceTab(pathname)} />
      {mode === 'full' && studentTab && (
        <TabLinks label="Học viên và phòng học" tabs={studentTabs} active={studentTab} />
      )}
    </div>
  )
}
