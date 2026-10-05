import type { FinancialManagementReport } from '../model'
import { displayMetricMoney, displayMoney } from '../presentation'
import { StatusChip } from './KpiCard'
import styles from '../financial-control-tower.module.css'

export function ReceivablesSection({ report }: { report: FinancialManagementReport }) {
  const remaining = report.obligations.payroll_disbursable_remaining
  return (
    <section className={styles.section} aria-labelledby="ar-heading">
      <h2 id="ar-heading">Công nợ &amp; nghĩa vụ</h2>
      {report.obligations.integrity_warning ? <p className={styles.error} role="alert">Cảnh báo toàn vẹn: số đã chi trả vượt nghĩa vụ ghi nhận.</p> : null}
      <div className={styles.rows}>
        <div>
          <span>Công nợ hiện tại</span>
          <span className={styles.num}>{displayMetricMoney(report.receivables.current_tuition_receivable, report.currency)}</span>
          <span className={styles.muted}>Công nợ học phí hiện tại · không phải công nợ cuối tháng</span>
        </div>
        <div>
          <span>Công nợ mở sổ hiện tại</span>
          <span className={styles.num}>{displayMetricMoney(report.receivables.opening_receivable_current, report.currency)}</span>
          <span />
        </div>
        <div>
          <span>Công nợ cuối kỳ</span>
          <span className={styles.num}>—</span>
          <span><StatusChip status="NOT_IMPLEMENTED" /> <span className={styles.muted}>Chưa hỗ trợ ảnh chụp công nợ cuối kỳ.</span></span>
        </div>
        <div>
          <span>Nghĩa vụ lương đã ghi nhận</span>
          <span className={styles.num}>{displayMetricMoney(report.obligations.payroll_recognized_payable, report.currency)}</span>
          <span className={styles.muted}>Đã ghi nhận</span>
        </div>
        <div>
          <span>Số lương còn có thể chi</span>
          <span className={styles.num}>{displayMetricMoney(remaining, report.currency)}</span>
          <span className={styles.muted}>{remaining.reason ?? report.obligations.payroll_approved_not_disbursable_label}</span>
        </div>
        <div>
          <span>Đã ghi nhận chi trả lương</span>
          <span className={styles.num}>{displayMoney(report.obligations.payroll_paid_amount, report.currency)}</span>
          <span />
        </div>
        <div>
          <span>Công nợ vận hành</span>
          <span className={styles.num}>—</span>
          <span><StatusChip status="NOT_IMPLEMENTED" /> <span className={styles.muted}>Chưa tích hợp nguồn dữ liệu.</span></span>
        </div>
        <div>
          <span>Dư nợ vay</span>
          <span className={styles.num}>—</span>
          <span><StatusChip status="NOT_IMPLEMENTED" /> <span className={styles.muted}>Chưa có nguồn dữ liệu khoản vay được xác nhận.</span></span>
        </div>
      </div>
    </section>
  )
}
