// One redacted comparison of OA, template, and response/get.
// Does not send a Zalo message and does not print tokens.
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), true, { info() {}, error() {} })
const { createClient } = require('@supabase/supabase-js')

const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const loaded = { exports: {} }
  cache.set(file, loaded.exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', 'require', code)(loaded, loaded.exports, id => id === 'server-only' ? {} : id.startsWith('.') ? load(path.resolve(path.dirname(file), id.endsWith('.ts') ? id : id + '.ts')) : require(id))
  return loaded.exports
}

function psql(sql) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_vibe-academy-system', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' }).trim()
}

function endpoint(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return { protocol: url.protocol, host: url.host, pathname: url.pathname }
  } catch {
    return { protocol: null, host: null, pathname: null }
  }
}

async function main() {
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  if (host !== '127.0.0.1:54321') throw new Error('UNEXPECTED_DATABASE')
  const sends = psql(`
    select coalesce(floor(extract(epoch from min(sent_at)) * 1000)::bigint::text, ''),
           count(*) filter (where send_status in ('SENT', 'DELIVERED'))
    from public.tuition_zalo_sends;
  `)
  const [earliest, acceptedSends] = sends.split('|')
  const events = psql(`
    select coalesce(string_agg(event_type || ':' || count, ','), '')
    from (
      select event_type, count(*)::text as count
      from public.integration_webhook_events
      group by event_type
      order by event_type
    ) rows;
  `)
  const { probeTuitionResponseChannels } = load('lib/integrations/zalo/tuition-response-sync.ts')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const fromMs = Number(earliest || Date.now() - 24 * 60 * 60 * 1000)
  const toMs = Date.now()
  const probe = await probeTuitionResponseChannels(db, process.env, { fromMs, toMs })
  const report = {
    at: new Date().toISOString(),
    acceptedSends: Number(acceptedSends || 0),
    webhookEvents: events,
    callback: endpoint(process.env.ZALO_OAUTH_REDIRECT_URI),
    webhook: endpoint(process.env.ZALO_WEBHOOK_PUBLIC_URL),
    probe,
    messageSent: false,
  }
  const file = path.resolve(__dirname, '../docs/verification/execution-20261001/response-sync-probe.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}

main().catch((error) => {
  console.error(JSON.stringify({ result: 'DIAGNOSE_FAILED', name: error instanceof Error ? error.name : 'Error' }))
  process.exitCode = 1
})
