// Component browser regression: real WeeklyBoard/React/CSS, synthetic roster.
// Router/link adapters keep this independent of accounts and production data.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { chromium } from 'playwright'

const root = process.cwd()
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'caday-browser-'))
await fs.symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir')
const output = process.env.CADAY_BROWSER_ARTIFACTS || path.join(dir, 'evidence')
await fs.mkdir(output, { recursive: true })
await fs.writeFile(path.join(dir, 'link.tsx'), `import React from 'react'; export default function Link({prefetch,children,...props}) { return <a {...props}>{children}</a> }`)
await fs.writeFile(path.join(dir, 'navigation.ts'), `export function useRouter(){return {refresh(){window.fixtureRefresh?.()}}}`)
const shared = `import React from 'react';import WeeklyBoard from ${JSON.stringify(path.join(root, 'app/admin/coordination/WeeklyBoard'))};`
await fs.writeFile(path.join(dir, 'server.tsx'), shared + `import{renderToString}from'react-dom/server';export function render(props){return renderToString(<WeeklyBoard {...props}/>)};`)
await fs.writeFile(path.join(dir, 'client.tsx'), shared + `import{hydrateRoot}from'react-dom/client';window.hydrationErrors=[];const root=hydrateRoot(document.getElementById('root'),<WeeklyBoard {...window.fixtureProps}/>,{onRecoverableError:error=>window.hydrationErrors.push(error.message)});window.fixtureUpdate=props=>root.render(<WeeklyBoard {...props}/>);window.hydrated=true;`)
const options = { bundle: true, absWorkingDir: root, jsx: 'automatic',
  alias: { '@': root, 'next/link': path.join(dir, 'link.tsx'), 'next/navigation': path.join(dir, 'navigation.ts') },
  define: { 'process.env.NODE_ENV': '"development"' } }
await build({ ...options, entryPoints: [path.join(dir, 'server.tsx')], outfile: path.join(dir, 'server.cjs'), platform: 'node', external: ['react', 'react-dom/server', 'react/jsx-runtime'] })
await build({ ...options, entryPoints: [path.join(dir, 'client.tsx')], outfile: path.join(dir, 'client.js'), platform: 'browser' })
const { render } = await import(pathToFileURL(path.join(dir, 'server.cjs')).href)
const person = (id, attendance = null) => ({ enrollment_id: id, student_id: id, name: `Học viên kiểm thử ${id}`, attendance })
const row = { id: 'session', session_id: 'session', schedule_id: 'schedule', class_id: 'class', roster_date: '2026-10-26', starts_at: '2026-10-26T09:00:00Z', ends_at: '2026-10-26T10:30:00Z', original_starts_at: null, status: 'SCHEDULED', occurrence_type: 'MAKEUP', class_name: 'Ca kiểm thử', class_code: 'TEST-G1', branch_id: 'branch', branch_name: 'Cần Thơ · kiểm thử', curriculum_id: null, program_name: 'Guitar', room_id: 'room', room_name: 'Guitar 1', room_capacity: 6, class_capacity: 6, teacher_id: 'teacher', teacher_name: 'Giáo viên kiểm thử', assignment_type: 'PRIMARY', roster: [person('A'), person('B')] }
const props = { snapshot: { version: 1, monday: '2026-10-26', snapshot_at: '2026-10-26T08:00:00Z', branches: [{ id: 'branch', name: row.branch_name }], rows: [row] }, error: null, reference: null, date: '2026-10-26', branch: '', view: 'week' }
const globals = (await fs.readFile(path.join(root, 'app/globals.css'), 'utf8')).split('/* VIBE-CONG-LUONG-UX-V1-APPROVED:')[1]
const server = http.createServer(async (request, response) => {
  if (request.url === '/client.js' || request.url === '/client.css') {
    response.setHeader('Content-Type', request.url.endsWith('.js') ? 'application/javascript' : 'text/css')
    response.end(await fs.readFile(path.join(dir, request.url.slice(1))))
  } else {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/client.css"><style>/* VIBE-CONG-LUONG-UX-V1-APPROVED:${globals}\nbody{font-family:Arial;margin:0;padding:20px}*{box-sizing:border-box}</style></head><body class="vibe-admin"><div id="root">${render(props)}</div><script>window.fixtureProps=${JSON.stringify(props)}</script><script src="/client.js"></script></body></html>`)
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CADAY_CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-gpu'], headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Los_Angeles', locale: 'vi-VN' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  // Simulate another ICU locale ordering. Date/time keys must use parts, not
  // locale-formatted strings. No suppression of hydration warnings is allowed.
  await page.addInitScript(() => {
    const Native = Intl.DateTimeFormat
    Intl.DateTimeFormat = new Proxy(Native, { construct(target, args) {
      const instance = new target(...args)
      if (args[0] === 'en-CA' || args[0] === 'en-GB') Object.defineProperty(instance, 'format', { value: () => 'DIFFERENT_LOCALE_FORMAT' })
      return instance
    } })
  })
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await page.waitForFunction(() => window.hydrated)
  const slot = page.getByRole('button', { name: /16:00–17:30, Guitar.*2 học viên/ }).filter({ visible: true })
  await slot.click()
  const detail = page.getByRole('dialog')
  await detail.waitFor({ state: 'visible' })
  assert.match(await detail.innerText(), /2\/6 học viên/)
  assert.match(await detail.innerText(), /Học viên kiểm thử B/)
  assert.match(await detail.innerText(), /kể cả học viên của ca khác/)
  await page.screenshot({ path: path.join(output, 'detail.png') })
  await page.keyboard.press('Escape')
  await detail.waitFor({ state: 'hidden' })
  assert.equal(await slot.evaluate(element => element === document.activeElement), true)
  await page.evaluate(() => {
    window.fixtureRefresh = () => {
      const props = structuredClone(window.fixtureProps)
      props.snapshot.rows[0].roster[1].attendance = 'PRESENT'
      window.fixtureUpdate(props)
    }
  })
  await page.getByRole('button', { name: 'Làm mới' }).click()
  await slot.click()
  assert.match(await detail.innerText(), /Có mặt 1 · Vắng 0 · Chưa điểm danh 1/)
  await page.getByRole('button', { name: 'Đóng chi tiết ca' }).click()
  await page.screenshot({ path: path.join(output, 'desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /16:00–17:30, Guitar.*2 học viên/ }).filter({ visible: true }).waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: path.join(output, 'mobile.png') })
  await page.evaluate(() => window.fixtureUpdate({ ...window.fixtureProps, snapshot: null, error: 'Không tải được lịch kiểm thử' }))
  await page.getByRole('alert').waitFor()
  assert.equal(await page.getByRole('definition').count(), 0)
  assert.deepEqual(await page.evaluate(() => window.hydrationErrors), [])
  assert.deepEqual(errors, [])
  console.log('PASS: SSR hydration across locale formats, guest roster, attendance refresh, Escape/focus, mobile overflow, and failed-load state.')
  console.log(`Browser evidence: ${output}`)
} finally {
  if (browser) await browser.close()
  await new Promise(resolve => server.close(resolve))
  // Evidence is retained; generated bundles contain synthetic records only.
}
