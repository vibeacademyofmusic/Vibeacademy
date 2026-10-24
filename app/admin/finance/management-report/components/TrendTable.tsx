import { FinancialTrendChart } from '../charts/FinancialTrendChart'
import type { FinancialManagementReport } from '../model'
import { displayMetricMoney, monthHeading } from '../presentation'
import { StatusChip } from './KpiCard'
import styles from '../financial-control-tower.module.css'

export function TrendTable({ report }: { report: FinancialManagementReport }) {
  return (
    <section className={styles.section} aria-labelledby="trend-heading">
      <h2 id="trend-heading">12 tháng</h2>
      <p>Nguồn: trend_12_months của báo cáo chuẩn. Điểm thiếu hoặc chưa đầy đủ không được vẽ thành số 0.</p>
      <FinancialTrendChart report={report} />
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Tháng</th>
              <th scope="col" className={styles.num}>Doanh thu</th>
              <th scope="col">TT</th>
              <th scope="col" className={styles.num}>Nhân sự</th>
              <th scope="col" className={styles.num}>Vận hành</th>
              <th scope="col" className={styles.num}>Kết quả hoạt động</th>
              <th scope="col" className={styles.num}>Tiền vào</th>
              <th scope="col" className={styles.num}>Tiền ra</th>
              <th scope="col" className={styles.num}>Dòng tiền thuần</th>
            </tr>
          </thead>
          <tbody>
            {report.trend_12_months.map((point) => (
              <tr key={point.month}>
                <td>{monthHeading(point.month)}</td>
                <td className={styles.num}>{displayMetricMoney(point.revenue, report.currency)}</td>
                <td><StatusChip status={point.revenue.status} /></td>
                <td className={styles.num}>{displayMetricMoney(point.personnel_expense, report.currency)}</td>
                <td className={styles.num}>{displayMetricMoney(point.operating_expense, report.currency)}</td>
                <td className={styles.num}>{displayMetricMoney(point.operating_result, report.currency)}</td>
                <td className={styles.num}>{displayMetricMoney(point.cash_in_integrated, report.currency)}</td>
                <td className={styles.num}>{displayMetricMoney(point.cash_out_integrated, report.currency)}</td>
                <td className={styles.num}>{displayMetricMoney(point.net_cash_integrated, report.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
