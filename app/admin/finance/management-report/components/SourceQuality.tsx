import type { FinancialManagementReport } from '../model'
import { sourceQualityTitles, statusLabel } from '../presentation'
import { StatusChip } from './KpiCard'
import styles from '../financial-control-tower.module.css'

export function SourceQuality({ report }: { report: FinancialManagementReport }) {
  return (
    <section className={styles.section} aria-labelledby="quality-heading">
      <h2 id="quality-heading">Chất lượng dữ liệu</h2>
      <p>Trạng thái nguồn từ source_status. Chưa đầy đủ là trạng thái báo cáo bình thường, không phải lỗi hệ thống.</p>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Nguồn</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {report.source_status.map((metric) => (
              <tr key={metric.code}>
                <td>{sourceQualityTitles[metric.code] ?? metric.code}</td>
                <td><StatusChip status={metric.status} /> {statusLabel(metric.status)}</td>
                <td className={styles.muted}>{metric.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
