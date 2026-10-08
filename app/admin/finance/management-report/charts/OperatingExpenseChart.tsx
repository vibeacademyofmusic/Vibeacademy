import type { FinancialManagementReport } from '../model'
import { displayMoney, opexCategoryLabel } from '../presentation'
import { axisRatio, bounds, plotCents } from './scale'
import styles from '../financial-control-tower.module.css'

export function OperatingExpenseChart({ report }: { report: FinancialManagementReport }) {
  const rows = report.operating_expense.by_category
  const partial = report.operating_expense.planned_status === 'PARTIAL'
  const values = rows.flatMap((row) => [plotCents(row.actual), row.planned === null || row.planned === undefined ? null : plotCents(row.planned)])
  const { low, high } = bounds(values)
  const rowH = 36
  const width = 720
  const labelW = 160
  const height = Math.max(80, rows.length * rowH + 24)
  const barMax = width - labelW - 24

  return (
    <figure className={styles.chart}>
      <figcaption>
        <strong>CHI PHÍ VẬN HÀNH</strong>
        <span>Kế hoạch và thực tế ghi nhận theo hạng mục.</span>
      </figcaption>
      {partial ? <p>Chưa đầy đủ. Còn {report.operating_expense.unplanned_template_count} hạng mục chưa có mức kế hoạch. Chênh lệch: —</p> : null}
      {rows.length ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ chi phí vận hành theo hạng mục">
          {rows.map((row, index) => {
            const y = 12 + index * rowH
            const actual = plotCents(row.actual)
            const planned = row.planned === null || row.planned === undefined ? null : plotCents(row.planned)
            const actualW = actual === null ? 0 : Math.max(0, axisRatio(actual, low, high) * barMax)
            const plannedW = planned === null ? 0 : Math.max(0, axisRatio(planned, low, high) * barMax)
            return (
              <g key={row.category}>
                <text x="0" y={y + 16} className={styles.chartLabel}>{opexCategoryLabel(row.category)}</text>
                <rect x={labelW} y={y} width={actualW} height="10" fill="#192c42">
                  <title>{`Thực tế đã ghi nhận ${displayMoney(row.actual, report.currency)}`}</title>
                </rect>
                {planned !== null ? (
                  <rect x={labelW} y={y + 14} width={plannedW} height="8" fill="none" stroke="#8a5a12" strokeDasharray={partial ? '3 2' : undefined}>
                    <title>{`Kế hoạch ${displayMoney(row.planned, report.currency)}${partial ? '. Chưa đầy đủ' : ''}`}</title>
                  </rect>
                ) : (
                  <text x={labelW} y={y + 22} className={styles.chartLabel}>Kế hoạch: —</text>
                )}
              </g>
            )
          })}
        </svg>
      ) : <p>Chưa có hạng mục chi phí vận hành trong kỳ.</p>}
      <ul className={styles.legend}>
        <li>Thanh đậm = Thực tế đã ghi nhận</li>
        <li>Viền = Kế hoạch, chỉ khi kế hoạch có số</li>
        {partial ? <li>Chưa đầy đủ</li> : null}
      </ul>
    </figure>
  )
}
