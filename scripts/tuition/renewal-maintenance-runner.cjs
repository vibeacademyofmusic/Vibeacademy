'use strict'

const DEFAULT_TIMEOUT_MS = 30000

function readConfig(env) {
  const rawUrl = String(env.VIBE_MAINTENANCE_URL || '').trim()
  const secret = String(env.CRON_SECRET || '').trim()
  if (!rawUrl || !secret) return null
  let url
  try { url = new URL(rawUrl) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
  if (!['/api/internal/zalo/maintenance', '/api/internal/tuition/renewal-automation'].includes(url.pathname)) return null
  const timeout = Number(env.VIBE_MAINTENANCE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  return {
    url: url.toString(),
    secret,
    timeoutMs: Number.isInteger(timeout) && timeout >= 5000 && timeout <= 60000 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

async function run(config, transport = fetch) {
  if (!config) throw new Error('MAINTENANCE_NOT_CONFIGURED')
  const response = await transport(config.url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${config.secret}`,
      'user-agent': 'vibe-vn-maintenance/1.0',
      accept: 'application/json',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const text = (await response.text()).slice(0, 8192)
  let body = null
  try { body = JSON.parse(text) } catch { /* keep null */ }
  const summary = {
    component: 'vibe_maintenance_runner',
    http_status: response.status,
    ok: response.ok,
    credential_result: typeof body?.result === 'string' ? body.result : null,
    renewal_state: typeof body?.renewals?.state === 'string' ? body.renewals.state : typeof body?.state === 'string' ? body.state : null,
    renewal_claimed: Number.isInteger(body?.renewals?.claimed) ? body.renewals.claimed : Number.isInteger(body?.claimed) ? body.claimed : null,
  }
  console.info(JSON.stringify(summary))
  if (!response.ok) throw new Error(`MAINTENANCE_HTTP_${response.status}`)
  return summary
}

if (require.main === module) {
  run(readConfig(process.env)).catch((error) => {
    console.error(JSON.stringify({
      component: 'vibe_maintenance_runner',
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 80) : 'MAINTENANCE_FAILED',
    }))
    process.exitCode = 1
  })
}

module.exports = { readConfig, run }
