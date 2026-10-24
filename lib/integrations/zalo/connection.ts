import 'server-only';
import { zaloAccessHeaders } from './app-secret-proof';
import { phoneErrorCode, oaErrorCode } from './errors';
import { ZALO_PILOT_OUTBOUND_DISABLED, zaloPilotOutboundBlocked } from './pilot-outbound';
import { ZALO_TEMPLATE_ID } from './readiness';
// Read-only identity + template checks. Response bodies never leave this module.
export async function verifyZaloToken(token: string, env: NodeJS.ProcessEnv = process.env, request: typeof fetch = fetch): Promise<string> {
    if (zaloPilotOutboundBlocked(env)) return ZALO_PILOT_OUTBOUND_DISABLED
    if (!token || !env.ZALO_APP_SECRET || !env.ZALO_OA_ID)
        return 'ZALO_OUTBOUND_NOT_CONFIGURED';
    try {
        const init = { headers: zaloAccessHeaders(token, env.ZALO_APP_SECRET.trim()), cache: 'no-store' as const, redirect: 'error' as const, signal: AbortSignal.timeout(15000) };
        const oa = await request('https://openapi.zalo.me/v2.0/oa/getoa', init);
        const info = await oa.json();
        if (!oa.ok)
            return 'ZALO_CONNECTION_UNAVAILABLE';
        if (info?.error !== 0)
            return Number.isSafeInteger(info?.error) ? oaErrorCode(info.error) : 'ZALO_OA_VERIFICATION_FAILED';
        if (String(info?.data?.oa_id) !== env.ZALO_OA_ID.trim())
            return 'ZALO_OA_MISMATCH';
        const response = await request(`https://business.openapi.zalo.me/template/sample-data?template_id=${ZALO_TEMPLATE_ID}`, { ...init, signal: AbortSignal.timeout(15000) });
        const body = await response.json();
        if (!response.ok)
            return 'ZALO_CONNECTION_UNAVAILABLE';
        if (body?.error === 0)
            return 'READY';
        return Number.isSafeInteger(body?.error) ? phoneErrorCode(body.error) : 'ZALO_CONNECTION_UNAVAILABLE';
    }
    catch {
        return 'ZALO_CONNECTION_UNAVAILABLE';
    }
}
