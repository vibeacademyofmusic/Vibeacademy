import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(new URL('../docs/releases/20261025-caday-release-manifest.json', import.meta.url)))

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function psql(sql, { tuples = false } = {}) {
  const container = process.env.CADAY_DOCKER_CONTAINER
  const database = process.env.CADAY_DATABASE_NAME || 'postgres'
  const flags = ['-v', 'ON_ERROR_STOP=1', '-f', '-']
  if (tuples) flags.unshift('-q', '-t', '-A')
  let command = 'psql'
  let args = [process.env.CADAY_DATABASE_URL, ...flags]
  if (container) {
    command = 'docker'
    args = ['exec', '-i', '-u', 'postgres', container, 'psql', '-U', 'supabase_admin', '-d', database, ...flags]
  } else if (!process.env.CADAY_DATABASE_URL) {
    fail('Set CADAY_DATABASE_URL, or CADAY_DOCKER_CONTAINER for an isolated rehearsal.')
  }
  return spawnSync(command, args, { input: sql, encoding: 'utf8' })
}

function query(sql) {
  const result = psql(sql, { tuples: true })
  if (result.status !== 0) fail(result.stderr || result.stdout || 'query failed')
  return (result.stdout || '').trim()
}

function apply(sql) {
  const result = psql(sql)
  if (result.status !== 0) {
    process.stderr.write(result.stderr || '')
    process.stderr.write(result.stdout || '')
    return false
  }
  if (result.stdout) process.stdout.write(result.stdout)
  return true
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(new URL(`../${file}`, import.meta.url))).digest('hex')
}

function recorded(version) {
  const row = query(`select version || chr(9) || coalesce(idempotency_key, '') from supabase_migrations.schema_migrations where version = '${version}'`)
  if (!row) return null
  const [found, key] = row.split('\t')
  return { version: found, key }
}

function ledgerSql(entry) {
  const key = `caday-release:${entry.sha256}`
  return `insert into supabase_migrations.schema_migrations (version, name, created_by, idempotency_key) values ('${entry.version}', '${entry.file}', 'caday-release-runner', '${key}');`
}

function sentinelReady(entry) {
  return query(entry.sentinel_sql).includes(entry.sentinel_contains)
}

function assertPrerequisites() {
  const present = new Set(query(
    `select coalesce(string_agg(version, ','), '') from supabase_migrations.schema_migrations where version in (${manifest.prerequisites.must_exist.map(version => `'${version}'`).join(',')})`,
  ).split(',').filter(Boolean))
  for (const version of manifest.prerequisites.must_exist) {
    if (!present.has(version)) fail(`Prerequisite ${version} is not in the ledger.`)
  }
  const forbidden = query(
    `select coalesce(string_agg(version, ','), '') from supabase_migrations.schema_migrations where version in (${manifest.prerequisites.must_be_absent.map(version => `'${version}'`).join(',')})`,
  )
  if (forbidden) fail(`Refusing to continue because ${forbidden} is already recorded.`)
  for (const version of manifest.prerequisites.already_recorded_do_not_rerun) {
    if (manifest.migrations.some(entry => entry.version === version)) fail(`${version} must not be in the eight-file release.`)
  }
  const recordedDoNotRerun = new Set(query(
    `select coalesce(string_agg(version, ','), '') from supabase_migrations.schema_migrations where version in (${manifest.prerequisites.already_recorded_do_not_rerun.map(version => `'${version}'`).join(',')})`,
  ).split(',').filter(Boolean))
  for (const version of manifest.prerequisites.already_recorded_do_not_rerun) {
    if (!recordedDoNotRerun.has(version)) fail(`${version} is not recorded. This runner does not apply it.`)
  }
}

function assertChecksums() {
  for (const entry of manifest.migrations) {
    const actual = sha256(entry.file)
    if (actual !== entry.sha256) fail(`${entry.file} checksum ${actual} does not match the manifest.`)
    const ownBegin = readFileSync(new URL(`../${entry.file}`, import.meta.url), 'utf8').split('\n').some(line => line.trim().toLowerCase() === 'begin;')
    const ownCommit = readFileSync(new URL(`../${entry.file}`, import.meta.url), 'utf8').split('\n').some(line => line.trim().toLowerCase() === 'commit;')
    if (entry.transaction === 'self' && !(ownBegin && ownCommit)) fail(`${entry.file} is marked self-committing but has no begin/commit pair.`)
    if (entry.transaction === 'runner-wraps' && (ownBegin || ownCommit)) fail(`${entry.file} cannot be wrapped because it already has a begin or commit.`)
  }
}

function skipOrStop(entry) {
  const row = recorded(entry.version)
  if (!row) return false
  const expected = `caday-release:${entry.sha256}`
  if (row.key !== expected) fail(`${entry.version} is recorded with idempotency key ${row.key || '(empty)'}, not ${expected}.`)
  process.stdout.write(`skip ${entry.version}\n`)
  return true
}

async function pauseBeforeLedger(entry) {
  if (process.env.CADAY_PAUSE_BEFORE_LEDGER !== entry.version) return
  writeFileSync('/tmp/caday-release-paused-before-ledger', entry.version)
  process.stdout.write(`paused before ledger ${entry.version}\n`)
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync('/tmp/caday-release-continue')) return
    await sleep(500)
  }
  fail(`Paused before the ledger row for ${entry.version}. The file was not run again.`)
}

async function repair(version) {
  const entry = manifest.migrations.find(item => item.version === version)
  if (!entry) fail(`${version} is not one of the eight release migrations.`)
  if (skipOrStop(entry)) return
  if (!sentinelReady(entry)) fail(`${version} has no completed sentinel. Refusing to record the ledger without re-running the file.`)
  if (!apply(`begin;\n${ledgerSql(entry)}\ncommit;\n`)) fail(`Could not record the ledger for ${version}.`)
  process.stdout.write(`repaired ledger ${version}\n`)
}

async function main() {
  const args = process.argv.slice(2)
  let stopBefore = null
  let repairVersion = null
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--stop-before') stopBefore = args[++index]
    else if (args[index] === '--repair-ledger') repairVersion = args[++index]
    else fail(`Unknown argument ${args[index]}`)
  }
  if (!root) fail('Could not resolve the checkout.')
  assertChecksums()
  assertPrerequisites()
  if (repairVersion) {
    await repair(repairVersion)
    return
  }
  for (const entry of manifest.migrations) {
    if (entry.version === stopBefore) {
      process.stdout.write(`stop before ${entry.version}\n`)
      return
    }
    if (skipOrStop(entry)) continue
    process.stdout.write(`apply ${entry.version}\n`)
    if (entry.transaction === 'self') {
      const sql = readFileSync(new URL(`../${entry.file}`, import.meta.url), 'utf8')
      if (!apply(sql)) fail(`Stopped at ${entry.version}. Earlier files were left as recorded. This file was not recorded.`)
      await pauseBeforeLedger(entry)
      if (!sentinelReady(entry)) fail(`${entry.version} committed without its sentinel. Ledger was not recorded.`)
      if (!apply(`begin;\n${ledgerSql(entry)}\ncommit;\n`)) fail(`Stopped after ${entry.version} committed and before its ledger row. Run --repair-ledger ${entry.version} after checking the sentinel. Do not run the file again.`)
    } else {
      const sql = readFileSync(new URL(`../${entry.file}`, import.meta.url), 'utf8')
      const wrapped = `begin;\nset local lock_timeout = '5s';\nset local statement_timeout = '10min';\n${sql}\n${ledgerSql(entry)}\ncommit;\n`
      if (!apply(wrapped)) fail(`Stopped at ${entry.version}. The wrapped file rolled back and was not recorded.`)
    }
    process.stdout.write(`recorded ${entry.version}\n`)
  }
  const count = Number(query('select count(*) from supabase_migrations.schema_migrations'))
  if (count !== manifest.expected_ledger_count) fail(`Ledger count is ${count}; expected ${manifest.expected_ledger_count}.`)
  process.stdout.write(`ledger ${count}\n`)
}

main()
