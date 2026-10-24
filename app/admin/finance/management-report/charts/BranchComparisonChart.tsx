import type { FinancialManagementReport } from '../model'
import { branchMetric, displayMetricMoney } from '../presentation'
import { axisRatio, bounds, plotCents } from './scale'

const ZERO = BigInt(0)
import styles from '../financial-control-tower.module.css'

const metrics = [
  { key: 'revenue', label: 'Doanh thu xác định được' },
  { key: 'operating_expense', label: 'Chi phí vận hành' },
  { key: 'operating_result', label: 'Kết quả hoạt động' },
] as const

export function BranchComparisonChart({ report }: { report: FinancialManagementReport }) {
  if (report.scope.type !== 'CONSOLIDATED') return null
  const rows = report.branches
  const values = rows.flatMap((row) => metrics.map((item) => plotCents(branchMetric(row.metrics, 'pnl', item.key)?.value)))
  const { low, high } = bounds(values)
  const top = high < ZERO ? -high : high
  const bottom = low < ZERO ? -low : low
  const peakMagnitude = top > bottom ? top : bottom
  const peak = peakMagnitude === ZERO ? BigInt(1) : peakMagnitude
  const width = 720
  const labelW = 180
  const rowH = 78
  const height = Math.max(96, rows.length * rowH + 20)
  const barMax = width - labelW - 16
  const mid = labelW + barMax / 2

  return (
    <figure className={styles.chart}>
      <figcaption>
        <strong>SO SÁNH CHI NHÁNH</strong>
        <span>So sánh các chỉ tiêu hoạt động trong cùng kỳ báo cáo.</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="So sánh chi nhánh">
        <line x1={mid} x2={mid} y1="4" y2={height - 4} className={styles.axis} />
        {rows.map((row, index) => (
          <g key={row.branch_id}>
            <text x="0" y={18 + index * rowH} className={styles.chartLabel}>{row.branch_name}</text>
            {metrics.map((item, metricIndex) => {
              const metric = branchMetric(row.metrics, 'pnl', item.key)
              const centsValue = plotCents(metric?.value)
              const y = 24 + index * rowH + metricIndex * 14
              if (centsValue === null) {
                return <text key={item.key} x={labelW} y={y + 8} className={styles.chartLabel}>{item.label}: —</text>
              }
              const magnitude = centsValue < ZERO ? -centsValue : centsValue
              const barWidth = axisRatio(magnitude, ZERO, peak) * (barMax / 2)
              const x = centsValue < ZERO ? mid - barWidth : mid
              const partial = metric?.status === 'PARTIAL'
              return (
                <rect key={item.key} x={x} y={y} width={barWidth} height="8" fill={centsValue < ZERO ? 'none' : '#192c42'} stroke="#192c42" strokeDasharray={partial ? '3 2' : undefined}>
                  <title>{`${row.branch_name} ${item.label}: ${displayMetricMoney(metric, report.currency)}. ${partial ? 'Chưa đầy đủ' : 'Đầy đủ'}`}</title>
                </rect>
              )
            })}
          </g>
        ))}
      </svg>
      <ul className={styles.legend}>
        {metrics.map((item) => <li key={item.key}>{item.label}</li>)}
        <li>Nét đứt = Chưa đầy đủ</li>
      </ul>
    </figure>
  )
}
