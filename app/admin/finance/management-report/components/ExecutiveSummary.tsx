import type { FinancialManagementReport } from '../model'
import { executiveConclusions } from '../presentation'
import styles from '../financial-control-tower.module.css'

export function ExecutiveSummary({ report }: { report: FinancialManagementReport }) {
  const items = executiveConclusions(report)
  return (
    <section className={styles.section} aria-labelledby="executive-heading">
      <h2 id="executive-heading">Kết luận điều hành</h2>
      <p>Tối đa năm nhận định từ nguồn báo cáo chuẩn. Không phải kết luận kết quả quản trị sau chi phí tài chính.</p>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.code + item.text} data-tone={item.tone}>
            <span className={styles.kind}>{item.kind === 'WARNING' ? 'Cảnh báo' : item.kind === 'OBSERVATION' ? 'Nhận định' : 'Sự kiện'}</span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
