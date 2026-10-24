/* Browser verification with synthetic data. No credentials or business writes.
 * Requires Playwright; optional CALENDAR_PLAYWRIGHT_MODULE / CALENDAR_BROWSER_EXECUTABLE.
 * Creates a temporary public fixture route and removes it in finally; never ships the route.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const route = path.join(root, 'app/calendar-layout-check/page.tsx')
const folder = path.join(root, 'docs/development/calendar-week-20261024')
const { chromium } = require(process.env.CALENDAR_PLAYWRIGHT_MODULE || 'playwright')
const routeSource = `import WeeklyBoard from '../admin/coordination/WeeklyBoard'
import { calendarDashboardFixture as fixture } from '../../tests/fixtures/calendar-dashboard'
export default async function Preview({searchParams}:{searchParams:Promise<{state?:string}>}) {
 const {state}=await searchParams
 const snapshot=state==='error'?null:state==='empty'?{...fixture,rows:[]}:fixture
 return <div className="vibe-admin preview-shell"><style>{'.preview-sidebar{position:fixed;left:0;top:0;bottom:0;width:240px;padding:30px;background:white;border-right:1px solid #ddd}.preview-main{margin-left:240px;padding:24px;max-width:1600px}.preview-main h1{font-size:24px;font-weight:700;margin:6px 0 12px}.preview-tabs{display:flex;gap:20px;font-size:13px;margin-bottom:12px}.preview-label{font-size:11px;color:#617286;margin-bottom:10px}@media(max-width:900px){.preview-sidebar{display:none}.preview-main{margin:0;padding:12px}}'}</style><aside className="preview-sidebar"><strong>VIBE ACADEMY</strong><p>Đào tạo</p></aside><main className="preview-main"><p className="preview-label">KIỂM TRA GIAO DIỆN · DỮ LIỆU MINH HỌA</p><h1>Ca dạy &amp; Lịch học</h1><div className="preview-tabs"><strong>Lịch tuần</strong><span>Chờ vào ca</span><span>Danh sách ca</span><span>Hôm nay</span></div><WeeklyBoard snapshot={snapshot} error={state==='error'?'Chưa tải được lịch và sĩ số. Chưa thể kết luận tuần này trống.':null} reference={null} date="2026-10-26" branch="" view="week" /></main></div>
}`
async function main() {
  assert.equal(fs.existsSync(route), false, 'Refusing to replace an existing route')
  fs.mkdirSync(path.dirname(route), { recursive: true }); fs.writeFileSync(route, routeSource)
  const cleanRoute = () => { if (fs.existsSync(route) && fs.readFileSync(route, 'utf8') === routeSource) { fs.unlinkSync(route); fs.rmdirSync(path.dirname(route)) } }
  process.once('exit', cleanRoute)
  const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-H', '127.0.0.1', '-p', '3018'], { cwd: root, detached: true, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-preview-placeholder', NEXT_TELEMETRY_DISABLED: '1' } })
  let browser
  try {
    await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (d.toString().includes('Ready')) resolve() }); server.stderr.on('data', d => process.stderr.write(d)); server.on('exit', code => reject(Error(`Next exited ${code}`))); setTimeout(() => reject(Error('Next startup timeout')), 30000).unref() })
    browser = await chromium.launch({ executablePath: process.env.CALENDAR_BROWSER_EXECUTABLE || undefined, args: JSON.parse(process.env.CALENDAR_BROWSER_ARGS || '[]'), headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000)
    await page.goto('http://127.0.0.1:3018/calendar-layout-check', { waitUntil: 'networkidle', timeout: 60000 })
    await page.addStyleTag({ content: 'nextjs-portal{display:none}' })
    const table = page.getByRole('table'); await table.waitFor({ state: 'visible' })
    const box = await table.boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= 1440, 'All seven days fit horizontally with sidebar')
    assert.ok(box.y < 500, 'Schedule begins before 500px with page heading and sidebar')
    await page.screenshot({ path: path.join(folder, 'compact-desktop.png'), fullPage: true })
    const button = table.getByRole('button', { name: /DEMO-1$/ }).first()
    await button.click(); const detail = page.getByRole('dialog'); await detail.waitFor({ state: 'visible' })
    await detail.getByText('Học viên minh họa 1', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(folder, 'compact-detail.png'), fullPage: false })
    await page.keyboard.press('Escape'); await detail.waitFor({ state: 'hidden' })
    assert.equal(await button.evaluate(el => el === document.activeElement), true, 'Escape restores focus to selected slot')
    await table.getByRole('button', { name: /Xem tất cả/ }).first().click()
    await table.waitFor({ state: 'hidden' })
    const dayGroup = page.getByRole('group', { name: 'Chọn ngày trong tuần' })
    await dayGroup.waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('button', { name: /DEMO-DENSE-/ }).filter({ visible: true }).count(), 4, 'Day mode shows all overflow slots')
    await page.getByRole('group', { name: 'Cách xem lịch' }).getByRole('button', { name: 'Tuần', exact: true }).click()
    await table.waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Cần xử lý · 1', exact: true }).click()
    assert.equal(await table.locator('tbody button').count(), 1, 'Attention action shows the unresolved session')
    await page.getByRole('button', { name: 'Cần xử lý · 1', exact: true }).click()
    await page.getByText('Bộ lọc · Bộ môn, giáo viên, phòng', { exact: true }).click()
    await page.getByLabel('Bộ môn', { exact: true }).selectOption('Violin')
    const visibleRows = table.locator('tbody button').filter({ visible: true })
    for (const b of await visibleRows.all()) if (!(await b.innerText()).includes('Xem tất cả')) assert.match(await b.getAttribute('aria-label'), /Violin/)
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
    await page.getByLabel('Phòng', { exact: true }).selectOption('00000000-0000-4000-8000-000000005000')
    assert.equal(await table.locator('tbody button').count(), 1, 'Room filter is exact')
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click()
    await page.getByText('Bộ lọc · Bộ môn, giáo viên, phòng', { exact: true }).click()
    await page.setViewportSize({ width: 1280, height: 800 });
    await table.waitFor({ state: 'visible' });
    const laptopBox = await table.boundingBox(); assert.ok(laptopBox.x + laptopBox.width <= 1280, 'Seven days fit smaller laptop')
    await page.setViewportSize({ width: 390, height: 844 }); await table.waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile page has no horizontal overflow')
    await dayGroup.getByRole('button', { name: /Thứ 4/ }).click()
    await page.screenshot({ path: path.join(folder, 'compact-mobile.png'), fullPage: true })
    const mobileSlot = page.locator('button[aria-label*="DEMO-"]').filter({ visible: true }).first()
    await mobileSlot.click(); await detail.waitFor({ state: 'visible' })
    assert.ok((await detail.boundingBox()).width <= 390, 'Mobile detail fits viewport')
    await detail.getByRole('button', { name: 'Đóng chi tiết ca' }).click()
    for (const state of ['error', 'empty']) {
      await page.goto(`http://127.0.0.1:3018/calendar-layout-check?state=${state}`, { waitUntil: 'networkidle' })
      if (state === 'error') assert.equal(await page.locator('table, dl').count(), 0, 'Load error never becomes zero totals')
      else assert.equal(await page.locator('button[aria-label*="DEMO-"]').count(), 0)
    }
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ result: 'PASS', desktop: '1440x1000', mobile: '390x844', gridTop: Math.round(box.y), checks: ['seven columns fit', 'dialog roster', 'Escape and focus return', 'overflow day expansion', 'program, room and attention filters', '1280px laptop', 'responsive day view', 'mobile dialog', 'error and empty', 'no runtime errors'] }))
  } finally {
    cleanRoute()
    if (browser) await browser.close()
    server.kill('SIGTERM')
    if (server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 5000) })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
