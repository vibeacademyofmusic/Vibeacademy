import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { PGlite } from '@electric-sql/pglite'
import { buildReleaseSql, migrationBody, preflightSql, readRelease, transactionSql } from '../scripts/lib/caday-release.mjs'

const manifest = { baseline_ledger_count: 1, expected_ledger_count: 3,
  prerequisites: { must_exist: ['20260101000000'], must_be_absent: ['19990101000000'], already_recorded_do_not_rerun: ['20260101000000'] } }
const entries = [1, 2].map(n => ({ version: `2026010200000${n}`, file: `test-${n}.sql`, sha256: String(n).repeat(64),
  body: `create table public.test_${n}(id integer); insert into public.test_${n} values(1);`,
  sentinel_sql: `select coalesce(to_regclass('public.test_${n}')::text, '')`, sentinel_contains: `test_${n}` }))
async function fixture(fn) {
  const db = new PGlite()
  try {
    await db.exec(`create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key, name text, created_by text, idempotency_key text);
      insert into supabase_migrations.schema_migrations(version) values('20260101000000');`)
    await fn(db)
  } finally { await db.close() }
}
const preflight = db => db.exec(preflightSql(manifest, entries))

test('a real SQL failure rolls back DDL, data and ledger together; retry applies once', () => fixture(async db => {
  await preflight(db)
  await assert.rejects(db.exec(`begin; ${transactionSql(entries[0])} select 1/0; commit;`), /division by zero/)
  await db.exec('rollback;')
  assert.equal((await db.query("select to_regclass('public.test_1') as relation")).rows[0].relation, null)
  assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n, 1)
  await preflight(db)
  await db.exec(`begin; ${transactionSql(entries[0])} commit;`)
  await preflight(db)
  assert.equal((await db.query('select count(*)::int as n from test_1')).rows[0].n, 1)
}))
test('a ledger insertion failure also rolls back the migration body', () => fixture(async db => {
  await db.exec("alter table supabase_migrations.schema_migrations add constraint refuse_release check(version='20260101000000');")
  await assert.rejects(db.exec(`begin; ${transactionSql(entries[0])} commit;`), /refuse_release/)
  await db.exec('rollback;')
  assert.equal((await db.query("select to_regclass('public.test_1') as relation")).rows[0].relation, null)
}))
test('existing sentinel without ledger is refused without repairing or replaying', () => fixture(async db => {
  await db.exec('create table test_1(id int);')
  await assert.rejects(preflight(db), /CADAY_AMBIGUOUS_MIGRATION/)
  assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n, 1)
}))
test('wrong checksum, missing schema, ledger holes and changed baseline are refused', async t => {
  await t.test('wrong checksum', () => fixture(async db => {
    await db.exec(`begin; ${transactionSql(entries[0])} commit; update supabase_migrations.schema_migrations set idempotency_key='wrong' where version='${entries[0].version}';`)
    await assert.rejects(preflight(db), /CADAY_LEDGER_CHECKSUM_MISMATCH/)
  }))
  await t.test('missing schema', () => fixture(async db => {
    await db.exec(`begin; ${transactionSql(entries[0])} commit; drop table test_1;`)
    await assert.rejects(preflight(db), /CADAY_APPLIED_SCHEMA_MISSING/)
  }))
  await t.test('hole', () => fixture(async db => {
    await db.exec(`begin; ${transactionSql(entries[1])} commit;`)
    await assert.rejects(preflight(db), /CADAY_LEDGER_NOT_A_PREFIX/)
  }))
  await t.test('extra baseline row', () => fixture(async db => {
    await db.exec("insert into supabase_migrations.schema_migrations(version) values('20260101000001');")
    await assert.rejects(preflight(db), /CADAY_BASELINE_LEDGER_CHANGED/)
  }))
})
test('SQL boundaries preserve quoted/function bodies and reject nested commits and psql commands', () => {
  const body = "create function f() returns text language plpgsql as $f$ begin return 'commit;'; end; $f$; /* nested /* commit; */ comment */"
  assert.equal(migrationBody(`-- header\nbegin;\n${body}\ncommit;`, 'self').trim(), body.split(' /*')[0])
  assert.throws(() => migrationBody('begin; create table t(id int); commit; select 1; commit;', 'self'), /Nested transaction/)
  assert.throws(() => migrationBody('select 1;\n\\! echo bad', 'runner-wraps'), /psql commands/)
  assert.throws(() => migrationBody('begin; select 1;', 'self'), /outer/)
})
test('actual eight files validate, preserve function bodies and have one shared connection lock', () => {
  const actual = JSON.parse(readFileSync('docs/releases/20261025-caday-release-manifest.json'))
  const files = readRelease(actual, process.cwd())
  assert.equal(files.length, 8)
  const sql = buildReleaseSql(actual, files)
  assert.equal((sql.match(/pg_try_advisory_lock/g) || []).length, 1)
  assert.equal((sql.match(/^commit;$/gm) || []).length, 8)
  assert.throws(() => buildReleaseSql(actual, files, { stopBefore: 'typo' }), /Unknown/)
})
test('legacy repair is refused before any database process is launched', () => {
  const result = spawnSync(process.execPath, ['scripts/apply-caday-release-migrations.mjs', '--repair-ledger', entries[0].version], { encoding: 'utf8', env: { PATH: '' } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /CADAY_REPAIR_DISABLED/)
})
