import 'server-only'
import { readCredential } from '../integrations/zalo/oauth'
import { zaloAccessHeaders } from '../integrations/zalo/app-secret-proof'
import { zaloPilotOutboundBlocked } from '../integrations/zalo/pilot-outbound'
import { prepareLearningReportPdf, type ReportAdmin } from './public-pdf'
import { reportParametersValid, reportPublicOrigin } from './public-link'

const endpoint = 'https://openapi.zalo.me/v3.0/oa/message/template'
type Prepared = { state: string; template_id: string; template_version: number; user_id: string; parameters: Record<string, string>; attempt_id?: string }
type Result = { state: 'ACCEPTED' | 'REJECTED' | 'UNKNOWN'; message?: string; error?: string }

export async function deliverLearningReport(admin: ReportAdmin, jobId: string, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch) {
  const blocked = async (error: string) => {
    await admin.rpc('note_learning_report_zbs_blocked', { p_job: jobId, p_error: error })
    return error
  }
  const prep = await admin.rpc('prepare_learning_report_zbs', { p_job: jobId })
  if (prep.error) return 'REPORT_DATABASE_UNAVAILABLE'
  const prepared = prep.data as Prepared | null
  if (!prepared || prepared.state !== 'READY') return blocked(prepared?.state ?? 'REPORT_RECIPIENT_INELIGIBLE')
  if (!reportParametersValid(prepared.parameters) || !/^\d{8,32}$/.test(prepared.user_id)) return blocked('REPORT_PARAMETERS_INVALID')
  if (!reportPublicOrigin(env.LEARNING_REPORT_PUBLIC_ORIGIN)) return blocked('REPORT_ORIGIN_MISSING')
  if (zaloPilotOutboundBlocked(env) || env.ZALO_LEARNING_REPORT_SEND_ENABLED !== 'true') return blocked('REPORT_SENDING_DISABLED')
  if (!env.ZALO_APP_SECRET?.trim()) return blocked('REPORT_CREDENTIAL_NOT_READY')
  // Credential refresh remains owned by the existing manager; this worker only reads.
  let credential
  try { credential = await readCredential(admin, env) } catch { return blocked('REPORT_CREDENTIAL_NOT_READY') }
  if (!credential?.access_token || credential.state !== 'READY' || credential.app_id !== env.ZALO_APP_ID?.trim() || credential.oa_id !== env.ZALO_OA_ID?.trim()
      || !credential.expires_at || Date.parse(credential.expires_at) <= Date.now() + 60_000) return blocked('REPORT_CREDENTIAL_NOT_READY')
  const claim = await admin.rpc('claim_learning_report_zbs', { p_job: jobId, p_app: credential.app_id, p_oa: credential.oa_id,
    p_credential_version: credential.version, p_template: prepared.template_id })
  if (claim.error) return 'REPORT_DATABASE_UNAVAILABLE'
  const current = claim.data as Prepared | null
  if (!current?.attempt_id) return 'NOT_CLAIMED'
  let result: Result = { state: 'UNKNOWN', error: 'REPORT_ACCEPTANCE_UNKNOWN' }
  if (!reportParametersValid(current.parameters) || !/^\d{8,32}$/.test(current.user_id)) result = { state: 'REJECTED', error: 'REPORT_PARAMETERS_INVALID' }
  else try {
    const response = await request(endpoint, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json', ...zaloAccessHeaders(credential.access_token, env.ZALO_APP_SECRET.trim()) },
      body: JSON.stringify({ user_id: current.user_id, template_id: current.template_id, template_data: current.parameters }),
    })
    const body = await response.json() as { error?: number; data?: { message_id?: string; user_id?: string } }
    if (response.ok && body.error === 0 && body.data?.user_id === current.user_id && typeof body.data.message_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.data.message_id)) {
      result = { state: 'ACCEPTED', message: body.data.message_id }
    } else if (response.ok && typeof body.error === 'number' && Number.isSafeInteger(body.error) && body.error < 0) {
      result = { state: 'REJECTED', error: `ZALO_ERROR_${body.error}` }
    }
  } catch { /* Timeout, malformed reply and network errors are UNKNOWN, never blindly resent. */ }
  // Retrying the database acknowledgement is safe; retrying the provider request is not.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const finished = await admin.rpc('finish_learning_report_zbs', { p_attempt: current.attempt_id, p_state: result.state,
        p_message: result.message ?? null, p_error: result.error ?? null })
      if (!finished.error) return result.state
    } catch { /* The durable REQUESTING attempt keeps the send locked after a process failure. */ }
  }
  return 'REPORT_ACCEPTANCE_UNKNOWN'
}

export async function maintainLearningReports(admin: ReportAdmin, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch) {
  const recovery = await admin.rpc('reconcile_learning_report_attempts')
  if (recovery.error) return { state: 'UNAVAILABLE', prepared: 0, accepted: 0 }
  const work = await admin.rpc('learning_report_delivery_work', { p_limit: 5 })
  if (work.error) return { state: 'UNAVAILABLE', prepared: 0, accepted: 0 }
  const ids = work.data as { reports: string[]; jobs: string[] }
  let prepared = 0, accepted = 0, failed = 0
  for (const id of ids.reports) {
    try { if (await prepareLearningReportPdf(admin, id) === 'READY') prepared++ } catch { failed++ }
  }
  for (const id of ids.jobs) {
    try { if (await deliverLearningReport(admin, id, env, request) === 'ACCEPTED') accepted++ } catch { failed++ }
  }
  return { state: 'CHECKED', prepared, accepted, failed }
}
