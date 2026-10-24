'use client'

import Link from 'next/link'
import { useId, useRef, useState, type ReactNode } from 'react'
import styles from './action-dropdown.module.css'

export type DropdownAction = { label: string; href?: string; disabled?: boolean; external?: boolean }

export default function ActionDropdown({ label, tone, actions, children, triggerLabel = 'Thao tác' }: {
  label: string; triggerLabel?: string; tone?: 'paid' | 'pending'; actions: DropdownAction[]; children?: ReactNode
}) {
  const id = useId()
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  function toggle(button: HTMLButtonElement) {
    const panel = popup.current
    if (!panel) return
    const bounds = button.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth - 24)
    panel.style.width = `${width}px`
    panel.style.left = `${Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12))}px`
    panel.style.top = `${Math.max(12, Math.min(bounds.bottom + 6, window.innerHeight - 340))}px`
    panel.togglePopover()
  }
  const close = () => popup.current?.hidePopover()
  return <>
    <button type="button" className={styles.trigger} data-tone={tone} aria-expanded={open} aria-controls={id}
      aria-label={label} onClick={event => toggle(event.currentTarget)}>
      <span>{triggerLabel}</span><span aria-hidden="true">▾</span>
    </button>
    <div id={id} ref={popup} popover="auto" className={styles.popup} aria-label={label}
      onToggle={event => setOpen(event.newState === 'open')}>
      {children && <div className={styles.context}>{children}</div>}
      <div className={styles.actions}>{actions.map(action => action.disabled || !action.href
        ? <button key={action.label} type="button" disabled className={styles.item} title="Chưa mở">{action.label}</button>
        : action.external
          ? <a key={action.label} className={styles.item} href={action.href} onClick={close}>{action.label}</a>
          : <Link key={action.label} className={styles.item} href={action.href} prefetch={false} scroll={false} onClick={close}>{action.label}</Link>)}</div>
    </div>
  </>
}
