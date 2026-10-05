import Link from 'next/link'
import type { ReactNode } from 'react'

export type OpsOption = { id: string; name: string }

export type OpsFilterField = {
  name: string
  label: string
  type?: 'text' | 'search' | 'date' | 'month' | 'select'
  value?: string
  placeholder?: string
  options?: OpsOption[]
  allLabel?: string
}

/** Shared GET filter form for Student Operations pages. Server-side filters via URL. */
export function OperationsFilterBar({
  action,
  fields,
  hidden = {},
  submitLabel = 'Lọc',
  resetHref,
}: {
  action: string
  fields: OpsFilterField[]
  hidden?: Record<string, string | undefined>
  submitLabel?: string
  resetHref?: string
}) {
  return (
    <form className="vibe-filter" action={action} method="get">
      {Object.entries(hidden).map(([name, value]) => value ? <input key={name} type="hidden" name={name} value={value} /> : null)}
      {fields.map(field => {
        if (field.type === 'select') {
          return (
            <label key={field.name} className="vibe-field">
              <span>{field.label}</span>
              <select name={field.name} defaultValue={field.value ?? ''}>
                <option value="">{field.allLabel ?? 'Tất cả'}</option>
                {(field.options ?? []).map(option => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>
            </label>
          )
        }
        return (
          <label key={field.name} className="vibe-field">
            <span>{field.label}</span>
            <input
              name={field.name}
              type={field.type === 'search' ? 'search' : field.type ?? 'text'}
              defaultValue={field.value ?? ''}
              placeholder={field.placeholder}
            />
          </label>
        )
      })}
      <button className="vibe-button vibe-button-primary" type="submit">{submitLabel}</button>
      {resetHref && <Link prefetch={false} href={resetHref} className="vibe-button">Xóa lọc</Link>}
    </form>
  )
}

export function OpsTabs({
  ariaLabel,
  tabs,
}: {
  ariaLabel: string
  tabs: { href: string; label: string; active: boolean }[]
}) {
  return (
    <nav className="vibe-tabs" aria-label={ariaLabel}>
      {tabs.map(tab => (
        <Link key={tab.href} prefetch={false} href={tab.href} aria-selected={tab.active || undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

export function OpsMetricLink({
  href,
  title,
  value,
  note,
}: {
  href: string
  title: string
  value: ReactNode
  note?: string
}) {
  return (
    <Link prefetch={false} href={href} className="block min-w-0">
      <section className="vibe-card vibe-metric">
        <p>{title}</p>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </section>
    </Link>
  )
}

export function OpsStatusBadge({
  status,
  labels,
}: {
  status: string
  labels: Record<string, string>
}) {
  return <span className="vibe-badge" data-tone={opsStatusTone(status)}>{labels[status] ?? status}</span>
}

export function opsStatusTone(status: string): 'neutral' | 'warning' | 'error' | 'success' | 'info' {
  switch (status) {
    case 'DRAFT':
    case 'NORMAL':
    case 'NOT_STARTED':
    case 'INACTIVE':
      return 'neutral'
    case 'READY_FOR_REVIEW':
    case 'IN_REVIEW':
    case 'IN_PROGRESS':
    case 'PUBLISHED':
      return 'info'
    case 'NEEDS_REVIEW':
    case 'NEEDS_ATTENTION':
    case 'OVERDUE':
    case 'PAUSED':
    case 'CANH_BAO':
      return 'warning'
    case 'APPROVED':
    case 'COMPLETED':
    case 'RESOLVED':
    case 'ACTIVE':
    case 'TRONG_HAN':
      return 'success'
    case 'CANCELLED':
    case 'REJECTED':
    case 'FAILED':
    case 'LOW_RATING':
    case 'QUA_HAN':
      return 'error'
    default:
      return 'neutral'
  }
}

export function buildQuery(base: Record<string, string | undefined>, patch: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams()
  const next = { ...base, ...patch }
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value)
  }
  return params.toString()
}
