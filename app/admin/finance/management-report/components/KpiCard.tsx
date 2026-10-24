import Link from 'next/link'
import type { ReactNode } from 'react'
import type { MetricValue } from '../model'
import { displayMetricMoney, statusLabel, statusTone, unresolvedNote, type StatusTone } from '../presentation'
import styles from '../financial-control-tower.module.css'

export function StatusChip({ status, integrity = false }: { status: string; integrity?: boolean }) {
  return <span className={styles.chip} data-tone={statusTone(status, integrity)}>{statusLabel(status)}</span>
}

export function KpiCard({
  title,
  metric,
  currency,
  href,
  change,
  extra,
}: {
  title: string
  metric: MetricValue
  currency: string
  href?: string
  change?: string | null
  extra?: ReactNode
}) {
  const unimplemented = metric.status === 'NOT_IMPLEMENTED'
  const note = unimplemented ? 'Chưa tích hợp nguồn dữ liệu.' : unresolvedNote(metric)
  const inner = <>
    <p className={styles.kpiTitle}>{title}</p>
    <p className={styles.kpiValue}>{unimplemented ? '—' : displayMetricMoney(metric, currency)}</p>
    <div className={styles.kpiMeta}>
      {metric.status === 'PARTIAL' ? <StatusChip status="PARTIAL" /> : null}
      {unimplemented ? <StatusChip status="NOT_IMPLEMENTED" /> : null}
    </div>
    {note ? <p className={styles.kpiNote}>{note}</p> : null}
    {change ? <p className={styles.change}>So với tháng trước: {change}</p> : null}
    {extra}
  </>
  if (!href) return <article className={styles.kpi}>{inner}</article>
  return <Link className={styles.kpi} href={href} prefetch={false}>{inner}</Link>
}
