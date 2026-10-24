import type { FinancialManagementReport, MetricValue } from '../model'
import { displayMetricMoney } from '../presentation'
import { StatusChip } from './KpiCard'
import styles from '../financial-control-tower.module.css'

function Line({ label, metric, currency }: { label: string; metric: MetricValue; currency: string }) {
  const unimplemented = metric.status === 'NOT_IMPLEMENTED'
  return (
    <div className={styles.cashRow}>
      <span>{label}</span>
      <span className={styles.num}>{unimplemented ? '—' : displayMetricMoney(metric, currency)}</span>
      <span>{unimplemented ? <><StatusChip status="NOT_IMPLEMENTED" /> <span className={styles.muted}>Chưa tích hợp</span></> : metric.status === 'PARTIAL' ? <StatusChip status="PARTIAL" /> : null}</span>
    </div>
  )
}

export function CashFlowSection({ report }: { report: FinancialManagementReport }) {
  return (
    <section className={styles.section} aria-labelledby="cash-heading">
      <h2 id="cash-heading">Dòng tiền trên các nguồn đã tích hợp</h2>
      <p>{report.cash_flow.label}</p>
      <p className={styles.warning} role="status">Chi phí vận hành đã ghi nhận không đồng nghĩa đã thanh toán.</p>
      <h3>Dòng tiền vào</h3>
      <div className={styles.rows}>
        <Line label="Học phí thực thu" metric={report.cash_flow.tuition_cash_in} currency={report.currency} />
        <Line label="Thu khác" metric={report.cash_flow.other_operating_in} currency={report.currency} />
        <Line label="Giải ngân khoản vay" metric={report.cash_flow.loan_drawdown} currency={report.currency} />
        <Line label="Dòng tiền vào" metric={report.cash_flow.total_in_integrated} currency={report.currency} />
      </div>
      <h3>Dòng tiền ra</h3>
      <div className={styles.rows}>
        <Line label="Chi trả lương" metric={report.cash_flow.payroll_cash_out} currency={report.currency} />
        <Line label="Hoàn học phí" metric={report.cash_flow.refund_cash_out} currency={report.currency} />
        <Line label="Chi phí vận hành đã thanh toán" metric={report.cash_flow.opex_cash_out} currency={report.currency} />
        <Line label="Trả gốc vay" metric={report.cash_flow.loan_principal_out} currency={report.currency} />
        <Line label="Lãi vay" metric={report.cash_flow.loan_interest_out} currency={report.currency} />
        <Line label="Chi nhà cung cấp" metric={report.cash_flow.vendor_out} currency={report.currency} />
        <Line label="Thuế / phí" metric={report.cash_flow.tax_fee_out} currency={report.currency} />
        <Line label="Đầu tư tài sản" metric={report.cash_flow.capex_out} currency={report.currency} />
        <Line label="Dòng tiền ra" metric={report.cash_flow.total_out_integrated} currency={report.currency} />
      </div>
      <div className={styles.rows}>
        <Line label="Dòng tiền thuần" metric={report.cash_flow.net_integrated} currency={report.currency} />
      </div>
    </section>
  )
}
