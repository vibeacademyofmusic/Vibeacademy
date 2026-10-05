const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process')
const root = path.resolve(__dirname, '..'), label = 'vn.vibeacademy.local.zalo-maintenance'
const file = path.join(os.homedir(), 'Library/LaunchAgents', label + '.plist')
const target = `gui/${process.getuid()}/${label}`
const action = process.argv[2] || 'status'
if (process.platform !== 'darwin' || root !== '/Users/macbookair/vibe-academy-system') throw Error('This scheduler belongs to the MAIN Mac workspace only')
if (action === 'start') {
  require('@next/env').loadEnvConfig(root, true, { info() {}, error() {} })
  const value = Number(process.env.ZALO_RENEWAL_CHECK_SECONDS || 600)
  const interval = Number.isInteger(value) && value >= 60 && value <= 3600 ? value : 600
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const logs = path.join(os.homedir(), 'Library/Logs/VibeAcademy')
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.mkdirSync(logs, { recursive: true, mode: 0o700 })
  const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>${escape(path.join(root, 'scripts/zalo-maintenance.cjs'))}</string></array>
<key>WorkingDirectory</key><string>${escape(root)}</string><key>RunAtLoad</key><true/><key>StartInterval</key><integer>${interval}</integer>
<key>StandardOutPath</key><string>${escape(path.join(logs, 'zalo-maintenance.log'))}</string><key>StandardErrorPath</key><string>${escape(path.join(logs, 'zalo-maintenance-error.log'))}</string>
</dict></plist>`
  const loaded = cp.spawnSync('launchctl', ['print', target], { encoding: 'utf8' }).status === 0
  const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === plist
  if (loaded && !same) cp.spawnSync('launchctl', ['bootout', target])
  fs.writeFileSync(file, plist, { mode: 0o600 })
  if (!loaded || !same) {
    const result = cp.spawnSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, file], { encoding: 'utf8' })
    if (result.status !== 0) throw Error('Scheduler install failed')
  }
  console.log(`Scheduler installed: ${label}; interval ${interval}s; report dispatch requires its separate send gate`)
} else if (action === 'status') {
  const p = cp.spawnSync('launchctl', ['print', target], { encoding: 'utf8' })
  console.log(JSON.stringify({ scheduler: label, installed: p.status === 0, state: p.stdout?.match(/state = ([^\n]+)/)?.[1], runs: p.stdout?.match(/runs = (\d+)/)?.[1], intervalSeconds: p.stdout?.match(/run interval = (\d+)/)?.[1], lastExit: p.stdout?.match(/last exit code = (\d+)/)?.[1] }))
  const r = cp.spawnSync(process.execPath, [path.join(root, 'scripts/zalo-maintenance.cjs'), '--status'], { stdio: 'inherit', cwd: root }); process.exitCode = r.status || 0
} else throw Error('Supported actions: start, status')
