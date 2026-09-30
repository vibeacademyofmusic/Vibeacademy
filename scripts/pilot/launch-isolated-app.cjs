// Copies application source, not secrets or browser sessions, into a local test checkout.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../..')
const target = '/private/tmp/vibe-execution-20260930/app'
fs.mkdirSync(target, { recursive: true })
const roots = ['package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json', 'next-env.d.ts', 'postcss.config.mjs', 'proxy.ts', 'instrumentation.ts']
const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(p => /^(app|lib|public)\//.test(p) || roots.includes(p))
for (const p of fs.readdirSync(path.join(root, 'lib/observability'))) files.push('lib/observability/' + p)
const manifest = {}
for (const p of new Set(files)) {
  if (!fs.existsSync(path.join(root, p))) continue
  fs.mkdirSync(path.dirname(path.join(target, p)), { recursive: true })
  fs.copyFileSync(path.join(root, p), path.join(target, p))
  manifest[p] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')
}
if (!fs.existsSync(path.join(target, 'node_modules'))) fs.symlinkSync(path.join(root, 'node_modules'), path.join(target, 'node_modules'))
// The synthetic browser uses 127.0.0.1 to keep its cookies separate from localhost.
// Allow only that loopback origin for dev assets; production config is untouched.
const testConfig = path.join(target, 'next.config.ts')
fs.writeFileSync(testConfig, fs.readFileSync(testConfig, 'utf8').replace('const nextConfig: NextConfig = {', "const nextConfig: NextConfig = {\n  allowedDevOrigins: ['127.0.0.1'],"))
manifest['next.config.ts'] = crypto.createHash('sha256').update(fs.readFileSync(testConfig)).digest('hex')
fs.writeFileSync(path.join(root, 'docs/verification/execution-20260930/raw/isolated-app-source.json'), JSON.stringify(manifest, null, 2) + '\n')
const status = execFileSync(path.join(root, 'node_modules/.bin/supabase'), ['status', '--workdir', '/private/tmp/vibe-execution-20260930', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const local = Object.fromEntries([...status.matchAll(/^([A-Z0-9_]+)="([^\"]*)"$/gm)].map(m => [m[1], m[2]]))
if (local.API_URL !== 'http://127.0.0.1:56321') throw Error('Wrong isolated platform')
const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_OPTIONS: '--require=' + path.join(root, 'scripts/pilot/local-network-guard.cjs'),
  NEXT_TELEMETRY_DISABLED: '1', ZALO_PILOT_OUTBOUND: 'disabled',
  NEXT_PUBLIC_SUPABASE_URL: local.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY }
console.log('Isolated app: http://127.0.0.1:3001; local network guard and Zalo block active; no gateway credentials.')
const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '-p', '3001'], { cwd: target, env, stdio: 'inherit' })
process.on('SIGTERM', () => child.kill('SIGTERM'))
child.on('exit', code => { process.exitCode = code ?? 1 })
