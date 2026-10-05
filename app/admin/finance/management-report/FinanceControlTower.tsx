import Link from 'next/link'
import type { FinanceBranchOption } from './data'
import type { FinancialManagementReport } from './model'
import {
  changeCaption,
  displayMetricMoney,
  drillHrefs,
  financialReportHref,
  generatedAtLabel,
  monthHeading,
  revenueTitle,
  scopeLabel,
} from './presentation'
import { BranchTable } from './components/BranchTable'
import { CashFlowSection } from './components/CashFlowSection'
import { ExecutiveSummary } from './components/ExecutiveSummary'
import { KpiCard, StatusChip } from './components/KpiCard'
import { OperatingExpenseSection } from './components/OperatingExpenseSection'
import { PnlTable } from './components/PnlTable'
import { ReceivablesSection } from './components/ReceivablesSection'
import { SourceQuality } from './components/SourceQuality'
import { TrendTable } from './components/TrendTable'
import styles from './financial-control-tower.module.css'

export function FinanceControlTower({
  report,
  month,
  branchId,
  currency,
  compare,
  canConsolidate,
  branches,
}: {
  report: FinancialManagementReport
  month: string
  branchId: string | null
  currency: string
  compare: boolean
  canConsolidate: boolean
  branches: FinanceBranchOption[]
}) {
  const changes = report.previous_period.changes
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.copy}>
          <h1>Tổng quan tài chính</h1>
          <p>Theo dõi kết quả hoạt động, dòng tiền, công nợ và chi phí theo chi nhánh.</p>
        </div>
        <dl className={styles.identity}>
          <div><dt>Kỳ báo cáo</dt><dd><strong>{monthHeading(report.period.month)}</strong></dd></div>
          <div><dt>Phạm vi</dt><dd>{scopeLabel(report.scope)}</dd></div>
          <div><dt>Tiền tệ</dt><dd>{report.currency}</dd></div>
          <div><dt>Thời điểm tạo dữ liệu</dt><dd>{generatedAtLabel(report.generated_at)}</dd></div>
        </dl>
      </header>

      <form className={styles.filters} method="get" action="/admin/finance">
        <label>Tháng
          <input type="month" name="month" defaultValue={month} required />
        </label>
        <label>Chi nhánh
          <select name="branch" defaultValue={branchId ?? ''}>
            {canConsolidate ? <option value="">Toàn VIBE</option> : null}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
        <label>Tiền tệ
          <select name="currency" defaultValue={currency}>
            <option value="VND">VND</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label>So với tháng trước
          <select name="compare" defaultValue={compare ? '1' : '0'}>
            <option value="1">Có</option>
            <option value="0">Không</option>
          </select>
        </label>
        <button className="vibe-button vibe-button-primary" type="submit">Xem báo cáo</button>
        <Link className={`vibe-button ${styles.export}`} href={financialReportHref(month, branchId, currency)} prefetch={false}>Xuất báo cáo</Link>
      </form>

      <section className={styles.kpiStack} aria-labelledby="kpi-heading">
        <h2 id="kpi-heading" className={styles.visuallyHidden}>Chỉ số điều hành</h2>
        <div className={styles.kpis}>
          <KpiCard
            title={revenueTitle(report.pnl.revenue.status)}
            metric={report.pnl.revenue}
            currency={report.currency}
            href={drillHrefs.revenue}
            change={compare ? changeCaption(changes.revenue, report.currency) : null}
          />
          <KpiCard
            title="Chi phí nhân sự"
            metric={report.pnl.personnel_expense}
            currency={report.currency}
            href={drillHrefs.personnel}
            change={compare ? changeCaption(changes.personnel_expense, report.currency) : null}
          />
          <KpiCard
            title="Chi phí vận hành"
            metric={report.pnl.operating_expense}
            currency={report.currency}
            href={drillHrefs.operatingExpense}
            change={compare ? changeCaption(changes.operating_expense, report.currency) : null}
          />
          <KpiCard
            title="Kết quả hoạt động"
            metric={report.pnl.operating_result}
            currency={report.currency}
            change={compare ? changeCaption(changes.operating_result, report.currency) : null}
          />
          <KpiCard
            title="Tiền vào"
            metric={report.cash_flow.total_in_integrated}
            currency={report.currency}
            href={drillHrefs.cashIn}
            change={compare ? changeCaption(changes.tuition_cash_in, report.currency) : null}
          />
          <KpiCard
            title="Tiền ra"
            metric={report.cash_flow.total_out_integrated}
            currency={report.currency}
            href={drillHrefs.payrollCashOut}
          />
          <KpiCard
            title="Dòng tiền thuần"
            metric={report.cash_flow.net_integrated}
            currency={report.currency}
            change={compare ? changeCaption(changes.net_integrated, report.currency) : null}
          />
          <KpiCard
            title="Công nợ hiện tại"
            metric={report.receivables.current_tuition_receivable}
            currency={report.currency}
            href={drillHrefs.receivable}
          />
        </div>
        <div className={styles.kpis}>
          <KpiCard
            title="Nghĩa vụ lương"
            metric={report.obligations.payroll_recognized_payable}
            currency={report.currency}
            href={drillHrefs.personnel}
            extra={<p className={styles.kpiNote}>{report.obligations.payroll_disbursable_remaining.reason}</p>}
          />
          <article className={styles.kpi}>
            <p className={styles.kpiTitle}>Dư nợ vay</p>
            <p className={styles.kpiValue}>—</p>
            <div className={styles.kpiMeta}><StatusChip status="NOT_IMPLEMENTED" /></div>
            <p className={styles.kpiNote}>Chưa có nguồn dữ liệu khoản vay được xác nhận.</p>
          </article>
          <KpiCard
            title="Công tác phí"
            metric={report.pnl.travel_reimbursement_expense}
            currency={report.currency}
            href={drillHrefs.travel}
          />
          <article className={styles.kpi}>
            <p className={styles.kpiTitle}>Số lương còn có thể chi</p>
            <p className={styles.kpiValue}>{displayMetricMoney(report.obligations.payroll_disbursable_remaining, report.currency)}</p>
            <p className={styles.kpiNote}>{report.obligations.payroll_approved_not_disbursable_label}</p>
          </article>
        </div>
      </section>

      <ExecutiveSummary report={report} />
      <PnlTable report={report} />
      <OperatingExpenseSection report={report} />
      <CashFlowSection report={report} />
      <ReceivablesSection report={report} />
      <BranchTable report={report} />
      <TrendTable report={report} />
      <SourceQuality report={report} />
    </div>
  )
}
