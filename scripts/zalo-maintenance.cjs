// Runs the SAME TypeScript manager as Next, in an independent supervised process.
const path = require('node:path'), fs = require('node:fs'), ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')
require('@next/env').loadEnvConfig(path.resolve(__dirname, '..'), true, { info() {}, error() {} })
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  const m = { exports: {} }; cache.set(file, m.exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', 'require', code)(m, m.exports, id => id === 'server-only' ? {} : id.startsWith('.') ? load(path.resolve(path.dirname(file), id + '.ts')) : require(id))
  return m.exports
}
async function main() {
  const env = process.env
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw Error('CONFIGURATION_MISSING')
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  if (process.argv.includes('--status')) {
    const { data, error } = await db.rpc('zalo_scheduler_health')
    if (error) throw Error('HEALTH_UNAVAILABLE')
    console.log(JSON.stringify({ component: 'zalo_maintenance', health: data }))
    return
  }
  const { maintainZaloCredentials } = load(path.resolve(__dirname, '../lib/integrations/zalo/maintenance.ts'))
  const credentials = await maintainZaloCredentials(db)
  let replies = { state: 'UNAVAILABLE' }
  try {
    const { maintainTuitionZaloResponses } = load(path.resolve(__dirname, '../lib/integrations/zalo/tuition-response-sync.ts'))
    replies = await maintainTuitionZaloResponses(db)
  } catch { replies = { state: 'UNAVAILABLE' } }
  console.log(JSON.stringify({ component: 'zalo_maintenance', ...credentials, replies }))
}
main().catch(() => { console.error(JSON.stringify({ component: 'zalo_maintenance', result: 'MAINTENANCE_UNAVAILABLE' })); process.exitCode = 1 })
