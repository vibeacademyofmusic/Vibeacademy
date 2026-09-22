import { BranchComparisonChart } from '../charts/BranchComparisonChart'
import type { FinancialManagementReport } from '../model'
import { branchMetric, branchRowStatus, displayMetricMoney, statusLabel } from '../presentation'
import { StatusChip } from './KpiCard'
import styles from '../financial-control-tower.module.css'

export function BranchTable({ report }: { report: FinancialManagementReport }) {
  if (report.scope.type !== 'CONSOLIDATED') return null
  return (
    <section className={styles.section} aria-labelledby="branch-heading">
      <h2 id="branch-heading">Hiệu quả theo chi nhánh</h2>
      <p>Danh sách chi nhánh lấy từ báo cáo chuẩn. Trạng thái hợp nhất không được tự suy ra trên giao diện.</p>
      <BranchComparisonChart report={report} />
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Chi nhánh</th>
              <th scope="col" className={styles.num}>Doanh thu xác định được</th>
              <th scope="col" className={styles.num}>Nhân sự</th>
              <th scope="col" className={styles.num}>Công tác phí</th>
              <th scope="col" className={styles.num}>Chi phí vận hành</th>
              <th scope="col" className={styles.num}>Kết quả hoạt động</th>
              <th scope="col" className={styles.num}>Tiền vào</th>
              <th scope="col" className={styles.num}>Tiền ra</th>
              <th scope="col" className={styles.num}>Dòng tiền thuần</th>
              <th scope="col">Trạng thái dữ liệu</th>
            </tr>
          </thead>
          <tbody>
            {report.branches.map((row) => {
              const status = branchRowStatus(row.metrics)
              return (
                <tr key={row.branch_id}>
                  <td>{row.branch_name}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'pnl', 'revenue'), report.currency)}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'pnl', 'personnel_expense'), report.currency)}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'pnl', 'travel_reimbursement_expense'), report.currency)}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'pnl', 'operating_expense'), report.currency)}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'pnl', 'operating_result'), report.currency)}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'cash_flow', 'total_in_integrated'), report.currency)}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'cash_flow', 'total_out_integrated'), report.currency)}</td>
                  <td className={styles.num}>{displayMetricMoney(branchMetric(row.metrics, 'cash_flow', 'net_integrated'), report.currency)}</td>
                  <td><StatusChip status={status} /> <span className={styles.muted}>{statusLabel(status)}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
