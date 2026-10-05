import type { FinancialManagementReport, MetricValue } from '../model'
import { displayMetricMoney } from '../presentation'
import { StatusChip } from './KpiCard'
import styles from '../financial-control-tower.module.css'

function Row({
  label,
  metric,
  currency,
  total = false,
  note,
}: {
  label: string
  metric: MetricValue
  currency: string
  total?: boolean
  note?: string
}) {
  const empty = metric.status === 'NOT_IMPLEMENTED' || metric.value === null || metric.value === undefined
  return (
    <div data-total={total}>
      <span>{label}</span>
      <span className={styles.num}>{empty ? '—' : displayMetricMoney(metric, currency)}</span>
      <span>{empty ? <><StatusChip status={metric.status} /> <span className={styles.muted}>{note ?? 'Chưa tích hợp nguồn dữ liệu.'}</span></> : metric.status === 'PARTIAL' ? <StatusChip status="PARTIAL" /> : null}</span>
    </div>
  )
}

export function PnlTable({ report }: { report: FinancialManagementReport }) {
  const managementUnavailable = report.pnl.management_result.value === null || report.pnl.management_result.status === 'NOT_IMPLEMENTED'
  return (
    <section className={styles.section} aria-labelledby="pnl-heading">
      <h2 id="pnl-heading">Kết quả hoạt động</h2>
      <p>Kết quả hoạt động là tổng hợp từ các nguồn đã tích hợp. Không thay thế kết quả quản trị sau chi phí tài chính.</p>
      <div className={styles.rows}>
        <Row label="Doanh thu" metric={report.pnl.revenue} currency={report.currency} />
        <Row label="Chi phí nhân sự" metric={report.pnl.personnel_expense} currency={report.currency} />
        <Row label="Công tác phí" metric={report.pnl.travel_reimbursement_expense} currency={report.currency} />
        <Row label="Chi phí vận hành" metric={report.pnl.operating_expense} currency={report.currency} />
        <Row label="Chi phí hoạt động khác" metric={report.pnl.other_operating_expense} currency={report.currency} />
        <Row label="Kết quả hoạt động" metric={report.pnl.operating_result} currency={report.currency} total />
        <Row label="Chi phí lãi vay" metric={report.pnl.loan_interest_expense} currency={report.currency} />
        <Row label="Chi phí tài chính khác" metric={report.pnl.other_financial_expense} currency={report.currency} />
        <div data-total="true">
          <span>Kết quả quản trị</span>
          <span className={styles.num}>{managementUnavailable ? 'Chưa đủ dữ liệu' : displayMetricMoney(report.pnl.management_result, report.currency)}</span>
          <span><StatusChip status={report.pnl.management_result.status} /></span>
        </div>
        <Row label="Biên kết quả quản trị" metric={report.pnl.management_margin} currency={report.currency} />
      </div>
      <p className={`${styles.kpiNote} ${styles.warning}`} role="status">
        Chưa đủ nguồn dữ liệu để kết luận kết quả quản trị sau chi phí tài chính.
      </p>
    </section>
  )
}