const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = 'app/admin/finance/management-report'
const files = {
  page: fs.readFileSync('app/admin/finance/page.tsx', 'utf8'),
  layout: fs.readFileSync('app/admin/finance/layout.tsx', 'utf8'),
  data: fs.readFileSync(path.join(root, 'data.ts'), 'utf8'),
  presentation: fs.readFileSync(path.join(root, 'presentation.ts'), 'utf8'),
  tower: fs.readFileSync(path.join(root, 'FinanceControlTower.tsx'), 'utf8'),
  kpi: fs.readFileSync(path.join(root, 'components/KpiCard.tsx'), 'utf8'),
  executive: fs.readFileSync(path.join(root, 'components/ExecutiveSummary.tsx'), 'utf8'),
  pnl: fs.readFileSync(path.join(root, 'components/PnlTable.tsx'), 'utf8'),
  opex: fs.readFileSync(path.join(root, 'components/OperatingExpenseSection.tsx'), 'utf8'),
  cash: fs.readFileSync(path.join(root, 'components/CashFlowSection.tsx'), 'utf8'),
  ar: fs.readFileSync(path.join(root, 'components/ReceivablesSection.tsx'), 'utf8'),
  branch: fs.readFileSync(path.join(root, 'components/BranchTable.tsx'), 'utf8'),
  trend: fs.readFileSync(path.join(root, 'components/TrendTable.tsx'), 'utf8'),
  quality: fs.readFileSync(path.join(root, 'components/SourceQuality.tsx'), 'utf8'),
}
const ui = Object.values(files).join('\n')

assert.match(files.page, /loadFinanceControlTower/, 'U-loader: overview uses canonical loader')
assert.doesNotMatch(files.page, /loadFinance\(/, 'no old finance dashboard fallback')
assert.match(files.tower, /revenueTitle/, 'U01 revenue title comes from PARTIAL-aware helper')
assert.match(files.presentation, /Doanh thu xác định được/, 'U01 PARTIAL revenue label')
assert.doesNotMatch(files.tower, /Doanh thu tháng/, 'U01 no Doanh thu tháng')
assert.doesNotMatch(ui, /Doanh thu tháng/, 'U01 no Doanh thu tháng anywhere in tower UI')

assert.match(files.pnl, /Chưa đủ dữ liệu/, 'U02 management result incomplete')
assert.match(files.pnl, /Chưa đủ nguồn dữ liệu để kết luận kết quả quản trị sau chi phí tài chính/, 'U02 management warning visible')
assert.doesNotMatch(ui, /Lợi nhuận|lợi nhuận|\bLỗ\b|Net Profit|\bProfit\b/, 'U02 no profit/loss wording')

assert.match(files.opex, /Thực tế đã ghi nhận/, 'U03 recognized opex card')
assert.match(files.opex, /recorded_amount/, 'U03 uses canonical recorded amount')
assert.doesNotMatch(ui, /Đã chi/, 'U04 does not claim opex paid')
assert.match(files.opex, /không đồng nghĩa đã thanh toán/, 'U04 recognition is not payment')
assert.match(files.opex, /varianceText/, 'U05 variance uses canonical display helper')
assert.match(files.opex, /'—'/, 'U05/U06 em dash for missing plan or variance')
assert.match(files.opex, /row\.planned === null \|\| row\.planned === undefined \? '—'/, 'U06 null plan is not 0')

assert.match(files.tower, /Công nợ hiện tại/, 'U07 current AR label')
assert.match(files.ar, /Công nợ hiện tại/, 'U07 receivables section current AR')
assert.match(files.ar, /không phải công nợ cuối tháng/, 'U08 not labelled as month-end')
assert.match(files.ar, /Chưa hỗ trợ ảnh chụp công nợ cuối kỳ/, 'U08 month-end unavailable')
assert.match(files.tower, /Chưa có nguồn dữ liệu khoản vay được xác nhận/, 'U09 loan unavailable copy')
assert.match(files.ar, /Dư nợ vay/, 'U09 loan row exists')
assert.match(files.kpi, /PARTIAL/, 'U10 partial badge component')
assert.match(files.tower, /StatusChip status="PARTIAL"|revenue\.status/, 'U10 partial status is rendered from canonical metric')
assert.match(files.branch, /report\.branches\.map/, 'U11 consolidated branch list is dynamic')
assert.doesNotMatch(files.branch, /Finance Report A|hard-coded branch/, 'U11 no hard-coded branch names')

assert.doesNotMatch(ui, /parseFloat|parseInt/, 'U12 no parseFloat/parseInt')
assert.doesNotMatch(files.tower + files.page + files.opex + files.pnl + files.cash, /actual_amount\s*-|recorded_amount\s*-|planned_known_amount\s*-/, 'U12 no UI variance arithmetic')
assert.match(files.presentation, /formatMoney/, 'U12 display uses shared money formatter')
assert.doesNotMatch(files.presentation, /p_value|gross_amount \+|base_salary \+/, 'U12 presentation does not invent formulas')

assert.match(files.quality, /Chất lượng dữ liệu/, 'U13 source quality section')
assert.match(files.quality, /source_status/, 'U13 binds canonical source_status')
assert.match(files.trend, /trend_12_months/, 'U14 12-month section uses canonical trend')
assert.match(files.tower, /Xuất báo cáo/, 'U15 export opens the financial report document')
assert.match(files.tower, /financialReportHref/, 'U15 export keeps the selected month, branch, and currency')
assert.match(files.presentation, /\/documents\/finance\/management-report/, 'U15 export route is the dedicated document')
assert.doesNotMatch(ui, /Xuất PDF|Download PDF|pdfkit|puppeteer/, 'U15 no fake server PDF download')
assert.doesNotMatch(ui, /recharts|chart\.js|Chart\.js|demo data/i, 'no fake chart library')
assert.match(files.presentation, /\/admin\/finance\/operating-expenses/, 'U16 opex drill route')
assert.match(files.opex, /drillHrefs\.operatingExpense/, 'U16 opex section uses the drill href')
assert.match(files.layout, /Chi phí vận hành/, 'finance nav keeps operating expense')
assert.match(files.layout, /\/admin\/payroll/, 'payroll remains a related module link')
assert.doesNotMatch(files.layout, /href=.*loan/i, 'no fake loan route')

console.log('Financial control tower UI contract: PASS')
