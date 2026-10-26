import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildReleaseSql, readRelease } from './lib/caday-release.mjs'

function main() {
  const args = process.argv.slice(2)
  let stopBefore
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--repair-ledger') throw new Error('CADAY_REPAIR_DISABLED: a sentinel is not proof of completion. Investigate on an untouched pre-release clone; never mark an ambiguous migration as applied.')
    if (args[index] !== '--stop-before' || !args[index + 1]) throw new Error(`Unknown or incomplete argument: ${args[index]}`)
    stopBefore = args[++index]
  }
  const root = new URL('../', import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('docs/releases/20261025-caday-release-manifest.json', root), 'utf8'))
  const sql = buildReleaseSql(manifest, readRelease(manifest, fileURLToPath(root)), { stopBefore })
  const flags = ['-X', '-v', 'ON_ERROR_STOP=1', '-f', '-']
  const container = process.env.CADAY_DOCKER_CONTAINER
  const database = process.env.CADAY_DATABASE_NAME || 'postgres'
  if (!container && !process.env.CADAY_DATABASE_URL) throw new Error('Set CADAY_DATABASE_URL, or CADAY_DOCKER_CONTAINER for an isolated rehearsal.')
  // One connection owns the lock through every COMMIT. No URL in argv/logs.
  const result = spawnSync(container ? 'docker' : 'psql', container
    ? ['exec', '-i', '-u', 'postgres', container, 'psql', '-U', 'supabase_admin', '-d', database, ...flags]
    : flags, {
    input: sql, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...(!container ? { PGDATABASE: process.env.CADAY_DATABASE_URL } : {}) },
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr)
    throw new Error('CADAY_RELEASE_STOPPED: reconnect and rerun the same verified release. Committed files have their ledger row; interrupted files roll back. Ambiguous legacy state is refused.')
  }
}

try { main() } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'CADAY_RELEASE_FAILED'}\n`)
  process.exitCode = 1
}
