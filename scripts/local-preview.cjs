#!/usr/bin/env node
// Local workflow only: never changes application behavior or database state.
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { createHash } = require('node:crypto')
const { execFileSync, spawn } = require('node:child_process')
const ROOT = path.resolve(__dirname, '..')
const CACHE = '.next/cache'

function fingerprint(root = ROOT) {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(file => file && (
      file.startsWith('public/') ||
      /^(app|src|lib|components|styles|scripts)\/.*\.(tsx?|jsx?|mjs|cjs|css|scss|json|mdx)$/.test(file) ||
      /^(package(-lock)?\.json|tsconfig\.json|(next|postcss|tailwind)\.config\.[^.]+|proxy\.[jt]s|middleware\.[jt]s)$/.test(file)
    ))
  files.push(...fs.readdirSync(root).filter(file => /^\.env(?:\.(?:local|production|production\.local))?$/.test(file)))
  const hash = createHash('sha256')
  for (const file of [...new Set(files)].sort()) {
    hash.update(file + '\0')
    const absolute = path.join(root, file)
    hash.update(fs.existsSync(absolute) ? fs.readFileSync(absolute) : '<deleted>')
    hash.update('\0')
  }
  return hash.digest('hex')
}

function assertFresh(root = ROOT) {
  if (fs.existsSync(path.join(root, '.next/lock')) || fs.existsSync(path.join(root, CACHE, 'vibe-preview-pending.json'))) {
    throw Error('A build is active or incomplete. Finish npm run build successfully before preview.')
  }
  let marker, buildId
  try {
    marker = JSON.parse(fs.readFileSync(path.join(root, CACHE, 'vibe-preview.json'), 'utf8'))
    buildId = fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim()
  } catch { throw Error('No verified completed build. Stop dev, then run npm run build first.') }
  if (marker.buildId !== buildId || marker.fingerprint !== fingerprint(root)) {
    throw Error('Preview build is stale: source, config or environment changed. Stop dev and run npm run build again.')
  }
  return marker
}

async function portOpen(port) {
  const results = await Promise.all(['127.0.0.1', '::1'].map(host => new Promise(resolve => {
    const socket = net.connect({ host, port })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false) })
  })))
  return results.some(Boolean)
}

async function main(mode) {
  // Vercel/CI builds retain their existing build behavior. No local servers there.
  if ((mode === 'prepare' || mode === 'record') && (process.env.CI || process.env.VERCEL)) return
  if (mode === 'prepare') {
    for (const port of [3000]) {
      if (await portOpen(port)) throw Error(`Port ${port} is in use. Stop the local server with Ctrl+C before building; no process was killed.`)
    }
    fs.mkdirSync(path.join(ROOT, CACHE), { recursive: true })
    fs.writeFileSync(path.join(ROOT, CACHE, 'vibe-preview-pending.json'), JSON.stringify({ fingerprint: fingerprint() }))
    return
  }
  if (mode === 'record') {
    const pending = JSON.parse(fs.readFileSync(path.join(ROOT, CACHE, 'vibe-preview-pending.json'), 'utf8'))
    if (pending.fingerprint !== fingerprint()) throw Error('Source changed during build. Run npm run build again before preview.')
    const buildId = fs.readFileSync(path.join(ROOT, '.next/BUILD_ID'), 'utf8').trim()
    fs.writeFileSync(path.join(ROOT, CACHE, 'vibe-preview.json'), JSON.stringify({ ...pending, buildId, builtAt: new Date().toISOString() }))
    fs.unlinkSync(path.join(ROOT, CACHE, 'vibe-preview-pending.json'))
    console.log('Current local build verified for npm run preview.')
    return
  }
  if (mode !== 'preview') throw Error('Expected prepare, record, or preview.')
  const marker = assertFresh()
  if (await portOpen(3000)) throw Error('Port 3000 is already in use. Reuse that preview or stop it before starting another.')
  console.log(`Starting verified build from ${marker.builtAt} at http://localhost:3000`)
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', '3000'], { cwd: ROOT, stdio: 'inherit' })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
  child.on('exit', code => { process.exitCode = code ?? 0 })
}
if (require.main === module) main(process.argv[2] || 'preview').catch(error => { console.error(error.message); process.exitCode = 1 })
module.exports = { fingerprint, assertFresh }
