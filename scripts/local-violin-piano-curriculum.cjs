#!/usr/bin/env node
// Local, transactional authoring import. Default is a rollback dry run.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { buildPlan, counts } = require('./curriculum-violin-piano-plan.cjs')
const root = path.resolve(__dirname, '..')
const tables = ['curriculums', 'curriculum_levels', 'curriculum_subjects', 'curriculum_subject_components', 'curriculum_component_items']

function buildSql(apply = false) {
  const plan = JSON.stringify(buildPlan()).replaceAll("'", "''")
  return `begin;\ncreate temp table vp_plan(payload jsonb) on commit drop;\ninsert into vp_plan values('${plan}'::jsonb);\n${fs.readFileSync(path.join(__dirname, 'sql/violin-piano-authoring.sql'), 'utf8')}\n${apply ? 'commit' : 'rollback'};\n`
}

function localOrigin(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Refusing a non-local Supabase API.')
  }
  url.hostname = '127.0.0.1'
  return url.origin
}

function envValue(text, key) {
  const match = text.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`, 'm'))
  if (!match) throw new Error(`Missing ${key} in .env.local`)
  return match[1].replace(/^(['"])(.*)\1$/, '$2')
}

function verifyTarget({ appUrl, apiUrl, dbUrl, container, projectId, portBinding }) {
  if (localOrigin(appUrl) !== localOrigin(apiUrl)) throw new Error('App and local Supabase API differ.')
  const db = new URL(dbUrl)
  if (!['postgresql:', 'postgres:'].includes(db.protocol) || !['localhost', '127.0.0.1'].includes(db.hostname)
    || db.pathname !== '/postgres' || db.search || db.hash || !db.port) throw new Error('Refusing a non-local database.')
  if (!/^[A-Za-z0-9_-]+$/.test(projectId) || container !== `supabase_db_${projectId}`) throw new Error('Unexpected database container.')
  const ports = portBinding.trim().split(/\r?\n/).map(line => line.trim())
  if (!ports.some(line => ['127.0.0.1', '0.0.0.0', '[::]', '::', '[::1]'].some(host => line === `${host}:${db.port}`))) {
    throw new Error('Container database port does not match local Supabase status.')
  }
  return { api: localOrigin(apiUrl), container, databasePort: db.port }
}

function parseReport(output) {
  const line = output.split(/\r?\n/).find(line => line.startsWith('{') && line.includes('progress_unchanged'))
  if (!line) throw new Error('Database did not return an import verification report.')
  return JSON.parse(line)
}

function main(args = process.argv.slice(2)) {
  if (args.length > 1 || (args[0] && !['--manifest', '--dry-run', '--apply'].includes(args[0]))) {
    throw new Error('Usage: node scripts/local-violin-piano-curriculum.cjs [--manifest|--dry-run|--apply]')
  }
  if (args[0] === '--manifest') {
    console.log(JSON.stringify({ counts: counts(buildPlan()), programs: buildPlan() }, null, 2))
    return
  }
  if (process.cwd() !== root) throw new Error('Run from this repository root.')
  const apply = args[0] === '--apply'
  const env = fs.readFileSync(path.join(root, '.env.local'), 'utf8')
  const config = fs.readFileSync(path.join(root, 'supabase/config.toml'), 'utf8')
  const projectId = config.match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1]
  if (!projectId) throw new Error('Cannot resolve local Supabase project_id.')
  const status = JSON.parse(execFileSync(path.join(root, 'node_modules/.bin/supabase'), ['status', '-o', 'json'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const container = `supabase_db_${projectId}`
  const target = verifyTarget({
    appUrl: envValue(env, 'NEXT_PUBLIC_SUPABASE_URL'), apiUrl: status.API_URL, dbUrl: status.DB_URL, projectId, container,
    portBinding: execFileSync('docker', ['port', container, '5432/tcp'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
  })
  // Same SQL and transaction on the actual target before making a backup or writes.
  const execute = commit => parseReport(execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: buildSql(commit), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }))
  const preview = execute(false)
  if (!apply) {
    console.log(JSON.stringify({ mode: 'DRY_RUN_ROLLED_BACK', target, ...preview }, null, 2))
    return
  }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-curriculum-20261005-'))
  fs.chmodSync(folder, 0o700)
  const backup = path.join(folder, 'catalog-before.dump')
  const fd = fs.openSync(backup, 'wx', 0o600)
  try {
    execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc', '--no-owner', '--no-acl',
      ...tables.flatMap(table => ['-t', `public.${table}`])], { stdio: ['ignore', fd, 'pipe'] })
  } finally { fs.closeSync(fd) }
  if (fs.statSync(backup).size === 0) throw new Error('Empty catalog backup; import refused.')
  const report = execute(true)
  const result = { mode: 'APPLIED_LOCAL', target, backup, backup_scope: 'Five curriculum tables; not a full system recovery backup', ...report }
  const reportPath = path.join(folder, 'import-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ ...result, reportPath }, null, 2))
}

if (require.main === module) {
  try { main() } catch (error) {
    // Child-process errors may contain SQL/student data. Do not print raw stderr or credentials.
    console.error(error.status !== undefined ? 'Local command failed. Transaction was not confirmed; inspect the local database and rerun --dry-run before retrying.' : error.message)
    process.exitCode = 1
  }
}
module.exports = { buildSql, localOrigin, envValue, verifyTarget, parseReport, main }
