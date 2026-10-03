import 'server-only'
import { readCredential, identity, type ZaloAdmin } from './oauth'
import { verifyZaloToken } from './connection'
// A check never refreshes, imports credentials or sends a customer message.
export async function checkStoredConnection(admin: ZaloAdmin, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch) {
  const c = await readCredential(admin, env)
  let http: number | null = null, error: number | null = null, match: boolean | null = null
  const observed: typeof fetch = async (url, init) => {
    const response = await request(url, init)
    if (String(url).includes('/oa/getoa')) {
      const body = await response.clone().json()
      http = response.status
      error = Number.isSafeInteger(body?.error) ? body.error : null
      match = body?.error === 0 ? String(body.data?.oa_id) === env.ZALO_OA_ID?.trim() : null
    }
    return response
  }
  const result = c?.access_token ? await verifyZaloToken(c.access_token, env, observed) : 'ZALO_MAIN_CREDENTIAL_MISSING'
  const evidence = await admin.rpc('zalo_connection_evidence', { ...identity(env), p_source: 'MAIN', p_result: error === -216 ? 'ZALO_ACCESS_EXPIRED' : result, p_http: http, p_error: error, p_match: match })
  if (evidence.error) throw Error('EVIDENCE_UNAVAILABLE')
  return error === -216 ? 'ZALO_ACCESS_EXPIRED' : result
}
