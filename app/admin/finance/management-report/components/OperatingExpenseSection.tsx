import Link from 'next/link'
import type { FinancialManagementReport } from '../model'
import { OperatingExpenseChart } from '../charts/OperatingExpenseChart'
import { displayMoney, drillHrefs, opexCategoryLabel, opexVarianceText } from '../presentation'
import { StatusChip } from './KpiCard'
import styles from '../financial-control-tower.module.css'

export function OperatingExpenseSection({ report }: { report: FinancialManagementReport }) {
  const plan = report.operating_expense
  const planPartial = plan.planned_status === 'PARTIAL'
  const varianceText = opexVarianceText(report)
  const plannedText = displayMoney(plan.planned_known_amount, report.currency)
  return (
    <section className={styles.section} aria-labelledby="opex-heading">
      <h2 id="opex-heading">Chi phí vận hành</h2>
      <p>Theo dõi kế hoạch, thực tế ghi nhận và cơ cấu chi phí theo chi nhánh.</p>
      <p className={styles.warning} role="status">Chi phí vận hành đã ghi nhận không đồng nghĩa đã thanh toán.</p>
      <dl className={styles.cards}>
        <div className={styles.summary}>
          <dt>Kế hoạch xác định được</dt>
          <dd>{plannedText}</dd>
          {planPartial ? <StatusChip status="PARTIAL" /> : null}
        </div>
        <div className={styles.summary}>
          <dt>Thực tế đã ghi nhận</dt>
          <dd>{displayMoney(plan.recorded_amount, report.currency)}</dd>
        </div>
        <div className={styles.summary}>
          <dt>Chênh lệch</dt>
          <dd>{varianceText}</dd>
        </div>
        <div className={styles.summary}>
          <dt>Hạng mục chưa có kế hoạch</dt>
          <dd>{plan.unplanned_template_count}</dd>
          {planPartial ? <p className={styles.kpiNote}>Còn {plan.unplanned_template_count} hạng mục chưa có mức kế hoạch</p> : null}
        </div>
      </dl>
      {planPartial ? <p>Chưa đầy đủ. Còn {plan.unplanned_template_count} hạng mục chưa có mức kế hoạch.</p> : null}
      <OperatingExpenseChart report={report} />
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Hạng mục</th>
              <th scope="col" className={styles.num}>Kế hoạch</th>
              <th scope="col" className={styles.num}>Thực tế</th>
              <th scope="col" className={styles.num}>Chênh lệch</th>
              <th scope="col">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {plan.by_category.length ? plan.by_category.map((row) => (
              <tr key={row.category}>
                <td>{opexCategoryLabel(row.category)}</td>
                <td className={styles.num}>{row.planned === null || row.planned === undefined ? '—' : displayMoney(row.planned, report.currency)}</td>
                <td className={styles.num}>{displayMoney(row.actual, report.currency)}</td>
                <td className={styles.num}>{row.variance === null || row.variance === undefined ? '—' : displayMoney(row.variance, report.currency)}</td>
                <td><StatusChip status={row.status} /></td>
              </tr>
            )) : <tr><td colSpan={5} className={styles.empty}>Chưa có khoản chi vận hành trong kỳ.</td></tr>}
          </tbody>
        </table>
      </div>
      {report.scope.type === 'CONSOLIDATED' ? (
        <>
          <h3>Chi phí vận hành theo chi nhánh</h3>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Chi nhánh</th>
                  <th scope="col" className={styles.num}>Kế hoạch</th>
                  <th scope="col" className={styles.num}>Thực tế</th>
                  <th scope="col" className={styles.num}>Chênh lệch</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {plan.by_branch.map((row) => (
                  <tr key={row.branch_id}>
                    <td>{row.branch_name}</td>
                    <td className={styles.num}>{row.planned === null || row.planned === undefined ? '—' : displayMoney(row.planned, report.currency)}</td>
                    <td className={styles.num}>{displayMoney(row.actual, report.currency)}</td>
                    <td className={styles.num}>{row.variance === null || row.variance === undefined ? '—' : displayMoney(row.variance, report.currency)}</td>
                    <td>{row.planned_status ? <StatusChip status={row.planned_status} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <p><Link className={styles.drill} href={drillHrefs.operatingExpense} prefetch={false}>Mở chi phí vận hành</Link></p>
    </section>
  )
}
