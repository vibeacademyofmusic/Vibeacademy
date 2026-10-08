import Link from 'next/link'
import type { ReactNode } from 'react'

import { AppPage, InlineNotice, OpsTabs, PageHeader } from '@/app/admin/_components/vibe'

export function BusinessWorkspace({
  title,
  description,
  section,
  tabLabel,
  tabs,
  denied = false,
  children,
}: {
  title: string
  description?: string
  section: string
  tabLabel?: string
  tabs: { href: string; label: string; active: boolean }[]
  denied?: boolean
  children?: ReactNode
}) {
  return (
    <AppPage>
      <div className="vibe-context">
        <Link href="/admin/business" prefetch={false}>Kinh doanh</Link>
        <span>/</span>
        <span>{section}</span>
        {tabLabel ? <><span>/</span><span>{tabLabel}</span></> : null}
      </div>
      <PageHeader title={title} description={description} />
      {tabs.length > 0 ? <OpsTabs ariaLabel={title} tabs={tabs} /> : null}
      {denied ? <InlineNotice tone="error">Bạn không có quyền xem mục này.</InlineNotice> : children}
    </AppPage>
  )
}
