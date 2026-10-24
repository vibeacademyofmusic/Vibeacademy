'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import styles from './workspace-tabs.module.css'

export function WorkspaceTabs({ label, tabs, scroll = false }: {
  label: string
  scroll?: boolean
  tabs: { href: string; label: string; active: boolean }[]
}) {
  const nav = useRef<HTMLElement>(null)
  const activeHref = tabs.find(tab => tab.active)?.href
  useEffect(() => {
    if (!scroll || !nav.current) return
    const container = nav.current
    const active = container.querySelector<HTMLElement>('[aria-current="page"]')
    if (active && (active.offsetLeft < container.scrollLeft || active.offsetLeft + active.offsetWidth > container.scrollLeft + container.clientWidth)) {
      container.scrollTo({ left: Math.max(0, active.offsetLeft - 8) })
    }
  }, [activeHref, scroll])
  return <nav ref={nav} className={`${styles.tabs} ${scroll ? styles.scroll : ''}`} aria-label={label}>
    {tabs.map(tab => <Link key={tab.href} href={tab.href} prefetch={false}
      className={styles.tab} aria-current={tab.active ? 'page' : undefined}>
      {tab.label}
    </Link>)}
  </nav>
}
