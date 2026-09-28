import 'server-only'
import { readCredential, connectionError, type ZaloAdmin } from './oauth'
import { dispatchPreviewRegistrationZalo } from './preview-dispatch'
import type { ZaloTransport } from './readiness'
export type RecoveryView = {
  state: 'BLOCKED' | 'SEND' | 'RETRY' | 'ACCEPTED' | 'UNCERTAIN' | 'DELIVERED'
  reason: string; connectionReason?: string; outcome?: string
  jobId: string; applicationId?: string; attempts: number; orderCode?: number
  consentedPhone?: string | null; snapshotPhone?: string | null
  history?: { number: number; state: string; http: number | null; providerError: number | null }[]
}
async function scopedView(db: ZaloAdmin, jobId: string, action: string, expected?: number): Promise<RecoveryView> {
  const { data, error } = await db.rpc('zalo_registration_recovery', { p_job: jobId, p_action: action, p_expected: expected ?? null })
  if (error || !data) return { state: 'BLOCKED', reason: 'RECOVERY_FORBIDDEN', jobId, attempts: 0 }
  return data as RecoveryView
}
export async function readRecovery(db: ZaloAdmin, admin: ZaloAdmin, jobId: string, env: NodeJS.ProcessEnv = process.env, action = 'VIEW'): Promise<RecoveryView> {
  const view = await scopedView(db, jobId, action)
  if (view.reason === 'RECOVERY_FORBIDDEN' || ['DELIVERED','ACCEPTED','UNCERTAIN'].includes(view.state)) return view
  let reason: string | undefined
  if (env.ZALO_CREDENTIAL_OWNER !== 'main') reason = 'ZALO_OWNERSHIP_UNCONFIRMED'
  else {
    try {
      const c = await readCredential(admin, env)
      if (!c?.refresh_token) reason = 'ZALO_REFRESH_TOKEN_MISSING'
      else if (!['READY','NEEDS_REFRESH','VERIFYING'].includes(c.state)) reason = c.error_code ?? 'ZALO_RECONNECT_REQUIRED'
      else if (!env.ZALO_APP_SECRET?.trim()) reason = 'ZALO_OUTBOUND_NOT_CONFIGURED'
    } catch (error) { reason = connectionError(error) }
  }
  return reason ? { ...view, connectionReason: reason, ...(['SEND','RETRY'].includes(view.state) ? { state: 'BLOCKED' as const, reason } : {}) } : view
}
export async function recoverRegistrationNotification(db: ZaloAdmin, admin: ZaloAdmin, input: { jobId: string; action: 'CHECK' | 'SEND'; expectedAttempts: number }, env: NodeJS.ProcessEnv = process.env, transport?: ZaloTransport, tokenRequest: typeof fetch = fetch): Promise<RecoveryView> {
  if (input.action === 'CHECK') return readRecovery(db, admin, input.jobId, env, 'CHECK')
  const prepared = await scopedView(db, input.jobId, 'PREPARE', input.expectedAttempts)
  if (!['SEND','RETRY'].includes(prepared.state) || !prepared.orderCode) {
    const latest = await readRecovery(db, admin, input.jobId, env)
    return { ...latest, outcome: prepared.reason }
  }
  const outcome = await dispatchPreviewRegistrationZalo(admin, Number(prepared.orderCode), transport, env, tokenRequest, { jobId: input.jobId, expectedAttempts: input.expectedAttempts })
  return { ...await readRecovery(db, admin, input.jobId, env), outcome }
}
