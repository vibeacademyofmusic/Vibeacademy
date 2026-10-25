import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const literal = value => `'${String(value).replaceAll("'", "''")}'`
export const releaseLock = [20261025, 830273]

// Split top-level SQL without treating function bodies, quotes or comments as
// transaction boundaries. Only the reviewed outer BEGIN/COMMIT may be removed.
export function sqlStatements(sql) {
  const result = []
  let start = 0, index = 0, command = ''
  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      index = end < 0 ? sql.length : end + 1
      command += ' '
    } else if (sql.startsWith('/*', index)) {
      let depth = 1
      index += 2
      while (index < sql.length && depth) {
        if (sql.startsWith('/*', index)) { depth++; index += 2 }
        else if (sql.startsWith('*/', index)) { depth--; index += 2 }
        else index++
      }
      if (depth) throw new Error('Unterminated SQL comment')
      command += ' '
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index++]
      const escaped = quote === "'" && /(?:^|\W)e$/i.test(command)
      let closed = false
      while (index < sql.length) {
        if (escaped && sql[index] === '\\') { index += 2; continue }
        if (sql[index++] === quote) {
          if (sql[index] === quote) index++
          else { closed = true; break }
        }
      }
      if (!closed) throw new Error('Unterminated SQL quote')
      command += ' quoted '
    } else if (sql[index] === '$' && /^\$(?:[a-z_][a-z_0-9]*)?\$/i.test(sql.slice(index))) {
      const tag = sql.slice(index).match(/^\$(?:[a-z_][a-z_0-9]*)?\$/i)[0]
      const end = sql.indexOf(tag, index + tag.length)
      if (end < 0) throw new Error('Unterminated SQL body')
      index = end + tag.length
      command += ' body '
    } else if (sql[index] === '\\') {
      throw new Error('psql commands are forbidden inside release migrations')
    } else if (sql[index] === ';') {
      index++
      if (command.trim()) result.push({ start, end: index, command: command.trim().replace(/\s+/g, ' ').toLowerCase() })
      start = index
      command = ''
    } else command += sql[index++]
  }
  if (command.trim()) throw new Error('Release SQL must end with a semicolon')
  return result
}

export function migrationBody(sql, transaction) {
  const statements = sqlStatements(sql)
  if (transaction === 'self') {
    if (statements[0]?.command !== 'begin' || statements.at(-1)?.command !== 'commit') throw new Error('Expected exactly one outer BEGIN/COMMIT')
    sql = sql.slice(statements[0].end, statements.at(-1).start)
    statements.shift(); statements.pop()
  } else if (transaction !== 'runner-wraps') throw new Error('Unknown transaction mode')
  for (const { command } of statements) {
    if (/^(begin|commit|rollback|end|abort|start transaction|prepare transaction)\b/.test(command)) throw new Error('Nested transaction control is forbidden')
  }
  return sql
}

export function readRelease(manifest, root) {
  const versions = new Set()
  const entries = manifest.migrations.map((entry, index) => {
    if (!/^\d{14}$/.test(entry.version) || versions.has(entry.version) || entry.order !== index + 1) throw new Error('Invalid migration order/version')
    versions.add(entry.version)
    const path = resolve(root, entry.file)
    if (!path.startsWith(resolve(root) + sep)) throw new Error('Migration is outside the checkout')
    const bytes = readFileSync(path)
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Checksum mismatch: ${entry.file}`)
    return { ...entry, body: migrationBody(bytes.toString('utf8'), entry.transaction) }
  })
  if (manifest.expected_ledger_count !== manifest.baseline_ledger_count + entries.length) throw new Error('Invalid expected ledger count')
  for (const version of manifest.prerequisites.already_recorded_do_not_rerun) {
    if (versions.has(version)) throw new Error('Release contains a historical migration')
  }
  return entries
}

const sentinel = entry => `position(${literal(entry.sentinel_contains)} in coalesce((${entry.sentinel_sql}), '')) > 0`
const recorded = entry => `exists(select 1 from supabase_migrations.schema_migrations where version = ${literal(entry.version)})`

export function preflightSql(manifest, entries) {
  const required = [...new Set([...manifest.prerequisites.must_exist, ...manifest.prerequisites.already_recorded_do_not_rerun])]
  return `do $caday_preflight$
  declare seen_gap boolean := false; applied integer := 0;
  begin
    ${required.map(version => `if not exists(select 1 from supabase_migrations.schema_migrations where version = ${literal(version)}) then raise exception 'CADAY_PREREQUISITE_MISSING: ${version}'; end if;`).join('\n')}
    ${manifest.prerequisites.must_be_absent.map(version => `if exists(select 1 from supabase_migrations.schema_migrations where version = ${literal(version)}) then raise exception 'CADAY_FORBIDDEN_VERSION: ${version}'; end if;`).join('\n')}
    ${entries.map(entry => `if ${recorded(entry)} then
      if seen_gap then raise exception 'CADAY_LEDGER_NOT_A_PREFIX: ${entry.version}'; end if;
      if exists(select 1 from supabase_migrations.schema_migrations where version = ${literal(entry.version)} and idempotency_key is distinct from ${literal(`caday-release:${entry.sha256}`)}) then raise exception 'CADAY_LEDGER_CHECKSUM_MISMATCH: ${entry.version}'; end if;
      if not (${sentinel(entry)}) then raise exception 'CADAY_APPLIED_SCHEMA_MISSING: ${entry.version}'; end if;
      applied := applied + 1;
    else
      seen_gap := true;
      if ${sentinel(entry)} then raise exception 'CADAY_AMBIGUOUS_MIGRATION: ${entry.version}. Existing schema without a verified ledger; no SQL replay or ledger repair.'; end if;
    end if;`).join('\n')}
    if (select count(*) from supabase_migrations.schema_migrations) <> ${manifest.baseline_ledger_count} + applied then raise exception 'CADAY_BASELINE_LEDGER_CHANGED'; end if;
  end; $caday_preflight$;`
}

export function transactionSql(entry) {
  return `${entry.body}\n
  do $caday_postcondition$ begin
    if not (${sentinel(entry)}) then raise exception 'CADAY_MIGRATION_POSTCONDITION: ${entry.version}'; end if;
  end; $caday_postcondition$;
  insert into supabase_migrations.schema_migrations(version, name, created_by, idempotency_key)
  values (${literal(entry.version)}, ${literal(entry.file)}, 'caday-release-runner', ${literal(`caday-release:${entry.sha256}`)});`
}

export function buildReleaseSql(manifest, entries, { stopBefore } = {}) {
  if (stopBefore && !entries.some(entry => entry.version === stopBefore)) throw new Error('Unknown --stop-before version')
  const selected = stopBefore ? entries.slice(0, entries.findIndex(entry => entry.version === stopBefore)) : entries
  return `\\set ON_ERROR_STOP on
\\set VERBOSITY terse
set statement_timeout = '10min';
set lock_timeout = '5s';
do $caday_lock$ begin
  if not pg_try_advisory_lock(${releaseLock.join(',')}) then raise exception 'CADAY_RELEASE_BUSY'; end if;
end; $caday_lock$;
${preflightSql(manifest, entries)}
${selected.map(entry => `begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
${preflightSql(manifest, entries)}
select ${recorded(entry)} as caday_skip \\gset
\\if :caday_skip
\\echo skip ${entry.version}
\\else
${transactionSql(entry)}
\\echo applied ${entry.version}
\\endif
commit;`).join('\n')}
${preflightSql(manifest, entries)}
select count(*) as ledger_count from supabase_migrations.schema_migrations;
select pg_advisory_unlock(${releaseLock.join(',')});
`
}
