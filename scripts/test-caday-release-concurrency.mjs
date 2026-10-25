// Real-connection regression, only against a new disposable database in the
// local Supabase Docker container. Does not connect to any hosted database.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { buildReleaseSql } from './lib/caday-release.mjs'

const container = process.env.SCHEDULE_TEST_DB_CONTAINER || 'supabase_db_vibe-academy-system'
assert.match(container, /^supabase_db_vibe-[a-z0-9-]+$/)
const database = `caday_runner_test_${process.pid}`
const args = db => ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', db, '-XAt', '-v', 'ON_ERROR_STOP=1', '-f', '-']
const query = (sql, db = database) => execFileSync('docker', args(db), { input: sql, encoding: 'utf8' }).trim()
const manifest = { baseline_ledger_count: 1, expected_ledger_count: 3,
  prerequisites: { must_exist: ['20260101000000'], must_be_absent: [], already_recorded_do_not_rerun: [] } }
const entries = [1, 2].map(n => ({ version: `2026010200000${n}`, file: `fixture-${n}.sql`, sha256: String(n).repeat(64),
  body: `create table public.test_${n}(id integer); insert into public.test_${n} values(1);`,
  sentinel_sql: `select coalesce(to_regclass('public.test_${n}')::text,'')`, sentinel_contains: `test_${n}` }))
const sql = buildReleaseSql(manifest, entries)
const reset = () => query(`drop schema if exists supabase_migrations cascade; drop schema public cascade; create schema public;
  create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,created_by text,idempotency_key text);
  insert into supabase_migrations.schema_migrations(version) values('20260101000000');`)
const active = new Set()
function session(source, marker = 'never') {
  const child = spawn('docker', args(database))
  active.add(child)
  let output = '', readyResolve
  const ready = new Promise(resolve => { readyResolve = resolve })
  child.stdout.on('data', chunk => { output += chunk; if (output.includes(marker)) readyResolve() })
  child.stderr.on('data', chunk => { output += chunk })
  const done = new Promise(resolve => child.on('close', code => { active.delete(child); readyResolve(); resolve({ code, output }) }))
  child.stdin.on('error', () => {})
  child.stdin.end(source)
  return { ready, done }
}
async function reached(job, marker) {
  let timer
  try {
    await Promise.race([job.ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Missing connection checkpoint')), 15000) })])
    // The database session must still be sleeping at the named checkpoint.
    assert.equal(query(`select count(*) from pg_stat_activity where datname='${database}' and application_name='${marker}' and wait_event='PgSleep'`), '1')
  } finally { clearTimeout(timer) }
}
const terminate = name => query(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${database}' and application_name='${name}'`)
const count = () => Number(query('select count(*) from supabase_migrations.schema_migrations'))
query(`create database ${database};`, 'postgres')
try {
  reset()
  const held = session(`set application_name='caday_before';\n` + sql.replace(/^commit;$/m, "select 'before_checkpoint'; select pg_sleep(30);\ncommit;"), 'before_checkpoint')
  await reached(held, 'caday_before')
  const contender = await session(sql).done
  assert.notEqual(contender.code, 0)
  assert.match(contender.output, /CADAY_RELEASE_BUSY/)
  terminate('caday_before')
  assert.notEqual((await held.done).code, 0)
  assert.equal(count(), 1)
  assert.equal(query("select to_regclass('public.test_1') is null"), 't')
  let finished = await session(sql).done
  assert.equal(finished.code, 0, finished.output)
  assert.equal(count(), 3)
  console.log('PASS: concurrent runner refused; connection loss before commit rolls back DDL and ledger; retry succeeds.')

  reset()
  const committed = session(`set application_name='caday_after';\n` + sql.replace(/^commit;$/m, "commit;\nselect 'after_checkpoint'; select pg_sleep(30);"), 'after_checkpoint')
  await reached(committed, 'caday_after')
  terminate('caday_after')
  assert.notEqual((await committed.done).code, 0)
  assert.equal(count(), 2)
  finished = await session(sql).done
  assert.equal(finished.code, 0, finished.output)
  assert.match(finished.output, /skip 20260102000001/)
  assert.equal(count(), 3)
  assert.equal(query('select count(*) from public.test_1'), '1')
  finished = await session(sql).done
  assert.equal(finished.code, 0, finished.output)
  assert.equal(count(), 3)
  console.log('PASS: connection loss after commit leaves a complete ledger; retry skips committed SQL; repeated run is unchanged.')
} finally {
  query(`select pg_terminate_backend(pid) from pg_stat_activity where datname='${database}'`, 'postgres')
  for (const child of active) child.kill('SIGTERM')
  query(`drop database ${database};`, 'postgres')
}
