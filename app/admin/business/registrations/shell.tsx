import Link from 'next/link'
import type { ReactNode } from 'react'
import styles from './workspace.module.css'
import { WorkspaceTabs } from '../../_components/WorkspaceTabs'

const tabs = [
  { id: 'counter', href: '/admin/business/registrations/new', label: 'Đăng ký tại quầy' },
  { id: 'crm', href: '/admin/business/registrations?workspace=crm', label: 'CRM' },
  { id: 'list', href: '/admin/business/registrations', label: 'Danh sách đăng ký' },
] as const

export function RecruitmentShell({
  title,
  description,
  current,
  crumb,
  children,
}: {
  title: string
  description?: string
  current?: 'counter' | 'crm' | 'list'
  crumb?: string
  children: ReactNode
}) {
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div>
          <nav className={styles.crumbs} aria-label="Đường dẫn">
            <Link href="/admin/business">Kinh doanh</Link>
            <span aria-hidden="true">/</span>
            {crumb ? <Link href="/admin/business/registrations">CRM & Tuyển sinh</Link> : <span>CRM & Tuyển sinh</span>}
            {crumb && <><span aria-hidden="true">/</span><span>{crumb}</span></>}
          </nav>
          <p className={styles.eyebrow}>Kinh doanh</p>
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.sub}>{description}</p>}
        </div>
        <div className={styles.actions}>
          {current !== 'counter' && <Link className={styles.buttonPrimary} href="/admin/business/registrations/new">Đăng ký tại quầy</Link>}
          <WorkspaceTabs label="CRM và tuyển sinh" tabs={tabs.map(tab => ({ href: tab.href, label: tab.label, active: tab.id === current }))} />
        </div>
      </header>
      {children}
    </section>
  )
}

export function ProgressSteps({ labels, currentIndex }: { labels: string[]; currentIndex: number }) {
  return (
    <ol className={styles.steps} aria-label="Tiến trình đăng ký">
      {labels.map((label, index) => {
        const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'upcoming'
        return (
          <li key={label} className={styles.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <small>{state === 'done' ? 'Đã qua' : state === 'current' ? 'Hiện tại' : 'Tiếp theo'} · {index + 1}</small>
            <strong>{label}</strong>
          </li>
        )
      })}
    </ol>
  )
}
