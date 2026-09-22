import type { FinancialManagementReport, MetricValue } from '@/app/admin/finance/management-report/model'
import { BranchComparisonChart } from '@/app/admin/finance/management-report/charts/BranchComparisonChart'
import { FinancialTrendChart } from '@/app/admin/finance/management-report/charts/FinancialTrendChart'
import { OperatingExpenseChart } from '@/app/admin/finance/management-report/charts/OperatingExpenseChart'
import {
  branchMetric,
  branchRowStatus,
  displayMetricMoney,
  displayMoney,
  executiveConclusions,
  generatedAtLabel,
  monthHeading,
  opexCategoryLabel,
  opexVarianceText,
  periodStamp,
  revenueTitle,
  scopeLabel,
  sourceQualityTitles,
  statusLabel,
} from '@/app/admin/finance/management-report/presentation'

function moneyCell(metric: MetricValue | null | undefined, currency: string) {
  return displayMetricMoney(metric, currency)
}

function statusCell(metric: MetricValue | null | undefined) {
  if (!metric) return '—'
  return statusLabel(metric.status)
}

export default function FinancialManagementReportDocument({ report }: { report: FinancialManagementReport }) {
  const consolidated = report.scope.type === 'CONSOLIDATED'
  const managementUnavailable = report.pnl.management_result.value === null
    || report.pnl.management_result.value === undefined
    || report.pnl.management_result.status === 'NOT_IMPLEMENTED'
  const plan = report.operating_expense
  const conclusions = executiveConclusions(report)
  const inflows = [
    ['Học phí thực thu', report.cash_flow.tuition_cash_in],
    ['Thu khác trên nguồn đã tích hợp', report.cash_flow.other_operating_in],
    ['Giải ngân khoản vay', report.cash_flow.loan_drawdown],
  ] as const
  const outflows = [
    ['Chi trả lương', report.cash_flow.payroll_cash_out],
    ['Hoàn học phí', report.cash_flow.refund_cash_out],
    ['Chi phí vận hành đã thanh toán', report.cash_flow.opex_cash_out],
    ['Chi nhà cung cấp', report.cash_flow.vendor_out],
    ['Trả gốc vay', report.cash_flow.loan_principal_out],
    ['Lãi vay', report.cash_flow.loan_interest_out],
    ['Thuế / phí', report.cash_flow.tax_fee_out],
    ['Đầu tư tài sản', report.cash_flow.capex_out],
  ] as const

  return (
    <article className="fm-report">
      <header className="fm-brand fm-keep">
        <p className="fm-kicker">VIBE Academy</p>
        <h1>BÁO CÁO TÀI CHÍNH QUẢN TRỊ</h1>
        <p>Financial Management Report</p>
      </header>
      <dl className="fm-meta">
        <div><dt>Kỳ</dt><dd>{periodStamp(report.period.month)}</dd></div>
        <div><dt>Phạm vi</dt><dd>{scopeLabel(report.scope)}</dd></div>
        <div><dt>Tiền tệ</dt><dd>{report.currency}</dd></div>
        <div><dt>Generated at</dt><dd>{generatedAtLabel(report.generated_at)}</dd></div>
      </dl>

      <section className="fm-section">
        <h2>EXECUTIVE KPI SUMMARY</h2>
        <div className="fm-kpis">
          <article>
            <p>{revenueTitle(report.pnl.revenue.status)}</p>
            <strong>{moneyCell(report.pnl.revenue, report.currency)}</strong>
            {report.pnl.revenue.status === 'PARTIAL' ? <span>Chưa đầy đủ</span> : null}
          </article>
          <article>
            <p>Chi phí nhân sự</p>
            <strong>{moneyCell(report.pnl.personnel_expense, report.currency)}</strong>
            {report.pnl.personnel_expense.status === 'PARTIAL' ? <span>Chưa đầy đủ</span> : null}
          </article>
          <article>
            <p>Chi phí vận hành</p>
            <strong>{moneyCell(report.pnl.operating_expense, report.currency)}</strong>
          </article>
          <article>
            <p>Kết quả hoạt động</p>
            <strong>{moneyCell(report.pnl.operating_result, report.currency)}</strong>
            {report.pnl.operating_result.status === 'PARTIAL' ? <span>Kết quả hoạt động xác định được từ các nguồn đủ điều kiện.</span> : null}
          </article>
          <article>
            <p>Tiền vào</p>
            <strong>{moneyCell(report.cash_flow.total_in_integrated, report.currency)}</strong>
          </article>
          <article>
            <p>Tiền ra</p>
            <strong>{moneyCell(report.cash_flow.total_out_integrated, report.currency)}</strong>
          </article>
          <article>
            <p>Dòng tiền thuần</p>
            <strong>{moneyCell(report.cash_flow.net_integrated, report.currency)}</strong>
          </article>
          <article>
            <p>Công nợ hiện tại</p>
            <strong>{moneyCell(report.receivables.current_tuition_receivable, report.currency)}</strong>
          </article>
        </div>
        <h2>Kết luận điều hành</h2>
        <ul>
          {conclusions.map((item) => <li key={item.code + item.text}>{item.text}</li>)}
        </ul>
        <FinancialTrendChart report={report} />
        {consolidated ? <BranchComparisonChart report={report} /> : <OperatingExpenseChart report={report} />}
      </section>

      <section className="fm-section">
        <h2>KẾT QUẢ HOẠT ĐỘNG</h2>
        <table>
          <thead>
            <tr><th>Chỉ tiêu</th><th className="fm-num">Số tiền</th><th>Trạng thái</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{revenueTitle(report.pnl.revenue.status)}</td>
              <td className="fm-num">{moneyCell(report.pnl.revenue, report.currency)}</td>
              <td>{statusCell(report.pnl.revenue)}</td>
            </tr>
            <tr>
              <td>Chi phí nhân sự</td>
              <td className="fm-num">{moneyCell(report.pnl.personnel_expense, report.currency)}</td>
              <td>{statusCell(report.pnl.personnel_expense)}</td>
            </tr>
            <tr>
              <td>Công tác phí</td>
              <td className="fm-num">{moneyCell(report.pnl.travel_reimbursement_expense, report.currency)}</td>
              <td>{statusCell(report.pnl.travel_reimbursement_expense)}</td>
            </tr>
            <tr>
              <td>Chi phí vận hành</td>
              <td className="fm-num">{moneyCell(report.pnl.operating_expense, report.currency)}</td>
              <td>{statusCell(report.pnl.operating_expense)}</td>
            </tr>
            <tr>
              <td>Chi phí hoạt động khác</td>
              <td className="fm-num">{moneyCell(report.pnl.other_operating_expense, report.currency)}</td>
              <td>{statusCell(report.pnl.other_operating_expense)}</td>
            </tr>
            <tr>
              <td>Kết quả hoạt động</td>
              <td className="fm-num">{moneyCell(report.pnl.operating_result, report.currency)}</td>
              <td>{statusCell(report.pnl.operating_result)}</td>
            </tr>
            <tr>
              <td>Chi phí lãi vay</td>
              <td className="fm-num">{moneyCell(report.pnl.loan_interest_expense, report.currency)}</td>
              <td>{statusCell(report.pnl.loan_interest_expense)}</td>
            </tr>
            <tr>
              <td>Chi phí tài chính khác</td>
              <td className="fm-num">{moneyCell(report.pnl.other_financial_expense, report.currency)}</td>
              <td>{statusCell(report.pnl.other_financial_expense)}</td>
            </tr>
            <tr>
              <td>Kết quả quản trị</td>
              <td className="fm-num">{managementUnavailable ? '—' : moneyCell(report.pnl.management_result, report.currency)}</td>
              <td>{statusCell(report.pnl.management_result)}</td>
            </tr>
            <tr>
              <td>Biên kết quả quản trị</td>
              <td className="fm-num">{moneyCell(report.pnl.management_margin, report.currency)}</td>
              <td>{statusCell(report.pnl.management_margin)}</td>
            </tr>
          </tbody>
        </table>
        {managementUnavailable ? <p className="fm-note">Chưa đủ nguồn dữ liệu để kết luận kết quả quản trị sau chi phí tài chính.</p> : null}
        {report.pnl.operating_result.status === 'PARTIAL' ? <p className="fm-note">Kết quả hoạt động xác định được từ các nguồn đủ điều kiện.</p> : null}
      </section>

      <section className="fm-section">
        <h2>CHI PHÍ VẬN HÀNH</h2>
        <p className="fm-note">Chi phí vận hành đã ghi nhận không đồng nghĩa đã thanh toán.</p>
        <div className="fm-kpis">
          <article>
            <p>Kế hoạch xác định được</p>
            <strong>{displayMoney(plan.planned_known_amount, report.currency)}</strong>
            {plan.planned_status === 'PARTIAL' ? <span>Chưa đầy đủ</span> : null}
          </article>
          <article>
            <p>Thực tế đã ghi nhận</p>
            <strong>{displayMoney(plan.recorded_amount, report.currency)}</strong>
          </article>
          <article>
            <p>Chênh lệch</p>
            <strong>{opexVarianceText(report)}</strong>
          </article>
          <article>
            <p>Hạng mục chưa có kế hoạch</p>
            <strong>{plan.unplanned_template_count}</strong>
            {plan.planned_status === 'PARTIAL' ? <span>Còn {plan.unplanned_template_count} hạng mục chưa có mức kế hoạch.</span> : null}
          </article>
        </div>
        <table>
          <thead>
            <tr>
              <th>Hạng mục</th>
              <th className="fm-num">Kế hoạch</th>
              <th className="fm-num">Thực tế</th>
              <th className="fm-num">Chênh lệch</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {plan.by_category.map((row) => (
              <tr key={row.category}>
                <td>{opexCategoryLabel(row.category)}</td>
                <td className="fm-num">{row.planned === null || row.planned === undefined ? '—' : displayMoney(row.planned, report.currency)}</td>
                <td className="fm-num">{displayMoney(row.actual, report.currency)}</td>
                <td className="fm-num">{row.variance === null || row.variance === undefined ? '—' : displayMoney(row.variance, report.currency)}</td>
                <td>{statusLabel(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {consolidated ? <OperatingExpenseChart report={report} /> : null}
        {consolidated ? (
          <table>
            <thead>
              <tr>
                <th>Chi nhánh</th>
                <th className="fm-num">Kế hoạch</th>
                <th className="fm-num">Thực tế</th>
                <th className="fm-num">Chênh lệch</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {plan.by_branch.map((row) => (
                <tr key={row.branch_id}>
                  <td>{row.branch_name}</td>
                  <td className="fm-num">{row.planned === null || row.planned === undefined ? '—' : displayMoney(row.planned, report.currency)}</td>
                  <td className="fm-num">{displayMoney(row.actual, report.currency)}</td>
                  <td className="fm-num">{row.variance === null || row.variance === undefined ? '—' : displayMoney(row.variance, report.currency)}</td>
                  <td>{row.planned_status ? statusLabel(row.planned_status) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      <section className="fm-section">
        <h2>DÒNG TIỀN TRÊN CÁC NGUỒN ĐÃ TÍCH HỢP</h2>
        <p className="fm-note">Dòng tiền trên các nguồn đã tích hợp. Chi phí vận hành đã ghi nhận không đồng nghĩa đã thanh toán.</p>
        <h3>Dòng tiền vào</h3>
        <table>
          <tbody>
            {inflows.map(([label, metric]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="fm-num">{moneyCell(metric, report.currency)}</td>
                <td>{metric.status === 'NOT_IMPLEMENTED' ? 'Chưa tích hợp' : statusCell(metric)}</td>
              </tr>
            ))}
            <tr>
              <td>Tổng tiền vào trên nguồn đã tích hợp</td>
              <td className="fm-num">{moneyCell(report.cash_flow.total_in_integrated, report.currency)}</td>
              <td>{statusCell(report.cash_flow.total_in_integrated)}</td>
            </tr>
          </tbody>
        </table>
        <h3>Dòng tiền ra</h3>
        <table>
          <tbody>
            {outflows.map(([label, metric]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="fm-num">{moneyCell(metric, report.currency)}</td>
                <td>{metric.status === 'NOT_IMPLEMENTED' ? 'Chưa tích hợp' : statusCell(metric)}</td>
              </tr>
            ))}
            <tr>
              <td>Tổng tiền ra trên nguồn đã tích hợp</td>
              <td className="fm-num">{moneyCell(report.cash_flow.total_out_integrated, report.currency)}</td>
              <td>{statusCell(report.cash_flow.total_out_integrated)}</td>
            </tr>
            <tr>
              <td>Dòng tiền thuần trên nguồn đã tích hợp</td>
              <td className="fm-num">{moneyCell(report.cash_flow.net_integrated, report.currency)}</td>
              <td>{statusCell(report.cash_flow.net_integrated)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="fm-section">
        <h2>{'CÔNG NỢ & NGHĨA VỤ'}</h2>
        <table>
          <tbody>
            <tr>
              <td>Công nợ học phí hiện tại</td>
              <td className="fm-num">{moneyCell(report.receivables.current_tuition_receivable, report.currency)}</td>
              <td>Công nợ hiện tại</td>
            </tr>
            <tr>
              <td>Công nợ mở sổ hiện tại</td>
              <td className="fm-num">{moneyCell(report.receivables.opening_receivable_current, report.currency)}</td>
              <td>{statusCell(report.receivables.opening_receivable_current)}</td>
            </tr>
            <tr>
              <td>Nghĩa vụ lương đã ghi nhận</td>
              <td className="fm-num">{moneyCell(report.obligations.payroll_recognized_payable, report.currency)}</td>
              <td>{statusCell(report.obligations.payroll_recognized_payable)}</td>
            </tr>
            <tr>
              <td>Lương còn có thể ghi nhận chi trả</td>
              <td className="fm-num">{moneyCell(report.obligations.payroll_disbursable_remaining, report.currency)}</td>
              <td>{report.obligations.payroll_disbursable_remaining.reason ?? statusCell(report.obligations.payroll_disbursable_remaining)}</td>
            </tr>
            <tr>
              <td>Công nợ vận hành</td>
              <td className="fm-num">—</td>
              <td>Chưa tích hợp</td>
            </tr>
            <tr>
              <td>Dư nợ vay</td>
              <td className="fm-num">—</td>
              <td>Chưa có nguồn dữ liệu khoản vay được xác nhận.</td>
            </tr>
            <tr>
              <td>Công nợ cuối kỳ</td>
              <td className="fm-num">—</td>
              <td>Chưa hỗ trợ ảnh chụp công nợ cuối kỳ.</td>
            </tr>
          </tbody>
        </table>
      </section>

      {consolidated ? (
        <section className="fm-section">
          <h2>HIỆU QUẢ THEO CHI NHÁNH</h2>
          <table>
            <thead>
              <tr>
                <th>Chi nhánh</th>
                <th className="fm-num">Doanh thu xác định được</th>
                <th className="fm-num">Chi phí nhân sự</th>
                <th className="fm-num">Công tác phí</th>
                <th className="fm-num">Chi phí vận hành</th>
                <th className="fm-num">Kết quả hoạt động</th>
                <th className="fm-num">Tiền vào</th>
                <th className="fm-num">Tiền ra</th>
                <th className="fm-num">Dòng tiền thuần</th>
                <th>Trạng thái dữ liệu</th>
              </tr>
            </thead>
            <tbody>
              {report.branches.map((row) => (
                <tr key={row.branch_id}>
                  <td>{row.branch_name}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'pnl', 'revenue'), report.currency)}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'pnl', 'personnel_expense'), report.currency)}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'pnl', 'travel_reimbursement_expense'), report.currency)}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'pnl', 'operating_expense'), report.currency)}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'pnl', 'operating_result'), report.currency)}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'cash_flow', 'total_in_integrated'), report.currency)}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'cash_flow', 'total_out_integrated'), report.currency)}</td>
                  <td className="fm-num">{moneyCell(branchMetric(row.metrics, 'cash_flow', 'net_integrated'), report.currency)}</td>
                  <td>{statusLabel(branchRowStatus(row.metrics))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="fm-section">
        <h2>XU HƯỚNG 12 THÁNG</h2>
        <FinancialTrendChart report={report} />
        <table>
          <thead>
            <tr>
              <th>Tháng</th>
              <th className="fm-num">Doanh thu</th>
              <th>Trạng thái</th>
              <th className="fm-num">Chi phí nhân sự</th>
              <th className="fm-num">Chi phí vận hành</th>
              <th className="fm-num">Kết quả hoạt động</th>
            </tr>
          </thead>
          <tbody>
            {report.trend_12_months.map((point) => (
              <tr key={point.month}>
                <td>{monthHeading(point.month)}</td>
                <td className="fm-num">{moneyCell(point.revenue, report.currency)}</td>
                <td>{statusCell(point.revenue)}</td>
                <td className="fm-num">{moneyCell(point.personnel_expense, report.currency)}</td>
                <td className="fm-num">{moneyCell(point.operating_expense, report.currency)}</td>
                <td className="fm-num">{moneyCell(point.operating_result, report.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="fm-section">
        <h2>{'CHẤT LƯỢNG DỮ LIỆU & PHẠM VI BÁO CÁO'}</h2>
        <table>
          <thead>
            <tr><th>Nguồn</th><th>Trạng thái</th><th>Chi tiết</th></tr>
          </thead>
          <tbody>
            {report.source_status.map((metric) => (
              <tr key={metric.code}>
                <td>{sourceQualityTitles[metric.code] ?? metric.code}</td>
                <td>{statusLabel(metric.status)}</td>
                <td>{metric.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li>Báo cáo này là báo cáo quản trị.</li>
          <li>Một số chỉ tiêu có thể là chưa đầy đủ.</li>
          <li>Đã ghi nhận chi phí không đồng nghĩa đã thanh toán.</li>
          <li>Dòng tiền chỉ bao gồm các nguồn đã tích hợp.</li>
          <li>Kết quả quản trị chưa được kết luận khi chi phí tài chính chưa đủ nguồn.</li>
        </ul>
      </section>
      <footer>
        <p>Generated at {generatedAtLabel(report.generated_at)}</p>
        <p>VIBE Academy · Báo cáo tài chính quản trị · {periodStamp(report.period.month)} · {scopeLabel(report.scope)}</p>
      </footer>
    </article>
  )
}
