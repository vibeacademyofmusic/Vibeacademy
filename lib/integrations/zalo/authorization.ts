import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { credentialCommand, readCredential, identity, getZaloCredential, blockCredential, ZaloConnectionError, type ZaloAdmin } from './oauth'
import { renewalSettings } from './renewal-settings'

export const CALLBACK_PATH = '/api/integrations/zalo/oauth/callback'
export function callbackUrl(env: NodeJS.ProcessEnv = process.env) {
  const url = new URL(env.ZALO_OAUTH_REDIRECT_URI || '')
  if (url.pathname !== CALLBACK_PATH || url.search || url.hash || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new ZaloConnectionError('ZALO_CALLBACK_NOT_CONFIGURED')
  return url.toString()
}
export const hashState = (state: string) => createHash('sha256').update(state).digest('hex')
export async function startAuthorization(admin: ZaloAdmin, userId: string, env: NodeJS.ProcessEnv = process.env) {
  const redirectUri = callbackUrl(env), ids = identity(env)
  if (env.ZALO_CREDENTIAL_OWNER !== 'main' || !env.ZALO_APP_SECRET) throw new ZaloConnectionError('ZALO_OWNERSHIP_UNCONFIRMED')
  const credential = await readCredential(admin, env)
  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const result = await admin.rpc('zalo_oauth_state', { p_action: 'CREATE', p_hash: hashState(state), p_user: userId, ...ids, p_verifier: verifier, p_version: credential?.version ?? 0 })
  if (result.error) throw new ZaloConnectionError('ZALO_CREDENTIAL_STORE_UNAVAILABLE')
  const url = new URL('https://oauth.zaloapp.com/v4/oa/permission')
  url.search = new URLSearchParams({ app_id: ids.p_app, redirect_uri: redirectUri, state, code_challenge: createHash('sha256').update(verifier, 'ascii').digest('base64url') }).toString()
  return { url: url.toString(), state }
}
export async function finishAuthorization(admin: ZaloAdmin, userId: string, input: { state: string; cookieState: string; code: string; oaId: string }, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch) {
  const ids = identity(env)
  if (env.ZALO_CREDENTIAL_OWNER !== 'main') throw new ZaloConnectionError('ZALO_OWNERSHIP_UNCONFIRMED')
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state) || input.state !== input.cookieState || input.oaId !== ids.p_oa || !input.code || input.code.length > 4096) throw new ZaloConnectionError('ZALO_OAUTH_INVALID')
  const claimed = await admin.rpc('zalo_oauth_state', { p_action: 'CONSUME', p_hash: hashState(input.state), p_user: userId, ...ids })
  const record = claimed.data as { verifier: string; version: number } | null
  if (claimed.error || !record?.verifier) throw new ZaloConnectionError('ZALO_OAUTH_INVALID')
  // Claim the SAME credential row before exchanging a one-use authorization code.
  // A racing refresh wins or loses here, before either caller consumes a token/code.
  const operation = randomUUID()
  const claim = await credentialCommand(admin, env, 'REAUTH_CLAIM', { p_version: record.version, p_operation: operation }) as { state: string; version: number }
  if (claim.state !== 'CLAIMED') throw new ZaloConnectionError('ZALO_CREDENTIAL_CHANGED')
  const claimedCredential = await readCredential(admin, env)
  if (!claimedCredential || claimedCredential.operation_id !== operation) throw new ZaloConnectionError('ZALO_CREDENTIAL_CHANGED')
  const uncertain = async () => { await blockCredential(admin, claimedCredential, 'ZALO_REFRESH_UNCERTAIN', env, operation).catch(() => {}) }
  const started = Date.now()
  let body: Record<string, unknown>
  try {
    const response = await request('https://oauth.zaloapp.com/v4/oa/access_token', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/x-www-form-urlencoded', secret_key: env.ZALO_APP_SECRET?.trim() ?? '' },
      body: new URLSearchParams({ app_id: ids.p_app, code: input.code, code_verifier: record.verifier, grant_type: 'authorization_code' }),
    })
    if (!response.ok) throw new Error('HTTP')
    body = await response.json()
  } catch { await uncertain(); throw new ZaloConnectionError('ZALO_OAUTH_EXCHANGE_UNCERTAIN') }
  const seconds = Number(body.expires_in ?? body.expire_in)
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || !Number.isInteger(seconds) || seconds <= 300 || seconds > 93600) { await uncertain(); throw new ZaloConnectionError('ZALO_RECONNECT_REQUIRED') }
  // Persist the pair in quarantine before read-only identity verification. An
  // outage cannot lose a rotated pair; VERIFYING resumes safely after restart.
  const args = { p_version: claim.version, p_operation: operation, p_access: body.access_token, p_refresh: body.refresh_token, p_expires_at: new Date(started + seconds * 1000 - renewalSettings(env).skewMs).toISOString() }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const saved = await credentialCommand(admin, env, 'COMMIT', args) as { state: string }
      if (saved.state !== 'COMMITTED') {
        const current = await readCredential(admin, env)
        if (!current || current.access_token !== body.access_token || current.refresh_token !== body.refresh_token) throw new ZaloConnectionError('ZALO_CREDENTIAL_CHANGED')
      }
      const current = await readCredential(admin, env)
      if (!current || current.access_token !== body.access_token || current.refresh_token !== body.refresh_token) throw new ZaloConnectionError('ZALO_CREDENTIAL_CHANGED')
      await getZaloCredential(admin, env, request)
      return 'READY'
    } catch (error) {
      if (error instanceof ZaloConnectionError && error.code !== 'ZALO_CREDENTIAL_STORE_UNAVAILABLE') throw error
    }
  }
  await uncertain()
  throw new ZaloConnectionError('ZALO_OAUTH_EXCHANGE_UNCERTAIN')
}
