import 'server-only'
import { getZaloCredential, connectionError, type ZaloAdmin } from './oauth'
import { renewalSettings } from './renewal-settings'

// Credential maintenance only. Never claims or drains notification jobs.
export async function maintainZaloCredentials(admin: ZaloAdmin, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch) {
  let result = 'DISABLED'
  if (env.ZALO_TOKEN_RENEWAL_ENABLED === 'true') {
    if (env.ZALO_CREDENTIAL_OWNER !== 'main') result = 'OWNERSHIP_UNCONFIRMED'
    else {
      try { await getZaloCredential(admin, env, request); result = 'READY' }
      catch (error) { result = connectionError(error) }
    }
  }
  const health = await admin.rpc('zalo_scheduler_health', { p_result: result, p_interval: renewalSettings(env).intervalSeconds })
  if (health.error) throw new Error('ZALO_CREDENTIAL_STORE_UNAVAILABLE')
  return { result, checkedAt: new Date().toISOString() }
}
