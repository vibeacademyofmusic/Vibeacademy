import type { FinancialManagementReport } from '../model'
import { displayMetricMoney, monthHeading } from '../presentation'
import { axisRatio, bounds, plotCents } from './scale'
import styles from '../financial-control-tower.module.css'

const series = [
  { key: 'revenue', label: 'Doanh thu', dash: '' },
  { key: 'personnel_expense', label: 'Chi phí nhân sự', dash: '7 4' },
  { key: 'operating_expense', label: 'Chi phí vận hành', dash: '2 3' },
  { key: 'operating_result', label: 'Kết quả hoạt động', dash: '10 3 2 3' },
] as const

export function FinancialTrendChart({ report }: { report: FinancialManagementReport }) {
  const width = 720
  const height = 240
  const pad = { l: 16, r: 16, t: 16, b: 28 }
  const points = report.trend_12_months
  const plotted = points.flatMap((point) => series.map((item) => plotCents(point[item.key].value)))
  const { low, high } = bounds(plotted)
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const zeroY = pad.t + (1 - axisRatio(BigInt(0), low, high)) * innerH
  const xAt = (index: number) => pad.l + (points.length <= 1 ? innerW / 2 : (index / (points.length - 1)) * innerW)
  const yAt = (value: bigint) => pad.t + (1 - axisRatio(value, low, high)) * innerH

  return (
    <figure className={styles.chart}>
      <figcaption>
        <strong>XU HƯỚNG 12 THÁNG</strong>
        <span>Doanh thu xác định được, chi phí và kết quả hoạt động theo dữ liệu đã tích hợp.</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="trend-chart-title trend-chart-desc">
        <title id="trend-chart-title">Xu hướng 12 tháng</title>
        <desc id="trend-chart-desc">Bốn chuỗi từ trend_12_months. Điểm thiếu không được vẽ thành 0. Điểm chưa đầy đủ có dấu tròn đứt.</desc>
        <line x1={pad.l} x2={width - pad.r} y1={zeroY} y2={zeroY} className={styles.axis} />
        {series.map((item) => {
          const segments: string[][] = []
          let current: string[] = []
          points.forEach((point, index) => {
            const centsValue = plotCents(point[item.key].value)
            if (centsValue === null) {
              if (current.length) segments.push(current)
              current = []
              return
            }
            current.push(`${xAt(index)},${yAt(centsValue)}`)
          })
          if (current.length) segments.push(current)
          return segments.map((segment, index) => (
            <polyline key={item.key + index} points={segment.join(' ')} fill="none" stroke="#192c42" strokeWidth="2" strokeDasharray={item.dash} />
          ))
        })}
        {points.map((point, index) => series.map((item) => {
          const centsValue = plotCents(point[item.key].value)
          if (centsValue === null || point[item.key].status !== 'PARTIAL') return null
          return (
            <circle key={item.key + point.month} cx={xAt(index)} cy={yAt(centsValue)} r="4" fill="white" stroke="#8a5a12" strokeDasharray="2 1">
              <title>{`${item.label} ${monthHeading(point.month)}: ${displayMetricMoney(point[item.key], report.currency)}. Chưa đầy đủ.`}</title>
            </circle>
          )
        }))}
        {points.map((point, index) => (
          <text key={point.month} x={xAt(index)} y={height - 8} textAnchor="middle" className={styles.chartLabel}>{point.month.slice(5, 7)}</text>
        ))}
      </svg>
      <ul className={styles.legend}>
        {series.map((item) => <li key={item.key}><svg width="28" height="8" aria-hidden="true"><line x1="0" x2="28" y1="4" y2="4" stroke="#192c42" strokeDasharray={item.dash} /></svg>{item.label}</li>)}
        <li>Dấu tròn đứt = Chưa đầy đủ. Không có điểm = chưa có số liệu, không phải 0.</li>
      </ul>
    </figure>
  )
}
