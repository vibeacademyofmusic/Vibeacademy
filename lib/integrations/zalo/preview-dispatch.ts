import 'server-only';
import { sendZaloPhoneTemplate, phoneRequestBlocker } from './phone';
import { ZALO_TEMPLATE_ID, type ZaloTransport } from './readiness';
import { getZaloCredential, blockCredential, connectionError, type ZaloAdmin } from './oauth';
type Decision = {
    decision: string;
    job_id: string | null;
    provider_user_id: string | null;
    idempotency_key: string | null;
    parameters: Record<string, string> | null;
    delivery_channel?: string;
};
type Claim = {
    state: string;
    attemptId: string;
    jobId: string;
    phone: string;
    parameters: Record<string, string>;
};
export async function dispatchPreviewRegistrationZalo(admin: ZaloAdmin, orderCode: number, transport?: ZaloTransport, env: NodeJS.ProcessEnv = process.env, tokenRequest: typeof fetch = fetch, recovery?: { jobId: string; expectedAttempts: number }) {
    try {
        const { data, error } = await admin.rpc('preview_zalo_dispatch_decision', { p_order_code: orderCode });
        const row = (Array.isArray(data) ? data[0] : data) as Decision | null;
        if (error || !row || row.decision !== 'SEND' || !row.job_id || !row.provider_user_id || !row.parameters || !row.idempotency_key)
            return row?.decision ?? 'NOT_ARMED';
        if (row.delivery_channel === 'PHONE') {
            let credential;
            try {
                credential = await getZaloCredential(admin, env, tokenRequest);
            }
            catch (error) {
                const code = connectionError(error);
                await admin.rpc('block_zalo_registration_job', { p_job: row.job_id, p_error: code });
                return code;
            }
            if (recovery && row.job_id !== recovery.jobId) return 'NOT_SENDABLE';
            const preflight = phoneRequestBlocker({ allowlisted: true, registrationCompleted: true, jobId: row.job_id, phone: row.provider_user_id, templateId: ZALO_TEMPLATE_ID, parameters: row.parameters, trackingId: row.job_id.replace(/-/g, '') }, { ...env, ZALO_OA_ACCESS_TOKEN: credential.access_token! });
            if (preflight) return preflight;
            const claim = await admin.rpc(recovery ? 'claim_zalo_registration_recovery' : 'claim_zalo_registration_attempt', { p_order_code: orderCode, p_version: credential.version, p_app: credential.app_id, p_oa: credential.oa_id, ...(recovery ? { p_job: recovery.jobId, p_expected: recovery.expectedAttempts } : {}) });
            const claimed = claim.data as Claim | null;
            if (claim.error || claimed?.state !== 'CLAIMED')
                return claimed?.state ?? 'NOT_CLAIMED';
            // A durable REQUESTING row exists before the provider is contacted. A crash
            // at any point after this line must never reclaim the job automatically.
            let locallyBlocked: string | null = null;
            const outbound: ZaloTransport = async (url, init) => {
                const started = recovery
                    ? await admin.rpc('start_zalo_recovery_outbound', { p_attempt: claimed.attemptId })
                    : await admin.rpc('authorize_zalo_registration_outbound', { p_attempt: claimed.attemptId, p_manual: false });
                if (!started.error && (started.data === 'NO_CONSENT' || started.data === 'GATE_DISABLED')) locallyBlocked = started.data;
                if (started.error || started.data !== 'STARTED') throw new Error('OUTBOUND_NOT_STARTED');
                return (transport ?? fetchTransport)(url, init);
            };
            const result = await sendZaloPhoneTemplate({ allowlisted: true, registrationCompleted: true, jobId: claimed.jobId, phone: claimed.phone, templateId: ZALO_TEMPLATE_ID, parameters: claimed.parameters, trackingId: claimed.jobId.replace(/-/g, '') }, { ...env, ZALO_OA_ACCESS_TOKEN: credential.access_token!, ZALO_OA_REFRESH_TOKEN: credential.refresh_token! }, outbound);
            if (locallyBlocked) return locallyBlocked;
            const state = result.state === 'ACCEPTED' ? 'ACCEPTED' : result.providerError && result.state !== 'AMBIGUOUS' ? 'REJECTED' : 'UNKNOWN';
            const args = { p_attempt: claimed.attemptId, p_state: state, p_http: result.httpStatus ?? null, p_provider_error: result.providerError ?? null,
                p_message_id: result.state === 'ACCEPTED' ? result.messageId : null, p_error: result.errorCode ?? (state === 'UNKNOWN' ? 'ZALO_ACCEPTANCE_UNKNOWN' : null) };
            let recorded = false;
            for (let i = 0; i < 2; i++) {
                try {
                    const saved = await admin.rpc('finish_zalo_registration_attempt', args);
                    if (!saved.error && saved.data === state) {
                        recorded = true;
                        break;
                    }
                }
                catch { /* Retry only the same database acknowledgement, never the send. */ }
            }
            if (result.state === 'ZALO_TOKEN_INVALID' || result.state === 'ZALO_PROOF_INVALID') {
                await blockCredential(admin, credential, result.state, env).catch(() => { });
            }
            if (!recorded)
                return 'ZALO_ACCEPTANCE_UNKNOWN';
            return state === 'UNKNOWN' ? 'ZALO_ACCEPTANCE_UNKNOWN' : result.state;
        }
        // Legacy UID pilot has no durable REQUESTING claim. Keep it closed:
        // an absent message id cannot prove that an earlier send did not happen.
        // No consent or send gate is widened by token maintenance.
        return 'ZALO_UID_DURABLE_CLAIM_REQUIRED';
    }
    catch {
        return 'DISPATCH_FAILED';
    }
}
const fetchTransport: ZaloTransport = async (url, init) => {
    const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    return { status: response.status, json: () => response.json() };
};
